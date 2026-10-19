#!/usr/bin/env node
/**
 * 起动自检：把页面开起来，盯 loader 与控制台，把第一条异常打出来。
 * 连拍前先跑这个——boot() 在很前面就抛错时，shoot.mjs 只会表现为"一直等加载"。
 *   node yunlong/tools/check.mjs [--base=http://127.0.0.1:8889] [--port=9348] [--wait=180]
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (k, d) => { const h = argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const BASE = flag('base', 'http://127.0.0.1:8889');
const PORT = Number(flag('port', 9348));
const WAIT = Number(flag('wait', 180));
const PAGE = flag('page', '/yunlong/index.html');
const HANDLE = flag('handle', 'yunlong');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), `edge-check-${PORT}`)}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { browser.kill('SIGTERM'); } catch { /* gone */ } });

let endpoint = null;
for (let i = 0; i < 400 && !endpoint; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) endpoint = (await r.json()).webSocketDebuggerUrl;
  } catch { /* 还在起来 */ }
  await sleep(400);
}
if (!endpoint) { console.log('连不上 Edge 的调试端口'); process.exit(2); }

const ws = new WebSocket(endpoint);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id !== undefined) {
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`EXCEPTION ${d.exception?.description || d.text}\n    @ ${d.url || ''}:${d.lineNumber || 0}`);
  }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'log'].includes(m.params.type)) {
    logs.push(`${m.params.type.toUpperCase()}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level !== 'debug') {
    logs.push(`LOG ${m.params.entry.level}: ${String(m.params.entry.text).slice(0, 300)}`);
  }
});
const send = (method, params = {}, sid, ms = 30000) => new Promise((res, rej) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
  const timer = setTimeout(() => { pending.delete(i); rej(new Error(`${method} 超时`)); }, ms);
  pending.set(i, { resolve: res, reject: rej, timer });
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: `${BASE}${PAGE}?r=${Date.now()}&bare=1` }, sessionId);

const evalx = async (expr) => {
  try {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    return r.result?.value;
  } catch (e) { return `EVALERR ${e.message}`; }
};

let done = false;
for (let i = 0; i < WAIT * 2 && !done; i++) {
  done = await evalx(`!!window.${HANDLE} && document.getElementById('loader')?.classList.contains('done')`);
  if (done) break;
  await sleep(500);
}
const step = await evalx(`document.getElementById('loader-step')?.textContent || ''`);
const info = await evalx(`(() => { const a = window.${HANDLE}; if (!a) return 'no handle';
  try { a.renderer.render(a.scene, a.camera); const i = a.renderer.info;
    return \`\${i.render.calls} calls / \${(i.render.triangles/1000).toFixed(0)}k tris / geoms \${i.memory.geometries}\`; }
  catch (e) { return 'render threw: ' + e.message; } })()`);

console.log(`ready=${!!done}  loader-step="${step}"\n${info}`);

/** 定位用：--diag="window.yunlong.……" 直接求值并打印 */
const diag = flag('diag', null);
if (diag) {
  const out = await evalx(`(() => { try { const v = (${diag}); return typeof v === 'string' ? v : JSON.stringify(v); }
    catch (e) { return 'DIAGERR ' + e.message; } })()`);
  console.log('diag:', out);
}

const uniq = [...new Set(logs)];
console.log(uniq.length ? '\n--- 控制台 ---\n' + uniq.slice(0, 25).join('\n') : '\n（控制台无输出）');
ws.close();
browser.kill('SIGTERM');
process.exit(0);
