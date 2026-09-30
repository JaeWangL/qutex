import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { JSDOM } from 'jsdom';
import SvgCanvas from 'svgcanvas';
import { PNG } from 'pngjs';
import { renderToString } from '../../src/core.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'experiments/common-font/output');
await fs.mkdir(out, { recursive: true });
const dom = new JSDOM();
Object.assign(globalThis, { DOMMatrix, Path2D, ImageData, document: dom.window.document, XMLSerializer: dom.window.XMLSerializer });
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const ns = 'http://www.w3.org/2000/svg';

function makeContext(width, height) {
  const ctx = new SvgCanvas.Context({ width, height, document: dom.window.document, ctx: createCanvas(1, 1).getContext('2d') });
  let clipId = 0;
  function pathNode(path) {
    const node = dom.window.document.createElementNS(ns, 'path');
    node.setAttribute('d', path.toSVGString());
    const { a, b, c, d, e, f } = ctx.getTransform();
    node.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
    return node;
  }
  for (const mode of ['fill', 'stroke']) {
    const original = ctx[mode];
    ctx[mode] = function (path, rule) {
      if (!(path instanceof Path2D)) return original.call(this, path, rule);
      if (this.globalCompositeOperation !== 'source-over') throw new Error(`unsupported blend: ${this.globalCompositeOperation}`);
      const node = pathNode(path);
      node.setAttribute('fill', mode === 'fill' ? this.fillStyle : 'none');
      if (mode === 'stroke') {
        node.setAttribute('stroke', this.strokeStyle);
        node.setAttribute('stroke-width', this.lineWidth);
        node.setAttribute('stroke-linecap', this.lineCap);
        node.setAttribute('stroke-linejoin', this.lineJoin);
        node.setAttribute('stroke-miterlimit', this.miterLimit);
        const dash = this.getLineDash();
        if (dash.length) node.setAttribute('stroke-dasharray', dash.join(' '));
        if (this.lineDashOffset) node.setAttribute('stroke-dashoffset', this.lineDashOffset);
      }
      if (this.globalAlpha !== 1) node.setAttribute('opacity', this.globalAlpha);
      if (rule === 'evenodd') node.setAttribute('fill-rule', 'evenodd');
      this.__closestGroupOrSvg().appendChild(node);
    };
  }
  const originalClip = ctx.clip;
  ctx.clip = function (path, rule) {
    if (!(path instanceof Path2D)) return originalClip.call(this, path, rule);
    const clip = dom.window.document.createElementNS(ns, 'clipPath');
    clip.setAttribute('id', `clip-${++clipId}`);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const node = pathNode(path);
    if (rule === 'evenodd') node.setAttribute('clip-rule', 'evenodd');
    clip.appendChild(node);
    this.__defs.appendChild(clip);
    const group = dom.window.document.createElementNS(ns, 'g');
    group.setAttribute('clip-path', `url(#clip-${clipId})`);
    this.__closestGroupOrSvg().appendChild(group);
    this.__currentElement = group;
  };
  for (const method of ['fillText', 'strokeText', 'drawImage', 'putImageData', 'createPattern']) {
    ctx[method] = function () { throw new Error(`unoutlined PDF operation: ${method}`); };
  }
  ctx.getLineDash = () => ctx.lineDash ? ctx.lineDash.split(',').map(Number) : [];
  ctx.getContext = () => ctx;
  ctx.getContextAttributes = () => ({ alpha: true, desynchronized: false });
  return ctx;
}

let css = await fs.readFile(path.join(root, 'dist/qutex.css'), 'utf8');
for (const name of ['QutexMath-Regular.woff2', 'QutexScript-Regular.woff2', 'NotoSerifKR.woff2']) {
  const bytes = await fs.readFile(path.join(root, 'fonts', name));
  css = css.replaceAll(`url('./${name}')`, `url(data:font/woff2;base64,${bytes.toString('base64')})`)
    .replaceAll(`url('${name}')`, `url(data:font/woff2;base64,${bytes.toString('base64')})`);
}
const cases = [
  ['sqrt', String.raw`\sqrt{x^2+1}`],
  ['fraction', String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`],
  ['sum', String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}`],
  ['matrix', String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`],
  ['cases', String.raw`f(x)=\begin{cases}x^2&x<0\\\sqrt{x}&x\ge0\end{cases}`],
  ['box', String.raw`\fcolorbox{red}{yellow}{hi}`],
  ['array', String.raw`\begin{array}{|c|c|}\hline a&b\\\hline c&d\\\hline\end{array}`],
  ['korean', String.raw`\text{한글 수식}\quad\lim_{x\to0}\frac{\sin x}{x}=1`],
  ['cancelto', String.raw`\cancelto{0}{x}`],
];
const started = performance.now();
const browser = await chromium.launch({ executablePath: process.env.QUTEX_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 3 });
  const imagePage = await browser.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 3 });
  const report = [];
  for (const [id, latex] of cases) {
    const start = performance.now();
    const mathml = renderToString(latex, { displayMode: true });
    await page.setContent(`<style>${css}html,body{margin:0;padding:0;background:transparent}#line{position:absolute;left:4px;top:4px;display:inline-block;white-space:nowrap;line-height:0;font-size:28px}math.tml-display{display:inline math!important;width:auto!important}#baseline{display:inline-block;width:0;height:0;padding:0;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0}</style><span id="line">${mathml}<span id="baseline"></span></span>`);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const rect = document.querySelector('math').getBoundingClientRect();
      const baseline = document.querySelector('#baseline').getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, baseline: baseline.top - rect.top };
    });
    // Snapshot exactly the region that will be printed. Rounding is exposed in metrics.
    const width = Math.ceil(geometry.width + 8), height = Math.ceil(geometry.height + 8);
    await page.addStyleTag({ content: `html,body{width:1024px;height:0;overflow:visible}#line{top:${4-geometry.y+4}px}@page { size:1024px 1024px; margin:0; }` });
    const source = await page.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground: false });
    await fs.writeFile(path.join(out, `${id}-browser.png`), source);
    const pdf = await page.pdf({ width: '1024px', height: '1024px', printBackground: true, preferCSSPageSize: true });
    const printed = performance.now();
    const loading = getDocument({ data: new Uint8Array(pdf), disableFontFace: true, isEvalSupported: false, useSystemFonts: false });
    const document = await loading.promise;
    try {
      if (document.numPages !== 1) throw new Error(`Unexpected ${document.numPages} PDF pages`);
      const pdfPage = await document.getPage(1), viewport = pdfPage.getViewport({ scale: 4 / 3 });
      const ctx = makeContext(viewport.width, viewport.height);
      await pdfPage.render({ canvasContext: ctx, viewport, background: 'rgba(0,0,0,0)' }).promise;
      const svg = ctx.getSvg();
      svg.removeAttribute('xmlns');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', width); svg.setAttribute('height', height);
      // Preserve PDF physical dimensions; never anisotropically fit the vector.
      const serialized = new dom.window.XMLSerializer().serializeToString(svg);
      await fs.writeFile(path.join(out, `${id}.svg`), serialized);
      await fs.writeFile(path.join(out, `${id}.pdf`), pdf);
      const converted = performance.now();
      await imagePage.setContent(`<style>html,body{margin:0;padding:0;background:white}img{display:block}</style><img src="data:image/svg+xml;base64,${Buffer.from(serialized).toString('base64')}">`);
      await imagePage.locator('img').evaluate(img => img.decode());
      const target = await imagePage.screenshot({ clip: { x: 0, y: 0, width, height } });
      await fs.writeFile(path.join(out, `${id}-svg.png`), target);
      const a = PNG.sync.read(source), b = PNG.sync.read(target);
      let sum = 0, changed = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const delta = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
        sum += delta; if (delta > 32) changed++;
      }
      report.push({ id, ok: true, geometry, canvas: { width, height }, pdf: { width: viewport.width, height: viewport.height }, htmlPdfMs: printed - start, svgMs: converted - printed, svgBytes: serialized.length, pathCount: svg.querySelectorAll('path').length, pixelMAE: sum / (a.width * a.height), changedPixelRatio: changed / (a.width * a.height) });
    } catch (error) { report.push({ id, ok: false, geometry, canvas: {width,height}, error: String(error),stack:error.stack }); }
    finally { await loading.destroy(); }
    console.log(JSON.stringify(report.at(-1)));
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ totalMs: performance.now() - started, report }, null, 2));
} finally { await browser.close(); }
