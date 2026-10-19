/**
 * 连拍前的静态核对：引用对不上、坐标 NaN、机位埋进山体——这些都能在node里查出来，
 * 不必花七分钟一轮的无头截图去发现。
 *   node langshan/tools/preflight.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as D from '../src/data.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'));
const srcOf = Object.fromEntries(files.map((f) => [f, readFileSync(join(srcDir, f), 'utf8')]));

let bad = 0;
const say = (msg) => { console.log(msg); bad++; };

/* 1. 材质名：kit.js 的 initMaterials 里定义了哪些 M.xxx，别的模块就只能用这些 */
const kit = srcOf['kit.js'];
const defined = new Set([...kit.matchAll(/^\s*M\.(\w+)\s*=/gm)].map((m) => m[1]));
for (const [f, src] of Object.entries(srcOf)) {
  if (f === 'kit.js') continue;
  for (const m of src.matchAll(/\bM\.([A-Za-z_]\w*)/g)) {
    if (!defined.has(m[1])) say(`${f}: 引用了未定义的材质 M.${m[1]}`);
  }
}
/* temple.js 的几何批次用 C 的键名去索引 M */
const temple = srcOf['temple.js'];
const cKeys = (temple.match(/const C = \{([^}]*)\}/s) || ['', ''])[1]
  .split(/[,\n]/).map((s) => s.trim().replace(/:.*$/, '').replace(/[^\w]/g, '')).filter(Boolean);
for (const k of cKeys) if (!defined.has(k)) say(`temple.js: 几何批次键 "${k}" 没有同名 M.${k}`);

/* 2. data.js 的导出：别的模块 import 了不存在的名字，node 里是 undefined 而不是报错 */
const exportsOf = new Set(Object.keys(D));
for (const [f, src] of Object.entries(srcOf)) {
  if (f === 'data.js') continue;
  const re = /import\s*\{([^}]*)\}\s*from\s*'\.\/data\.js'/g;
  for (const m of src.matchAll(re)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name && !exportsOf.has(name)) say(`${f}: data.js 没有导出 ${name}`);
    }
  }
}

/* 3. 数值有限性：机位、台地、建筑落点、路上采样 */
const finite = (label, v) => {
  if (!Number.isFinite(v)) say(`${label} = ${v}`);
};
for (const s of D.STATIONS) {
  for (const [k, arr] of [['pos', s.pos], ['look', s.look], ['mark', s.mark]]) {
    if (!arr) continue;
    arr.forEach((v, i) => finite(`STATIONS[${s.id}].${k}[${i}]`, v));
  }
}
for (const key of Object.keys(D.PADS)) {
  const p = D.PADS[key];
  finite(`PADS.${key}.y`, p.y);
  // 台面应当是平的：整方内地表与台顶的差只能出现在"没被削到"的外侧
  let above = 0, worst = 0;
  for (let i = 0; i <= 14; i++) {
    for (let j = 0; j <= 14; j++) {
      const x = p.x0 + (p.x1 - p.x0) * (i / 14), z = p.z0 + (p.z1 - p.z0) * (j / 14);
      const v = D.heightAt(x, z) - p.y;
      if (v > 1.2) { above++; worst = Math.max(worst, v); }
    }
  }
  // 台面内部的格点应基本是平的；边缘 feather 区外侧高出来是挡墙，不算问题
  if (above > 4) console.log(`  台地 ${key}: 边缘 ${above} 格高于台顶（最高 ${worst.toFixed(1)} m，那是挡墙与削山的面）`);
  // 内圈（退掉 feather）里建筑真正站的那一片
  let inner = 0, innerWorst = 0;
  for (let i = 0; i <= 14; i++) {
    for (let j = 0; j <= 14; j++) {
      const fx = p.x0 + p.feather + (p.x1 - p.x0 - 2 * p.feather) * (i / 14);
      const fz = p.z0 + p.feather + (p.z1 - p.z0 - 2 * p.feather) * (j / 14);
      const v = D.heightAt(fx, fz) - p.y;
      if (v > 0.6) { inner++; innerWorst = Math.max(innerWorst, v); }
    }
  }
  if (inner > 0) say(`台地 ${key}: 内圈还有 ${inner} 格不平（最高出 ${innerWorst.toFixed(1)} m）`);
}

/* 建筑落点：以其面阔/进深估一个方框，框内地表高差不能大过台基能埋住的量 */
const boxSpread = (x, z, hx, hz) => {
  let mn = 1e9, mx = -1e9;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
    const v = D.heightAt(x + sx * hx, z + sz * hz);
    if (v < mn) mn = v; if (v > mx) mx = v;
  }
  return { mn, mx, spread: mx - mn };
};
const hallBox = (b) => {
  const span = b.bays * b.bayW, half = (b.deck ?? 2.4) + 1;
  // rot=π/2 时面阔沿世界 Z、进深沿世界 X
  return [span / 2 + half, b.depth / 2 + half + 1.2];
};
const T = D.TEMPLE;
const FOOT = {
  pagoda: [T.pagoda, 9, 9],
  dasheng: [T.dasheng, ...hallBox(T.dasheng)],
  yuantong: [T.yuantong, ...hallBox(T.yuantong)],
  faru: [T.faru, ...hallBox(T.faru)],
  sanxian: [T.sanxian, ...hallBox(T.sanxian)],
  cuijing: [T.cuijing, (T.cuijing.d + 3) / 2, (T.cuijing.w + 3) / 2],
  gate: [T.gate, (T.gate.width + 4) / 2, 2.2],
  daxiang: [T.daxiang, T.daxiang.d / 2, T.daxiang.w / 2],
  pavilion: [T.pavilion, T.pavilion.half + 2.4, T.pavilion.half + 2.4],
  tomb: [{ x: D.TOMB.x, z: D.TOMB.z }, 15, 11],
};
for (const [name, [b, hz, hx]] of Object.entries(FOOT)) {
  finite(`${name} 落点高程`, D.heightAt(b.x, b.z));
  const s = boxSpread(b.x, b.z, hx, hz);
  if (s.spread > 3.2) say(`${name}: 足迹内高差 ${s.spread.toFixed(1)} m（${s.mn.toFixed(1)}→${s.mx.toFixed(1)}），台基埋不住`);
}

/* 4. 机位是不是站在实地能站的地方：眼高与地表高差 */
console.log('\n机位眼高核对（pos.y − 地表）：');
for (const s of D.STATIONS) {
  const g = D.heightAt(s.pos[0], s.pos[2]);
  const d = s.pos[1] - g;
  const flag = d < 1.2 || d > 60 ? ' ← 注意' : '';
  console.log(`  ${s.id.padEnd(8)} 地表 ${g.toFixed(1).padStart(6)}  眼 ${s.pos[1].toFixed(1).padStart(6)}  高差 ${d.toFixed(2).padStart(6)}${flag}`);
}

/* 5. 路的高程应当一路抬升、且贴着地表 */
let prev = -1, maxDiff = 0;
for (let i = 0; i <= 60; i++) {
  const p = D.roadAt(i / 60);
  finite(`roadAt(${(i / 60).toFixed(2)})`, p.y);
  if (p.y < prev - 0.05) say(`路在 t=${(i / 60).toFixed(2)} 倒退了：${prev.toFixed(1)} → ${p.y.toFixed(1)}`);
  prev = p.y;
  maxDiff = Math.max(maxDiff, Math.abs(D.heightAt(p.x, p.z) - p.y));
}
console.log(`路总长 ${D.roadLength().toFixed(0)} m，路床与地形最大偏差 ${maxDiff.toFixed(1)} m`);

/* 6. 西崖应当真的临水：从山顶往西一路降到 0 以下 */
const crest = D.heightAt(D.HILL.cx, D.HILL.cz);
let shoreX = null;
for (let x = D.HILL.cx; x > D.RIVER.shoreX - 60; x -= 4) {
  if (D.heightAt(x, 10) < 0.6) { shoreX = x; break; }
}
console.log(`山顶 ${crest.toFixed(1)} m；西坡入水处 x≈${shoreX}`);
if (shoreX === null) say('西坡没有落到水面以下——江与山接不上');

console.log(bad === 0 ? '\n静态核对通过' : `\n有 ${bad} 处要修`);
