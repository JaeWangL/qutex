import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { version } from '../src/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await build({ entryPoints: [resolve(root, 'src/browser.mjs')], outfile: resolve(dist, 'qutex.mjs'), bundle: true, format: 'esm', minify: true, sourcemap: true, legalComments: 'linked', target: 'es2022' });
await build({ entryPoints: [resolve(root, 'src/browser.mjs')], outfile: resolve(dist, 'qutex.min.js'), bundle: true, format: 'iife', globalName: 'qutex', minify: true, legalComments: 'linked', target: 'es2022' });
let css = await readFile(resolve(root, 'vendor/temml/dist/Temml-Latin-Modern.css'), 'utf8');
css = css.replaceAll('Latin Modern Math', 'Qutex Math').replaceAll('latinmodernmath.woff2', 'QutexMath-Regular.woff2')
  .replaceAll("'Temml'", "'Qutex Script'").replaceAll('"Temml"', '"Qutex Script"').replaceAll('Temml.woff2', 'QutexScript-Regular.woff2');
css += '\n@font-face { font-family: "Qutex Korean"; src: url("NotoSerifKR.woff2") format("woff2"); font-weight: 200 900; font-style: normal; font-display: swap; }\nmath {font-family: "Qutex Math", "Qutex Korean", math;}\nmath mtext {font-family: "Qutex Math", "Qutex Korean", serif;}\n';
css += '\n.mathscr {font-family: "Qutex Script", "Qutex Math", math;}\n';
// The upstream helper font also supplied prime glyphs; our script-only font
// intentionally does not. Use the real math font for these and text fractions,
// so native SVG never depends on an installed system Times/Temml font.
css = css.replace(/font-family:\s*Temml\s*;/g, 'font-family: "Qutex Math";');
css += '\n.special-fraction {font-family: "Qutex Math", "Qutex Korean", math;}\n';
await writeFile(resolve(dist, 'qutex.css'), css);
for (const name of ['QutexMath-Regular.otf', 'QutexMath-Regular.woff2', 'QutexScript-Regular.woff2', 'NotoSerifKR.woff2']) {
  await copyFile(resolve(root, 'fonts', name), resolve(dist, name));
}
await copyFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(dist, 'THIRD_PARTY_NOTICES.txt'));
await mkdir(resolve(dist, 'licenses'), { recursive: true });
for (const name of ['GUST-FONT-LICENSE.txt', 'LPPL-1.3c.txt', 'MANIFEST-Latin-Modern-Math.txt', 'README-Latin-Modern-Math.txt']) {
  await copyFile(resolve(root, 'fonts/upstream/latin-modern-math', name), resolve(dist, 'licenses', name));
}
await copyFile(resolve(root, 'fonts/upstream/noto-serif-kr/OFL.txt'), resolve(dist, 'licenses/NotoSerifKR-OFL.txt'));
await copyFile(resolve(root, 'fonts/upstream/katex-script/OFL.txt'), resolve(dist, 'licenses/QutexScript-OFL.txt'));
await copyFile(resolve(root, 'fonts/upstream/katex-script/FONT-NOTICE.txt'), resolve(dist, 'licenses/QutexScript-FONT-NOTICE.txt'));
await copyFile(resolve(root, 'fonts/README-Qutex-Script.md'), resolve(dist, 'licenses/README-Qutex-Script.md'));
await copyFile(resolve(root, 'fonts/README-Qutex-Math.md'), resolve(dist, 'licenses/README-Qutex-Math.md'));
await copyFile(resolve(root, 'fonts/MANIFEST-Qutex-Math.txt'), resolve(dist, 'licenses/MANIFEST-Qutex-Math.txt'));
await copyFile(resolve(root, 'vendor/temml/LICENSE'), resolve(dist, 'licenses/Temml-MIT.txt'));
const files = {};
for (const file of (await readdir(dist, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name !== 'manifest.json')) {
  const bytes = await readFile(resolve(dist, file.name));
  files[file.name] = { bytes: bytes.length, integrity: `sha384-${createHash('sha384').update(bytes).digest('base64')}` };
}
await writeFile(resolve(dist, 'manifest.json'), JSON.stringify({ version, files }, null, 2));
const versioned = resolve(dist, `v${version}`);
await mkdir(versioned, { recursive: true });
for (const name of [...Object.keys(files), 'manifest.json', 'licenses']) {
  await cp(resolve(dist, name), resolve(versioned, name), { recursive: true });
}
console.log(`Built browser/CDN assets ${version}: ${Object.keys(files).length} files + license notices`);
