import { parentPort } from 'node:worker_threads';
import { renderToString } from './core.mjs';
import { renderToSVG, closeRenderer } from './svg.mjs';
let closing = false;
let svgInvoked = false;
parentPort.on('message', async ({ id, latex, options, format, type }) => {
  if (type === 'close') {
    if (closing) return;
    closing = true;
    try { if (svgInvoked) await closeRenderer(); }
    finally { parentPort.close(); }
    return;
  }
  if (closing) return;
  try {
    if (format !== 'mathml') svgInvoked = true;
    const result = format === 'mathml' ? { mathml: renderToString(latex, options) } : await renderToSVG(latex, options);
    if (!closing) parentPort.postMessage({ id, result });
  } catch (error) { if (!closing) parentPort.postMessage({ id, error: error.message }); }
});
