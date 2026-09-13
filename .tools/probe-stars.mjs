/**
 * 观星台星星定位探针（本地工具，不入库）
 * 用途：验证 .sky-star 的实际屏幕位置是否落在天幕内（排查 % translate 相对元素自身的问题）
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) { return (await fetch(url)).json(); }

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
}

const port = 9333;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'vmr-probe-' + Date.now())}`, 'about:blank'], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 60; i++) { await sleep(250); try { v = await json(`http://127.0.0.1:${port}/json/version`); break; } catch {} }
if (!v) { chrome.kill(); throw new Error('chrome not ready'); }
const list = await json(`http://127.0.0.1:${port}/json/list`);
const cdp = await Cdp.connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await cdp.send('Page.navigate', { url: BASE + '/starcatch' });
await sleep(1500);
await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.sky .btn-primary').click()` });
await sleep(4000);

const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const sky = document.querySelector('.sky');
    const sr = sky.getBoundingClientRect();
    const stars = [...document.querySelectorAll('.sky-star')];
    return JSON.stringify({
      sky: { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) },
      count: stars.length,
      style: stars[0] ? stars[0].getAttribute('style') : null,
      boxes: stars.slice(0, 6).map((el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) }; }),
      inSky: stars.filter((el) => { const b = el.getBoundingClientRect(); return b.x >= sr.x && b.x <= sr.right && b.y >= sr.y && b.y <= sr.bottom; }).length,
    });
  })()`,
});
console.log(r.result.value);
cdp.ws?.close?.();
chrome.kill();
