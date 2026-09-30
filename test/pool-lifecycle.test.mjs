import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RenderPool } from '../src/pool.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};

async function stalledBrowser(t, timeout = 30000) {
  const directory = await mkdtemp(join(tmpdir(), 'qutex-pool-lifecycle-'));
  const executable = join(directory, 'stalled-browser');
  const pidFile = join(directory, 'pid');
  // Launches a real process but never answers Chromium's startup handshake.
  // It must be owned and stopped without ever completing browser startup.
  await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ pid: process.pid, profile: process.argv.find(arg => arg.startsWith('--user-data-dir='))?.slice(16) }));
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  const pool = new RenderPool({ size: 1, capacity: 4, timeout });
  const previous = process.env.QUTEX_CHROME_PATH;
  process.env.QUTEX_CHROME_PATH = executable;
  let work;
  try {
    // Worker environment is snapshotted here; future replacement workers use
    // the restored real browser configuration.
    work = pool.render({ latex: 'x', format: 'svg' }).catch(error => ({ error }));
  } finally {
    if (previous === undefined) delete process.env.QUTEX_CHROME_PATH;
    else process.env.QUTEX_CHROME_PATH = previous;
  }
  let pid, profile;
  t.after(async () => {
    if (pid && alive(pid)) process.kill(pid, 'SIGKILL');
    await pool.close();
    await rm(directory, { recursive: true, force: true });
  });
  const deadline = Date.now() + 5000;
  while (!pid && Date.now() < deadline) {
    try { ({ pid, profile } = JSON.parse(await readFile(pidFile, 'utf8'))); } catch { await sleep(25); }
  }
  assert.ok(Number.isInteger(pid) && pid > 0, 'the child process must have started before shutdown');
  return { pool, work, pid, profile };
}

test('pool shutdown cleans a browser before its startup handshake completes', { skip: process.platform === 'win32', timeout: 60000 }, async t => {
  const { pool, work, pid, profile } = await stalledBrowser(t);
  const started = Date.now();
  const close = pool.close();
  assert.match((await work).error.message, /Renderer closed/);
  assert.ok(Date.now() - started < 1000, 'the caller is rejected promptly while browser cleanup continues');
  await close;
  assert.equal(alive(pid), false, 'awaiting close must not leave the unregistered child alive');
  await assert.rejects(access(profile), { code: 'ENOENT' });
  await assert.rejects(pool.render({ latex: 'x', format: 'mathml' }), /Renderer closed/);
});

test('timed-out worker keeps its slot until browser cleanup, then the queue recovers', { skip: process.platform === 'win32', timeout: 60000 }, async t => {
  const { pool, work, pid } = await stalledBrowser(t, 5000);
  const timedOut = await work;
  assert.match(timedOut.error.message, /Rendering timed out/);
  pool.timeout = 30000;
  const result = await pool.render({ latex: String.raw`\frac{1}{x+1}`, format: 'mathml' });
  assert.match(result.mathml, /<mfrac/);
  assert.equal(alive(pid), false, 'replacement work must wait for the previous child to exit');
  await pool.close();
});

test('normal native shutdown unregisters the exited browser before worker termination', { timeout: 60000 }, async t => {
  const pool = new RenderPool({ size: 1 });
  t.after(() => pool.close());
  let result;
  try { result = await pool.render({ latex: String.raw`\sqrt{x+1}`, format: 'svg' }); }
  catch (error) {
    if (error.message.includes('Chromium is required')) { t.skip(error.message); return; }
    throw error;
  }
  assert.match(result.backend, /chromium-qutex-font/);
  const slot = pool.slots[0], pids = [...slot.browserPids];
  assert.equal(pids.length, 1);
  let closeNotified = false;
  slot.worker.on('message', message => {
    if (message.type === 'qutex-browser-process-closed') {
      closeNotified = true;
      assert.equal(slot.browserPids.size, 0, 'the resource-close protocol is processed while the slot is closing');
    }
  });
  await pool.close();
  assert.ok(closeNotified);
  assert.ok(pids.every(pid => !alive(pid)));
  assert.deepEqual(pool.cleanupErrors, []);
});
