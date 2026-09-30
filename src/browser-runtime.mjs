import { access, readFile, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { chromium } from 'playwright-core';
import { create as createFont } from 'fontkit';

const root = fileURLToPath(new URL('../', import.meta.url));
const SIZE = 4096;
const PAGE_COUNT = 2;
const MAX_PENDING = 32;
let active, starting, launching, closingPromise, idleTimer, closed = false;
let pending = 0;
const waiters = [];
let assetsPromise;

async function executablePath() {
  const explicit = process.env.QUTEX_CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const candidates = explicit ? [explicit] : [
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
      .flatMap(base => [path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe')]),
  ];
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* try the next installed browser */ }
  }
  throw new Error('Chromium is required for native SVG output. Set QUTEX_CHROME_PATH or install Chromium with playwright-core.');
}

async function assets() {
  return assetsPromise ??= (async () => {
    let css = await readFile(path.join(root, 'dist/qutex.css'), 'utf8');
    const fontPath = process.env.QUTEX_MATH_FONT_PATH || path.join(root, 'fonts/QutexMath-Regular.woff2');
    const font = await readFile(fontPath);
    const coveredCodepoints = new Set();
    let fontMarginEm = 1;
    for (const [name, source] of [
      ['QutexMath-Regular.woff2', font],
      ['QutexScript-Regular.woff2', await readFile(path.join(root, 'fonts/QutexScript-Regular.woff2'))],
      ['NotoSerifKR.woff2', await readFile(path.join(root, 'fonts/NotoSerifKR.woff2'))],
    ]) {
      // No external asset requests are needed by a page in the render pool.
      const mime = name === 'QutexMath-Regular.woff2' && /\.otf$/i.test(fontPath) ? 'font/otf' : 'font/woff2';
      const loadedFont = createFont(source);
      for (const codepoint of loadedFont.characterSet) coveredCodepoints.add(codepoint);
      const { minX, minY, maxX, maxY } = loadedFont.bbox;
      fontMarginEm = Math.max(fontMarginEm, 1 + Math.max(...[minX, minY, maxX, maxY].map(Math.abs)) / loadedFont.unitsPerEm);
      const escapedName = name.replaceAll('.', '\\.');
      css = css.replace(new RegExp(`url\\(\\s*(['\"]?)(?:\\./)?${escapedName}\\1\\s*\\)`, 'g'),
        `url(data:${mime};base64,${source.toString('base64')})`);
    }
    return { css, coveredCodepoints, fontMarginEm, fontSha256: createHash('sha256').update(font).digest('hex') };
  })();
}

/** Own the OS process before waiting for the DevTools handshake. */
async function launchOwnedBrowser() {
  const executable = await executablePath();
  const profile = await mkdtemp(path.join(tmpdir(), 'qutex-chromium-'));
  if (closed) { await rm(profile, { recursive: true, force: true }); throw new Error('Native renderer is closing'); }
  const child = spawn(executable, [
    '--headless', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-extensions',
    '--disable-sync', '--hide-scrollbars', '--force-color-profile=srgb', '--export-tagged-pdf',
    '--no-startup-window', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  ], { detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const owner = { child, pid: child.pid, browser: null, exited: false, closePromise: null };
  launching = owner;
  if (owner.pid) parentPort?.postMessage({ type: 'qutex-browser-process', pid: owner.pid });
  let endpointResolve, endpointReject, startupTimer, stderr = '';
  const endpoint = new Promise((resolve, reject) => { endpointResolve = resolve; endpointReject = reject; });
  const exited = new Promise(resolve => child.once('close', () => {
    owner.exited = true;
    clearTimeout(startupTimer);
    endpointReject(new Error('Chromium exited before the renderer was ready'));
    if (owner.pid) parentPort?.postMessage({ type: 'qutex-browser-process-closed', pid: owner.pid });
    resolve();
  }));
  child.once('error', error => endpointReject(new Error(`Could not start Chromium: ${error.message}`)));
  child.stderr.on('data', chunk => {
    // Keep the private DevTools endpoint in memory; never return/log stderr.
    stderr = (stderr + chunk.toString()).slice(-8192);
    const match = stderr.match(/DevTools listening on (ws:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/devtools\/browser\/[^\s]+)/);
    if (match) { clearTimeout(startupTimer); endpointResolve(match[1]); }
  });
  startupTimer = setTimeout(() => endpointReject(new Error('Chromium startup timed out')), 10000);
  const waitForExit = ms => new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), ms);
    exited.then(() => { clearTimeout(timer); resolve(true); });
  });
  function signal(signalName) {
    if (owner.exited || !owner.pid) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(owner.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(-owner.pid, signalName); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  owner.close = () => owner.closePromise ??= (async () => {
    clearTimeout(startupTimer);
    endpointReject(new Error('Native renderer closed'));
    if (owner.browser?.isConnected()) {
      // Browser.close() on a CDP-connected Playwright client may only detach;
      // the CDP command asks our actual Chromium process to exit.
      void owner.browser.newBrowserCDPSession().then(session => session.send('Browser.close')).catch(() => {});
      await waitForExit(1000);
    }
    if (!owner.exited) { signal('SIGTERM'); await waitForExit(1000); }
    if (!owner.exited) signal('SIGKILL');
    await exited;
    await rm(profile, { recursive: true, force: true });
    if (launching === owner) launching = undefined;
  })();
  try {
    const websocket = await endpoint;
    if (closed) throw new Error('Native renderer is closing');
    owner.browser = await chromium.connectOverCDP(websocket, { timeout: 10000 });
    return owner;
  } catch (error) {
    await owner.close();
    throw error;
  }
}

async function start() {
  if (active) return active;
  if (starting) return starting;
  starting = (async () => {
    const { css, fontSha256, coveredCodepoints, fontMarginEm } = await assets();
    if (closed) throw new Error('Native renderer is closing');
    const owner = await launchOwnedBrowser();
    const { pid, browser } = owner;
    try {
      if (closed) throw new Error('Native renderer is closing');
      const context = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
      await context.route('**/*', route => route.abort());
      const pages = await Promise.all(Array.from({ length: PAGE_COUNT }, async () => {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        await page.setContent(`<style>${css}html,body{margin:0;padding:0;width:${SIZE}px;height:0;overflow:visible;background:transparent}#line{position:absolute;left:4px;top:4px;display:inline-block;white-space:nowrap;line-height:0}math.tml-display{display:inline math!important;width:auto!important}#baseline{display:inline-block;width:0;height:0;padding:0;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:${SIZE}px ${SIZE}px;margin:0}</style><span id="line"><span id="content"></span><span id="baseline"></span></span>`, { timeout: 10000 });
        await page.evaluate(async () => {
          for (const [family, sample] of [['Qutex Math', 'x'], ['Qutex Korean', '한'], ['Qutex Script', '𝒜']]) {
            const loaded = await document.fonts.load(`28px "${family}"`, sample);
            if (!loaded.length || loaded.some(face => face.status !== 'loaded')) throw new Error(`Required font did not load: ${family}`);
          }
        });
        return page;
      }));
      if (closed) throw new Error('Native renderer is closing');
      const runtime = { owner, browser, context, free: pages, busy: 0, pid, fontSha256, coveredCodepoints, fontMarginEm };
      active = runtime;
      if (launching === owner) launching = undefined;
      return runtime;
    } catch (error) {
      await owner.close();
      throw error;
    }
  })();
  try { return await starting; } finally { starting = undefined; }
}

function scheduleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!pending) void closeNativeRenderer(); }, 2000);
  idleTimer.unref();
}

async function acquire() {
  const runtime = await start();
  if (closed || active !== runtime) throw new Error('Native renderer closed');
  const page = runtime.free.pop();
  if (page) { runtime.busy++; return { runtime, page }; }
  return new Promise((resolve, reject) => waiters.push({ resolve, reject, runtime }));
}

function release(runtime, page) {
  const next = waiters.findIndex(waiter => waiter.runtime === runtime);
  if (next >= 0 && active === runtime) { const [waiter] = waiters.splice(next, 1); waiter.resolve({ runtime, page }); }
  else { runtime.busy--; if (active === runtime) runtime.free.push(page); }
}

export async function withNativePage(action) {
  if (closed) throw new Error('Native renderer is closing');
  if (pending >= MAX_PENDING) throw new Error('Native renderer queue is full');
  pending++;
  clearTimeout(idleTimer);
  let lease;
  try {
    lease = await acquire();
    let timer;
    try {
      return await Promise.race([
        action(lease.page, { fontSha256: lease.runtime.fontSha256, coveredCodepoints: lease.runtime.coveredCodepoints, fontMarginEm: lease.runtime.fontMarginEm, maxDimension: SIZE - 16 }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native rendering timed out')), 10000); }),
      ]);
    } catch (error) {
      if (error.message === 'Native rendering timed out') await closeNativeRenderer();
      throw error;
    } finally { clearTimeout(timer); }
  } catch (error) {
    // A broken browser must not remain in the pool or leave child processes.
    if (lease && (lease.page.isClosed() || !lease.runtime.browser.isConnected())) await closeNativeRenderer();
    throw error;
  } finally {
    if (lease) release(lease.runtime, lease.page);
    pending--;
    if (!pending) scheduleClose();
  }
}

export function closeNativeRenderer() {
  if (closingPromise) return closingPromise;
  clearTimeout(idleTimer);
  closed = true;
  for (const waiter of waiters.splice(0)) waiter.reject(new Error('Native renderer closed'));
  const owner = active?.owner || launching;
  active = undefined;
  closingPromise = (async () => {
    try {
      await owner?.close();
      await starting?.catch(() => null);
    } finally { closed = false; closingPromise = undefined; }
  })();
  return closingPromise;
}
