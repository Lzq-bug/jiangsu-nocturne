/**
 * 无头校验：启 Edge（远程调试）→ CDP 连上 → 收 console/异常 → 逐机位出图。
 *   node tools/shoot.mjs [station ...]
 * 机位省略时拍全部。图落 shots/<id>.png，异常与告警打到 stdout。
 *
 * 页面里 window.nantong 暴露了 goToStation，所以换机位只调函数、不重载页面
 * （改 hash 不会触发 reload，靠 URL 切机位会拍到上一个画面）。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.PORT || 9333);
const URL_BASE = process.env.SHOT_URL || 'http://127.0.0.1:8801/index.html';
const W = Number(process.env.SHOT_W || 1280), H = Number(process.env.SHOT_H || 800);
const want = process.argv.slice(2);

const profile = await mkdtemp(join(tmpdir(), 'nt-shot-'));
const edge = spawn(EDGE, [
  '--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`, '--use-angle=swiftshader', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', URL_BASE,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Edge 调试端口没起来');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let id = 0;
const waiting = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve: res, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else res(msg.result);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  waiting.set(n, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async (expression, { soft = false } = {}) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const msg = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
    if (soft) { console.log('页内异常：', String(msg).split('\n').slice(0, 3).join('\n')); return null; }
    throw new Error(msg);
  }
  return r.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

/* 等 boot 跑完：loader 上会挂 done，或把异常写进 #loader-step */
let ready = false;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  ready = await evaluate(`!!(window.nantong && window.nantong.STATIONS
    && document.getElementById('loader').classList.contains('done'))`);
  if (ready) break;
  if (i % 10 === 9) console.log(`… 等待加载 ${i + 1}s`);
}

const drain = () => {
  const lines = [];
  for (const e of events.splice(0)) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      lines.push(`EXCEPTION ${d.exception?.className || ''}: ${d.exception?.description || d.text}`);
    } else if (e.method === 'Runtime.consoleAPICalled' && /error|warning/.test(e.params.type)) {
      const args = (e.params.args || []).map((a) => a.description ?? a.value).join(' ');
      lines.push(`${e.params.type.toUpperCase()} ${args}`);
    } else if (e.method === 'Log.entryAdded' && /error|warning/.test(e.params.entry.level)) {
      lines.push(`${e.params.entry.level.toUpperCase()} [${e.params.entry.source}] ${e.params.entry.text}`);
    }
  }
  return lines;
};

if (!ready) console.log('!! 页面没有加载完成（loader 未 done）');
console.log('loader 文案：', await evaluate(`document.getElementById('loader-step').textContent`));
console.log(drain().join('\n') || '（启动无报错）');

const stations = await evaluate('window.nantong && window.nantong.STATIONS ? window.nantong.STATIONS.map(s => s.id) : []');
console.log('机位：', JSON.stringify(stations));
const list = want.length ? want : stations;
await mkdir(join(ROOT, 'shots'), { recursive: true });

for (const sid of list) {
  const idx = stations.indexOf(sid);
  if (idx < 0) { console.log(`未知机位 ${sid}`); continue; }
  await evaluate(`window.nantong.setMode('pano'); window.nantong.goToStation(${idx}, {info:false, animate:false}); 1`, { soft: true });
  // 让波纹与船走一段，画面才是"夜里在动"的那一帧
  await sleep(4000);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(ROOT, 'shots', `${sid}.png`), Buffer.from(shot.data, 'base64'));
  const errs = drain();
  console.log(`— ${sid} 已拍${errs.length ? '\n' + errs.join('\n') : ''}`);
}

const stats = await evaluate(`(function(){
  const el = document.getElementById('fps');
  const r = window.nantong && window.nantong.renderer;
  if (!r) return 'no renderer';
  const i = r.info;
  return (el ? el.textContent + ' · ' : '') + 'draw ' + i.render.calls + ' · tri ' + (i.render.triangles / 1000).toFixed(0) + 'k · geo ' + i.memory.geometries;
})()`);
console.log('性能：', stats);

ws.close();
edge.kill();
try { await rm(profile, { recursive: true, force: true }); } catch { /* Edge 还锁着 pma，随系统回收 */ }
