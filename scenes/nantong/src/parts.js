/**
 * 通用构筑件：窗、门、柱廊、栏杆、台基、台阶、树、假山、灯。
 * 所有函数只产几何体（或往 Batch 里塞），不建网格 —— 材质在 Batch.flush() 里
 * 按 key 合并，整园几百个构件最后落到十几个 draw call 上。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, mesh, rand, rr, glow, M, poly } from './kit.js';

/**
 * 局部坐标一律 +Z 朝外、底在 y=0；先缩放、再转 X/Z、再转 Y、最后平移 ——
 * 几何体上直接链式 .scale()/.rotateX() 会把已平移的顶点一起变换，位置就飞了。
 */
export function place(geo, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4().makeRotationY(ry);
  if (rx) m.multiply(new THREE.Matrix4().makeRotationX(rx));
  if (rz) m.multiply(new THREE.Matrix4().makeRotationZ(rz));
  if (sx !== 1 || sy !== 1 || sz !== 1) m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  m.setPosition(x, y, z);
  geo.applyMatrix4(m);
  return geo;
}

const join = (parts) => (parts.length === 1 ? parts[0] : mergeGeometries(parts.filter(Boolean)));

/* ------------------------------------------------------------------ 合并桶 */
export class Batch {
  constructor() { this.buckets = new Map(); }
  add(key, geo) {
    if (!geo) return;
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(geo);
  }
  /** @returns {Map<string,THREE.Mesh>} 按材质 key 取回合并后的网格 */
  flush(parent, { castShadow = false, receive = true } = {}) {
    const out = new Map();
    for (const [key, list] of this.buckets) {
      let mat;
      if (key.startsWith('glow:')) {
        const [color, inten] = key.slice(5).split('|');
        mat = glow(color, Number(inten) || 1.6);
      } else {
        mat = M[key];
      }
      if (!mat) { console.warn('未知材质', key); continue; }
      const geo = join(list);
      if (!geo) { console.warn(`材质桶 ${key} 合并失败：几何属性或索引状态不一致`); continue; }
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = castShadow;
      m.receiveShadow = receive;
      m.name = key;
      parent.add(m);
      out.set(key, m);
    }
    this.buckets.clear();
    return out;
  }
}

export const glowKey = (color, intensity = 1.8) => `glow:${color}|${intensity}`;

/* ------------------------------------------------------------------ 门窗 */

/**
 * 上半圆拱头：弦在 y=0、axis 沿 Z、宽 2r。
 * three 的 CylinderGeometry 截面是 x=r·sinθ、z=r·cosθ（不是 cos/sin），
 * 所以取 θ∈[π/2, 3π/2] 才让 x 铺满 ±r、且 rotateX(90°) 后 y=-r·cosθ≥0 落在上半。
 */
export function archTop(r, depth) {
  const g = new THREE.CylinderGeometry(r, r, depth, 12, 1, false, Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  return g;
}

/**
 * 一扇窗，分两套几何返回：frame 是窗框/窗棂（走墙色或木色），
 * glass 是窗洞里的玻璃（走 M.glass 的暗色）。合成一套就会被窗套材质统一刷成
 * 灰板，夜里看就是一排实心拱券而不是窗。
 * 局部坐标：+Z 朝外，底 y=0，高 h 含拱。
 */
export function windowPane({ w = 1.2, h = 1.8, arch = false, mull = 0.12, depth = 0.24, style = 'plain' } = {}) {
  const r = arch ? w / 2 : 0;
  const rectH = arch ? Math.max(0.2, h - r) : h;
  const frame = [
    box(mull, rectH, depth, -(w / 2 + mull / 2), 0, 0),
    box(mull, rectH, depth, w / 2 + mull / 2, 0, 0),
  ];
  const glass = [box(w, rectH - mull, 0.05, 0, mull, -0.02)];
  if (arch) {
    // 拱券做成半圆线脚环（TorusGeometry 的环就在 XY 面，arc=π 正好上半），
    // 整块填充的半圆会把窗读成一块灰板
    frame.push(place(new THREE.TorusGeometry(r + mull * 0.5, mull * 0.62, 4, 10, Math.PI), { y: rectH }));
    glass.push(place(archTop(r, 0.05), { y: rectH, z: 0.02 }));
  } else {
    frame.push(box(w + mull * 2, mull, depth, 0, rectH, 0));
  }
  if (style === 'lattice') {
    for (let i = 1; i < 4; i++) frame.push(box(0.06, rectH - mull, 0.1, -w / 2 + (w * i) / 4, mull, 0.04));
    frame.push(box(w, 0.07, 0.1, 0, mull + (rectH - mull) * 0.55, 0.04));
  } else if (style === 'sash') {
    frame.push(box(w, 0.07, 0.1, 0, mull + (rectH - mull) * 0.5, 0.04));
    frame.push(box(0.07, rectH - mull, 0.1, 0, mull, 0.04));
  }
  return { frame, glass };
}

/** 亮着的窗玻璃片（单独材质，滑块可以直接调它的 emissiveIntensity） */
export function windowLit({ w = 1.2, h = 1.8, arch = false, mull = 0.12 } = {}) {
  const r = arch ? w / 2 : 0;
  const rectH = arch ? Math.max(0.2, h - r) : h;
  const parts = [box(w - mull, rectH - mull * 1.6, 0.06, 0, mull * 1.4, 0.03)];
  if (arch) parts.push(place(archTop(r - mull * 0.5, 0.06), { y: rectH, z: 0.03 }));
  return parts;
}

const FACE = {
  '+z': { ry: 0, n: [0, 1], t: [1, 0] },
  '-z': { ry: Math.PI, n: [0, -1], t: [-1, 0] },
  '+x': { ry: Math.PI / 2, n: [1, 0], t: [0, -1] },
  '-x': { ry: -Math.PI / 2, n: [-1, 0], t: [0, 1] },
};

/**
 * 沿一面墙排窗。cx/cz 是该面墙的中心（墙外表面所在），length 是这面墙的展长。
 */
export function windowRun(B, {
  cx, cz, face = '+z', length, y0 = 0, floors = 1, floorH = 3.6, bays = 3,
  w = 1.2, h = 1.8, arch = false, style = 'plain', frameKey = 'stone',
  litKey = 'litWindow', litChance = 0.22, sill = 0.95, inset = 0.05, skip = [],
}) {
  const F = FACE[face];
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < bays; i++) {
      if (skip.includes(`${f}-${i}`)) continue;
      const t = (i + 0.5) / bays - 0.5;
      const gx = cx + F.t[0] * length * t + F.n[0] * inset;
      const gz = cz + F.t[1] * length * t + F.n[1] * inset;
      const y = y0 + f * floorH + sill;
      const pane = windowPane({ w, h, arch, style });
      B.add(frameKey, place(join(pane.frame), { x: gx, y, z: gz, ry: F.ry }));
      B.add('glass', place(join(pane.glass), { x: gx, y, z: gz, ry: F.ry }));
      if (rand() < litChance) {
        B.add(litKey, place(join(windowLit({ w, h, arch })), { x: gx + F.n[0] * 0.05, y, z: gz + F.n[1] * 0.05, ry: F.ry }));
      }
    }
  }
}

/** 门洞：门框 + 门扇，可带拱，拱心留一条亮缝 */
export function doorway(B, { cx, cz, face = '+z', w = 2.4, h = 3.4, arch = false, depth = 0.3, frameKey = 'stone', panelKey = 'timber', litAbove = false }) {
  const F = FACE[face];
  const parts = [
    box(0.3, h, depth, -w / 2 - 0.15, 0, 0),
    box(0.3, h, depth, w / 2 + 0.15, 0, 0),
  ];
  if (arch) parts.push(archTop(w / 2 + 0.15, depth), place(archTop(w / 2 + 0.15, depth), { y: h }));
  else parts.push(box(w + 0.6, 0.36, depth, 0, h, 0));
  B.add(frameKey, place(join(parts), { x: cx, y: 0, z: cz, ry: F.ry }));
  B.add(panelKey, place(join([
    box(w * 0.47, h * 0.92, 0.1, -w * 0.25, 0.02, -0.08),
    box(w * 0.47, h * 0.92, 0.1, w * 0.25, 0.02, -0.08),
  ]), { x: cx, y: 0, z: cz, ry: F.ry }));
  if (litAbove) {
    B.add('litCool', place(join([box(w * 0.86, 0.14, 0.05, 0, h * 0.94, 0.09)]), { x: cx, y: 0, z: cz, ry: F.ry }));
  }
}

/* ------------------------------------------------------------------ 柱廊 */

export function colonnade(B, { cx, cz, along = 'x', len, count = 4, h, r = 0.3, order = 'roman', key = 'plaster', y0 = 0 }) {
  const vec = along === 'x' ? [1, 0] : [0, 1];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const x = cx + vec[0] * len * t, z = cz + vec[1] * len * t;
    if (order === 'roman') {
      B.add(key, box(r * 2.6, 0.3, r * 2.6, x, y0, z));
      B.add(key, place(new THREE.CylinderGeometry(r * 0.9, r, h - 1.0, 14, 1), { x, y: y0 + 0.3, z }));
      B.add(key, box(r * 3, 0.4, r * 3, x, y0 + h - 0.7, z));
    } else {
      B.add(key, place(new THREE.CylinderGeometry(r * 0.92, r * 1.08, h, 12, 1), { x, y: y0 + 0.32, z }));
      B.add('stone', box(r * 2.4, 0.32, r * 2.4, x, y0, z));
    }
  }
  const bw = along === 'x' ? len + r * 2.4 : r * 2.6;
  const bd = along === 'x' ? r * 2.6 : len + r * 2.4;
  B.add(key, box(bw, 0.55, bd, cx, y0 + h - 0.15, cz));
}

/* ------------------------------------------------------------------ 栏杆 */

/** 石栏杆：望柱 + 上下枋 */
export function balustrade(B, { from, to, y = 0, h = 0.86, post = 0.17, gap = 1.4, key = 'stone' }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / gap));
  const ux = dx / len, uz = dz / len;
  const ry = Math.atan2(ux, uz);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    const x = from[0] + ux * t, z = from[1] + uz * t;
    B.add(key, box(post, h + 0.14, post, x, y, z));
    B.add(key, box(post * 1.6, 0.13, post * 1.6, x, y + h + 0.14, z));
  }
  for (const yy of [h * 0.88, h * 0.34]) {
    B.add(key, place(box(len, 0.11, 0.1), { x: (from[0] + to[0]) / 2, y: y + yy, z: (from[1] + to[1]) / 2, ry }));
  }
}

/** 墙顶铁栅：矮墙 + 竖铁条 + 矛头 */
export function ironFence(B, { from, to, wallH = 0.8, barH = 1.1, gap = 0.45, wallKey = 'stone', barKey = 'ironwork' }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const ry = Math.atan2(ux, uz);
  const mx = (from[0] + to[0]) / 2, mz = (from[1] + to[1]) / 2;
  B.add(wallKey, place(box(len, wallH, 0.45), { x: mx, y: 0, z: mz, ry }));
  B.add(wallKey, place(box(len, 0.12, 0.66), { x: mx, y: wallH, z: mz, ry }));
  const n = Math.floor(len / gap);
  for (let i = 0; i <= n; i++) {
    const t = i * gap;
    if (t > len - 0.1) break;
    const x = from[0] + ux * t, z = from[1] + uz * t;
    B.add(barKey, box(0.06, barH, 0.06, x, wallH + 0.16, z));
    B.add(barKey, poly([
      [[x - 0.07, wallH + barH + 0.16, z - 0.07], [x + 0.07, wallH + barH + 0.16, z - 0.07], [x, wallH + barH + 0.4, z]],
      [[x + 0.07, wallH + barH + 0.16, z + 0.07], [x - 0.07, wallH + barH + 0.16, z + 0.07], [x, wallH + barH + 0.4, z]],
      [[x - 0.07, wallH + barH + 0.16, z - 0.07], [x - 0.07, wallH + barH + 0.16, z + 0.07], [x, wallH + barH + 0.4, z]],
      [[x + 0.07, wallH + barH + 0.16, z + 0.07], [x + 0.07, wallH + barH + 0.16, z - 0.07], [x, wallH + barH + 0.4, z]],
    ]));
  }
  B.add(barKey, place(box(len, 0.07, 0.07), { x: mx, y: wallH + barH * 0.68, z: mz, ry }));
}

/** 台阶：从 face 外向内上到 y=top */
export function steps(B, { cx, cz, face = '+z', w, n = 3, rise = 0.16, tread = 0.34, top = 0, key = 'stone' }) {
  const F = FACE[face];
  for (let i = 0; i < n; i++) {
    const d = (n - i) * tread;
    B.add(key, place(box(w + i * 0.24, rise * (i + 1) + top, tread), {
      x: cx + F.n[0] * d, y: 0, z: cz + F.n[1] * d, ry: F.ry,
    }));
  }
}

/* ------------------------------------------------------------------ 植物 */

export function tree(B, { x, z, h = 9, kind = 'plane', y = 0 }) {
  const r = h * (kind === 'fir' ? 0.2 : 0.3);
  B.add('bark', place(new THREE.CylinderGeometry(h * 0.03, h * 0.055, h * 0.46, 7, 1), { x, y: y + h * 0.23, z }));
  if (kind === 'fir') {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      B.add('foliageDark', place(new THREE.ConeGeometry(r * (1 - t * 0.62), h * 0.36, 9, 1), { x, y: y + h * (0.36 + t * 0.48), z }));
    }
    return;
  }
  const blobs = kind === 'willow'
    ? [[0, 0.72, 0.34], [-0.22, 0.66, 0.3], [0.2, 0.68, 0.28], [0, 0.52, 0.42]]
    : [[0, 0.78, 0.34], [-0.3, 0.7, 0.28], [0.28, 0.72, 0.27], [0.05, 0.9, 0.24]];
  const key = kind === 'willow' ? 'foliage' : 'foliageDark';
  for (const [ox, oy, os] of blobs) {
    B.add(key, place(new THREE.SphereGeometry(r * os * 2.4, 8, 6),
      { x: x + ox * r, y: y + h * oy, z, sy: kind === 'willow' ? 1.5 : 0.78 }));
  }
  if (kind === 'willow') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      B.add('foliage', place(new THREE.CylinderGeometry(0.03, 0.06, h * 0.4, 4, 1),
        { x: x + Math.cos(a) * r * 0.85, y: y + h * 0.62, z: z + Math.sin(a) * r * 0.85 }));
    }
  }
}

/** 紫藤架：柱 + 格栅顶 + 架下老藤 */
export function pergola(B, { x, z, w, d, h = 3.1, baysX = 4, baysZ = 2 }) {
  for (let i = 0; i <= baysX; i++) {
    for (let j = 0; j <= baysZ; j++) {
      if (i !== 0 && i !== baysX && j !== 0 && j !== baysZ) continue;
      B.add('timber', box(0.22, h, 0.22, x - w / 2 + (w * i) / baysX, 0, z - d / 2 + (d * j) / baysZ));
    }
  }
  for (let i = 0; i <= baysX * 2; i++) {
    B.add('timber', box(0.1, 0.18, d, x - w / 2 + (w * i) / (baysX * 2), h, z));
  }
  for (let j = 0; j <= baysZ; j++) {
    B.add('timber', box(w, 0.22, 0.13, x, h + 0.18, z - d / 2 + (d * j) / baysZ));
  }
  for (let i = 0; i < 7; i++) {
    B.add('vine', place(new THREE.TorusGeometry(rr(0.3, 0.8), 0.1, 5, 9, rr(2, 5)),
      { x: x + rr(-w / 2 + 0.3, w / 2 - 0.3), y: h - rr(0.1, 0.45), z: z + rr(-d / 2, d / 2), ry: rr(0, 6), rx: rr(-0.5, 0.5) }));
  }
  for (let i = 0; i < 16; i++) {
    B.add('vine', place(new THREE.SphereGeometry(rr(0.25, 0.5), 6, 5),
      { x: x + rr(-w / 2, w / 2), y: h - rr(0.2, 0.9), z: z + rr(-d / 2, d / 2), sy: 0.6 }));
  }
}

/** 假山：块石错叠，收脚大收顶小 */
export function rockPile(B, { x, z, w, h, d, chunks = 26, key = 'rock' }) {
  for (let i = 0; i < chunks; i++) {
    const t = i / chunks;
    const r = rr(0.5, 1.15) * (1 - t * 0.5);
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(r * w * 0.22, r * h * 0.32, r * d * 0.22);
    g.rotateY(rr(0, 6.28));
    g.rotateZ(rr(-0.22, 0.22));
    B.add(key, place(g, {
      x: x + rr(-w / 2, w / 2) * (1 - t * 0.55),
      y: t * h + rr(-0.15, 0.35),
      z: z + rr(-d / 2, d / 2) * (1 - t * 0.55),
    }));
  }
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(w * 0.1, h * 0.44, d * 0.1);
  B.add(key, place(g, { x: x + rr(-w * 0.15, w * 0.15), y: h * 0.86, z: z + rr(-d * 0.15, d * 0.15), ry: rr(0, 3) }));
}

/** 独立湖石（美人石一路）：瘦石竖立在石座 */
export function scholarStone(B, { x, z, h = 3.2 }) {
  B.add('stone', box(1.5, 0.32, 1.5, x, 0, z));
  for (let i = 0; i < 5; i++) {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(h * rr(0.14, 0.2), h * 0.27, h * rr(0.1, 0.16));
    g.rotateZ(rr(-0.3, 0.3)); g.rotateY(rr(0, 3));
    B.add('rock', place(g, { x: x + rr(-0.25, 0.25), y: 0.32 + i * h * 0.2, z: z + rr(-0.2, 0.2) }));
  }
}

/* ------------------------------------------------------------------ 灯具 */

export function lampPost(B, { x, z, h = 5.4, arms = 2, y = 0 }) {
  B.add('ironwork', place(new THREE.CylinderGeometry(0.1, 0.18, h, 8, 1), { x, y: y + h / 2, z }));
  B.add('ironwork', box(0.44, 0.2, 0.44, x, y + h - 0.1, z));
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + 0.4;
    const lx = x + Math.cos(a) * 0.9, lz = z + Math.sin(a) * 0.9;
    B.add('ironwork', box(Math.abs(Math.cos(a)) * 1.8 + 0.2, 0.1, Math.abs(Math.sin(a)) * 1.8 + 0.2, (x + lx) / 2, y + h - 0.02, (z + lz) / 2));
    B.add('ironwork', box(0.36, 0.14, 0.36, lx, y + h - 0.16, lz));
    B.add(glowKey('#ffd9a6', 2.3), place(new THREE.SphereGeometry(0.2, 8, 6), { x: lx, y: y + h - 0.34, z: lz, sy: 0.72 }));
  }
}

export function gardenLamp(B, { x, z, h = 0.9 }) {
  B.add('stoneDark', box(0.32, h, 0.32, x, 0, z));
  B.add('stoneDark', box(0.44, 0.1, 0.44, x, h, z));
  B.add(glowKey('#ffcf94', 2.0), place(new THREE.SphereGeometry(0.17, 8, 6), { x, y: h + 0.16, z, sy: 0.86 }));
}

/** 灯笼：一只暖头 + 上下盖，返回中心高度给光柱用 */
export function lantern(B, { x, y, z, r = 0.26, color = '#ffb46a', squash = 1.2 }) {
  B.add('ironwork', box(0.05, 0.55, 0.05, x, y + 0.3, z));
  B.add(glowKey(color, 1.8), place(new THREE.SphereGeometry(r, 9, 7), { x, y, z, sy: squash }));
  B.add('ironwork', box(r * 1.15, 0.07, r * 1.15, x, y + r * squash, z));
  B.add('ironwork', box(r * 1.15, 0.07, r * 1.15, x, y - r * squash, z));
}

/** 残荷：十月荷池里立着的枯茎与翻卷的叶 */
export function lotusRemnant(B, { x, z, y = 0.12 }) {
  const n = 3 + ((rand() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const ox = x + rr(-1.4, 1.4), oz = z + rr(-1.4, 1.4);
    const hh = rr(0.35, 1.05);
    B.add('vine', place(new THREE.CylinderGeometry(0.025, 0.035, hh, 5, 1), { x: ox, y: y + hh / 2, z: oz }));
    if (rand() > 0.45) {
      B.add('vine', place(new THREE.CircleGeometry(rr(0.24, 0.44), 7),
        { x: ox + rr(-0.2, 0.2), y: y + hh, z: oz + rr(-0.2, 0.2), ry: rr(0, 6.28), rx: -Math.PI / 2 + rr(-0.5, 0.5) }));
    } else {
      B.add('vine', place(new THREE.SphereGeometry(0.1, 6, 5), { x: ox, y: y + hh + 0.05, z: oz, sy: 1.3 }));
    }
  }
}
