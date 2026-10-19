/**
 * 逐机位无头截图：chrome/edge --headless=new + swiftshader 软件渲染。
 *   node tools/shoot.mjs [st1 st2 ...]
 * 出图落在 shots/<id>.png，用 ?st=<id> 让场景直接落到该机位。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const STATIONS = ['natian', 'skybridge', 'tower', 'boardwalk', 'mirror', 'swan', 'pear', 'sanfeng', 'aerial'];
const port = process.env.PORT || 8790;
const outDir = resolve('shots');
mkdirSync(outDir, { recursive: true });

const bin = CANDIDATES.find((p) => {
  try { return spawnSync(p, ['--version']).status === 0; } catch { return false; }
});
if (!bin) { console.error('找不到 chrome / msedge'); process.exit(1); }
console.log('使用', bin);

const wanted = process.argv.slice(2).filter((s) => STATIONS.includes(s));
const list = wanted.length ? wanted : STATIONS;
for (const id of list) {
  const file = resolve(outDir, `${id}.png`);
  const r = spawnSync(bin, [
    '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720', '--hide-scrollbars',
    '--virtual-time-budget=45000',
    `--screenshot=${file}`,
    `http://127.0.0.1:${port}/index.html?st=${id}`,
  ], { stdio: 'inherit', timeout: 180000 });
  console.log(r.status === 0 ? `ok  ${id}` : `FAIL ${id}`);
}
