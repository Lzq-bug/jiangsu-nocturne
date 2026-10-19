/**
 * 无头截图自检：一次浏览器会话里把所有机位都走一遍。
 *   node tools/shoot.mjs                 # 全部机位
 *   node tools/shoot.mjs bridge aerial   # 只出指定的
 *
 * 用 Edge 的 remote debugging + CDP，不引任何依赖（Node 自带 WebSocket/fetch）。
 * 软件渲染很慢，所以不等虚拟时间，而是轮询页面里的 window.__ready。
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
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = 9354;
const BASE = 'http://127.0.0.1:8794/index.html';
const OUT = resolve('docs/shots');
const SETTLE = Number((args.find((a) => a.startsWith('--settle=')) || '--settle=13000').split('=')[1]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  // 不给独立 profile，Edge 会把请求并到已开着的实例上，调试端口就永远不起来
  `--user-data-dir=${resolve('.edgeprofile')}`,
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

function send(method, params = {}, sessionId, timeout = 90000) {
  const id = ++idSeq;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  // 浏览器偶尔不回某条命令（导航撞上加载中），宁可超时报错也别把整批挂住
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error(`${method} 超时`));
      }
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function shoot(sessionId, id) {
  events.length = 0;
  // 只有 hash 不同的话 Page.navigate 不会重载文档，得拿 query 破一下
  await send('Page.navigate', { url: `${BASE}?r=${Date.now()}&bare=1&station=${id}` }, sessionId);
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await wait(2500);
    const ready = await evaluate(sessionId, '!!(window.__ready && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  await wait(SETTLE);
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  const stats = await evaluate(sessionId,
    'window.panmen ? JSON.stringify({calls: panmen.renderer.info.render.calls, tris: panmen.renderer.info.render.triangles, fps: document.getElementById("fps").textContent}) : "-"').catch(() => '-');
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(OUT, `${id}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  ${err ? '! ' : '✓ '}${id}  ${stats}${err ? `  ERR: ${err}` : ''}`);
}

const ALL = ['reach', 'bridge', 'watergate', 'barbican', 'wallwalk', 'pagoda', 'aerial'];

try {
  // 先探一下 dev server：页面加载不出来时，宁可立刻报错也别对着黑图猜十分钟
  const ping = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
  if (!ping.ok) throw new Error(`dev server 返回 ${ping.status}`);
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

  const list = ids.length ? ALL.filter((s) => ids.includes(s)) : ALL;
  console.log(`出 ${list.length} 张 → ${OUT}`);
  for (const id of list) {
    try {
      await shoot(sessionId, id);
    } catch (e) {
      console.log(`  ✗ ${id}: ${e.message}`);
    }
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
