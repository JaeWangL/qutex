import { renderToString, temml, optionsFor } from '../../src/core.mjs';
import { withNativePage, closeNativeRenderer } from '../../src/browser-runtime.mjs';
import { pdfToVector } from '../../src/pdf-vector.mjs';

export { closeNativeRenderer };

/** The same Qutex font bytes and native MathML layout used by the browser UI. */
export async function renderToSVGNative(latex, options = {}) {
  const fontSize = options.fontSize ?? 16;
  const color = options.color ?? '#000000';
  if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 512) throw new RangeError('fontSize must be between 1 and 512 CSS pixels');
  if (!/^#[\da-f]{6}$/i.test(color)) throw new TypeError('color must be a six-digit hex color');
  const mathml = renderToString(latex, options);
  const styledFonts = new Set(['\\textbf', '\\textit', '\\textsf', '\\texttt', '\\textsc', '\\emph', 'mathbf', 'mathit', 'mathsf', 'mathsfit', 'mathtt', 'boldsymbol', 'mathbb', 'mathfrak', 'mathscr', 'mathcal']);
  const cjk = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  function checkStyle(node, styled = false) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) checkStyle(child, styled); return; }
    const active = styled || styledFonts.has(node.font);
    if (active && typeof node.text === 'string' && cjk.test(node.text)) {
      const error = new Error('Styled CJK text is not preserved by the current Temml parser');
      error.code = 'QUTEX_NATIVE_SVG_UNSUPPORTED'; throw error;
    }
    for (const [key, child] of Object.entries(node)) if (!['loc', 'token'].includes(key) && typeof child === 'object') checkStyle(child, active);
  }
  checkStyle(temml.__parse(latex, optionsFor(latex, options)));
  return withNativePage(async (page, runtime) => {
    await page.evaluate(({ mathml, fontSize, color, displayMode }) => {
      const line = document.querySelector('#line');
      line.style.fontSize = `${fontSize}px`;
      line.style.color = color;
      line.style.top = '4px';
      line.style.left = '4px';
      document.querySelector('#content').innerHTML = mathml;
      document.querySelector('math').setAttribute('displaystyle', displayMode ? 'true' : 'false');
    }, { mathml, fontSize, color, displayMode: options.displayMode ?? false });
    await page.evaluate(() => document.fonts.ready);
    const visibleText = await page.evaluate(() => [...document.querySelectorAll('math mi,math mn,math mo,math mtext,math ms')].map(node => node.textContent).join(''));
    for (const character of visibleText) {
      if (!/[\s\p{Cf}]/u.test(character) && !runtime.coveredCodepoints.has(character.codePointAt(0))) {
        const error = new Error(`Configured fonts do not cover U+${character.codePointAt(0).toString(16).toUpperCase()}`);
        error.code = 'QUTEX_NATIVE_SVG_UNSUPPORTED'; throw error;
      }
    }
    const geometry = await page.evaluate(() => {
      const math = document.querySelector('math').getBoundingClientRect();
      const baseline = document.querySelector('#baseline').getBoundingClientRect();
      const largestFont = Math.max(...[...document.querySelectorAll('math,math *')].map(node => parseFloat(getComputedStyle(node).fontSize)));
      return { x: math.x, y: math.y, width: math.width, height: math.height, baseline: baseline.top - math.top, largestFont };
    });
    if (![geometry.width, geometry.height, geometry.baseline].every(Number.isFinite) || geometry.width > runtime.maxDimension || geometry.height > runtime.maxDimension || geometry.width * geometry.height > 8_000_000) {
      throw new RangeError('Equation exceeds native vector output dimensions');
    }
    // A small transparent safety margin preserves antialiased glyph overhangs.
    // It is included in the returned geometry and never scales the formula.
    const logicalWidth = Math.max(1, geometry.width + 8), logicalHeight = Math.max(1, geometry.height + 8);
    // Keep negative bearings away from the PDF page clip before cropping SVG.
    // This reserve comes from the actual fonts' global outline bounds, including
    // explicit TeX size commands, rather than a formula-specific adjustment.
    const reserve = 0;
    const printWidth = 4096;
    const printHeight = 4096;
    if (Math.max(printWidth, printHeight) > 16384) throw new RangeError('Equation exceeds native print dimensions');
    await page.evaluate(({ y, reserve, printWidth, printHeight }) => {
      const line = document.querySelector('#line');
      line.style.top = `${8 - y + reserve}px`;
      line.style.left = `${4 + reserve}px`;
      let rule = document.querySelector('#print-page');
      if (!rule) { rule = document.createElement('style'); rule.id = 'print-page'; document.head.append(rule); }
      rule.textContent = `@page{size:${printWidth}px ${printHeight}px;margin:0}`;
      document.body.style.width = `${printWidth}px`;
    }, { y: geometry.y, reserve, printWidth, printHeight });
    const pdf = await page.pdf({ width: `${printWidth}px`, height: `${printHeight}px`, printBackground: true, preferCSSPageSize: true, timeout: 10000 });
    const vector = await pdfToVector(pdf, { width: logicalWidth, height: logicalHeight, label: latex });
    const result = await page.evaluate(({ vector, logicalWidth, logicalHeight, reserve }) => {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden';
      holder.innerHTML = vector;
      document.body.append(holder);
      try {
        const svg = holder.firstElementChild;
        const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const translated = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        translated.setAttribute('transform', `translate(${-reserve} ${-reserve})`);
        for (const child of [...svg.children]) if (child.tagName !== 'defs') translated.append(child);
        drawing.append(translated);
        svg.append(drawing);
        // MathML's logical advance box does not include calligraphic swashes.
        // Measure the actual vector paths and expand the viewport, never scale
        // or trim the glyphs to make their ink fit the logical box.
        const ink = drawing.getBBox();
        const x = Math.min(0, ink.x - 1), y = Math.min(0, ink.y - 1);
        const width = Math.max(logicalWidth, ink.x + ink.width + 1) - x;
        const height = Math.max(logicalHeight, ink.y + ink.height + 1) - y;
        svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
        svg.setAttribute('width', `${width}px`);
        svg.setAttribute('height', `${height}px`);
        return { svg: new XMLSerializer().serializeToString(svg), x, y, width, height };
      } finally { holder.remove(); }
    }, { vector, logicalWidth, logicalHeight, reserve });
    const { svg, width, height, x, y } = result;
    if (width > runtime.maxDimension || height > runtime.maxDimension || width * height > 8_000_000) throw new RangeError('Equation ink exceeds native vector output dimensions');
    const baseline = geometry.baseline + 4 - y;
    return {
      svg, mathml, width, height, baseline,
      fontFamily: 'Qutex Math', fontSha256: runtime.fontSha256,
      backend: 'temml-native-mathml/chromium-qutex-font-svg',
      contentBounds: { x: 4 - x, y: 4 - y, width: geometry.width, height: geometry.height },
      warnings: [],
    };
  });
}
