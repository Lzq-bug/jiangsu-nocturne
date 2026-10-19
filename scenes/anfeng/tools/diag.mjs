/**
 * 遮挡定位：在河坝机位逐项关掉候选对象，各出一张小图，看泥色是谁画的。
 *   node tools/diag.mjs            （默认 weir 机位）
 *   node tools/diag.mjs aerial
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.PORT || 9352);
const STATION = process.argv[2] || 'weir';
const OUT = join(ROOT, 'shots');
const URL_BASE = process.env.SCENE_URL || 'http://127.0.0.1:8799/index.html';

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/tmp/edge-anfeng-diag', '--window-size=900,520',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'error';
    return 'EX:' + d.slice(0, 120).replace(/[\r\n]+/g, ' | ');
  }
  return r.result?.value;
};

const { targetId } = await send('Target.createTarget', { url: URL_BASE });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 520, deviceScaleFactor: 1, mobile: false }, sessionId);

for (let i = 0; i < 120; i++) {
  await sleep(2500);
  if (await ev(`!!(window.anfeng && document.getElementById('loader').classList.contains('done'))`)) break;
}
const i0 = await ev(`window.anfeng.STATIONS.findIndex(s=>s.id===${JSON.stringify(STATION)})`);
await ev(`window.anfeng.goToStation(${i0},{animate:false,info:false}); 1`);
await sleep(4000);

await mkdir(OUT, { recursive: true });
const shot = async (tag) => {
  await ev(`(()=>{const A=window.anfeng; A.rig.update(0.016); A.camera.updateMatrixWorld(true); for(let k=0;k<6;k++) A.composer.render(); return 1;})()`);
  const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(join(OUT, `diag-${tag}.png`), Buffer.from(s.data, 'base64'));
  console.log('  wrote diag-' + tag + '.png');
};

// 先报一下候选对象在不在
console.log(await ev(`(()=>{const A=window.anfeng;
  const names=['reflections','town','ground','works','strings','chuanchang-water','sea','hotspots'];
  const found = {};
  for(const n of names){ let o=null; A.scene.traverse(x=>{ if(!o && x.name===n) o=x; }); found[n]= !!o; }
  found.columnsMesh = !!A.columns?.mesh;
  return JSON.stringify(found);})()`).catch(() => 'probe failed'));

await shot('00-base');
const targets = [
  ['reflections', `(()=>{const A=window.anfeng; let o=null; A.scene.traverse(x=>{if(x.name==='reflections')o=x;}); if(o)o.visible=!o.visible; return o?o.visible:'none';})()`],
  ['water-canal', `(()=>{const A=window.anfeng; A.water.canal.visible=!A.water.canal.visible; return A.water.canal.visible;})()`],
  ['light-columns', `(()=>{const A=window.anfeng; A.columns.mesh.visible=!A.columns.mesh.visible; return A.columns.mesh.visible;})()`],
  ['ground', `(()=>{const A=window.anfeng; let o=null; A.scene.traverse(x=>{if(x.name==='ground')o=x;}); if(o)o.visible=!o.visible; return o?o.visible:'none';})()`],
  ['sea', `(()=>{const A=window.anfeng; A.water.sea.visible=!A.water.sea.visible; return A.water.sea.visible;})()`],
];
for (const [tag, expr] of targets) {
  const st = await ev(expr);
  const safe = String(st).replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  await shot(`${tag}-${safe}`);
  console.log(`  ${tag} -> ${st}`);
  await ev(expr);                       // 还原
}
ws.close();
child.kill();
