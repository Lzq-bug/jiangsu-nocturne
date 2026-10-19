/**
 * 逐机位无头截图 + 启动期报错捕获：
 *   node tools/serve.mjs 8791        （另开一个终端）
 *   node tools/shoot.mjs             （全部机位）
 *   node tools/shoot.mjs dike weir   （指定 id）
 * 出图落在 docs/shots/NN-<id>.png，尺寸 1280x720，与申报材料同一口径。
 * 浏览器只用 Edge：--headless=new + swiftshader，无 GPU 也能出图。
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.PORT || 9351);
const SIZE = (process.argv.find((a) => a.startsWith('--size=')) || '--size=1280,720').slice(7).split(',').map(Number);
const FLAGS = process.argv.filter((a) => a.startsWith('--') && !a.startsWith('--size')).map((a) => a.slice(2));
const BASE = process.env.SCENE_URL || 'http://127.0.0.1:8799/index.html';
// 标志位必须挂在最终 URL 上，SCENE_URL 走 file:// 时也一样
const URL_BASE = BASE + (FLAGS.length ? (BASE.includes('?') ? '&' : '?') + FLAGS.join('&') : '');
const OUT = join(ROOT, 'docs', 'shots');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/tmp/edge-anfeng-${PORT}`, `--window-size=${SIZE[0]},${SIZE[1]}`,
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 240; i++) {
  try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); }
}
if (!v) { child.kill(); throw new Error('Edge 调试端口没起来'); }

const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  } else if (m.method) events.push(m);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await send('Target.createTarget', { url: URL_BASE });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: SIZE[0], height: SIZE[1], deviceScaleFactor: 1, mobile: false }, sessionId);

/** 轮询就绪：别用一次长 awaitPromise，页面重载会把执行上下文打断 */
async function ping() {
  try {
    const r = await send('Runtime.evaluate', {
      expression: `!!(window.anfeng && window.anfeng.STATIONS && document.getElementById('loader').classList.contains('done'))`,
      returnByValue: true,
    }, sessionId);
    return r.result.value === true;
  } catch { return false; }
}
const t0 = Date.now();
let booted = false;
while (Date.now() - t0 < 600000) {
  await sleep(2500);
  if (await ping()) { booted = true; break; }
}
const dumpErrors = (tag) => {
  const errs = events.filter((m) => m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    .map((m) => `[${m.params.type}] ` + m.params.args.map((a) => a.description || a.value || a.type).join(' '));
  const log = events.filter((m) => m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
    .map((m) => `[log ${m.params.entry.level}] ${m.params.entry.text} @ ${m.params.entry.url || ''}:${m.params.entry.lineNumber ?? ''}`);
  const thrown = events.filter((m) => m.method === 'Runtime.exceptionThrown').map((m) => {
    const d = m.params.exceptionDetails;
    return `[throw] ${d.text} ${d.exception?.description || ''} ${(d.stack?.callFrames || []).map((f) => `at ${f.url.split('/').pop()}:${f.lineNumber}`).join(' ')}`;
  });
  const all = [...new Set([...errs, ...log, ...thrown])].filter((x) => !x.includes('favicon'));
  if (all.length) {
    console.log(`${tag}控制台（${all.length} 条）:`);
    all.slice(0, 30).forEach((x) => console.log('  ' + x));
  }
  return all;
};

if (!booted) {
  dumpErrors('启动失败。');
  child.kill();
  throw new Error('boot failed: window.anfeng 未出现');
}
const st = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ms:${Date.now() - t0}, step:document.getElementById('loader-step').textContent, ids:window.anfeng.STATIONS.map(s=>s.id)})`,
  returnByValue: true,
}, sessionId).catch(() => null);
const bootedInfo = st ? JSON.parse(st.result.value) : { ms: 0, step: '', ids: [] };
console.log(`boot ${bootedInfo.ms} ms · loader 末句「${bootedInfo.step}」· 机位 ${bootedInfo.ids.length} 个`);
dumpErrors('启动期');

await mkdir(OUT, { recursive: true });
await sleep(600);

const wanted = bootedInfo.ids
  .map((id, i) => ({ id, i }))
  .filter(({ id }) => !ONLY.length || ONLY.includes(id));

for (const { id, i } of wanted) {
  const go = await send('Runtime.evaluate', {
    expression: `(()=>{const A=window.anfeng;A.goToStation(${i},{animate:false,info:false});
      A.rig.update(0.016); A.camera.updateMatrixWorld(true);
      for(let k=0;k<8;k++) A.composer.render();
      return JSON.stringify({pos:A.camera.position.toArray().map(v=>+v.toFixed(1)),calls:A.renderer.info.render.calls});})()`,
    returnByValue: true,
  }, sessionId).catch((e) => ({ err: String(e.message) }));
  if (go.err) { console.log(`  ${id}: 机位切换失败 ${go.err}`); continue; }
  console.log(`  ${id}: ${go.result.value}`);
  await sleep(1200);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const file = join(OUT, `${String(i + 1).padStart(2, '0')}-${id}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  const stats = await send('Runtime.evaluate', {
    expression: `(async()=>{const A=window.anfeng, r=A.renderer.info;
      r.autoReset=false; r.reset();
      const t0=performance.now(); let f=0;
      while(performance.now()-t0<1200){ A.composer.render(); f++; }
      const out={calls:Math.round(r.render.calls/f), tris:Math.round(r.render.triangles/f),
        progs:r.programs?.length||0, tex:r.memory.textures, fps:+(f/((performance.now()-t0)/1000)).toFixed(1)};
      r.autoReset=true; return JSON.stringify(out);})()`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  console.log(`  ${String(i + 1).padStart(2, '0')}-${id}.png  ${stats.result.value}`);
}

const errEnd = events.filter((m) => m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error');
if (errEnd.length) console.log(`截图期间新增报错 ${errEnd.length} 条：\n` + errEnd.map((m) => '  ' + m.params.args.map((a) => a.description || a.value || '').join(' ')).slice(-6).join('\n'));

ws.close();
child.kill();
console.log('done →', OUT);
