/**
 * 无头截图自检：一次 Edge 会话里把所有机位走一遍。
 *   node tools/shoot.mjs                      # 全部机位
 *   node tools/shoot.mjs head wharf aerial    # 只出指定的
 *   node tools/shoot.mjs --size=1440,810 head # 换尺寸
 *
 * 走 Edge 的 remote debugging + CDP，不引任何依赖（Node 自带 WebSocket/fetch）。
 * SwiftShader 很慢，所以不等虚拟时间：轮询 window.dongguan 与 loader 是否就绪。
 * 只改 hash 的 Page.navigate 不会重载文档，所以每次挂一个不同的 ?r= 破缓存。
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
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1280,720').split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = 9344;
const BASE = 'http://127.0.0.1:8792/index.html';
const OUT = resolve('shots');
const ALL = ['head', 'paving', 'fronts', 'temple', 'alley', 'wharf', 'aerial'];

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

function send(method, params = {}, sessionId) {
  const id = ++idSeq;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
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
  await send('Page.navigate', { url: `${BASE}?r=${Date.now()}#bare/noaq/${id}` }, sessionId);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 200000) {
    await sleep(3000);
    ready = await evaluate(sessionId,
      '!!(window.dongguan && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  // 人群、灯影与相机姿态都要真实时间跑几帧
  await sleep(14000);
  const title = await evaluate(sessionId, 'document.title').catch(() => '');
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  if (err) console.log(`  ! ${id}: ${err}`);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(OUT, `${id}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  ${ready ? '✓' : '✗ 未就绪'} ${id}  ${title}`);
}

try {
  await mkdir(OUT, { recursive: true });
  await connect();
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(size.split(',')[0]), height: Number(size.split(',')[1]), deviceScaleFactor: 1, mobile: false,
  }, sessionId);
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
