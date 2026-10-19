/**
 * 无头截图自检：一次浏览器会话里把所有机位走一遍。
 *   node tools/shoot.mjs                     # 全部机位
 *   node tools/shoot.mjs chiyue shuzhai      # 只出指定的
 *   node tools/shoot.mjs --size=1400,800     # 改画面尺寸
 *
 * 用 Edge 的 remote debugging + CDP，不引任何依赖（Node 自带 WebSocket/fetch）。
 * 软件渲染很慢，所以不等虚拟时间，而是轮询页面里的 window.mx 是否就绪。
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
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1200,700').split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = 9341;
const BASE = 'file:///D:/mengxiyuan/dist/mx-preview.html';
const OUT = resolve('shots');

const STATIONS = ['xiangkou', 'jingtai', 'menting', 'yuanmen', 'shiqiao', 'chiyue', 'shuzhai', 'xingtai', 'niaokan'];
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

function lastEvent(method) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].method === method) return events[i];
  return null;
}

async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function shoot(sessionId, id) {
  events.length = 0;
  // 只有 hash 不同的话 Page.navigate 不会重载文档，得拿 query 破一下
  await send('Page.navigate', { url: `${BASE}?r=${Date.now()}#bare&station=${id}` }, sessionId);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 200000) {
    await new Promise((r) => setTimeout(r, 2500));
    ready = await evaluate(sessionId, '!!(window.mx && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  // 相机走位与灯火呼吸留给真实时间跑完
  await new Promise((r) => setTimeout(r, 14000));
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  if (err) console.log(`  ! ${id}: ${err}`);
  const consoleErr = lastEvent('Runtime.exceptionThrown');
  if (consoleErr) console.log(`  ! ${id} 异常: ${JSON.stringify(consoleErr.params.exceptionDetails?.exception?.description || '').slice(0, 220)}`);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(OUT, `${id}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  ${ready ? '✓' : '✗ 未就绪'} ${id}${err ? ' (有报错)' : ''}`);
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
    source: 'window.addEventListener("error",e=>{window.__err=(window.__err?window.__err+" | ":"")+e.message});',
  }, sessionId);

  const list = ids.length ? STATIONS.filter((s) => ids.includes(s)) : STATIONS;
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
