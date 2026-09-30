import { spawnSync } from 'node:child_process';

const waitFor = (promise, milliseconds) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(false), milliseconds);
  promise.then(() => { clearTimeout(timer); resolve(true); });
});

/** Track the process lifetime separately from inherited stdio pipes. */
export function trackOwnedProcess(child, { onExit = () => {}, killGroup = process.kill, platform = process.platform } = {}) {
  let exited = false, lastError, resolveExit, resolveClose, stopping;
  const exit = new Promise(resolve => { resolveExit = resolve; });
  const close = new Promise(resolve => { resolveClose = resolve; });
  const hasExited = () => exited || child.exitCode !== null || child.signalCode !== null;
  const markExited = () => {
    if (exited) return;
    exited = true;
    onExit();
    resolveExit();
  };
  child.once('exit', markExited);
  child.once('close', () => { markExited(); resolveClose(); });
  child.on('error', error => {
    lastError = error;
    // A failed spawn has no process to wait for. Signal errors must not claim
    // that a live child exited.
    if (!child.pid) markExited();
  });
  function signal(signalName) {
    if (hasExited() || !child.pid) return;
    if (platform === 'win32') {
      const result = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 1000 });
      if (result.status !== 0 && !hasExited()) throw result.error ?? new Error(`Could not stop owned Chromium process (${result.status})`);
      return;
    }
    try { killGroup(-child.pid, signalName); }
    catch (error) {
      if (!['ESRCH', 'EPERM'].includes(error.code)) throw error;
      if (hasExited()) return;
      // Darwin may reject a group containing only zombies with EPERM. Fall
      // back through the owned ChildProcess handle, never a saved raw PID.
      // child.kill() knows when its handle has already been reaped.
      if (!child.kill(signalName) && !hasExited()) throw lastError ?? error;
    }
  }
  return {
    get exited() { return hasExited(); },
    waitForExit: milliseconds => hasExited() ? Promise.resolve(true) : waitFor(exit, milliseconds),
    stop({ signalGraceMs = 1000, pipeGraceMs = 1000 } = {}) {
      return stopping ??= (async () => {
        if (!hasExited()) { signal('SIGTERM'); await waitFor(exit, signalGraceMs); }
        if (!hasExited()) { signal('SIGKILL'); await waitFor(exit, signalGraceMs); }
        if (!hasExited()) throw new Error('Owned Chromium process did not exit after SIGKILL');
        // The process is gone; another process may still hold its stderr fd.
        // Stop reading our local pipe instead of signaling an expired PGID.
        if (!await waitFor(close, pipeGraceMs)) {
          child.stderr?.destroy();
          if (!await waitFor(close, pipeGraceMs)) throw new Error('Owned Chromium stderr did not close after process exit');
        }
      })();
    },
  };
}
