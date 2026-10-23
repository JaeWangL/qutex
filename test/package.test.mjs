import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('version, exports and types agree', async () => {
  const core = await import('../src/core.mjs');
  assert.equal(core.version, pkg.version);
  const targets = Object.values(pkg.exports).flatMap(target => typeof target === 'string' ? [target] : Object.values(target));
  for (const target of targets.filter(target => !target.includes('*'))) {
    assert.ok(existsSync(new URL(`../${target}`, import.meta.url)), `${target} exists (run npm run build first)`);
  }
  // Self-reference resolves the published entry points.
  const browser = await import('qutex/browser');
  const node = await import('qutex');
  assert.equal(browser.renderToString(String.raw`\binom{5}{2}`), node.renderToString(String.raw`\binom{5}{2}`));
  for (const name of ['renderToString', 'render', 'resolveLocale', 'localeMacros', 'describeLocale', 'locales', 'DEFAULT_LOCALE']) {
    assert.ok(name in browser, `browser exports ${name}`);
    assert.ok(name in node, `node exports ${name}`);
    assert.match(readFileSync(new URL('../types/browser.d.ts', import.meta.url), 'utf8'), new RegExp(`\\b${name}\\b`));
  }
});

test('the browser entry has no Node-only imports and heavy SVG libraries are optional peers', () => {
  for (const file of ['src/browser.mjs', 'src/core.mjs', 'src/locales.mjs']) {
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /from 'node:|playwright|jsdom|fontkit|canvas|pdfjs/);
  }
  assert.equal(pkg.dependencies, undefined);
  for (const name of Object.keys(pkg.peerDependencies)) assert.equal(pkg.peerDependenciesMeta[name]?.optional, true, name);
});

test('lite stylesheet keeps the math fonts and drops only the Korean web font', () => {
  const full = readFileSync(new URL('../dist/qutex.css', import.meta.url), 'utf8');
  const lite = readFileSync(new URL('../dist/qutex-lite.css', import.meta.url), 'utf8');
  assert.match(full, /NotoSerifKR\.woff2/);
  assert.doesNotMatch(lite, /NotoSerifKR|Qutex Korean/);
  for (const font of ['QutexMath-Regular.woff2', 'QutexScript-Regular.woff2']) assert.ok(lite.includes(font));
});

test('the npm tarball ships only reviewed paths', () => {
  const [archive] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }));
  const paths = archive.files.map(file => file.path);
  for (const required of ['types/browser.d.ts', 'types/index.d.ts', 'src/locales.mjs', 'dist/qutex.css', 'dist/qutex-lite.css', 'dist/qutex.mjs', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert.ok(paths.includes(required), required);
  }
  for (const path of paths) {
    assert.doesNotMatch(path, /^(?:artifacts|experiments|test|tools|\.github)\/|\.env|Temml\.woff2|vendor\/temml\/(?!dist\/temml\.mjs|LICENSE|package\.json)/, path);
  }
});
