#!/usr/bin/env node
/**
 * 机位诊断：静帧一片黑时，先问"射线打到了什么"，别猜。
 * 一个浏览器会话里逐机位走位，打印相机姿态、正前方最近的六个命中、
 * 各组几何的包围盒与 draw call —— 本景自用，不进共享 tools/。
 *
 *   node tools/probe.mjs tower deck rail aerial
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ids = argv.filter((a) => !a.startsWith('--'));
const PORT = Number(flag('port', 9341));
const BASE = flag('base', 'http://127.0.0.1:8866');
const PAGE = flag('page', 'njbridge/index.html');
const HANDLE = flag('handle', 'njbridge');
const SIZE = flag('size', '1200,750');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), `edge-probe-${PORT}`)}`,
  `--window-size=${SIZE}`, 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { browser.kill('SIGTERM'); } catch { /* gone */ } });

async function endpoint() {
  for (let i = 0; i < 400; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch { /* up */ }
    await sleep(500);
  }
  throw new Error('连不上调试端口，换个 --port');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id !== undefined) { const p = this.pending.get(m.id); this.pending.delete(m.id); if (!p) return; clearTimeout(p.t); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    else for (const fn of this.listeners) fn(m);
  }); }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); }); return new CDP(ws); }
  on(fn) { this.listeners.push(fn); }
  send(method, params = {}, sid, ms = 60000) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); return new Promise((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method} 超时`)); }, ms); this.pending.set(id, { resolve: res, reject: rej, t }); }); }
}

const cdp = await CDP.connect(await endpoint());
let sid = null;
const errs = [];
cdp.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') errs.push(`EXCEPTION ${m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(`ERROR ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
});

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
({ sessionId: sid } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
await cdp.send('Page.enable', {}, sid);
await cdp.send('Runtime.enable', {}, sid);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: Number(SIZE.split(',')[0]), height: Number(SIZE.split(',')[1]), deviceScaleFactor: 1, mobile: false }, sid);

const ev = async (expr) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid, 40000);
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result?.value;
  } catch (e) { return { __err: e.message }; }
};

await cdp.send('Page.navigate', { url: `${BASE}/${PAGE}?bare=1&debug=1&noaq=1&r=${Date.now()}` }, sid);
for (let i = 0; i < 900; i++) {
  const ready = await ev(`!!window.${HANDLE} && document.getElementById('loader').classList.contains('done')`);
  if (ready === true) break;
  await sleep(1000);
}
console.log('就绪：', await ev(`document.getElementById('loader-step').textContent`));

const DIAG = `(() => {
  const a = window.${HANDLE}, T = window.THREE;
  const cam = a.camera; cam.updateMatrixWorld(true);
  const dir = cam.getWorldDirection(new T.Vector3());
  const rc = new T.Raycaster(cam.position, dir, 0.2, 6000);
  rc.camera = cam;                       // sprite 的 raycast 要这个
  let hits = [];
  try {
    hits = rc.intersectObjects(a.scene.children, true).filter((h) => !h.object.isSprite).slice(0, 4).map((h) => ({
      n: h.object.name || (h.object.material && h.object.material.name) || h.object.type,
      d: +h.distance.toFixed(1),
      p: h.point.toArray().map((v) => +v.toFixed(1)),
    }));
  } catch (e) { hits = ['raycast 失败：' + e.message]; }
  const boxes = {};
  for (const nm of ['towers','main-bridge','approach','ground','lamps','city','river','flags','cargo-ship','reflections']) {
    const o = a.scene.getObjectByName(nm);
    if (!o) { boxes[nm] = 'MISSING'; continue; }
    const b = new T.Box3().setFromObject(o);
    boxes[nm] = [+b.min.x.toFixed(0), +b.min.y.toFixed(0), +b.min.z.toFixed(0), +b.max.x.toFixed(0), +b.max.y.toFixed(0), +b.max.z.toFixed(0)];
  }
  const lights = [];
  a.scene.traverse((o) => { if (o.isLight) lights.push((o.type) + '@' + o.position.toArray().map((v) => +v.toFixed(0)).join(',') + '=' + +(o.intensity || 0).toFixed(0)); });
  return JSON.stringify({
    eye: cam.position.toArray().map((v) => +v.toFixed(2)),
    dir: dir.toArray().map((v) => +v.toFixed(3)),
    fov: cam.fov, hits, boxes, lights,
    calls: a.renderer.info.render.calls, tris: a.renderer.info.render.triangles,
  });
})()`;

for (const id of ids.length ? ids : ['tower']) {
  const idx = await ev(`window.${HANDLE}.STATIONS.findIndex((s) => s.id === ${JSON.stringify(id)})`);
  if (idx < 0) { console.log(`没有机位 ${id}`); continue; }
  await ev(`window.${HANDLE}.goToStation(${idx}, { info: false, animate: false }); 'ok'`);
  await sleep(4000);
  console.log(`\n### ${id}`);
  const out = await ev(DIAG);
  console.log(typeof out === 'string' ? out : JSON.stringify(out));
}
if (errs.length) console.log('\n控制台：\n  ' + [...new Set(errs)].slice(0, 12).join('\n  '));
process.exit(0);
