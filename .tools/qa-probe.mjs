/**
 * 产品级 QA 探针（本地工具，不入库）
 * 检查：横向溢出 / 焦点可见性 / 环境层语义 / 关键文字对比度 / DOM 规模 / 动效与 reduced-motion
 * 用法：node .tools/qa-probe.mjs
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const port = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (u) => (await fetch(u)).json();

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); }
  static async connect(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Cdp(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.p.has(m.id)) { const { res, rej } = c.p.get(m.id); c.p.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    return c;
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.p.set(id, { res, rej })); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; }
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'vmr-qa-' + Date.now())}`, 'about:blank'], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 60; i++) { await sleep(250); try { v = await json(`http://127.0.0.1:${port}/json/version`); break; } catch {} }
if (!v) { chrome.kill(); throw new Error('chrome not ready'); }
const list = await json(`http://127.0.0.1:${port}/json/list`);
const cdp = await Cdp.connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

/* ---------- fixture：78/78 ---------- */
const ids = [];
for (let n = 0; n < 22; n++) ids.push(`major-${n}`);
for (const s of ['wands', 'cups', 'swords', 'pentacles']) for (let r = 1; r <= 14; r++) ids.push(`minor-${s}-${r}`);
const collection = {};
ids.forEach((id, i) => { collection[id] = { count: 1 + (i % 3), firstAt: Date.UTC(2026, 7, 8, 9) + i * 3600e3, lastAt: Date.UTC(2026, 7, 9, 9) + i * 3600e3 }; });
const SAVE = {
  version: 1, createdAt: Date.UTC(2026, 7, 8, 9), updatedAt: Date.UTC(2026, 8, 13, 12),
  stardust: 320, totalDraws: 132, sinceLastNew: 0, collection,
  stats: { gamesPlayed: 46, starsCaught: 512, bestRound: 21 },
  settings: { master: 0.8, bgm: 0.5, sfx: 0.8, muted: true, reducedMotion: false, apiKey: '', apiBaseUrl: '/__api', modelId: 'deepseek-chat' },
};

const ROUTES = ['/', '/starcatch', '/unseal', '/collection', '/card/major-18', '/card/minor-swords-14', '/starwhisper', '/settings', '/about'];
const results = [];

await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: BASE + '/' });
await sleep(900);
await cdp.eval(`localStorage.setItem('veiled-moon.save.v1', ${JSON.stringify(JSON.stringify(SAVE))})`);

const OVERFLOW_CHECK = `(() => ({
  docW: document.documentElement.scrollWidth,
  winW: window.innerWidth,
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  offenders: [...document.querySelectorAll('body *')].filter(el => {
    if (el.closest('.env-scene')) return false;           // 环境层在 overflow:hidden 容器内，不影响文档宽度
    if (el.closest('svg')) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0)) return false;
    if (getComputedStyle(el).position === 'fixed') return false;
    return r.right > window.innerWidth + 1.5 || r.left < -1.5;
  }).slice(0, 6).map(el => {
    const b = el.getBoundingClientRect();
    return (el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ').join('.') : '')).slice(0, 48)
      + ' L' + Math.round(b.left) + ' R' + Math.round(b.right);
  })
}))()`;

const ENV_CHECK = `(() => {
  const env = document.querySelector('.env-scene');
  if (!env) return { present: false };
  const cs = getComputedStyle(env);
  return {
    present: true,
    ariaHidden: env.getAttribute('aria-hidden'),
    role: env.getAttribute('role'),
    pointerEvents: cs.pointerEvents,
    zIndex: cs.zIndex,
    skyNodes: document.querySelectorAll('.env-sky, .env-sky *').length,
    roomSvg: document.querySelectorAll('.env-room, .env-room-m').length,
    bgImages: [...document.querySelectorAll('body *')].filter(el => /url\\(/.test(getComputedStyle(el).backgroundImage)).length,
    shellZ: getComputedStyle(document.querySelector('.shell')).zIndex,
    animatedEls: [...document.querySelectorAll('.env-scene *')].filter(el => getComputedStyle(el).animationName !== 'none').length,
  };
})()`;

const A11Y_CHECK = `(() => {
  const btn = document.querySelector('.btn') || document.querySelector('.nav a');
  if (!btn) return { focusable: false };
  btn.focus();
  const cs = getComputedStyle(btn);
  const nav = document.querySelector('.nav a');
  nav && nav.focus();
  const navCs = nav ? getComputedStyle(nav) : null;
  return {
    focusable: document.activeElement === btn || document.activeElement === nav,
    btnOutline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
    navOutline: navCs ? navCs.outlineStyle + ' ' + navCs.outlineWidth + ' ' + navCs.outlineColor : null,
  };
})()`;

const CONTRAST_CHECK = `(() => {
  const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = (s) => (s.match(/[\\d.]+/g) || []).slice(0,3).map(Number);
  // 采样：把每个文本元素背后的第一个不透明祖先背景色相叠（近似：取最近的非透明背景）
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const b = getComputedStyle(n).backgroundColor;
      const a = (b.match(/[\\d.]+/g) || [])[3];
      if (b && b !== 'rgba(0, 0, 0, 0)' && (a === undefined || Number(a) > 0.6)) return parse(b);
      n = n.parentElement;
    }
    return [13,18,38];
  };
  const targets = [
    ['h1', document.querySelector('h1')],
    ['hero-p', document.querySelector('.hero-copy p')],
    ['entry-p', document.querySelector('.entry-card p')],
    ['card-name', document.querySelector('.card-name-line')],
    ['panel-text', document.querySelector('.panel p')],
    ['interp', document.querySelector('.interp')],
    ['meta-row', document.querySelector('.meta-row')],
  ].filter(([, el]) => el);
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi+0.05)/(lo+0.05); };
  return targets.map(([k, el]) => {
    const fg = parse(getComputedStyle(el).color);
    const bg = bgOf(el);
    return { k, ratio: Number(ratio(fg, bg).toFixed(2)) };
  });
})()`;

const FPS_CHECK = `(async () => {
  const frames = [];
  let last = performance.now();
  await new Promise((res) => {
    let n = 0;
    const step = () => { const t = performance.now(); frames.push(t - last); last = t; n++; if (n < 90) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
  window.scrollTo(0, 400); window.scrollTo(0, 0);
  const sorted = frames.slice(5).sort((a, b) => a - b);
  return { avgMs: Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2)), p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)), frames: sorted.length };
})()`;

/* ---------- 桌面遍历 ---------- */
for (const r of ROUTES) {
  await cdp.send('Page.navigate', { url: BASE + r });
  await sleep(r === '/collection' ? 1800 : 1100);
  const o = await cdp.eval(OVERFLOW_CHECK);
  results.push({ route: r, viewport: '1440x900', overflow: o.overflow, offenders: o.offenders });
  if (r === '/') {
    results.push({ env: await cdp.eval(ENV_CHECK) });
    results.push({ a11y: await cdp.eval(A11Y_CHECK) });
    results.push({ contrast: await cdp.eval(CONTRAST_CHECK) });
    results.push({ fps: await cdp.eval(FPS_CHECK) });
  }
  if (r === '/collection') {
    results.push({ contrastArchive: await cdp.eval(CONTRAST_CHECK) });
  }
}

/* ---------- 1280×720 ---------- */
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
for (const r of ROUTES) {
  await cdp.send('Page.navigate', { url: BASE + r });
  await sleep(r === '/collection' ? 1600 : 1000);
  const o = await cdp.eval(OVERFLOW_CHECK);
  results.push({ route: r, viewport: '1280x720', overflow: o.overflow });
}

/* ---------- 390×844 移动端 ---------- */
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
for (const r of ROUTES) {
  await cdp.send('Page.navigate', { url: BASE + r });
  await sleep(r === '/collection' ? 1800 : 1100);
  const o = await cdp.eval(OVERFLOW_CHECK);
  results.push({ route: r, viewport: '390x844', overflow: o.overflow, offenders: o.offenders });
  if (r === '/') results.push({ envMobile: await cdp.eval(ENV_CHECK) });
}

/* ---------- reduced motion ---------- */
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: BASE + '/' });
await sleep(1200);
results.push({ reducedMotion: await cdp.eval(`(() => {
  const pick = [...document.querySelectorAll('.env-scene *')];
  const animated = pick.filter(el => getComputedStyle(el).animationName !== 'none' && getComputedStyle(el).animationDuration !== '0.01ms');
  return { envAnimated: animated.length, animNames: animated.slice(0,4).map(el => getComputedStyle(el).animationName),
           skyAnim: getComputedStyle(document.querySelector('.env-sky')).animationName,
           fadeDuration: getComputedStyle(document.querySelector('.fade-in')).animationDuration };
})()`) });

/* ---------- 启封扇形：跨视口横向溢出 ---------- */
await cdp.send('Emulation.setEmulatedMedia', { features: [] });
for (const w of [1440, 1280, 1024, 768, 640, 600, 480, 430, 390, 360]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: w < 700 });
  await cdp.send('Page.navigate', { url: BASE + '/unseal' });
  await sleep(1200);
  const res = await cdp.eval(`(() => {
    const gate = document.querySelector('.orb-gate');
    if (!gate) return { none: true };
    gate.click();
    return { opened: document.querySelector('.fan-box') !== null };
  })()`);
  await sleep(900);
  const f = await cdp.eval(`(() => {
    const box = document.querySelector('.fan-box');
    const cards = [...document.querySelectorAll('.fan-box .card-btn')];
    let min = Infinity, max = -Infinity;
    for (const el of cards) { const b = el.getBoundingClientRect(); min = Math.min(min, b.left); max = Math.max(max, b.right); }
    return {
      opened: !!box,
      cards: cards.length,
      fanLeft: cards.length ? Math.round(min) : null,
      fanRight: cards.length ? Math.round(max) : null,
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  })()`);
  results.push({ fan: { viewport: w, ...res, ...f } });
}

/* ---------- 间歇性横向溢出（旋转环）：连续采样 ---------- */
for (const w of [390, 480, 600, 768]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: w < 700 });
  await cdp.send('Page.navigate', { url: BASE + '/unseal' });
  await sleep(1200);
  const samples = await cdp.eval(`(async () => {
    const out = [];
    for (let i = 0; i < 20; i++) { out.push(document.documentElement.scrollWidth - window.innerWidth); await new Promise(r => setTimeout(r, 200)); }
    return out;
  })()`);
  results.push({ intermittentOverflow: { viewport: w, route: '/unseal', max: Math.max(...samples) } });
}

/* ---------- 观星台功能：能否真的抓到星 ---------- */
await cdp.send('Page.navigate', { url: BASE + '/starcatch' });
await sleep(1200);
await cdp.eval(`document.querySelector('.sky .btn-primary').click()`);
await sleep(3000);
const catchResult = await cdp.eval(`(() => {
  const sky = document.querySelector('.sky');
  const sr = sky.getBoundingClientRect();
  const stars = [...document.querySelectorAll('.sky-star')];
  const before = Number((document.querySelector('.sky-hud').textContent.match(/✦\\s*(\\d+)/) || [0, 0])[1]);
  let clicked = 0;
  for (const el of stars.slice(0, 3)) {
    const b = el.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (x < sr.x || x > sr.right || y < sr.y || y > sr.bottom) continue;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    clicked++;
  }
  return { starsOnScreen: stars.length, clicked, inSky: stars.filter(el => { const b = el.getBoundingClientRect(); return b.x >= sr.x && b.x <= sr.right && b.y >= sr.y && b.y <= sr.bottom; }).length, scoreBefore: before };
})()`);
await sleep(400);
const afterScore = await cdp.eval(`document.querySelector('.sky-hud') ? document.querySelector('.sky-hud').textContent.trim() : 'round-ended'`);
results.push({ starcatch: { ...catchResult, hudAfter: afterScore } });

const pad = (s, n) => String(s).padEnd(n);
console.log(JSON.stringify(results, null, 2));
mkdirSync('.tools/qa', { recursive: true });
writeFileSync('.tools/qa/qa-probe.json', JSON.stringify(results, null, 2));
void pad;
cdp.ws?.close?.();
chrome.kill();
