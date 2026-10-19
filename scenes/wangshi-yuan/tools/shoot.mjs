/**
 * 无头截图自检：一次浏览器会话里把所有点位都走一遍。
 *   node tools/shoot.mjs                        # 全部点位，各自演到对应那一出
 *   node tools/shoot.mjs yanying dianshun       # 只出指定的
 *   node tools/shoot.mjs --show=9 yanying       # 强制演到第几出（节目序号）
 *
 * 用 Edge 的 remote debugging + CDP，不引任何依赖（Node 自带 WebSocket/fetch）。
 * 软件渲染很慢，所以不等虚拟时间，而是轮询页面里的 window.wangshi 是否就绪。
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
const showArg = (args.find((a) => a.startsWith('--show=')) || '').split('=')[1];
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1200,700').split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = 9333;
const BASE = 'http://127.0.0.1:8821/index.html';
const OUT = resolve('shots');

/** 点位 → 该点位上演的那一出（SHOW 里的序号），-1 表示不开戏 */
const STATIONS = [
  ['menfang', -1], ['juanshuitang', 0], ['xiexiulou', 1], ['tiyunshi', 2],
  ['xiaoshan', 3], ['jixuzhai', 4], ['kaisong', 5], ['dianshun', 6],
  ['zhuwai', 7], ['yanying', 8], ['yuedao', -1], ['yinjing', -1], ['wufeng', -1],
  ['jiaoting', -1], ['aerial', 8],
];

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

const wait = async (ms) => { await sleep(ms); };

async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function shoot(sessionId, id, show) {
  events.length = 0;
  // 只有 hash 不同的话 Page.navigate 不会重载文档，得拿 query 破一下
  const url = show >= 0 ? `${BASE}?st=${id}&show=${show}` : `${BASE}?st=${id}`;
  await send('Page.navigate', { url: `${url}${url.includes('?') ? '&' : '?'}r=${Date.now()}#bare` }, sessionId);
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await wait(2500);
    const ready = await evaluate(sessionId, '!!(window.wangshi && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  // 身段、灯色与相机走位都留给真实时间跑完
  await wait(19000);
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  if (err) console.log(`  ! ${id}: ${err}`);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(OUT, `${id}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  ✓ ${id}${err ? ' (有报错)' : ''}`);
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

  const list = ids.length ? STATIONS.filter(([s]) => ids.includes(s)) : STATIONS;
  console.log(`出 ${list.length} 张 → ${OUT}`);
  for (const [id, show] of list) {
    await shoot(sessionId, id, showArg !== undefined ? Number(showArg) : show);
  }
  console.log('完成');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  proc.kill();
  process.exit();
}
