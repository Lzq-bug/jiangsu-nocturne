/**
 * 加载探针：看个园这景在软件渲染下到底卡在哪一步、有多少 draw call。
 *   node tools/probe.mjs [station-id]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const st = process.argv[2] || 'men';
const PORT = 9342;
const BASE = `http://127.0.0.1:8793/index.html?probe=1&st=${st}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, '--window-size=900,520', 'about:blank',
], { stdio: 'ignore' });

let ws, idSeq = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) {
          const p = pending.get(m.id); pending.delete(m.id);
          m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
        } else if (m.method === 'Runtime.exceptionThrown') {
          const d = m.params.exceptionDetails;
          console.log('[exception]', (d.exception?.description || d.text || '').slice(0, 400));
        } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
          console.log('[console:error]', m.params.args.map((x) => x.value ?? x.description ?? '').join(' ').slice(0, 400));
        }
      };
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      return;
    } catch { await sleep(500); }
  }
  throw new Error('调试端口连不上');
}

const ev = async (expression, sessionId) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.text || '');
  return r.result?.value;
};

try {
  await connect();
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Runtime.evaluate', {
    expression: 'window.addEventListener("error",e=>{window.__err=(window.__err?window.__err+" | ":"")+e.message});',
  }, sessionId);
  const t0 = Date.now();
  await send('Page.navigate', { url: BASE }, sessionId);
  let done = false;
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const step = await ev('document.getElementById("loader-step") && document.getElementById("loader-step").textContent', sessionId);
    const ready = await ev('!!(window.geyuan && document.getElementById("loader").classList.contains("done"))', sessionId);
    const err = await ev('window.__err || ""', sessionId);
    console.log(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  ready=${ready}  step=${step}${err ? '  err=' + err : ''}`);
    if (ready === true || (typeof err === 'string' && err.length)) { done = ready === true; break; }
  }
  if (done) {
    const stats = await ev(`JSON.stringify({
      calls: geyuan.renderer.info.render.calls,
      tris: geyuan.renderer.info.render.triangles,
      geo: geyuan.renderer.info.memory.geometries,
      tex: geyuan.renderer.info.memory.textures,
      programs: geyuan.renderer.info.programs.length,
      objects: geyuan.scene.children.length,
    })`, sessionId);
    console.log('[renderer]', stats);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`shots/probe-${st}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`→ shots/probe-${st}.png`);
  }
} catch (e) {
  console.error('probe failed:', e.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  proc.kill();
  process.exit();
}
