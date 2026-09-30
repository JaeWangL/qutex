import { createHash } from 'node:crypto';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { JSDOM } from 'jsdom';
import SvgCanvas from 'svgcanvas';

const dom = new JSDOM();
// PDF.js' Node path uses these standard Canvas APIs. The matching native canvas
// version is shared with its optional dependency, so Path2D instances agree.
for (const [name, value] of Object.entries({ DOMMatrix, Path2D, ImageData })) globalThis[name] ??= value;
const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const ns = 'http://www.w3.org/2000/svg';

export function vectorError(detail) {
  const error = new Error(`Native SVG cannot preserve ${detail} as vectors.`);
  error.code = 'QUTEX_NATIVE_SVG_UNSUPPORTED';
  return error;
}

function context(width, height, prefix) {
  const ctx = new SvgCanvas.Context({ width, height, document: dom.window.document, ctx: createCanvas(1, 1).getContext('2d') });
  let clipId = 0;
  const fillRect = ctx.fillRect;
  ctx.fillRect = function (...args) {
    // PDF.js clears its canvas with a transparent rectangle. Keeping this
    // invisible page-sized node would incorrectly enlarge the measured ink box.
    if (this.globalAlpha === 0 || this.fillStyle === 'transparent' || /^rgba\([^)]*,\s*0\s*\)$/.test(this.fillStyle)) return;
    return fillRect.apply(this, args);
  };
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
      if (this.globalCompositeOperation !== 'source-over') throw vectorError('blend modes');
      const node = pathNode(path);
      if (typeof this.fillStyle !== 'string' || typeof this.strokeStyle !== 'string') throw vectorError('paint patterns');
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
    clip.setAttribute('id', `qutex-${prefix}-clip-${++clipId}`);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const node = pathNode(path);
    if (rule === 'evenodd') node.setAttribute('clip-rule', 'evenodd');
    clip.appendChild(node);
    this.__defs.appendChild(clip);
    const group = dom.window.document.createElementNS(ns, 'g');
    group.setAttribute('clip-path', `url(#qutex-${prefix}-clip-${clipId})`);
    this.__closestGroupOrSvg().appendChild(group);
    this.__currentElement = group;
  };
  ctx.drawImage = function (source, ...args) {
    if (!source?.getSvg || this.globalCompositeOperation !== 'source-over' || ![2, 4, 8].includes(args.length)) throw vectorError('raster images or blend modes');
    let sx = 0, sy = 0, sw = source.width, sh = source.height, dx, dy, dw = sw, dh = sh;
    if (args.length === 2) [dx, dy] = args;
    else if (args.length === 4) [dx, dy, dw, dh] = args;
    else [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || sw <= 0 || sh <= 0) throw vectorError('invalid vector group dimensions');
    const group = dom.window.document.createElementNS(ns, 'g');
    const { a, b, c, d, e, f } = this.getTransform();
    group.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
    if (this.globalAlpha !== 1) group.setAttribute('opacity', this.globalAlpha);
    const nested = source.getSvg().cloneNode(true);
    nested.removeAttribute('xmlns');
    for (const [key, value] of Object.entries({ x: dx, y: dy, width: dw, height: dh, viewBox: `${sx} ${sy} ${sw} ${sh}`, preserveAspectRatio: 'none', overflow: 'hidden' })) nested.setAttribute(key, value);
    group.appendChild(nested);
    this.__closestGroupOrSvg().appendChild(group);
  };
  for (const method of ['fillText', 'strokeText', 'putImageData', 'createPattern']) {
    ctx[method] = function () { throw vectorError(`PDF operation ${method}`); };
  }
  ctx.getLineDash = () => ctx.lineDash ? ctx.lineDash.split(',').map(Number) : [];
  ctx.getContext = () => ctx;
  ctx.getContextAttributes = () => ({ alpha: true, desynchronized: false });
  return ctx;
}

export async function pdfToVector(pdf, { width, height, label = '' }) {
  if (!pdf.length || pdf.length > 16 * 1024 * 1024) throw vectorError('oversized PDF output');
  const prefix = createHash('sha256').update(pdf).digest('hex').slice(0, 16);
  let groupId = 0;
  class VectorCanvasFactory {
    create(w, h) { const ctx = context(w, h, `${prefix}-group${++groupId}`); return { canvas: ctx, context: ctx }; }
    reset(entry, w, h) { Object.assign(entry, this.create(w, h)); }
    destroy(entry) { entry.canvas = null; entry.context = null; }
  }
  const task = getDocument({ data: new Uint8Array(pdf), disableFontFace: true, isEvalSupported: false, useSystemFonts: false, stopAtErrors: true, CanvasFactory: VectorCanvasFactory });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw vectorError('multi-page equation output');
    const page = await document.getPage(1);
    const ops = await page.getOperatorList();
    const forbidden = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectGroup, OPS.paintSolidColorImageMask, OPS.shadingFill]);
    if (ops.fnArray.some(op => forbidden.has(op))) throw vectorError('soft masks, raster images or shading groups');
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== OPS.beginGroup) continue;
      const group = ops.argsArray[i][0];
      if (group.smask || group.hasSoftMask || group.knockout || group.isGray || (group.needsIsolation && !group.isolated)) throw vectorError('soft masks or non-isolated transparency groups');
    }
    const viewport = page.getViewport({ scale: 4 / 3 });
    const ctx = context(viewport.width, viewport.height, prefix);
    await page.render({ canvasContext: ctx, viewport, background: 'rgba(0,0,0,0)' }).promise;
    const svg = ctx.getSvg();
    // XMLSerializer adds the namespace from createElementNS. The library's
    // literal xmlns attribute would duplicate it and make standalone SVG invalid.
    svg.removeAttribute('xmlns');
    svg.setAttribute('width', `${width}px`);
    svg.setAttribute('height', `${height}px`);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    if (svg.querySelector('text,image,foreignObject')) throw vectorError('non-vector content');
    return new dom.window.XMLSerializer().serializeToString(svg);
  } finally { await task.destroy(); }
}
