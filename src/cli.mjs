#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { renderToString } from './core.mjs';

// stdin is literal TeX, or JSON with {latex, options}; stdout never includes logs.
let svgInvoked = false;
try {
  const [format = 'svg', destination] = process.argv.slice(2);
  if (!['svg', 'mathml', 'json'].includes(format)) throw new Error('Usage: qutex [svg|mathml|json] [output-file] < input.tex');
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 65536) throw new Error('Input exceeds 64 KiB');
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8');
  let latex = input.trim();
  let options = {};
  if (latex.startsWith('{"')) ({ latex, options = {} } = JSON.parse(latex));
  let output;
  if (format === 'mathml') output = renderToString(latex, options);
  else {
    svgInvoked = true;
    const { renderToSVG } = await import('./svg.mjs');
    const result = await renderToSVG(latex, options);
    output = format === 'json' ? JSON.stringify(result) : result.svg;
  }
  if (destination) await writeFile(destination, output);
  else process.stdout.write(output + '\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (svgInvoked) {
    const { closeRenderer } = await import('./svg.mjs');
    await closeRenderer();
  }
}
