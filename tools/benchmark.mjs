import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderToString } from '../src/core.mjs';
import { renderToSVG, closeRenderer } from '../src/svg.mjs';
import { NativeFont, openJavaScriptFont } from '../src/font.mjs';
import { corpus } from './corpus.mjs';

const results = { environment: { node: process.version, platform: process.platform, arch: process.arch }, renderer: [] };
for (const [name, latex] of corpus) {
  try {
    const mathmlStart = performance.now();
    const mathml = renderToString(latex, { displayMode: true });
    const mathmlMs = performance.now() - mathmlStart;
    const svgStart = performance.now();
    const svg = await renderToSVG(latex, { displayMode: true });
    results.renderer.push({ name, ok: true, mathmlMs, svgMs: performance.now() - svgStart, mathmlBytes: Buffer.byteLength(mathml), svgBytes: Buffer.byteLength(svg.svg), width: svg.width, height: svg.height });
  } catch (error) { results.renderer.push({ name, ok: false, error: error.message }); }
}
await closeRenderer();
const path = fileURLToPath(new URL('../fonts/QutexMath-Regular.otf', import.meta.url));
const codes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789αβγδε∑∫√∞±()[]'].map(c => c.codePointAt(0));
const js = openJavaScriptFont(path);
const iterations = 100;
js.glyphs(codes);
let start = performance.now();
for (let i = 0; i < iterations; i++) js.glyphs(codes);
results.outlines = { glyphsPerBatch: codes.length, iterations, jsWarmMs: performance.now() - start };
const cached = new Map(js.glyphs(codes).glyphs.map(glyph => [glyph.codepoint, glyph]));
start = performance.now();
for (let i = 0; i < iterations; i++) JSON.stringify(codes.map(code => cached.get(code)));
results.outlines.jsCachedSerializeMs = performance.now() - start;
results.outlines.note = 'Rust includes JSONL IPC and its outline cache; JavaScript cached comparison serializes the same cached glyph rows. These are extractor timings, not equation render speedups.';
const rust = new NativeFont(path);
try {
  const nativeGlyphs = await rust.glyphs(codes);
  const jsGlyphs = js.glyphs(codes);
  const metricsEqual = nativeGlyphs.glyphs.every((glyph, index) => glyph.glyphId === jsGlyphs.glyphs[index].glyphId && glyph.advanceWidth === jsGlyphs.glyphs[index].advanceWidth);
  start = performance.now();
  for (let i = 0; i < iterations; i++) await rust.glyphs(codes);
  results.outlines.rustWarmRoundTripMs = performance.now() - start;
  results.outlines.metricsEqual = metricsEqual;
} catch (error) { results.outlines.nativeUnavailable = error.message; }
finally { rust.close(); }
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/benchmark.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
