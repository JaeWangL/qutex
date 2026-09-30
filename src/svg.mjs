/** Default SVG shares the browser's real OpenType font and MathML layout. */
export async function renderToSVG(latex, options = {}) {
  if (options.backend === 'mathjax') {
    const { renderToSVG: renderLegacy } = await import('./svg-mathjax.mjs');
    return renderLegacy(latex, options);
  }
  if (options.backend !== undefined && options.backend !== 'native') {
    throw new TypeError('backend must be native or mathjax');
  }
  const { renderToSVGNative } = await import('./svg-browser.mjs');
  return renderToSVGNative(latex, options);
}

export async function closeRenderer() {
  const { closeNativeRenderer } = await import('./svg-browser.mjs');
  await closeNativeRenderer();
}
