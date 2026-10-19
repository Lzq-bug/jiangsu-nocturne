#!/usr/bin/env node
/**
 * 连拍前的静态核对。
 *   node tongli/tools/refs.mjs
 *
 * 查三类"运行时不报错、画面上塌一块"的事（见 memory/headless-capture-workflow）：
 *   1. import 了某个模块里并不存在的名字；
 *   2. 用到了某模块导出的名字，却没写 import（BANK 漏引过一次，整批驳岸变 NaN）；
 *   3. T.xxx 不在 textures.js 里、M.xxx 不在 kit 的材质表里。
 * 裸标识符判定要先剥掉注释与字符串，并排除 `T.tiles` 这类属性访问。
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = (await readdir(resolve(ROOT, 'src'))).filter((f) => f.endsWith('.js'));
const sources = {};
for (const f of files) sources[f] = await readFile(resolve(ROOT, 'src', f), 'utf8');

const B = String.fromCharCode(92);                   // 反斜线，免得在本文件里被转义吃掉
const bare = (n) => new RegExp(`(?<![.${B}w$])${B}b${n}${B}b(?![${B}w$])`);

const exportsOf = (src) => {
  const set = new Set();
  for (const m of src.matchAll(/export\s+(?:const|function|class|let)\s+([A-Za-z0-9_$]+)/g)) set.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const n of m[1].split(',')) if (n.trim()) set.add(n.trim().split(/\s+as\s+/).pop());
  }
  return set;
};
const MOD_EXPORTS = {};
for (const f of files) MOD_EXPORTS[f] = exportsOf(sources[f]);

const M_KEYS = new Set();
for (const m of sources['kit.js'].matchAll(/^\s{2}M\.([A-Za-z0-9_$]+)\s*=/gm)) M_KEYS.add(m[1]);

/** 剥掉注释与字符串后的"正文"，用来判断某个名字是否真的被当标识符用了 */
function code(s) {
  return s
    .replace(/^\s*import[\s\S]*?from\s*'[^']*';/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/\/\/[^\n]*/g, ' ');
}

const $LSQP = '';
const problems = [];
for (const f of files) {
  const src = sources[f];
  const imported = new Set();
  const targets = new Map();

  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gs)) {
    const base = m[2].split('/').filter(Boolean).pop();          // './kit.js' → 'kit.js'
    for (const raw of m[1].split(',')) {
      const srcName = raw.trim().split(/\s+as\s+/)[0];
      const local = raw.trim().split(/\s+as\s+/).pop();
      if (!srcName) continue;
      imported.add(local);
      if (MOD_EXPORTS[base]) {
        targets.set(srcName, base);
        if (!MOD_EXPORTS[base].has(srcName)) problems.push(`${f}: ${base} 没有导出 ${srcName}`);
      }
    }
  }

  // 只算"被当外部名字用"的出现：本地声明、属性键、类的方法名都先抹掉
  const body = code(src)
    .replace(/(?:const|let|var|function|class)\s+[A-Za-z0-9_$]+/g, ' ')
    .replace(/([A-Za-z0-9_$]+)\s*:/g, ' ')
    .replace(/^\s*([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/gm, ' ')
    .replace(/\s([A-Za-z0-9_$]+)\s*\(/g, ' $1$LSQP$(');
  for (const [mod, names] of Object.entries(MOD_EXPORTS)) {
    if (mod === f) continue;
    for (const name of names) {
      if (imported.has(name) || !bare(name).test(body)) continue;
      problems.push(`${f}: 用到了 ${name}（定义在 ${mod}）却没有 import`);
    }
  }

  src.split('\n').forEach((L, i) => {
    for (const m of L.matchAll(/\bT\.([A-Za-z0-9_$]+)/g)) {
      if (!MOD_EXPORTS['textures.js'].has(m[1])) problems.push(`${f}:${i + 1}: textures.js 没有 T.${m[1]}`);
    }
    for (const m of L.matchAll(/\bM\.([A-Za-z0-9_$]+)/g)) {
      if (!M_KEYS.has(m[1])) problems.push(`${f}:${i + 1}: kit 的 M 里没有 ${m[1]}`);
    }
  });
  void targets;
}

if (problems.length) {
  console.log(`引用核对：${problems.length} 处可疑`);
  for (const p of [...new Set(problems)]) console.log('  ✗ ' + p);
} else console.log('引用核对：全部对得上');
console.log(`· ${files.length} 个模块 · data.js 导出 ${MOD_EXPORTS['data.js'].size} 项 · kit 材质 ${M_KEYS.size} 项`);
