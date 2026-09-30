import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';

// The owned launcher has a 10s startup deadline and bounded process cleanup.
// The caller fails promptly; this grace only bounds resource teardown.
const CLOSE_GRACE_MS = 15000;

function killBrowserProcess(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  // The owned launcher makes browsers process-group leaders on POSIX. This also
  // reaps their render/GPU subprocesses if graceful shutdown did not finish.
  try { process.kill(-pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

/** Bounded reusable workers: a timeout terminates the actual computation. */
export class RenderPool {
  constructor({ size = 2, capacity = 32, timeout = 30000 } = {}) {
    this.size = size; this.capacity = capacity; this.timeout = timeout;
    this.slots = []; this.queue = []; this.sequence = 0; this.closed = false;
    this.cleanupErrors = [];
  }
  render(request) {
    if (this.closed) return Promise.reject(new Error('Renderer closed'));
    if (this.queue.length + this.slots.filter(s => s.job).length >= this.capacity) {
      return Promise.reject(new Error('Renderer busy'));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject, id: ++this.sequence });
      this.drain();
    });
  }
  drain() {
    while (this.queue.length && !this.closed) {
      let slot = this.slots.find(s => !s.job && !s.closing);
      if (!slot && this.slots.length < this.size) {
        const worker = new Worker(new URL('./worker.mjs', import.meta.url));
        slot = { worker, job: null, timer: null, closeTimer: null, browserPids: new Set(), closing: false, exited: false, forced: false };
        slot.closed = new Promise(resolve => { slot.resolveClosed = resolve; });
        const ownedSlot = slot;
        this.slots.push(slot);
        worker.on('message', message => {
          if (message.type === 'qutex-browser-process') {
            if (Number.isInteger(message.pid) && message.pid > 0) {
              if (ownedSlot.forced || ownedSlot.exited) this.killBrowser(message.pid);
              else ownedSlot.browserPids.add(message.pid);
            }
            return;
          }
          if (message.type === 'qutex-browser-process-closed') {
            ownedSlot.browserPids.delete(message.pid);
            return;
          }
          if (ownedSlot.closing) return;
          const job = ownedSlot.job;
          if (!job || job.id !== message.id) return;
          clearTimeout(ownedSlot.timer);
          ownedSlot.job = null;
          if (message.error) job.reject(new Error(message.error));
          else job.resolve(message.result);
          this.drain();
        });
        worker.on('error', error => this.retire(ownedSlot, error));
        worker.on('exit', () => this.finish(ownedSlot, new Error('Renderer worker exited')));
      }
      if (!slot) break;
      slot.job = this.queue.shift();
      try { slot.worker.postMessage({ ...slot.job.request, id: slot.job.id }); }
      catch (error) { this.retire(slot, error); continue; }
      const ownedSlot = slot;
      slot.timer = setTimeout(() => {
        this.retire(ownedSlot, new Error('Rendering timed out'));
      }, this.timeout);
    }
  }
  retire(slot, error) {
    if (slot.closing || slot.exited) return slot.closed;
    slot.closing = true;
    clearTimeout(slot.timer);
    slot.job?.reject(error);
    slot.job = null;
    // A closing worker still occupies a slot. Do not start replacement workers
    // while its browser is alive, and keep accepting its late PID messages.
    slot.closeTimer = setTimeout(() => this.forceStop(slot), CLOSE_GRACE_MS);
    try { slot.worker.postMessage({ type: 'close' }); }
    catch { this.forceStop(slot); }
    return slot.closed;
  }
  forceStop(slot) {
    if (slot.exited || slot.forced) return;
    slot.forced = true;
    this.killBrowsers(slot);
    void slot.worker.terminate();
  }
  killBrowsers(slot) {
    for (const pid of slot.browserPids) {
      this.killBrowser(pid);
    }
    slot.browserPids.clear();
  }
  killBrowser(pid) {
    try { killBrowserProcess(pid); }
    catch (error) {
      // An OS cleanup failure must not crash a worker event handler or leave
    // the pool's close promise unresolved. Retain bounded diagnostics.
      this.cleanupErrors.push({ pid, code: error.code, message: error.message });
      if (this.cleanupErrors.length > 16) this.cleanupErrors.shift();
    }
  }
  finish(slot, error) {
    if (slot.exited) return;
    slot.exited = true;
    clearTimeout(slot.timer);
    clearTimeout(slot.closeTimer);
    slot.job?.reject(error);
    slot.job = null;
    this.killBrowsers(slot);
    this.slots = this.slots.filter(s => s !== slot);
    slot.resolveClosed();
    this.drain();
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.queue.splice(0).forEach(job => job.reject(new Error('Renderer closed')));
    this.closePromise = Promise.all([...this.slots].map(slot => this.retire(slot, new Error('Renderer closed'))));
    return this.closePromise;
  }
}
