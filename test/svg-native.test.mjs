import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { SaxesParser } from 'saxes';
import { renderToSVGNative, closeNativeRenderer } from '../src/svg-browser.mjs';
import { withNativePage } from '../src/browser-runtime.mjs';

let browserUnavailable = false;
async function render(t, ...args) {
  if (browserUnavailable) { t.skip('Chromium is not installed'); return null; }
  try { return await renderToSVGNative(...args); }
  catch (error) {
    if (error.message.includes('Chromium is required')) { browserUnavailable = true; t.skip(error.message); return null; }
    throw error;
  }
}
after(closeNativeRenderer);

function xml(svg) {
  const tags = [], parser = new SaxesParser({ xmlns: true });
  parser.on('error', error => { throw error; });
  parser.on('opentag', tag => tags.push(tag));
  parser.write(svg).close();
  return tags;
}

test('native output uses the real Qutex font with outline-only transparent SVG', async t => {
  const result = await render(t, String.raw`\sqrt{x^2+1}`, { fontSize: 28, displayMode: true });
  if (!result) return;
  assert.equal(result.fontFamily, 'Qutex Math');
  assert.match(result.fontSha256, /^[a-f0-9]{64}$/);
  assert.match(result.backend, /chromium-qutex-font/);
  const nodes = xml(result.svg);
  assert.ok(nodes.some(node => node.local === 'path'));
  assert.ok(nodes.some(node => node.local === 'clipPath'));
  assert.ok(!nodes.some(node => ['text', 'image', 'foreignObject'].includes(node.local)));
  assert.equal(result.contentBounds.x, 4);
  assert.equal(result.width, result.contentBounds.width + 8);
  assert.ok(result.baseline > 4 && result.baseline < result.height - 4);
  assert.equal(result.warnings.length, 0);
});

test('native physical size scales without fitting to a rectangle', async t => {
  const small = await render(t, 'x', { fontSize: 16 });
  if (!small) return;
  const big = await render(t, 'x', { fontSize: 32 });
  assert.ok(Math.abs(big.contentBounds.width / small.contentBounds.width - 2) < 0.03);
  assert.ok(Math.abs(big.contentBounds.height / small.contentBounds.height - 2) < 0.03);
  assert.ok([1, 2, 4, 8, 16, 32].includes(small.layoutScale));
  assert.ok([1, 2, 4, 8, 16, 32].includes(big.layoutScale));
});

test('high-precision vector layout preserves absolute cm and pt dimensions', async t => {
  const rule = await render(t, String.raw`\rule{1cm}{0.4pt}`, { fontSize: 16 });
  if (!rule) return;
  assert.equal(rule.layoutScale, 32);
  // CSS defines 96px/in, 2.54cm/in and 72pt/in, independent of font size.
  assert.ok(Math.abs(rule.contentBounds.width - 96 / 2.54) < 0.002);
  assert.ok(Math.abs(rule.contentBounds.height - 0.4 * 96 / 72) < 1 / rule.layoutScale);
  assert.equal(rule.contentBounds.x, 4);
  assert.equal(rule.contentBounds.y, 4);
  assert.equal(rule.baseline, 4 + rule.contentBounds.height);
  const space = await renderToSVGNative(String.raw`\hspace{1cm}`, { fontSize: 16 });
  assert.ok(Math.abs(space.contentBounds.width - 96 / 2.54) < 0.002);
  assert.equal(space.contentBounds.height, 0);
  assert.equal(space.contentBounds.x, 4);
});

test('standalone equation tags fail consistently before or after pooled renders', async t => {
  const available = await render(t, 'x');
  if (!available) return;
  const tagged = () => renderToSVGNative(String.raw`x\tag{1}`, { displayMode: true });
  await assert.rejects(tagged(), { code: 'QUTEX_NATIVE_SVG_UNSUPPORTED', message: /containing document width/ });
  await renderToSVGNative(String.raw`\mathscr{A}`, { fontSize: 512 });
  await assert.rejects(tagged(), { code: 'QUTEX_NATIVE_SVG_UNSUPPORTED', message: /containing document width/ });
});

test('native cases output remains valid standalone XML with inequality label', async t => {
  const latex = String.raw`f(x)=\begin{cases}x^2&x<0\\\sqrt{x}&x\ge0\end{cases}`;
  const result = await render(t, latex);
  if (!result) return;
  assert.equal(xml(result.svg)[0].attributes['aria-label'].value, latex);
});

test('native masks fail explicitly and the pooled page recovers', async t => {
  const plain = await render(t, 'x');
  if (!plain) return;
  await assert.rejects(renderToSVGNative(String.raw`\cancelto{0}{x}`), { code: 'QUTEX_NATIVE_SVG_UNSUPPORTED' });
  const recovered = await renderToSVGNative('x');
  assert.equal(recovered.contentBounds.width, plain.contentBounds.width);
  assert.equal(recovered.fontSha256, plain.fontSha256);
});

test('native pooled pages keep concurrent formulas and colors isolated', async t => {
  const check = await render(t, 'x');
  if (!check) return;
  const [a, b] = await Promise.all([
    renderToSVGNative('x', { color: '#008000' }),
    renderToSVGNative('y+z', { color: '#FF0000' }),
  ]);
  assert.equal(xml(a.svg)[0].attributes['aria-label'].value, 'x');
  assert.equal(xml(b.svg)[0].attributes['aria-label'].value, 'y+z');
  assert.notEqual(a.width, b.width);
  assert.match(a.svg.toLowerCase(), /#008000/);
  assert.match(b.svg.toLowerCase(), /#ff0000/);
  const clipA = a.svg.match(/id="([^"]*clip-1)"/)[1];
  const clipB = b.svg.match(/id="([^"]*clip-1)"/)[1];
  assert.notEqual(clipA, clipB);
});

test('native script overhang and isolated accent groups retain all vector ink', async t => {
  const initial = await render(t, String.raw`\mathscr{A}`, { fontSize: 128 });
  if (!initial) return;
  assert.ok(initial.width > initial.contentBounds.width + 20, 'the known script swash exceeds its logical advance');
  for (const fontSize of [128, 512]) {
    for (const latex of [String.raw`\mathscr{A}`, String.raw`\widehat{ABC}`, String.raw`x^{x^x}`]) {
      const result = await renderToSVGNative(latex, { fontSize });
      const inside = await withNativePage(page => page.evaluate(svg => {
        const div = document.createElement('div'); div.innerHTML = svg; document.body.append(div);
        try {
          const element = div.firstElementChild, box = element.viewBox.baseVal;
          const ink = element.querySelector(':scope > g').getBBox();
          return ink.x >= box.x && ink.y >= box.y && ink.x + ink.width <= box.x + box.width && ink.y + ink.height <= box.y + box.height;
        } finally { div.remove(); }
      }, result.svg));
      assert.ok(inside, `${latex} at ${fontSize}px`);
      assert.ok(xml(result.svg).some(node => node.local === 'path'));
    }
  }
});

test('negative italic bearings survive the PDF page clip before SVG expansion', async t => {
  const result = await render(t, 'j', { fontSize: 512 });
  if (!result) return;
  assert.ok(result.contentBounds.x > 4, 'italic j requires space left of its advance box');
  const leftInk = await withNativePage(page => page.evaluate(async svg => {
    const image = new Image();
    image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, 3, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  }, result.svg));
  assert.ok(leftInk, 'the first three columns contain the negative-bearing ink; expanding a previously clipped page alone leaves these empty');
});
