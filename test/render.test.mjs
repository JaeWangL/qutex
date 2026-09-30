import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from '../src/core.mjs';
import { renderToSVG } from '../src/svg-mathjax.mjs';
import { createServer } from '../src/server.mjs';
import { SaxesParser } from 'saxes';

test('Temml macros remain isolated and expansion is bounded', () => {
  assert.match(renderToString(String.raw`\RR^2`, { macros: { '\\RR': '\\mathbb{R}' } }), /<math/);
  assert.throws(() => renderToString(String.raw`\RR`), /Undefined|Unsupported/i);
  assert.throws(() => renderToString(String.raw`\loop`, { macros: { '\\loop': '\\loop' } }), /expan/i);
  assert.throws(() => renderToString('x'.repeat(16385)), /exceeds/);
});

test('untrusted links and malformed input do not export successful markup', () => {
  assert.match(renderToString(String.raw`\text{temml-error}`), /temml-error/);
  assert.throws(() => renderToString('x', { displayMode: 'false' }), /boolean/);
  assert.throws(() => renderToString('x', { macros: [] }), /object/);
  assert.throws(() => renderToString(String.raw`\href{javascript:alert(1)}{x}`));
  assert.throws(() => renderToString(String.raw`\includegraphics{https://example.com/track.png}`));
  assert.throws(() => renderToString(String.raw`\frac{1}{`));
});

const examples = [
  String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  String.raw`\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}`,
  String.raw`\sum_{k=1}^{n}k=\frac{n(n+1)}{2}`,
  String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,
  String.raw`f(x)=\begin{cases}x^2&x<0\\\sqrt{x}&x\ge0\end{cases}`,
  String.raw`\overrightarrow{AB}+\widehat{ABC}+\underbrace{x+\cdots+x}_{n}`,
  String.raw`\mathbf{x}+\mathbb{R}+\mathcal{F}+\mathscr{L}`,
  String.raw`\text{단, }x\ne0`,
  String.raw`\ce{2H2 + O2 -> 2H2O}`,
];
test('equation families export actual standalone vector paths', async () => {
  for (const latex of examples) {
    const result = await renderToSVG(latex);
    new SaxesParser({ xmlns: true }).write(result.svg).close();
    assert.match(result.svg, /<path/);
    assert.doesNotMatch(result.svg, /<text\b|<image\b|<foreignObject\b|(?:xlink:)?href=|currentColor|merror/);
    assert.ok(result.width > 0 && result.height > 0 && result.baseline >= 0);
    assert.equal(result.fontFamily, 'Latin Modern (MathJax Modern)');
  }
});

test('point-size transport scales geometry linearly and color is explicit', async () => {
  const a = await renderToSVG(String.raw`\frac{1}{x_2}`, { fontSize: 12, color: '#008000' });
  const b = await renderToSVG(String.raw`\frac{1}{x_2}`, { fontSize: 24, color: '#008000' });
  assert.equal(b.width, a.width * 2);
  assert.equal(b.height, a.height * 2);
  assert.equal(b.baseline, a.baseline * 2);
  assert.match(a.svg, /#008000/);
  await assert.rejects(renderToSVG('x', { color: 'url(https://example.com)' }));
});

test('concurrent calls and rejection do not leak color, macro or layout state', async () => {
  const sequential = await Promise.all(examples.slice(0, 4).map(latex => renderToSVG(latex)));
  await assert.rejects(renderToSVG(String.raw`\badCommand`));
  const actual = await Promise.all(examples.slice(0, 4).map(latex => renderToSVG(latex)));
  assert.deepEqual(actual, sequential);
});

test('HTTP request, repeated cache hit and malformed input are handled', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/v1/render`;
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latex: String.raw`\frac12`, options: { fontSize: 20 } }) };
    const a = await (await fetch(url, init)).json();
    const b = await (await fetch(url, init)).json();
    assert.ok(a.width > 0);
    assert.equal(a.cacheHit, false); assert.equal(b.cacheHit, true);
    assert.equal(a.svg, b.svg);
    const invalid = await fetch(url, { ...init, body: JSON.stringify({ latex: '\\undefined' }) });
    assert.equal(invalid.status, 422);
    const wrong = await fetch(url, { ...init, headers: { 'Content-Type': 'text/plain' } });
    assert.equal(wrong.status, 415);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
