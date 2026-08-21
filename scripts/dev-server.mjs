import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);
const TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
]);

createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let target = path.resolve(ROOT, `.${requestPath}`);
    if (!target.startsWith(`${ROOT}${path.sep}`) && target !== ROOT) throw new Error('unsafe path');
    let details = await stat(target);
    if (details.isDirectory()) {
      target = path.join(target, 'index.html');
      details = await stat(target);
    }
    response.writeHead(200, {
      'Content-Type': TYPES.get(path.extname(target)) || 'application/octet-stream',
      'Content-Length': details.size,
      'Cache-Control': 'no-cache'
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Doc Ideas is available at http://127.0.0.1:${PORT}`);
});
