/** 测量启封扇形在窄屏下的实际外扩宽度（本地工具） */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5174';
const port = 9355;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (u) => (await fetch(u)).json();
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); const c = new Cdp(ws); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && c.p.has(m.id)) { const { res, rej } = c.p.get(m.id); c.p.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => this.p.set(id, { res, rej })); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; }
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'vmr-fan-' + Date.now())}`, 'about:blank'], { stdio: 'ignore' });
let v = null;
for (let i = 0; i < 60; i++) { await sleep(250); try { v = await json(`http://127.0.0.1:${port}/json/version`); break; } catch {} }
if (!v) { chrome.kill(); throw new Error('no chrome'); }
const list = await json(`http://127.0.0.1:${port}/json/list`);
const cdp = await Cdp.connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

for (const w of [1440, 768, 430, 390, 360]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: w < 700 });
  await cdp.send('Page.navigate', { url: BASE + '/unseal' });
  await sleep(1300);
  await cdp.eval(`document.querySelector('.orb-gate').click()`);
  await sleep(900);
  const r = await cdp.eval(`(() => {
    const cards = [...document.querySelectorAll('.ritual-stage .card-btn')];
    if (!cards.length) return { none: true };
    let min = Infinity, max = -Infinity, top = Infinity, bottom = -Infinity;
    for (const el of cards) { const b = el.getBoundingClientRect(); min = Math.min(min, b.left); max = Math.max(max, b.right); top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom); }
    return { viewport: window.innerWidth, fanLeft: Math.round(min), fanRight: Math.round(max), fanWidth: Math.round(max - min), top: Math.round(top), bottom: Math.round(bottom), docScrollW: document.documentElement.scrollWidth };
  })()`);
  console.log(JSON.stringify(r));
}
cdp.ws?.close?.();
chrome.kill();
