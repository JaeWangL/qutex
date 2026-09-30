import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { trackOwnedProcess } from '../src/owned-process.mjs';

const errorWithCode = code => Object.assign(new Error(`signal ${code}`), { code });
const fakeChild = () => Object.assign(new EventEmitter(), {
  pid: 12345, exitCode: null, signalCode: null,
  stderr: { destroy() {} }, kill() { return true; },
});

test('an exited child retaining inherited stderr is never signaled again', { timeout: 5000, skip: process.platform === 'win32' }, async t => {
  const child = spawn(process.execPath, ['-e', `
    const {spawn}=require('node:child_process');
    const holder=spawn(process.execPath,['-e','setTimeout(()=>{},1000)'],{stdio:['ignore','ignore',process.stderr]});
    holder.unref();
    process.exit(0);
  `], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let closeSeen = false, unregistered = false, signals = 0;
  child.once('close', () => { closeSeen = true; });
  const owner = trackOwnedProcess(child, {
    onExit() { unregistered = true; },
    killGroup() { signals++; throw errorWithCode('EPERM'); },
  });
  await once(child, 'exit');
  assert.equal(closeSeen, false, 'the counterexample must keep stdio open after OS exit');
  assert.equal(unregistered, true, 'the pool must release its stale PID at exit, before stream close');
  assert.equal(await owner.waitForExit(1), true);
  await owner.stop({ pipeGraceMs: 20 });
  assert.equal(signals, 0, 'cleanup must not target the old process group');
  assert.equal(closeSeen, true, 'bounded teardown closes the local stderr reader');
  assert.equal(child.exitCode, 0);
  // Let the independently bounded holder finish; do not signal any unowned PID.
  await new Promise(resolve => setTimeout(resolve, 1100));
});

for (const code of ['EPERM', 'ESRCH']) {
  test(`group ${code} falls back to the live owned ChildProcess handle`, { timeout: 5000, skip: process.platform === 'win32' }, async t => {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    t.after(() => child.kill('SIGKILL'));
    const groupSignals = [], directSignals = [];
    const kill = child.kill.bind(child);
    child.kill = signal => { directSignals.push(signal); return kill(signal); };
    const owner = trackOwnedProcess(child, {
      killGroup(pid, signal) { groupSignals.push([pid, signal]); throw errorWithCode(code); },
    });
    await once(child, 'spawn');
    await owner.stop();
    assert.deepEqual(groupSignals, [[-child.pid, 'SIGTERM']]);
    assert.deepEqual(directSignals, ['SIGTERM']);
    assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(owner.exited, true);
  });
}

test('failure to signal the owned child remains an error', async () => {
  const child = fakeChild();
  child.kill = () => { child.emit('error', errorWithCode('EPERM')); return false; };
  const owner = trackOwnedProcess(child, { killGroup() { throw errorWithCode('EPERM'); }, platform: 'darwin' });
  await assert.rejects(owner.stop({ signalGraceMs: 5 }), { code: 'EPERM' });
  assert.equal(owner.exited, false);
});

test('a child that survives SIGKILL fails within bounded teardown', async () => {
  const child = fakeChild(), signals = [];
  const owner = trackOwnedProcess(child, { killGroup(pid, signal) { signals.push(signal); }, platform: 'darwin' });
  await assert.rejects(owner.stop({ signalGraceMs: 5 }), /did not exit after SIGKILL/);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(owner.exited, false);
});

test('spawn failure is not mistaken for a live process needing a signal', { timeout: 5000 }, async () => {
  const child = spawn('/qutex-test-no-such-browser-executable', [], { stdio: ['ignore', 'ignore', 'pipe'] });
  let signals = 0;
  const owner = trackOwnedProcess(child, { killGroup() { signals++; } });
  await owner.stop({ signalGraceMs: 20 });
  assert.equal(owner.exited, true);
  assert.equal(signals, 0);
});
