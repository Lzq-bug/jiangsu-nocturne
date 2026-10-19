/**
 * 无头 Edge 的 CDP 探针：抓 console/异常，并在页面里求值一段表达式。
 *   1) msedge --headless=new --remote-debugging-port=9333 <url>
 *   2) node tools/cdp-probe.mjs 9333 "<js expression>"
 */
const PORT = Number(process.argv[2] || 9333);
const EXPR = process.argv[3] || 'document.getElementById("loader-step").textContent';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const want = process.argv[4];
if (want) console.log('[targets]', list.map((t) => `${t.type}:${t.url.slice(0, 70)}`).join('\n'));
const page = list.find((t) => want && t.url.includes(want))
  || list.find((t) => t.type === 'page' && !t.url.startsWith('edge://'))
  || list.find((t) => t.type === 'page') || list[0];
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const pending = new Map();
const timeouts = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log('[exception]', d.exception?.description || d.text);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const a = msg.params.args.map((x) => x.value ?? x.description ?? x.type).join(' ');
    console.log(`[console:${msg.params.type}]`, a.slice(0, 600));
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error' || e.level === 'warning') console.log(`[log:${e.level}]`, (e.text + ' ' + (e.url || '')).slice(0, 300));
  }
});

ws.addEventListener('open', async () => {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  timeouts.push(setTimeout(async () => {
    const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
    console.log('[eval]', typeof r?.result?.value === 'string' ? r.result.value : JSON.stringify(r?.result));
    const mem = await send('Runtime.evaluate', {
      expression: 'window.qingming?JSON.stringify({calls:qingming.renderer.info.render.calls,tris:qingming.renderer.info.render.triangles,geo:qingming.renderer.info.memory.geometries,tex:qingming.renderer.info.memory.textures,programs:qingming.renderer.info.programs.length}):"no-handle"',
      returnByValue: true,
    });
    console.log('[renderer]', mem?.result?.value);
    process.exit(0);
  }, 12000));
});

ws.addEventListener('error', (e) => { console.error('ws error', e.message || e); process.exit(1); });
