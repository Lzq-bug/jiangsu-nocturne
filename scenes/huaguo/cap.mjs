#!/usr/bin/env node
/**
 * 本景自用的连拍：一次加载，逐机位在页面里 toDataURL 落盘。
 * 为什么要自己拍：SwiftShader 画满屏半透明海面时一帧要几十秒，
 * Page.captureScreenshot 抓的是合成器表面，会拿到没画完的黑块；
 * 同一次 JS 任务里 render() 之后直接 toDataURL 读的是 drawingBuffer，不会骗人。
 *   node huaguo/cap.mjs [station...] [--q=veil=0&tower=44] [--port=9366] [--frames=14]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const POS = argv.filter((a) => !a.startsWith('--'));
const BASE = flag('base', 'http://127.0.0.1:8882');
const PAGE = flag('page', '/huaguo/index.html');
const HANDLE = flag('handle', 'huaguo');
const PORT = Number(flag('port', 9366));
const SIZE = flag('size', '1440,900');
const Q = flag('q', '');
const NOPASS = flag('nopass', '0');
const FRAMES = Number(flag('frames', 14));
const WAIT = Number(flag('wait', 900));
const OUT = join(process.cwd(), 'huaguo', 'shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
try {
  const p = await fetch(BASE);
  if (!p.ok) throw new Error(String(p.status));
} catch {
  console.log(`连不上 ${BASE} — 先起服务：node tools/serve.mjs 8882`);
  process.exit(2);
}

const browser = spawn(EDGE, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), `edge-cap-${PORT}`)}`, `--window-size=${SIZE}`, 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { browser.kill('SIGTERM'); } catch { /* gone */ } });

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`${msg.error.message} ${JSON.stringify(msg.error.data || '')}`));
        else p.resolve(msg.result);
      } else for (const fn of this.listeners) fn(msg);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId, timeoutMs = 180000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method} 超时`)); }, timeoutMs);
      this.pending.set(id, { resolve: res, reject: rej, timer });
    });
  }
  on(fn) { this.listeners.push(fn); }
}

let endpoint = null;
for (let i = 0; i < 600; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) { endpoint = (await r.json()).webSocketDebuggerUrl; break; }
  } catch { /* booting */ }
  await sleep(500);
}
if (!endpoint) { console.log('连不上 Edge 调试端口（换个 --port）'); process.exit(2); }

const cdp = await CDP.connect(endpoint);
const notes = [];
cdp.on((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    notes.push(`EXCEPTION ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    notes.push(`${msg.params.type.toUpperCase()}: ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  }
});
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
const [w, h] = SIZE.split(',').map(Number);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);

const ev = async (expr, timeoutMs = 180000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId, timeoutMs);
    if (r.exceptionDetails) notes.push(`EVAL ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result?.value;
  } catch (e) { notes.push(`EVAL ${e.message}`); return undefined; }
};

const url = `${BASE}${PAGE}?r=${Date.now()}&bare=1${Q ? `&${Q}` : ''}#bare`;
console.log(`载入 ${url}`);
await cdp.send('Page.navigate', { url }, sessionId);
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < WAIT * 1000) {
  const ready = await ev(`!!window.${HANDLE} && document.getElementById('loader')?.classList.contains('done')`);
  if (ready) { console.log(`就绪（${((Date.now() - t0) / 60).toFixed(1)} 分钟）`); break; }
  const step = String(await ev(`document.getElementById('loader-step')?.textContent || ''`) || '');
  if (/失败/.test(step)) { console.log(`页面自报失败：${step}`); process.exit(1); }
  if (step !== last) { last = step; process.stdout.write(`\r  ${step.padEnd(38).slice(0, 38)}`); }
  await sleep(4000);
}
// 画质自适应会在 SwiftShader 下自己关倒影，静帧要的是全路径
await ev(`(() => { const el = document.getElementById('c-quality'); if (el && el.checked) el.click(); return true; })()`);
await sleep(6000);

const ids = POS.length ? POS : JSON.parse(await ev(`window.${HANDLE}.STATIONS.map(s=>s.id).join(',')
  .split(',').map(x=>x).join('|') && JSON.stringify(window.${HANDLE}.STATIONS.map(s=>s.id))`));
for (const id of ids) {
  const data = await ev(`(async () => {
    const a = window.${HANDLE};
    const i = a.STATIONS.findIndex((s) => s.id === ${JSON.stringify(id)});
    if (i < 0) return 'NO_SUCH_STATION';
    a.goToStation(i, { info: false, animate: false });
    for (let k = 0; k < ${FRAMES}; k++) await new Promise((r) => requestAnimationFrame(r));
    a.renderer.render(a.scene, a.camera);
    ${NOPASS === '1' ? '' : 'a.composer.render();'}
    return document.getElementById('stage').toDataURL('image/png');
  })()`, 600000);
  if (!data || data === 'NO_SUCH_STATION') { console.log(`× ${id} 没拍到`); continue; }
  const b64 = data.slice(data.indexOf(',') + 1);
  const file = join(OUT, `${id}.png`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`ok ${id}.png  ${(Buffer.byteLength(b64) / 1024).toFixed(0)} KB`);
}
if (notes.length) {
  console.log('\n控制台：');
  for (const n of [...new Set(notes)].slice(-14)) console.log('  ' + n.slice(0, 220));
}
process.exit(0);
