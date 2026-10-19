/**
 * Dev preview server for the Qinhuai 3D panorama — no dependencies, no install step.
 * ES modules are blocked over file://, so the page has to come from http://.
 *   node tools/serve.mjs [port] [root]   # root 相对工程根，默认工程根本身
 *   node tools/serve.mjs 4173 dist       # 只发构建好的单文件站点
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
// 第二个参数换掉服务根目录；不传就还是整个工程，老调用方式行为不变
const SITE = process.argv[3] ? resolve(ROOT, process.argv[3]) : ROOT;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';

    const file = resolve(join(SITE, normalize(path)));
    // never serve anything outside the directory we were asked to root at
    if (file !== SITE && !file.startsWith(SITE + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(301, { Location: `${path}/` }).end();
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      // edited files must never come back from the browser cache
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`清名桥 · 运河灯河 3D 夜景 → http://127.0.0.1:${PORT}/index.html`);
  // 只传端口时行为与以前一致：根目录就是工程根，不加多余的一行
  if (SITE !== ROOT) console.log(`站点根目录：${SITE}`);
  console.log('Ctrl+C 退出');
});
