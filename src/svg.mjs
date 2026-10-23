// The SVG backends use optional peer dependencies; MathML users install none.
const PEERS = {
  native: 'fontkit playwright-core @napi-rs/canvas jsdom pdfjs-dist svgcanvas',
  mathjax: 'fontkit @mathjax/src @mathjax/mathjax-modern-font',
};
async function load(backend, specifier) {
  try {
    return await import(specifier);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !/(?:fontkit|playwright-core|@napi-rs\/canvas|jsdom|pdfjs-dist|svgcanvas|@mathjax)/.test(error.message)) throw error;
    throw new Error(`renderToSVG (${backend}) needs optional peer dependencies: npm install ${PEERS[backend]}`, { cause: error });
  }
}

/** Default SVG shares the browser's real OpenType font and MathML layout. */
export async function renderToSVG(latex, options = {}) {
  if (options.backend === 'mathjax') {
    const { renderToSVG: renderLegacy } = await load('mathjax', './svg-mathjax.mjs');
    return renderLegacy(latex, options);
  }
  if (options.backend !== undefined && options.backend !== 'native') {
    throw new TypeError('backend must be native or mathjax');
  }
  const { renderToSVGNative } = await load('native', './svg-browser.mjs');
  return renderToSVGNative(latex, options);
}

export async function closeRenderer() {
  const { closeNativeRenderer } = await import('./svg-browser.mjs');
  await closeNativeRenderer();
}
