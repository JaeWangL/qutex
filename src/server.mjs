import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { RenderPool } from './pool.mjs';
import { optionsFor, version } from './core.mjs';

export function createServer() {
  const pool = new RenderPool();
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const cache = new Map();
  const inFlight = new Map();
  let cacheBytes = 0;
  function reply(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && pathname === '/health') return reply(res, 200, { ok: true, version });
      if (req.method === 'GET' && pathname.startsWith('/assets/')) {
        const relative = decodeURIComponent(pathname.slice(8));
        const file = resolve(root, relative);
        if (!file.startsWith(resolve(root) + sep)) return reply(res, 404, { error: 'Not found' });
        const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.otf': 'font/otf', '.json': 'application/json', '.txt': 'text/plain' };
        const bytes = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': relative.startsWith(`v${version}/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
          'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
        return res.end(bytes);
      }
      if (req.method !== 'POST' || pathname !== '/v1/render') return reply(res, 404, { error: 'Not found' });
      if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { error: 'Use application/json' });
      const parts = []; let length = 0;
      for await (const part of req) {
        length += part.length;
        if (length > 65536) { reply(res, 413, { error: 'Request exceeds 64 KiB' }); return; }
        parts.push(part);
      }
      const { latex, options = {}, format = 'svg' } = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!['mathml', 'svg'].includes(format)) throw new Error('format must be mathml or svg');
      optionsFor(latex, options);
      const key = JSON.stringify([latex, options, format]);
      if (cache.has(key)) return reply(res, 200, { ...cache.get(key).value, cacheHit: true });
      if (inFlight.has(key)) return reply(res, 200, { ...await inFlight.get(key), cacheHit: false, sharedWork: true });
      const work = pool.render({ latex, options, format });
      inFlight.set(key, work);
      let result;
      try { result = await work; } finally { inFlight.delete(key); }
      const bytes = Buffer.byteLength(JSON.stringify(result)) + Buffer.byteLength(key);
      if (bytes <= 1024 * 1024) {
        if (cache.has(key)) { cacheBytes -= cache.get(key).bytes; cache.delete(key); }
        while (cache.size >= 256 || cacheBytes + bytes > 16 * 1024 * 1024) {
          const oldest = cache.keys().next().value;
          cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest);
        }
        cache.set(key, { value: result, bytes }); cacheBytes += bytes;
      }
      reply(res, 200, { ...result, cacheHit: false });
    } catch (error) {
      if (res.headersSent) return;
      reply(res, error.code === 'ENOENT' ? 404 : error.message === 'Renderer busy' ? 503 : 422, { error: error.message });
    }
  });
  server.on('close', () => void pool.close());
  server.requestTimeout = 20000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.QUTEX_HOST ?? '127.0.0.1';
  const port = Number(process.env.QUTEX_PORT ?? 8774);
  const server = createServer();
  server.listen(port, host, () => console.log(`Qutex ${version}: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
