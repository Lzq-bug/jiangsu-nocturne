#!/usr/bin/env node
/**
 * 几何核对（不依赖 three，也不依赖浏览器）：把 data.js 的常数表抠出来在 node 里算一遍。
 *   node tongli/tools/geom.mjs
 *
 * 查的是三件最容易白跑一轮连拍的事：
 *   1. 机位是不是站在能站的地方（岸顶、堤顶、洲顶，或明确写明的船头）；
 *   2. 桥是不是真的跨在水上——桥的中心要在水里，两端要在地上；
 *   3. 灯船航线有没有穿到屋体或圩岸里。
 */
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (await readFile(resolve(ROOT, 'src/data.js'), 'utf8'))
  .replace(/import[^\n]*from '\.\/kit\.js';/, `
let __seed = 20261015;
export function rand() {
  __seed |= 0; __seed = (__seed + 0x6d2b79f5) | 0;
  let t = Math.imul(__seed ^ (__seed >>> 15), 1 | __seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + rand() * (b - a);
`);
const tmp = resolve(ROOT, '.tmp-data.mjs');
await mkdir(dirname(tmp), { recursive: true });
await writeFile(tmp, src, 'utf8');
const D = await import(pathToFileURL(tmp).href);
await unlink(tmp);

const { STATIONS, BRIDGES, CANAL, ISLANDS, BANKS, VOYAGE, RESERVE, ISLET, GARDEN, onLand, pointIn, BANK, DEP } = D;

/* ---- 点到最近地块边界的符号距离：在水里为负 */
function landDist(x, z) {
  const id = onLand(x, z);
  if (id) {
    const poly = ISLANDS.find((i) => i.id === id).poly;
    let best = 1e9;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j], [bx, bz] = poly[i];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  }
  // 水里：到任一块地的最短距离取负
  let best = 1e9;
  for (const isl of ISLANDS) {
    const poly = isl.poly;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j], [bx, bz] = poly[i];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
  }
  return -best;
}

function inBank(x, z, pad = 0) {
  for (const b of BANKS) {
    for (let i = 0; i < b.path.length - 1; i++) {
      const [ax, az] = b.path[i], [bx, bz] = b.path[i + 1];
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      if (t < -0.02 || t > 1.02) continue;
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < b.width / 2 + pad) return b.id;
    }
  }
  return null;
}

const problems = [];
const notes = [];

/* ---- 1. 机位 */
for (const s of STATIONS) {
  const [x, z] = s.at;
  const d = landDist(x, z);
  const onIslet = Math.hypot(x - ISLET.x, z - ISLET.z) < ISLET.r;
  const onBank = inBank(x, z, 3);
  if (s.id === 'chuan' || s.id === 'aerial') continue;   // 一个在船头、一个飞在湖上                 // 这一站本来就在船头
  if (d <= 0.6 && !onIslet && !onBank) problems.push(`机位 ${s.id}（${s.short}）站在水上：landDist=${d.toFixed(1)}`);
  if (d > 0 && d < 1.2) notes.push(`机位 ${s.id} 离岸边只有 ${d.toFixed(1)} 米，可能被檐或灯柱挡住`);
  // 站得太深就等于站在屋体里：沿河街只有 4.2 米，门前空地另算
  const yard = (D.FORECOURT || []).some((r) => s.at[0] > r.x0 - 2 && s.at[0] < r.x1 + 2 && s.at[1] > r.z0 - 2 && s.at[1] < r.z1 + 2);
  const inPlot = RESERVE.some((r) => s.at[0] > r.x0 && s.at[0] < r.x1 && s.at[1] > r.z0 && s.at[1] < r.z1);
  if (d > 8 && !yard && !inPlot) problems.push(`机位 ${s.id} 深入街坊 ${d.toFixed(1)} 米，多半站在屋里`);
  if (s.mark) {
    const [mx, mz] = s.mark;
    notes.push(`机位 ${s.id} 的热点锚点 (${mx.toFixed(0)},${mz.toFixed(0)}) landDist=${landDist(mx, mz).toFixed(1)}`);
  }
}

/* ---- 2. 桥 */
for (const b of BRIDGES) {
  const [x, z] = b.at;
  const c = CANAL[b.over];
  const dirX = Math.cos(b.dir), dirZ = -Math.sin(b.dir);   // 绕 Y 转 dir：局部 +X → (cos, -sin)
  const half = b.span / 2;
  const ends = [[x + dirX * half, z + dirZ * half], [x - dirX * half, z - dirZ * half]];
  const dMid = landDist(x, z);
  const dEnds = ends.map(([ex, ez]) => landDist(ex, ez));
  const water = c ? c.width / 2 + 2 : 9;
  if (dMid > 0.2) problems.push(`桥 ${b.id} 的中心落在地上（landDist=${dMid.toFixed(1)}），跨的不是水`);
  if (dEnds.some((d) => d <= 1.0)) problems.push(`桥 ${b.id} 的桥头还在水里（两端 ${dEnds.map((v) => v.toFixed(1)).join(' / ')}）， span=${b.span} 太短（河宽 ${c ? c.width : '?'}）`);
  if (dEnds.some((d) => d > water + 8)) problems.push(`桥 ${b.id} 的桥头伸进地里太深（${dEnds.map((v) => v.toFixed(1)).join(' / ')}）`);
  // 拱桥的净空：桥心高 = BANK + rise，券洞要在它下面留得下船
  if (b.type === 'arch') {
    const clear = (BANK + b.rise) - (BANK - 0.6);
    notes.push(`拱桥 ${b.id} rise=${b.rise} 拱顶离水面约 ${(BANK + b.rise).toFixed(1)} 米`);
    if (clear < 1.4) problems.push(`拱桥 ${b.id} 的券洞净空太小`);
  }
}

/* ---- 3. 航线 */
{
  const n = 220;
  let hits = 0, bankHits = 0;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (VOYAGE.route.length - 1);
    const k = Math.floor(t), f = t - k;
    const a = VOYAGE.route[k], b = VOYAGE.route[Math.min(VOYAGE.route.length - 1, k + 1)];
    const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
    if (landDist(x, z) > 0.4) hits++;
    if (inBank(x, z, 1.5)) bankHits++;
  }
  if (hits > n * 0.06) problems.push(`航线有 ${hits} 处穿屋/穿地（共 ${n + 1} 个采样）`);
  if (bankHits > 6) problems.push(`航线有 ${bankHits} 处撞圩岸`);
  else notes.push(`航线穿地 ${hits} 处、撞圩 ${bankHits} 处（在容许范围内）`);
}

/* ---- 4. 园与宅的地块归属 */
for (const r of RESERVE) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const d = landDist(cx, cz);
  if (d <= 0.5) problems.push(`预留地块 ${r.id} 的中心不在地上（landDist=${d.toFixed(1)}）`);
  const cornerD = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].map(([x, z]) => landDist(x, z));
  if (cornerD.some((v) => v <= 0.3)) problems.push(`预留地块 ${r.id} 有角出了地（${cornerD.map((v) => v.toFixed(1)).join('/')}）`);
}
{
  const P = GARDEN.plot;
  for (const [x, z] of [[GARDEN.hall.x, GARDEN.hall.z], [GARDEN.tower.x, GARDEN.tower.z], [GARDEN.pavilion.x, GARDEN.pavilion.z]]) {
    if (x < P.x0 || x > P.x1 || z < P.z0 || z > P.z1) problems.push(`退思园建筑 (${x},${z}) 落在园墙之外`);
  }
  const pondIn = GARDEN.pondPoly.every(([x, z]) => onLand(x, z) === 'n1');
  if (!pondIn) notes.push('园池边缘有点出地块，挖洞会缺角');
}

console.log(problems.length ? `几何核对：${problems.length} 处要改` : '几何核对：机位、桥、航线、地块都对得上');
for (const p of problems) console.log('  ✗ ' + p);
for (const n of notes) console.log('  · ' + n);
