// Production server for hosts like Railway: the login + database API (server/api.mjs, active when
// DATABASE_URL is set) and the Vite build in dist/, falling back to index.html so client-side
// routes (/employees, /salary, …) load on refresh.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, initApi } from './server/api.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function fileFor(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const path = join(ROOT, rel);
  if (!path.startsWith(ROOT)) return null;
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

const online = await initApi();

createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url, 'http://x').pathname;
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (await handleApi(req, res, urlPath)) return;
    let path = await fileFor(urlPath);
    if (!path && urlPath.startsWith('/assets/')) return res.writeHead(404).end('Not found');
    path ||= join(ROOT, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      // Hashed build assets never change; everything else must be revalidated.
      'Cache-Control': urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500).end('Server error');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`Serving dist on port ${PORT}${online ? ' with database + login' : ' (no DATABASE_URL: offline mode)'}`));
