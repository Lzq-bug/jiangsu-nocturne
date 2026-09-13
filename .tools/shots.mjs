/**
 * 展示截图驱动（仅本地开发工具，不入库）
 *
 * 通过 Chrome DevTools Protocol 驱动本机 Chrome：
 *   - 可注入 fixture 存档（78/78 收藏）便于拍摄展示图
 *   - 可点击元素后再截图（真实交互，非伪造状态）
 *   - 采集 console error / pageerror 用于 Console 0 error 门禁
 *
 * 用法：node .tools/shots.mjs <jobs.json>
 * jobs.json: { chrome: "path", base: "http://127.0.0.1:5173", jobs: [...] }
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Cdp(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const l of c.listeners) l(msg);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn) { this.listeners.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

async function main() {
  const cfgPath = process.argv[2];
  const cfg = JSON.parse((await import('node:fs')).readFileSync(cfgPath, 'utf8'));
  const userData = join(tmpdir(), `vmr-shot-${Date.now()}`);

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${cfg.port || 9222}`,
    `--user-data-dir=${userData}`,
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { version = await fetchJson(`http://127.0.0.1:${cfg.port || 9222}/json/version`); break; } catch {}
  }
  if (!version) { chrome.kill(); throw new Error('Chrome devtools 未就绪'); }

  // 复用默认标签页（/json/new 需要 PUT，某些版本拒绝 GET）
  const list = await fetchJson(`http://127.0.0.1:${cfg.port || 9222}/json/list`);
  const target = list.find((t) => t.type === 'page') || list[0];
  if (!target) { chrome.kill(); throw new Error('未找到可调试页面'); }
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);

  const consoleErrors = [];
  cdp.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(`console.error: ${(msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(`exception: ${msg.params.exceptionDetails?.text} ${msg.params.exceptionDetails?.exception?.description ?? ''}`);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry?.level === 'error') {
      consoleErrors.push(`log: ${msg.params.entry.text}`);
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  const results = [];
  let lastFixture = null;

  for (const job of cfg.jobs) {
    const w = job.w || 1440;
    const h = job.h || 900;
    const dsf = job.scale || 1;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: dsf, mobile: !!job.mobile,
    });

    if (job.fixture && job.fixture !== lastFixture) {
      // 先落地到同源页面，再写 localStorage，之后由业务 URL 读取
      await cdp.send('Page.navigate', { url: cfg.base + '/' });
      await sleep(600);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => { try { localStorage.setItem('veiled-moon.save.v1', ${JSON.stringify(JSON.stringify(job.fixture))}); return 'ok'; } catch(e) { return String(e); } })()`,
        awaitPromise: false,
      });
      lastFixture = job.fixture;
    }
    if (job.fixture === null && lastFixture) {
      await cdp.send('Page.navigate', { url: cfg.base + '/' });
      await sleep(500);
      await cdp.send('Runtime.evaluate', { expression: `(() => { try { localStorage.removeItem('veiled-moon.save.v1'); return 'ok'; } catch(e){ return 'x'; } })()` });
      lastFixture = null;
    }

    for (const step of (job.steps || [])) {
      if (step.goto) {
        await cdp.send('Page.navigate', { url: cfg.base + step.goto });
        await sleep(step.wait ?? 900);
      }
      if (step.click) {
        const r = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(step.click)}); if(!el) return 'notfound'; el.click(); return 'clicked'; })()`,
        });
        results.push({ note: `${job.out} click ${step.click} -> ${r.result?.value}` });
        await sleep(step.wait ?? 600);
      }
      if (step.eval) {
        await cdp.send('Runtime.evaluate', { expression: step.eval });
        await sleep(step.wait ?? 300);
      }
      if (step.evalAsync) {
        const r = await cdp.send('Runtime.evaluate', { expression: step.evalAsync, awaitPromise: true, returnByValue: true });
        results.push({ note: `${job.out} evalAsync -> ${typeof r.result?.value === 'string' ? r.result.value.slice(0, 60) : JSON.stringify(r.result?.value)}` });
        await sleep(step.wait ?? 300);
      }
      if (step.waitOnly) await sleep(step.waitOnly);
    }

    if (job.goto) {
      await cdp.send('Page.navigate', { url: cfg.base + job.goto });
      await sleep(job.wait ?? 1200);
    }

    // 触发一次手势以解锁音频（模拟真实玩家），避免交互态缺失
    if (job.gesture !== false) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'none', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'none', clickCount: 1 });
    }
    await sleep(job.settle ?? 500);

    if (job.evalBeforeShot) {
      await cdp.send('Runtime.evaluate', { expression: job.evalBeforeShot });
      await sleep(job.settle ?? 400);
    }

    const shot = { format: 'png' };
    if (job.full) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const cs = m.contentSize || m.cssContentSize;
      shot.captureBeyondViewport = true;
      shot.clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
    }
    const res = await cdp.send('Page.captureScreenshot', shot);
    const out = job.out;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(res.data, 'base64'));
    results.push({ out, ok: true, w, h });
    if (job.consoleGate) {
      results.push({ consoleErrors: consoleErrors.slice() });
      consoleErrors.length = 0;
    }
  }

  results.push({ finalConsoleErrors: consoleErrors.slice() });
  cdp.close();
  chrome.kill();
  await sleep(300);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
