#!/usr/bin/env node
/**
 * Headless stills for every night scene in this repo, over one CDP session.
 * SHARED TOOL — other scenes' sessions call it too, so keep the existing flags
 * working (--page/--handle/--out/--port/--size/--settle/--wait/--all/--hud/
 * --reload/--noaq/--wave-style extras) when you change it.
 *
 * SwiftShader pays for shader compilation once per page load, and that warm-up
 * render is what takes minutes. So by default: load the page once, then move the
 * camera between stations through the scene's own debug handle
 * (`window.<handle>.goToStation(i, {info:false, animate:false})`) instead of
 * re-navigating for every frame.
 *
 *   node tools/shoot.mjs --page=biji/index.html --handle=biji              # all stations
 *   node tools/shoot.mjs --page=biji/index.html --handle=biji mouth moon
 *   node tools/shoot.mjs --page=haichun/index.html --handle=haichun --port=9334
 *   node tools/shoot.mjs --page=biji/index.html --handle=biji --eye=112,4.6,8 --at=150,5.5,30 --fov=60
 *
 * Deep links are written into BOTH forms so either convention works:
 *   ?st=<id>&bare=1  (query — scenes that read the query string)
 *   #station=<id>&bare (hash — scenes that read location.hash)
 * Anything in --extra=<a=1&b=2> is appended verbatim, and any --flag=value the
 * scene expects (wave=1, noaq, inside=1, bell=1…) can ride along with it.
 *
 * Flags: --size=1440,900 · --port=9333 · --wait=540 (warm-up ceiling, s)
 *        --settle=10 (seconds of frames after each camera move) · --hud
 *        --reload (one page load per station) · --base=http://127.0.0.1:8765
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const has = (name) => argv.includes(`--${name}`);
const positional = argv.filter((a) => !a.startsWith('--'));

// Git Bash rewrites arguments that start with `/`, so the page comes without a
// leading slash and is normalised here.
const PAGE_RAW = flag('page', '');
if (!PAGE_RAW) {
  console.log('这个工具被多个场景共用，--page 不给就会拍错工程：\n  node tools/shoot.mjs --page=<场景>/index.html --handle=<window 上的句柄> [机位…]');
  process.exit(2);
}
const PAGE = '/' + String(PAGE_RAW).replace(/^\/+/, '');
const HANDLE = flag('handle', PAGE.split('/')[1] || 'scene');
const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
// default output: <scene dir>/shots next to the page
const OUT = resolve(flag('out', join(ROOT, PAGE.split('/')[1] || 'shots', 'shots')));
const SIZE = flag('size', '1440,900');
const PORT = Number(flag('port', 9333));
const SETTLE = Number(flag('settle', 10));
const WAIT = Number(flag('wait', 540));
const BASE = flag('base', 'http://127.0.0.1:8765');
const EXTRA = flag('extra', '');
const EDGE = flag('edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');

const ALL = positional.length ? positional : ['mouth', 'lane', 'shop', 'quay', 'moon', 'aerial'];   // 无参默认只对本景成立
const SHOT = flag('eye', null);

if (!existsSync(join(ROOT, PAGE.replace(/^\//, '').split('/')[0] === 'index.html' ? 'index.html' : PAGE.replace(/^\//, '')))) {
  console.log(`没找到 ${PAGE.replace(/^\//, '')}，--page 要写成仓库内的相对路径（如 biji/index.html）`);
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `edge-shoot-${PORT}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the dev server dies silently between batches (see the scene notes) — check first */
try {
  const probe = await fetch(BASE);
  if (!probe.ok) throw new Error(String(probe.status));
} catch {
  console.log(`连不上 ${BASE} — 先起服务：node tools/serve.mjs 8765`);
  process.exit(2);
}

const browser = spawn(EDGE, [
  '--headless=new',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${SIZE}`,
  'about:blank',
], { stdio: 'ignore' });

process.on('exit', () => { try { browser.kill('SIGTERM'); } catch { /* already gone */ } });

/* ------------------------------------------------------------------ CDP client */
async function waitEndpoint() {
  for (let i = 0; i < 360; i++) {   // 并行会话把 SwiftShader 占满时，Edge 冷启动能要两三分钟
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* the browser is still coming up */ }
    await sleep(500);
  }
  throw new Error('连不上 Edge 的调试端口（换个 --port 再试，旧浏览器实例可能还没散场）');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`${msg.error.message} ${JSON.stringify(msg.error.data || '')}`));
        else p.resolve(msg.result);
      } else {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId = undefined, timeoutMs = 60000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve: res, reject: rej, timer });
    });
  }
  on(fn) { this.listeners.push(fn); }
}

/* ------------------------------------------------------------------ run */
const cdp = await CDP.connect(await waitEndpoint());

let sessionId = null;
const errors = [];
cdp.on((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push(`EXCEPTION ${d.exception?.description || d.text}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    errors.push(`${msg.params.type.toUpperCase()}: ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  }
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
    errors.push(`LOG ${msg.params.entry.level}: ${msg.params.entry.text}`);
  }
});

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', background: false });
({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Log.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: Number(SIZE.split(',')[0]), height: Number(SIZE.split(',')[1]), deviceScaleFactor: 1, mobile: false,
}, sessionId);

const evaluate = async (expr) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId, 30000);
    if (r.exceptionDetails) errors.push(`EXCEPTION ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result?.value;
  } catch (e) { errors.push(`EVALUATE ${e.message}`); return undefined; }
};

/**
 * Ready = the loader has lifted AND the page hasn't reported a boot failure.
 * Some scenes write their error into window.__err, others into the loader text,
 * so check both.
 */
const readyExpr = `!!window.${HANDLE} && document.getElementById('loader')?.classList.contains('done')`;
const failExpr = `(window.${HANDLE}?.__err || document.getElementById('loader-step')?.textContent || '')`;

async function loadPage(id) {
  const q = `?r=${Date.now()}&bare=1${EXTRA ? `&${EXTRA}` : ''}${id ? `&st=${encodeURIComponent(id)}` : ''}`;
  const h = id ? `#station=${encodeURIComponent(id)}&bare` : '#bare';
  const url = `${BASE}${PAGE}${q}${h}`;
  await cdp.send('Page.navigate', { url }, sessionId);
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < WAIT * 1000) {
    if (await evaluate(readyExpr)) return true;
    const step = String(await evaluate(failExpr) || '');
    if (/失败|Error|error:/.test(step)) { console.log(`\n  页面自报失败：${step}`); return false; }
    if (step !== last) { last = step; process.stdout.write(`\r    ${step.padEnd(40).slice(0, 40)}`); }
    await sleep(4000);
  }
  console.log('\n  等待加载超时');
  return false;
}

async function shoot(name) {
  const info = await evaluate(`(() => { const a = window.${HANDLE};
    a.renderer.render(a.scene, a.camera);
    const i = a.renderer.info;
    return \`\${i.render.calls} calls / \${(i.render.triangles / 1000).toFixed(0)}k tris\`; })()`);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 120000);
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`ok  ${name}.png  ${info || ''}`);
  return file;
}

/** auto quality would drop reflections mid-run; stills want the full path */
const disableAdaptive = `(() => { ['c-quality','c-autoQuality'].forEach((id) => {
  const el = document.getElementById(id);
  if (el && el.checked) el.click();
}); return true; })()`;

const moveExpr = (id) => `(() => { const a = window.${HANDLE};
  const want = '${id}'.toLowerCase();
  const i = a.STATIONS.findIndex((s) => String(s.id).toLowerCase() === want || String(s.id).toLowerCase().startsWith(want + '.'));
  if (i < 0) return false;
  if (a.rig) a.rig.mode = 'pano';
  a.goToStation(i, { info: false, animate: false });
  return true; })()`;

let apiMoves = false;
if (SHOT) {
  const at = flag('at', '60,6,20'), fov = flag('fov', '58');
  process.stdout.write(`· eye ${SHOT} … `);
  if (await loadPage(null)) {
    await evaluate(`(() => { const a = window.${HANDLE};
      const eye = '${SHOT}'.split(',').map(Number), at = '${at}'.split(',').map(Number);
      if (a.rig) { a.rig.mode = 'pano'; a.rig.goTo(eye, at, { animate: false, fov: ${fov} }); }
      return true; })()`);
    await evaluate(disableAdaptive);
    await sleep(SETTLE * 1000);
    await shoot('eye');
  }
} else {
  if (!has('reload')) {
    process.stdout.write('· 载入 … ');
    if (await loadPage(ALL[0])) {
      console.log('就绪');
      await evaluate(disableAdaptive);
      apiMoves = Boolean(await evaluate(`typeof window.${HANDLE}?.goToStation === 'function'`));
      if (apiMoves) {
        await sleep(SETTLE * 1000);
        for (const st of ALL) {
          process.stdout.write(`· ${st} … `);
          try {
            if (!(await evaluate(moveExpr(st)))) { console.log('机位不存在'); continue; }
            await sleep(SETTLE * 1000);
            await shoot(st);
          } catch (e) { console.log(`失败：${e.message}`); }
        }
      } else {
        console.log('  这个场景没有 goToStation，改用逐机位重载');
        for (const st of ALL) {
          process.stdout.write(`· ${st} … `);
          try {
            if (await loadPage(st)) { await evaluate(disableAdaptive); await sleep(SETTLE * 1000); await shoot(st); }
          } catch (e) { console.log(`失败：${e.message}`); }
        }
      }
    }
  } else {
    for (const st of ALL) {
      process.stdout.write(`· ${st} … `);
      try {
        if (await loadPage(st)) { await evaluate(disableAdaptive); await sleep(SETTLE * 1000); await shoot(st); }
      } catch (e) { console.log(`失败：${e.message}`); }
    }
  }
}

const uniq = [...new Set(errors)].slice(0, 30);
if (uniq.length) {
  console.log('\n控制台：');
  for (const e of uniq) console.log('  ' + e.slice(0, 300));
} else {
  console.log('\n控制台无报错');
}
console.log(`落盘：${OUT}${apiMoves ? '' : '（逐机位模式）'}`);
cdp.ws.close();
browser.kill('SIGTERM');
process.exit(0);
