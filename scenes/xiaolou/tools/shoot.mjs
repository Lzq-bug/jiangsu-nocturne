/**
 * 无头连拍：起一次 Edge（SwiftShader），走 CDP 单会话逐机位截图，比每张冷启动快得多。
 *   node tools/shoot.mjs [机位id ...] [--size=1280,720] [--settle=9000]
 * 依赖 npm run dev 已在 8798 起好；页面要暴露 window.xiaolou 且 loader 完成后加 .done。
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8798/index.html';
const PORT = Number(process.env.PORT || 9300 + (process.pid % 40));
const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'shots');

const ALL = ['west', 'lane', 'well', 'bye', 'fushou', 'ancestry', 'crane', 'garden', 'east', 'aerial'];
const args = process.argv.slice(2);
const sizeArg = args.find((a) => a.startsWith('--size='));
const settleArg = args.find((a) => a.startsWith('--settle='));
const SIZE = sizeArg ? sizeArg.split('=')[1] : '1180,664';
const SETTLE = settleArg ? Number(settleArg.split('=')[1]) : 9000;
const ids = args.filter((a) => !a.startsWith('--'));
const list = ids.length ? ids : ALL;

await mkdir(OUT, { recursive: true });

const browser = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:/tmp/edge-xl-${process.pid}`, `--window-size=${SIZE}`,
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--disable-extensions', '--no-first-run', '--mute-audio',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
browser.stderr.on('data', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* 浏览器还没起 */ }
    await sleep(1000);
  }
  throw new Error('连不上 Edge 的调试端口');
}

/** 极简 CDP 客户端：一条命令一个 id，事件按 method 分发 */
function connect(url) {
  return new Promise((open, fail) => {
    const ws = new WebSocket(url);
    let seq = 0;
    const waiting = new Map();
    const handlers = new Set();
    ws.addEventListener('open', () => open({
      send: (method, params = {}, sessionId) => new Promise((res, rej) => {
        const id = ++seq;
        waiting.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      }),
      on: (fn) => handlers.add(fn),
      close: () => ws.close(),
    }));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && waiting.has(msg.id)) {
        const { res, rej } = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message}`)); else res(msg.result);
      } else if (msg.method) for (const fn of handlers) fn(msg);
    });
    ws.addEventListener('error', fail);
  });
}

const errors = [];
let browserExited = false;
browser.on('exit', () => { browserExited = true; });

const cdp = await connect(await waitForWsUrl());
cdp.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled' && msg.method !== 'Runtime.exceptionThrown') return;
  const text = msg.method === 'Runtime.exceptionThrown'
    ? msg.params.exceptionDetails.text
    : msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
  if (/error|exception|NaN|undefined|fail/i.test(text)) {
    errors.push(text.slice(0, 300));
    console.log(`  ! ${text.slice(0, 220)}`);
  }
});

const { targetInfos } = await cdp.send('Target.getTargets');
let target = targetInfos.find((t) => t.type === 'page');
if (!target) target = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });

await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride',
  { width: Number(SIZE.split(',')[0]), height: Number(SIZE.split(',')[1]), deviceScaleFactor: 1, mobile: false }, sessionId);

const ready = '!!window.xiaolou && document.getElementById("loader").classList.contains("done")';

for (const id of list) {
  const t0 = Date.now();
  // 只改 hash 不会重载文档，必须挂一个每次不同的 query 破缓存
  const url = `${BASE}?bare&r=${Date.now()}#${id}`;
  await cdp.send('Page.navigate', { url }, sessionId);
  let ok = false;
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    if (browserExited) throw new Error('浏览器中途退出');
    const r = await cdp.send('Runtime.evaluate', { expression: ready, returnByValue: true }, sessionId);
    if (r.result?.value === true) { ok = true; break; }
  }
  if (!ok) { console.log(`  ${id} 超时未就绪`); continue; }
  await sleep(SETTLE); // 等相机走位与灯的呼吸稳下来
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const file = resolve(OUT, `${id}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  console.log(`  ${id.padEnd(9)} ${((Date.now() - t0) / 1000).toFixed(0)}s → ${file}`);
}

cdp.close();
browser.kill('SIGKILL');
console.log(errors.length ? `\n页面报错 ${errors.length} 条，见上` : '\n无页面报错');
