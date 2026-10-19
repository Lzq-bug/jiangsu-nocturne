/**
 * 无头截图自检：一次 Edge 会话里把所有机位走一遍（软件渲染，逐台起浏览器太慢）。
 *   node tools/shoot.mjs                        # 全部机位
 *   node tools/shoot.mjs qiaodong aerial        # 只出指定的
 *   node tools/shoot.mjs --fmt=jpg --size=1600,900   # 报告/PPT 用图
 *
 * 只用 Node 自带的 fetch/WebSocket，不引依赖。页面靠 window.huishan 与
 * #loader.done 报就绪，启动期异常由 addScriptToEvaluateOnNewDocument 带回 Node。
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

const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${dflt}`).split('=')[1];
const fmt = opt('fmt', 'png');
const size = opt('size', '1440,900');
const settle = Number(opt('settle', 12000));
const ids = argv.filter((a) => !a.startsWith('--'));
const PORT = Number(opt('port', 9334));
const BASE = 'http://127.0.0.1:8801/index.html';
const OUT = resolve(opt('out', 'shots'));

const STATIONS = ['street', 'spring', 'garden', 'temple', 'pagoda', 'aerial'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--no-sandbox',
  '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${resolve(OUT, '..', 'shots-profile')}`,
  `--window-size=${size}`, '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let ws, idSeq = 0;
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
  for (let i = 0; i < 80; i++) {
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function shoot(sessionId, id) {
  events.length = 0;
  // 只有 hash 不同的话 Page.navigate 不会重载文档，得拿 query 破一下
  await send('Page.navigate', { url: `${BASE}?r=${Date.now()}#bare&station=${id}` }, sessionId);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 240000) {
    await sleep(3000);
    ready = await evaluate(sessionId, '!!(window.huishan && document.getElementById("loader").classList.contains("done"))').catch(() => false);
    if (ready) break;
  }
  await sleep(settle);
  const exc = lastEvent('Runtime.exceptionThrown');
  if (exc) console.log(`  ! ${id} 异常: ${exc.params.exceptionDetails?.exception?.description?.split('\n')[0] || ''}`);
  const err = await evaluate(sessionId, 'window.__err || ""').catch(() => '');
  if (err) console.log(`  ! ${id}: ${err}`);
  if (!ready) console.log(`  ! ${id} 未就绪（可能卡在加载）`);
  const info = await evaluate(sessionId, 'window.huishan?JSON.stringify(huishan.renderer.info.render):"-"').catch(() => '-');
  const shot = await send('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpg' ? 90 : undefined }, sessionId);
  await writeFile(resolve(OUT, `${id}.${fmt}`), Buffer.from(shot.data, 'base64'));
  console.log(`  ✓ ${id}.${fmt}  ${info}`);
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
