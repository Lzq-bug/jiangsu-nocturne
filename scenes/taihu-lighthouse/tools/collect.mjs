/**
 * 机位截图收集服务（只用于开发期）。
 * 预览浏览器是无头 0×0 视口，页面里只能离屏渲染再回传，这里把 PNG 落盘。
 *   node tools/collect.mjs [port]     默认 8767
 * 页面侧：fetch('http://127.0.0.1:8767/shot/名字', {method:'POST', body: dataURL})
 */
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'shots');
const PORT = Number(process.argv[2] || process.env.PORT || 8767);

const server = createServer(async (req, res) => {
  // 页面在 8766，这里是跨源回传；只允许本机，只收 POST
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST' || !req.url.startsWith('/shot/')) {
    res.writeHead(405).end('no');
    return;
  }
  const raw = decodeURIComponent(req.url.slice(6)).replace(/[^\w.-]/g, '_').slice(0, 60) || 'shot';
  const name = /\.(png|jpe?g)$/i.test(raw) ? raw : `${raw}.png`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  const comma = body.indexOf(',');
  const raw = body.startsWith('data:') && comma > 0 ? body.slice(comma + 1) : body;
  const file = resolve(OUT, `${name}.png`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(raw, 'base64'));
  console.log(`${name}.png  ${(Buffer.from(raw, 'base64').length / 1048576).toFixed(2)} MB`);
  res.writeHead(200).end('ok');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`截图收集 → ${OUT}  (port ${PORT})`);
});
