/**
 * 开发期探针 / 连拍：起一个无头 Edge，用 CDP 打开场景页，把控制台与异常原样打回来，
 * 每张静帧等加载条走完再拍。比 --virtual-time-budget 直出图快得多，也看得清报错。
 *
 *   node mingyue/probe.mjs                                  # 单张：默认 hall
 *   node mingyue/probe.mjs "http://…#bare&station=pool" out.png
 *   node mingyue/probe.mjs --batch lane,gate,pool           # 一个浏览器连拍多个机位
 *   node mingyue/probe.mjs --batch all --flood              # 顺带把「邀月」状态拍进去
 *
 * 环境变量：CDP_PORT（默认 9333，别的会话也在开无头 Edge，撞了就换）、WAIT（首帧等待，默认 8000）
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8899/mingyue/index.html';
const OUTDIR = process.env.OUTDIR || 'D:/3D/docs/shots';
const PORT = Number(process.env.CDP_PORT || 9333);
const WAIT = Number(process.env.WAIT || 8000);
const ALL = ['lane', 'gate', 'corridor', 'hall', 'balcony', 'pool', 'paving', 'well', 'aerial'];

const argv = process.argv.slice(2);
const batchAt = argv.indexOf('--batch');
const flood = argv.includes('--flood');
let jobs;
if (batchAt >= 0) {
  const arg = argv[batchAt + 1] || 'all';
  const list = arg === 'all' ? ALL : arg.split(',');
  jobs = list.map((s) => ({
    url: `${BASE}?v=${Math.random().toString(36).slice(2, 7)}#bare&station=${s}${flood ? '&flood=1' : ''}`,
    out: `${OUTDIR}/my-${s}${flood ? '-flood' : ''}.jpg`,
  }));
} else {
  jobs = [{ url: argv[0] || `${BASE}#bare&station=hall`, out: argv[1] || `${OUTDIR}/probe.png` }];
}

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--use-angle=swiftshader',
  '--disable-gpu-compositing', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=D:/tmp/myprof-cdp-${PORT}`,
  '--window-size=1440,900',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (path, init) => (await fetch(`http://127.0.0.1:${PORT}${path}`, init)).json();

let version = null;
for (let i = 0; i < 60 && !version; i++) {
  await sleep(400);
  try { version = await json('/json/version'); } catch { /* 还在起 */ }
}
if (!version) {
  console.error(`端口 ${PORT} 上没有 CDP：要么 Edge 没起来，要么被别的实例占了。换个 CDP_PORT 再跑。`);
  proc.kill();
  process.exit(1);
}

let target = null;
for (let i = 0; i < 20 && !target; i++) {
  try { target = await json(`/json/new?${encodeURIComponent(jobs[0].url)}`, { method: 'PUT' }); } catch { await sleep(400); }
}
if (!target) {
  console.error('开不了新页面');
  proc.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || [])
      .map((a) => a.description ?? (a.value === undefined ? a.type : String(a.value)))
      .join(' ');
    if (!/Download the React|three.module/.test(text)) console.log(`[console.${msg.params.type}] ${text.slice(0, 600)}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log(`[exception] ${(d.exception?.description || d.text || '').slice(0, 600)}`);
  }
};

const SCAN = `(() => {
  const s = window.mingyue && window.mingyue.scene;
  if (!s) return 'no scene';
  const out = [];
  const path = (o) => { let p = [], n = o; while (n && n !== s) { p.unshift(n.name || n.type); n = n.parent; } return p.join('/'); };
  s.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!pos) return;
    const a = pos.array;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) { out.push(path(o) + ' [' + o.geometry.type + ' @' + i + ']'); break; }
    }
  });
  return out.length ? out.slice(0, 8).join(' | ') : 'no NaN geometry';
})()`;

const POLL = `JSON.stringify({
  loader: (document.querySelector('#loader p')?.textContent || '').slice(0, 220),
  done: document.querySelector('#loader')?.classList.contains('done'),
  fps: document.querySelector('#fps')?.textContent || '',
})`;

await send('Page.enable');
await send('Runtime.enable');

let scanned = false;
for (const job of jobs) {
  await send('Page.navigate', { url: job.url });
  await sleep(WAIT);
  let st = {};
  for (let i = 0; i < 40; i++) {
    const r = await send('Runtime.evaluate', { expression: POLL, returnByValue: true });
    st = JSON.parse(r.result.value || '{}');
    if (st.done || /加载失败/.test(st.loader || '')) break;
    await sleep(2000);
  }
  if (!scanned) {
    const bad = await send('Runtime.evaluate', { expression: SCAN, returnByValue: true });
    console.log(`[nan-scan] ${bad.result.value}`);
    scanned = true;
  }
  const tag = job.out.split('/').pop();
  console.log(`[shot] ${tag} ${st.done ? 'ready' : 'NOT READY'} ${st.fps || ''} ${st.loader || ''}`);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  await mkdir(OUTDIR, { recursive: true });
  await writeFile(job.out, Buffer.from(shot.data, 'base64'));
}

ws.close();
try { await send('Browser.close'); } catch { /* socket already gone */ }
proc.kill();
process.exit(0);
