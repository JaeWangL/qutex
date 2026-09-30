import { fileURLToPath } from 'node:url';
import { openSync } from 'fontkit';
import { STATE } from '@mathjax/src/js/core/MathItem.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { MathML } from '@mathjax/src/js/input/mathml.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { MathJaxModernFont } from '@mathjax/mathjax-modern-font/js/svg.js';
import '@mathjax/src/js/util/asyncLoad/esm.js';
import { renderToString, optionsFor, temml } from './core.mjs';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
let statePromise;
let queue = Promise.resolve();

function state() {
  return statePromise ??= (async () => {
    const output = new SVG({ fontCache: 'none', fontData: MathJaxModernFont });
    // Dynamic ranges must finish before checking whether a glyph is genuinely missing.
    await output.font.loadDynamicFiles();
    const scriptFont = openSync(fileURLToPath(new URL('../fonts/QutexScript-Regular.woff2', import.meta.url)));
    output.font.createVariant('qutex-script', 'normal');
    output.font.defineChars('qutex-script', Object.fromEntries(scriptFont.characterSet.map(code => [code, glyphData(scriptFont, code)])));
    const document = mathjax.document('', {
      InputJax: new MathML(), OutputJax: output,
      renderActions: {
        qutexScript: [STATE.CONVERT + 1, () => {}, math => {
          math.root.walkTree(node => {
            if ([true, 'true'].includes(node.attributes?.get('data-qutex-script'))) node.attributes.set('mathvariant', 'qutex-script');
          });
        }],
      },
      compileError(_document, _math, error) { throw error; },
      typesetError(_document, _math, error) { throw error; },
    });
    return { output, document, fallback: null, fallbackCodepoints: new Set() };
  })();
}

function styles(node) {
  return Object.fromEntries((adaptor.getAttribute(node, 'style') || '').split(';')
    .filter(part => part.includes(':')).map(part => {
      const at = part.indexOf(':');
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
    }));
}
function children(node) { return adaptor.childNodes(node).filter(n => !adaptor.kind(n).startsWith('#')); }
function walk(node, fn) { for (const child of [...children(node)]) walk(child, fn); fn(node); }
function unsupported(detail) {
  const error = new Error(`SVG backend does not yet support ${detail}; use MathML output instead.`);
  error.code = 'QUTEX_SVG_UNSUPPORTED';
  return error;
}


function writeStyles(node, css) {
  const entries = Object.entries(css);
  if (entries.length) adaptor.setAttribute(node, 'style', entries.map(([k, v]) => `${k}:${v}`).join(';'));
  else adaptor.removeAttribute(node, 'style');
}
function border(css, edge) {
  const value = css[`border-${edge}`];
  if (!value || value === 'none') return 'none';
  const match = value.match(/\b(solid|dashed)\b/);
  if (!match || /\b(double|dotted)\b/.test(value)) throw unsupported(`table border ${value}`);
  return match[1];
}
function uniform(values, detail) {
  if (new Set(values).size !== 1) throw unsupported(`partial or inconsistent ${detail}`);
  return values[0];
}
function combineBorders(a, b) {
  if (a === 'none') return b;
  if (b === 'none' || a === b) return a;
  throw unsupported('conflicting table rules');
}
/** Full row/column rules map to MathML geometry; partial cell rules remain explicit errors. */
function normalizeTable(table) {
  const rows = children(table).filter(n => adaptor.kind(n) === 'mtr');
  const cells = rows.map(row => children(row).filter(n => adaptor.kind(n) === 'mtd'));
  if (!cells.length || !cells[0].length) return;
  const grid = cells.map(row => row.map(styles));
  if (!grid.flat().some(css => Object.keys(css).some(key => key.startsWith('border')))) return;
  const count = cells[0].length;
  if (cells.some(row => row.length !== count) || cells.flat().some(cell => adaptor.getAttribute(cell, 'columnspan') || adaptor.getAttribute(cell, 'rowspan'))) {
    throw unsupported('ruled tables with merged or uneven cells');
  }
  const horizontal = Array.from({length: rows.length + 1}, (_, r) => uniform(Array.from({length: count}, (_, c) =>
    combineBorders(r ? border(grid[r - 1][c], 'bottom') : 'none', r < rows.length ? border(grid[r][c], 'top') : 'none')), 'horizontal table rules'));
  const vertical = Array.from({length: count + 1}, (_, c) => uniform(Array.from({length: rows.length}, (_, r) =>
    combineBorders(c ? border(grid[r][c - 1], 'right') : 'none', c < count ? border(grid[r][c], 'left') : 'none')), 'vertical table rules'));
  if (rows.length > 1) adaptor.setAttribute(table, 'rowlines', horizontal.slice(1, -1).join(' '));
  if (count > 1) adaptor.setAttribute(table, 'columnlines', vertical.slice(1, -1).join(' '));
  const outer = [horizontal[0], horizontal.at(-1), vertical[0], vertical.at(-1)];
  if (outer.every(value => value === outer[0]) && outer[0] !== 'none') {
    adaptor.setAttribute(table, 'frame', outer[0]);
  } else {
    if (outer.some(value => value === 'dashed')) throw unsupported('partial dashed table frame');
    const notation = ['top', 'bottom', 'left', 'right'].filter((_, i) => outer[i] !== 'none').join(' ');
    if (notation) {
      const frame = adaptor.node('menclose', { notation });
      adaptor.replace(frame, table);
      adaptor.append(frame, table);
    }
  }
  cells.forEach((row, r) => row.forEach((cell, c) => {
    const css = grid[r][c];
    for (const key of Object.keys(css)) if (key.startsWith('border')) delete css[key];
    writeStyles(cell, css);
  }));
}

function inheritedColor(node, defaultColor) {
  for (let current = node; current; current = adaptor.parent(current)) {
    const color = styles(current).color || adaptor.getAttribute(current, 'mathcolor');
    if (color && color !== 'undefined') return color;
  }
  return defaultColor;
}

function colorBox(node, css, defaultColor) {
  if (css.padding !== '0.3em') throw unsupported('nonstandard color-box padding');
  const background = adaptor.getAttribute(node, 'mathbackground');
  const content = adaptor.node('mstyle', { mathcolor: inheritedColor(node, defaultColor) }, [...adaptor.childNodes(node)]);
  const padded = adaptor.node('mpadded', {
    width: '+0.6em', height: '+0.3em', depth: '+0.3em', lspace: '0.3em', mathbackground: background,
  }, [content]);
  if (!css.border) { adaptor.replace(padded, node); return; }
  const match = css.border.match(/^([\d.]+em) solid (#[\da-f]{6})$/i);
  if (!match) throw unsupported(`color-box border ${css.border}`);
  // Border color must not leak into the contents. The padded box already owns
  // its 0.3em insets, so suppress menclose's additional default padding.
  const framed = adaptor.node('menclose', {
    notation: 'box', mathcolor: match[2], 'data-padding': '0', 'data-thickness': match[1],
  }, [padded]);
  adaptor.replace(framed, node);
}

/** Translate Temml's browser-specific CSS into actual MathML layout semantics. */
function normalizeMathML(mathml, color) {
  const parsed = adaptor.parse(mathml, 'text/html');
  const root = adaptor.tags(adaptor.body(parsed), 'math')[0];
  if (!root) throw new Error('Temml did not return a math element');
  // Tables must be translated before the per-node pass strips cell CSS.
  walk(root, node => { if (adaptor.kind(node) === 'mtable') normalizeTable(node); });
  walk(root, node => {
    const css = styles(node);
    const classes = (adaptor.getAttribute(node, 'class') || '').split(/\s+/);
    if (classes.includes('tml-cancelto') || classes.includes('tml-shift-left') || classes.includes('ff-squash')) {
      throw unsupported(`CSS-only decoration ${classes.join(' ')}`);
    }
    if (css.color && css.color !== 'undefined') adaptor.setAttribute(node, 'mathcolor', css.color);
    if (css['font-size']) adaptor.setAttribute(node, 'mathsize', css['font-size']);
    if (css['font-weight']) {
      if (!['bold', '700', 'normal', '400'].includes(css['font-weight'])) throw unsupported(`font weight ${css['font-weight']}`);
      adaptor.setAttribute(node, 'mathvariant', ['bold', '700'].includes(css['font-weight']) ? 'bold' : 'normal');
    }
    if (classes.includes('mathscr')) adaptor.setAttribute(node, 'data-qutex-script', 'true');
    if (classes.includes('tml-right')) adaptor.setAttribute(node, 'columnalign', 'right');
    if (classes.includes('tml-left')) adaptor.setAttribute(node, 'columnalign', 'left');
    if (classes.includes('tml-jot')) adaptor.setAttribute(node, 'rowspacing', '0.5em');
    if (adaptor.getAttribute(node, 'mathbackground') && css.padding) { colorBox(node, css, color); return; }
    // \boxed uses an HTML-style border, which an SVG <g> cannot draw.
    if (css.border && adaptor.kind(node) === 'mrow') {
      const attributes = Object.fromEntries(adaptor.allAttributes(node).map(a => [a.name, a.value]));
      delete attributes.style; delete attributes.class;
      const box = adaptor.node('menclose', { ...attributes, notation: 'box' }, [...adaptor.childNodes(node)]);
      adaptor.replace(box, node);
      return;
    }
    if (Object.keys(css).some(key => key.startsWith('border'))) throw unsupported('CSS table/frame borders');
    const allowedCSS = new Set(['display', 'color', 'font-size', 'font-weight', 'math-depth', 'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom']);
    for (const key of Object.keys(css)) if (!allowedCSS.has(key)) throw unsupported(`CSS property ${key}`);
    adaptor.removeAttribute(node, 'style');
    adaptor.removeAttribute(node, 'class');
  });
  return adaptor.outerHTML(root);
}

/** Temml maps Latin variants to Unicode but currently drops CJK style intent. */
function rejectLostCjkStyles(latex, options) {
  const unsupportedFonts = new Set(['\\textbf', '\\textit', '\\textsf', '\\texttt', '\\textsc', '\\emph',
    'mathbf', 'mathit', 'mathsf', 'mathsfit', 'mathtt', 'boldsymbol', 'mathbb', 'mathfrak', 'mathscr', 'mathcal']);
  const cjk = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  function visit(value, styled = false) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) visit(item, styled); return; }
    const active = styled || unsupportedFonts.has(value.font);
    if (value.type === 'array') {
      if (value.arraystretch !== undefined && value.arraystretch !== 1) throw unsupported('nondefault arraystretch');
      if (value.rowGaps?.some(gap => gap?.number)) throw unsupported('explicit array row gaps');
      if (value.arraycolsep && (value.arraycolsep.number !== 6 || value.arraycolsep.unit !== 'pt')) throw unsupported('nondefault array column spacing');
    }
    if (active && typeof value.text === 'string' && cjk.test(value.text)) {
      const error = unsupported('styled CJK text');
      error.message = 'Styled CJK text is not preserved by the current Temml output. Neither the MathML nor SVG path implements this style yet.';
      throw error;
    }
    for (const [key, child] of Object.entries(value)) if (!['loc', 'token'].includes(key) && typeof child === 'object') visit(child, active);
  }
  visit(temml.__parse(latex, optionsFor(latex, options)));
}

function glyphData(font, code) {
  const glyph = font.glyphForCodePoint(code);
  const unit = font.unitsPerEm;
  const { minY, maxY } = glyph.bbox;
  const path = glyph.path.scale(1000 / unit).toSVG();
  return [Number.isFinite(maxY) ? Math.max(0, maxY / unit) : 0, Number.isFinite(minY) ? Math.max(0, -minY / unit) : 0, glyph.advanceWidth / unit,
    { p: path.replace(/^M/, '').replace(/Z$/, '') }];
}

function addFallbackGlyphs(state, mathml) {
  const parsed = adaptor.parse(mathml, 'text/html');
  const text = adaptor.textContent(adaptor.body(parsed));
  const used = [];
  for (const char of new Set(text)) {
    const code = char.codePointAt(0);
    if (state.fallbackCodepoints.has(code)) { used.push(char); continue; }
    // The built-in font's normal variant includes mathematical Unicode variants.
    if (state.output.font.getChar('normal', code)) continue;
    if (/\s/u.test(char)) continue;
    state.fallback ??= openSync(fileURLToPath(new URL('../fonts/upstream/noto-serif-kr/NotoSerifKR[wght].ttf', import.meta.url))).getVariation({ wght: 400 });
    if (!state.fallback.hasGlyphForCodePoint(code)) {
      throw unsupported(`glyph U+${code.toString(16).toUpperCase()}`);
    }
    const data = glyphData(state.fallback, code);
    // Register before layout: both advance width and outlines use the same font.
    // Do not reuse the browser's approximate unknown-text width then swap glyphs.
    state.output.font.defineChars('normal', { [code]: data });
    state.fallbackCodepoints.add(code);
    used.push(char);
  }
  return used;
}

async function render(latex, options) {
  const fontSize = options.fontSize ?? 16;
  const color = options.color ?? '#000000';
  if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 512) throw new RangeError('fontSize must be between 1 and 512 CSS pixels');
  if (!/^#[\da-f]{6}$/i.test(color)) throw new TypeError('color must be a six-digit hex color');
  const mathml = renderToString(latex, { ...options, throwOnError: true });
  rejectLostCjkStyles(latex, options);
  const normalized = normalizeMathML(mathml, color);
  const engine = await state();
  const usedFallback = addFallbackGlyphs(engine, normalized);
  const container = await engine.document.convertPromise(normalized, { display: options.displayMode ?? false, em: fontSize, ex: fontSize * 0.442, containerWidth: fontSize * 10000 });
  const svg = adaptor.tags(container, 'svg')[0];
  if (!svg) throw new Error('MathJax did not produce an SVG');
  // MathJax normally installs these table-rule declarations in the HTML page.
  // Inline the same values so exported SVG has no dependency on external CSS.
  for (const node of [...adaptor.tags(svg, 'line'), ...adaptor.tags(svg, 'rect')]) {
    if (!adaptor.getAttribute(node, 'data-line') && !adaptor.getAttribute(node, 'data-frame')) continue;
    adaptor.setAttribute(node, 'stroke-width', '70');
    adaptor.setAttribute(node, 'fill', 'none');
    const classes = adaptor.getAttribute(node, 'class') || '';
    if (classes.includes('mjx-dashed')) adaptor.setAttribute(node, 'stroke-dasharray', '140');
    if (classes.includes('mjx-dotted')) {
      adaptor.setAttribute(node, 'stroke-dasharray', '0,140');
      adaptor.setAttribute(node, 'stroke-linecap', 'round');
    }
  }
  const initial = adaptor.outerHTML(svg);
  if (adaptor.tags(svg, 'text').some(n => adaptor.textContent(n).trim()) || /data-mjx-error|mjx-output-error|data-mml-node="merror"/.test(initial)) {
    throw unsupported('a glyph or layout that did not produce vector paths');
  }
  if (adaptor.tags(svg, 'image').length || adaptor.tags(svg, 'foreignObject').length) throw unsupported('external image content');
  const viewBox = adaptor.getAttribute(svg, 'viewBox').split(/\s+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite)) throw new Error('Invalid SVG geometry');
  const [, top, boxWidth, boxHeight] = viewBox;
  const width = boxWidth / 1000 * fontSize;
  const height = boxHeight / 1000 * fontSize;
  const baseline = -top / 1000 * fontSize;
  adaptor.setAttribute(svg, 'width', `${width}px`);
  adaptor.setAttribute(svg, 'height', `${height}px`);
  adaptor.setAttribute(svg, 'style', `vertical-align:${-(height - baseline)}px`);
  adaptor.setAttribute(svg, 'aria-label', latex);
  // LiteAdaptor is an HTML serializer: it leaves literal '<' in attributes.
  // Standalone SVG is XML, so labels such as x<0 must be escaped as well.
  const serialized = adaptor.outerHTML(svg).replaceAll('currentColor', color)
    .replace(/(\s[\w:.-]+=")([^"]*)(")/g, (_match, prefix, value, suffix) =>
      prefix + value.replaceAll('<', '&lt;').replaceAll('>', '&gt;') + suffix);
  if (/\b(?:href|xlink:href)\s*=/.test(serialized)) throw unsupported('linked SVG resources');
  return {
    svg: serialized, mathml, width, height, baseline,
    fontFamily: 'Latin Modern (MathJax Modern)',
    backend: 'temml-mathml/mathjax-modern-svg',
    warnings: [
      'SVG uses MathJax Modern vector font data; browser MathML uses Qutex Math OTF. Layout engines may differ.',
      ...(usedFallback.length ? ['Some text glyphs use outlined Noto Serif KR Regular.'] : []),
    ],
  };
}

/** Concurrent callers are serialized because MathJax's document/font state is mutable. */
export function renderToSVG(latex, options = {}) {
  const result = queue.then(() => render(latex, options));
  queue = result.catch(() => {});
  return result;
}
