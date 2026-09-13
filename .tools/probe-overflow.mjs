/** 定位横向溢出元素（本地工具） */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5174';
const port = 9366;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (u) => (await fetch(u)).json();
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); const c = new Cdp(ws); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && c.p.has(m.id)) { const { res, rej } = c.p.get(m.id); c.p.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => this.p.set(id, { res, rej })); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; }
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'vmr-ov-' + Date.now())}`, 'about:blank'], { stdio: 'ignore' });
let v = null;
for (let i = 0; i < 60; i++) { await sleep(250); try { v = await json(`http://127.0.0.1:${port}/json/version`); break; } catch {} }
if (!v) { chrome.kill(); throw new Error('no chrome'); }
const list = await json(`http://127.0.0.1:${port}/json/list`);
const cdp = await Cdp.connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
for (const r of ['/unseal', '/', '/collection']) {
  await cdp.send('Page.navigate', { url: BASE + r });
  await sleep(1400);
  const out = await cdp.eval(`(() => {
    const vw = window.innerWidth;
    const all = [...document.querySelectorAll('body *')];
    const bad = all.filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > vw + 0.5 || b.left < -0.5); })
      .map(el => { const b = el.getBoundingClientRect(); return (el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ').join('.') : '')).slice(0,46) + ' L' + Math.round(b.left) + ' R' + Math.round(b.right) + ' pos:' + getComputedStyle(el).position; });
    // 伪元素检查
    const pes = [];
    for (const el of all) {
      for (const pe of ['::before','::after']) {
        const cs = getComputedStyle(el, pe);
        if (cs.content === 'none' || cs.display === 'none') continue;
        const w = parseFloat(cs.width), ih = parseFloat(cs.insetInlineStart || '0');
        void w; void ih;
      }
    }
    const inner = [...document.querySelectorAll('.ritual *')].map((el) => { const b = el.getBoundingClientRect(); return (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '')).slice(0, 40) + ' L' + Math.round(b.left) + ' R' + Math.round(b.right) + ' W' + Math.round(b.width); }).slice(0, 8);
    const noAnim = (() => {
      const s = document.createElement('style');
      s.textContent = '.orb-gate::before,.orb-gate::after{animation:none!important}';
      document.head.appendChild(s);
      const v = document.documentElement.scrollWidth; s.remove(); return v;
    })();
    const fixedBox = (() => {
      const s = document.createElement('style');
      s.textContent = '.orb-gate::before,.orb-gate::after{display:none!important}';
      document.head.appendChild(s);
      const v = document.documentElement.scrollWidth; s.remove(); return v;
    })();
    return { route: location.pathname, vw, docW: document.documentElement.scrollWidth, noAnim, fixedBox, inner };
  })()`);
  console.log(JSON.stringify(out));
}
cdp.ws?.close?.();
chrome.kill();
