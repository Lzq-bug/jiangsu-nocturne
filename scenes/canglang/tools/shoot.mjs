/**
 * 无头截图自检：一次 Edge 会话里把所有机位走一遍（CDP，不引依赖）。
 *   node canglang/tools/shoot.mjs                     # 全部机位
 *   node canglang/tools/shoot.mjs gate pavilion       # 只出指定的
 *   node canglang/tools/shoot.mjs --size=1440,900     # 出图尺寸
 *
 * 前提：npm run dev 已起在 8765。软件渲染很慢，所以不等虚拟时间，
 * 而是轮询页面里的 window.canglang 与 loader.done；只改 hash 不会重载文档，
 * 每次导航都挂一个 ?r= 破缓存。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!browser) { console.error('找不到 msedge.exe'); process.exit(1); }

const args = process.argv.slice(2);
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1440,900').split('=')[1];
const settle = Number((args.find((a) => a.startsWith('--settle=')) || '--settle=12000').split('=')[1]);
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = Number(process.env.SHOOT_PORT || 9334);
const BASE = 'http://127.0.0.1:8765/canglang/index.html';
const OUT = resolve('canglang/shots');

const ALL = ['gate', 'corridor', 'pavilion', 'hall', 'bamboo', 'fish', 'tower', 'stele', 'aerial'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`,
  `--window-size=${size}`,
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let idSeq = 0;
const pending = new Map();

function send(method, params = {}, sessionId, timeout = 90000) {
  const id = ++idSeq;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`CDP ${method} 超时`));
    }, timeout);
    pending.set(id, {
      res: (v) => { clearTimeout(timer); res(v); },
      rej: (e) => { clearTimeout(timer); rej(e); },
    });
  });
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
        }
      };
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      return;
    } catch { await sleep(500); }
  }
  throw new Error('连不上 Edge 的调试端口');
}

async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function shoot(sessionId, id) {
  await send('Page.navigate', { url: `${BASE}?r=${Date.now()}#bare&station=${id}` }, sessionId);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 240000) {
    await sleep(3000);
    const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
    if (err) { console.log(`  ! ${id}: ${err}`); break; }
    ready = await evaluate(sessionId,
      '!!(window.canglang && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  if (!ready) console.log(`  ! ${id}: 未在 240s 内就绪，仍出图`);
  await sleep(settle);
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }, sessionId, 240000);
  await writeFile(resolve(OUT, `${id}.jpg`), Buffer.from(shot.data, 'base64'));
  console.log(`  ✓ ${id}  (${((Date.now() - t0) / 1000).toFixed(0)}s)${err ? ' 有报错' : ''}`);
}

try {
  const probe = await fetch(BASE).catch(() => null);
  if (!probe || !probe.ok) throw new Error(`${BASE} 打不开——先 npm run dev`);
  await mkdir(OUT, { recursive: true });
  await connect();
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  const [w, h] = size.split(',').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.addEventListener("error",e=>{window.__err=(window.__err?window.__err+" | ":"")+e.message});',
  }, sessionId);

  const list = ids.length ? ALL.filter((s) => ids.includes(s)) : ALL;
  console.log(`出 ${list.length} 张 → ${OUT}`);
  for (const id of list) await shoot(sessionId, id);
  console.log('完成');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  proc.kill();
  process.exit();
}
