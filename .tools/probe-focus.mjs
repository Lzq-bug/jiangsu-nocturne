/** 键盘焦点可见性 + 卡牌状态检查（本地工具） */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5174';
const port = 9388;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (u) => (await fetch(u)).json();
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); const c = new Cdp(ws); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && c.p.has(m.id)) { const { res, rej } = c.p.get(m.id); c.p.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise((res, rej) => this.p.set(id, { res, rej })); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; }
  async key(k) { await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: k === 'Tab' ? 9 : 0 }); await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: k === 'Tab' ? 9 : 0 }); }
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'vmr-focus-' + Date.now())}`, 'about:blank'], { stdio: 'ignore' });
let v = null;
for (let i = 0; i < 60; i++) { await sleep(250); try { v = await json(`http://127.0.0.1:${port}/json/version`); break; } catch {} }
if (!v) { chrome.kill(); throw new Error('no chrome'); }
const list = await json(`http://127.0.0.1:${port}/json/list`);
const cdp = await Cdp.connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const out = [];
for (const r of ['/', '/collection', '/card/major-18', '/unseal', '/starcatch', '/settings']) {
  await cdp.send('Page.navigate', { url: BASE + r });
  await sleep(1400);
  const seen = [];
  await cdp.eval(`document.body.focus(); document.activeElement && document.activeElement.blur();`);
  for (let i = 0; i < 4; i++) {
    await cdp.key('Tab');
    await sleep(160);
    const info = await cdp.eval(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 34), text: (el.textContent || '').trim().slice(0, 14),
        outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, offset: cs.outlineOffset, hasOutline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, pos: Math.round(b.x) + ',' + Math.round(b.y) };
    })()`);
    if (info) seen.push(info);
  }
  out.push({ route: r, tabs: seen });
}
console.log(JSON.stringify(out, null, 1));
cdp.ws?.close?.();
chrome.kill();
