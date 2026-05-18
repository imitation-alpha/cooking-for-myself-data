#!/usr/bin/env node
// Zero-dependency static server for local preview of _site/ only.
// Not used in production (GitHub Pages serves the artifact). Usage:
//   npm run preview:site            # http://localhost:8080
//   PORT=4000 npm run preview:site
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const siteDir = path.join(root, '_site');
const port = Number(process.env.PORT) || 8080;

if (!existsSync(siteDir)) {
  console.error('No _site/ — run `npm run build:site` first.');
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // Resolve within siteDir; reject path traversal.
  let target = path.normalize(path.join(siteDir, urlPath));
  // Containment: must be siteDir itself or strictly inside it. A bare
  // startsWith(siteDir) would also accept sibling dirs sharing the prefix
  // (e.g. _site-bak), so require an exact match or a trailing separator.
  if (target !== siteDir && !target.startsWith(siteDir + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' });
  createReadStream(target).pipe(res);
});

server.listen(port, () => console.log('Preview: http://localhost:' + port + '/'));
