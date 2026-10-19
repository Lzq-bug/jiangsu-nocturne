/**
 * 无头截图自检：一次浏览器会话里把所有机位走一遍。
 *   node tools/shoot.mjs                    # 全部机位
 *   node tools/shoot.mjs chun dong          # 只出指定的
 *   node tools/shoot.mjs --season=winter    # 强制某一季月色
 *
 * 用 Edge 的 remote debugging + CDP，不引任何依赖（Node 自带 WebSocket/fetch）。
 * 软件渲染很慢，所以不等虚拟时间，而是轮询页面里的 window.geyuan 是否就绪。
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
const seasonArg = (args.find((a) => a.startsWith('--season=')) || '').split('=')[1] || '';
const size = (args.find((a) => a.startsWith('--size=')) || '--size=1280,720').split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const PORT = 9341;
const BASE = 'http://127.0.0.1:8793/index.html';
const OUT = resolve('shots');

const ALL = ['men', 'chun', 'yuxuan', 'xia', 'baoshan', 'qiu', 'feng', 'dong', 'hall', 'lane'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--no-sandbox',
  '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`,
  `--window-size=${size}`, '--hide-scrollbars', 'about:blank',
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
  // 机器被别的工程占满时，Edge 起调试端口能慢到几十秒，别只等 30 秒
  for (let i = 0; i < 240; i++) {
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

function lastConsoleError() {
  return events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map((e) => (e.params.args[0] && e.params.args[0].value) || '')
    .join(' | ');
}

async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function shoot(sessionId, id) {
  events.length = 0;
  // 只有 query 变了才会真的重载，机位与季节都从 query 进
  const url = `${BASE}?r=${Date.now()}&st=${id}${seasonArg ? `&season=${seasonArg}` : ''}`;
  await send('Page.navigate', { url }, sessionId);
  const t0 = Date.now();
  while (Date.now() - t0 < 420000) {
    await sleep(3000);
    // 服务没起来就别一张张干等，直接炸给操作者看
    const dead = await evaluate(sessionId,
      '/ERR_CONNECTION|无法访问|拒绝连接/.test(document.body && document.body.innerText || "")').catch(() => false);
    if (dead) throw new Error(`${BASE} 打不开——先起服务：node tools/serve.mjs 8793`);
    const failed = await evaluate(sessionId,
      '/场景加载失败/.test(document.getElementById("loader-step").textContent || "")').catch(() => false);
    if (failed) throw new Error(`页面报错：${await evaluate(sessionId, 'document.getElementById("loader-step").textContent')}`);
    const ready = await evaluate(sessionId,
      '!!(window.geyuan && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  // 相机走位与月色换挡都留给真实时间跑完
  await sleep(10000);
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  const cerr = lastConsoleError();
  if (err || cerr) console.log(`  ! ${id}: ${err || cerr}`);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(resolve(OUT, `gy-${id}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`  ✓ ${id}`);
}

try {
  await mkdir(OUT, { recursive: true });
  await connect();
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(size.split(',')[0]), height: Number(size.split(',')[1]),
    deviceScaleFactor: 1, mobile: false,
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
