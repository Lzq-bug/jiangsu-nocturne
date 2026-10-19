#!/usr/bin/env node
// 把 land.js 里算驳岸顶点的那段搬到 node 里跑一遍，找出哪块地出 NaN
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
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

const { ISLANDS, pointIn, BANK, QUAY_DRAFT } = D;

function perimeterFrames(poly, step = 2.6) {
  const n = poly.length, out = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-4) { console.log('  零边', i, a, b); continue; }
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let nx = -tz, nz = tx;
    if (!pointIn(poly, a[0] + nx, a[1] + nz)) { nx = tz; nz = -tx; }
    const k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz, nx, nz, s: total + L * t });
    }
    total += L;
  }
  out.total = total;
  return out;
}

const rows = [
  { y: BANK - QUAY_DRAFT, dry: 0 },
  { y: BANK - QUAY_DRAFT * 0.42, dry: 0.26 },
  { y: BANK - 0.8, dry: 0.62 },
  { y: BANK + 0.03, dry: 1 },
];

for (const isl of ISLANDS) {
  const frames = perimeterFrames(isl.poly, 2.6);
  let bad = 0, first = null;
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const bulge = 0.15 * Math.sin(f.s * 0.29) + 0.05 * Math.sin(f.s * 1.13 + 2.1);
      const x = f.x - f.nx * bulge, z = f.z - f.nz * bulge;
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(f.s)) {
        bad++;
        if (!first) first = { r, i, f, bulge };
      }
    }
  }
  const verts = frames.length * rows.length;
  console.log(`${isl.id.padEnd(3)} 边点 ${String(isl.poly.length).padStart(3)} 取样 ${String(frames.length).padStart(4)} 顶点 ${String(verts).padStart(5)} NaN ${bad}`);
  if (first) console.log('   首个坏点：', JSON.stringify(first));
}
