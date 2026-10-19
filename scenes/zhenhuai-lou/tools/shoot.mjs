/**
 * 无头截图自检：一次浏览器会话里把所有机位都走一遍。
 *   node tools/shoot.mjs                      # 全部机位
 *   node tools/shoot.mjs lou qiao             # 只出指定的
 *   node tools/shoot.mjs --drum=1 ding        # 预置几记鼓，看波环与鼓皮
 *   node tools/shoot.mjs --size=1440,810      # 改视口
 *
 * 用 Edge 的 remote debugging + CDP，不引任何依赖（Node 自带 WebSocket/fetch）。
 * 软件渲染很慢，所以不等虚拟时间，而是轮询页面里的 window.zhenhuailou 是否就绪。
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
const drum = args.includes('--drum=1');
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1280,720').split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = Number((args.find((a) => a.startsWith('--port=')) || '--port=9334').split('=')[1]);
const BASE = 'http://127.0.0.1:8797/index.html';
const OUT = resolve('shots');

/** 每个机位留多少秒给相机走位与灯火闪烁 */
const STATIONS = [
  ['lou', 16], ['qiao', 16], ['quanmen', 16], ['ding', 18],
  ['qu', 16], ['jie', 16], ['cao', 16], ['aerial', 22],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/tmp/edge-shoot-${PORT}`,
  `--window-size=${size}`,
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let idSeq = 0;
const pending = new Map();
const events = [];

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
        } else if (m.method) events.push(m);
      };
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      return;
    } catch { await sleep(500); }
  }
  throw new Error('连不上 Edge 的调试端口');
}

function lastError() {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      return d.exception?.description || d.text;
    }
  }
  return null;
}

async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function shoot(sessionId, id, settle) {
  events.length = 0;
  // 只有 query 变了才会真的重载文档
  await send('Page.navigate', { url: `${BASE}?r=${Date.now()}&bare=1&st=${id}${drum ? '&drum=1' : ''}` }, sessionId);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 420000) {
    await sleep(2500);
    ready = await evaluate(sessionId,
      '!!(window.zhenhuailou && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready || await evaluate(sessionId, 'window.__err || ""').catch(() => '')) break;
  }
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '') || lastError() || '';
  await sleep(ready ? settle * 1000 : 4000);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(OUT, `${id}.png`), Buffer.from(shot.data, 'base64'));
  console.log(err ? `  ! ${id}: ${err}` : `  ✓ ${id}${ready ? '' : ' (未就绪)'}`);
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
  // 把启动期异常带回 Node，免得对着黑图猜
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.addEventListener("error",e=>{window.__err=(window.__err?window.__err+" | ":"")+(e.error&&e.error.stack||e.message)});',
  }, sessionId);

  const list = ids.length ? STATIONS.filter(([s]) => ids.includes(s)) : STATIONS;
  console.log(`出 ${list.length} 张 → ${OUT}`);
  for (const [id, settle] of list) await shoot(sessionId, id, settle);
  console.log('完成');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  proc.kill();
  process.exit();
}
