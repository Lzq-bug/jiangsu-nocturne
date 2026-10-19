#!/usr/bin/env node
/**
 * 连拍之前先跑一遍的静态核对（本景自用，不进共享 tools/）。
 * 它只做两件便宜而致命的事：
 *   1) 每个模块从 ./data.js 里 import 的名字，data.js 真的导出没有；
 *   2) 代码里写的 M.xxx / T.xxx，kit.js 的 initMaterials 与 textures.js 的导出里真的有没有。
 * undefined 进算术不会报错，只会在渲染时变成 NaN，然后整块几何被 three 剔掉——
 * 一屏"桥没了"的静帧要七分钟才看得见，这一轮只要一秒。
 * 顺带把每个模块复制成 .mjs 走一遍 node --check，语法错误也在这里挡住。
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SRC = join(process.cwd(), 'src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.js'));
const srcOf = (f) => readFileSync(join(SRC, f), 'utf8');

const DATA = new URL('../src/data.js', import.meta.url).href;
const dataExports = new Set(Object.keys(await import(DATA)));

/* kit.js 的 initMaterials 里给了哪些材质名 */
const kit = srcOf('kit.js');
const mats = new Set([...kit.matchAll(/\bM\.([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]));

/* textures.js 导出了哪些函数 */
const texNames = new Set([...srcOf('textures.js').matchAll(/^export function ([A-Za-z0-9_]+)/gm)].map((m) => m[1]));

let bad = 0;
const say = (f, msg) => { console.log(`✗ ${f}: ${msg}`); bad++; };

for (const f of files) {
  const s = srcOf(f);
  // 1) 从 data.js 的 import
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/data\.js'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!dataExports.has(name)) say(f, `data.js 没有导出 ${name}`);
    }
  }
  // 2) M.xxx 与 T.xxx 的取值
  for (const m of s.matchAll(/\bM\.([A-Za-z0-9_]+)/g)) {
    if (!mats.has(m[1]) && m[1] !== 'materials') say(f, `M.${m[1]} 未在 kit.js 的 initMaterials 里定义`);
  }
  for (const m of s.matchAll(/\bT\.([A-Za-z0-9_]+)\s*\(/g)) {
    if (!texNames.has(m[1])) say(f, `T.${m[1]}() 未在 textures.js 里导出`);
  }
  // 3) 语法
  const dir = mkdtempSync(join(tmpdir(), 'njcheck-'));
  const tmp = join(dir, f.replace(/\.js$/, '.mjs'));
  writeFileSync(tmp, s);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  if (r.status !== 0) say(f, `语法：${(r.stderr || '').split('\n').slice(0, 3).join(' / ')}`);
}

/* 4) 几何/高程函数在机位上取到的是有限数 */
const { STATIONS, groundY, roadY, railY } = await import(new URL('../src/data.js', import.meta.url).href);
for (const s of STATIONS) {
  for (const key of ['pos', 'look', 'mark']) {
    const v = s[key];
    if (!v) continue;
    for (const n of v) if (!Number.isFinite(n)) say(s.id, `${key} 里有非有限数 ${v}`);
  }
  const g = groundY(s.pos[0], s.pos[2]);
  if (!Number.isFinite(g) || !Number.isFinite(roadY(s.pos[2])) || !Number.isFinite(railY(s.pos[2]))) {
    say(s.id, '高程函数返回 NaN');
  }
}

console.log(bad === 0
  ? `✓ ${files.length} 个模块、${STATIONS.length} 个机位：引用与语法都对得上`
  : `共 ${bad} 处对不上，先修再连拍`);
process.exit(bad === 0 ? 0 : 1);
