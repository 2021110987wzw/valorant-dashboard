#!/usr/bin/env node
/**
 * 本地静态服务器 —— 预览无畏契约折扣看板
 * 用法: node scripts/server.mjs  （默认 http://127.0.0.1:8347 ，可用 PORT 环境变量覆盖）
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = Number(process.env.PORT || 8347);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let file = normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '') || 'index.html';
    const abs = resolve(ROOT, file);
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    const body = await readFile(abs);
    res.writeHead(200, { 'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => {
  console.log(`无畏契约折扣看板已启动: http://127.0.0.1:${PORT}`);
});
