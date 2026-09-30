import test from 'node:test';
import assert from 'node:assert/strict';
import { SaxesParser } from 'saxes';
import { renderToSVG } from '../src/svg-mathjax.mjs';

const paths = svg => [...svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map(match => match[1]);

test('colorbox owns visible background and expands both width and height', async () => {
  const plain = await renderToSVG(String.raw`\text{hi}`);
  const box = await renderToSVG(String.raw`\colorbox{yellow}{hi}`);
  assert.match(box.svg, /<rect[^>]*fill="#FFFF00"[^>]*data-bgcolor="true"/);
  assert.ok(box.width > plain.width + 9);
  assert.ok(box.height > plain.height + 9);
  assert.deepEqual(paths(box.svg), paths(plain.svg));
});

test('fcolorbox preserves independent background, border, and content colors', async () => {
  const box = await renderToSVG(String.raw`\fcolorbox{red}{yellow}{hi}`, { color: '#008000' });
  assert.match(box.svg, /fill="#FFFF00"/);
  assert.match(box.svg, /(?:fill|stroke)="#ff0000"/);
  assert.match(box.svg, /(?:fill|stroke)="#008000"/);
  assert.match(box.svg, /<rect[^>]*fill="none"[^>]*stroke-width="66\.7"/);
});

test('full array grid rules remain visible in standalone SVG without external CSS', async () => {
  const result = await renderToSVG(String.raw`\begin{array}{|c|c|}\hline a&b\\\hline c&d\\\hline\end{array}`);
  const lines = [...result.svg.matchAll(/<line\b[^>]*>/g)].map(m => m[0]);
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(line, /stroke-width="70"/);
    assert.match(line, /fill="none"/);
  }
  assert.match(result.svg, /<rect[^>]*data-frame="true"[^>]*stroke-width="70"[^>]*fill="none"/);
  assert.equal(paths(result.svg).length, 4);
});

test('side-only array borders do not invent top and bottom borders', async () => {
  const result = await renderToSVG(String.raw`\begin{array}{|c|}a\\b\end{array}`);
  assert.equal((result.svg.match(/<line\b/g) || []).length, 2);
  assert.doesNotMatch(result.svg, /data-frame=/);
  assert.match(result.svg, /data-mml-node="menclose"/);
});

test('script and calligraphic retain distinct source-font outlines', async () => {
  const script = await renderToSVG(String.raw`\mathscr{ABC}`);
  const calligraphic = await renderToSVG(String.raw`\mathcal{ABC}`);
  assert.equal(paths(script.svg).length, 3);
  assert.notDeepEqual(paths(script.svg), paths(calligraphic.svg));
  assert.notEqual(script.width, calligraphic.width);
  assert.doesNotMatch(script.svg, /<text\b|<image\b|foreignObject/);
});

test('bold operator CSS is preserved as a real font variant', async () => {
  const normal = await renderToSVG('+');
  const bold = await renderToSVG(String.raw`\boldsymbol{+}`);
  assert.notDeepEqual(paths(normal.svg), paths(bold.svg));
});

test('fast SVG respects inline versus display math for large operators', async () => {
  const latex = String.raw`\sum_{k=1}^{n}k`;
  const inline = await renderToSVG(latex, { displayMode: false });
  const display = await renderToSVG(latex, { displayMode: true });
  assert.ok(display.height > inline.height, 'display limits must not be used for inline output');
});

test('Korean normal text remains outlines on repeat calls', async () => {
  for (let index = 0; index < 2; index++) {
    const result = await renderToSVG(String.raw`\text{한글}`);
    assert.equal(paths(result.svg).length, 2);
    assert.doesNotMatch(result.svg, /<text\b/);
    assert.ok(result.warnings.some(warning => warning.includes('Noto Serif KR')));
  }
});

test('unrepresented styles and spacing fail instead of returning an unchanged formula', async () => {
  const unsupported = [
    String.raw`\textbf{한글}`,
    String.raw`\text{a\textit{한글}b}`,
    String.raw`\newcommand{\heavy}[1]{\textbf{#1}}\heavy{한글}`,
    String.raw`\def\arraystretch{3}\begin{matrix}a&b\\c&d\end{matrix}`,
    String.raw`\begin{matrix}a&b\\[1em]c&d\end{matrix}`,
    String.raw`\begin{array}{||c||}a\end{array}`,
    String.raw`\cancelto{0}{x}`,
  ];
  for (const latex of unsupported) await assert.rejects(renderToSVG(latex), { code: 'QUTEX_SVG_UNSUPPORTED' });
  // One failed job must not poison the queue.
  assert.ok((await renderToSVG(String.raw`\frac{x}{y}`)).width > 0);
});


test('standalone SVG is valid XML when equation labels contain inequalities', async () => {
  const latex = String.raw`f(x)=\begin{cases}x^2&x<0\\\sqrt{x}&x\ge0\end{cases}`;
  const result = await renderToSVG(latex);
  const parser = new SaxesParser({ xmlns: true });
  let label, root;
  parser.on('error', error => { throw error; });
  parser.on('opentag', node => {
    if (!root) { root = node; label = node.attributes['aria-label']?.value; }
  });
  parser.write(result.svg).close();
  assert.equal(root.name, 'svg');
  assert.equal(root.uri, 'http://www.w3.org/2000/svg');
  assert.equal(label, latex);
  assert.match(result.svg, /x&lt;0/);
});
