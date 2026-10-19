import * as THREE from 'three';
import {
  M, mesh, lit,  rr, cyl, meterBox, loft, roundedSection,
  pathFrames, blobGeometry, clamp01, quadGrid, mergeAll } from './kit.js';
import * as T from './textures.js';
import { GARDEN, BANK } from './data.js';
import { polyToShape, offsetPoly } from './land.js';
import { buildPond } from './water.js';
import { gabledRoof, pavilionRoof, wallCap } from './roofs.js';
import { lampBatch, plaque } from './lamps.js';

/**
 * 退思园。
 *
 * 可核的是：光绪十一年至十三年（1885—1887）任兰生归乡所筑、袁龙设计、
 * 名取《左传》"退思补过"、9.9 亩、东西长 112 米南北宽 83 米、格局不作常规
 * 南北纵深而是东西横列（西半为园、东半为宅）、2000 年随苏州古典园林列入世界文化遗产。
 * 各栋的名字（退思草堂、眠云亭、辛台、石舫）取自旧记与《园话》，
 * 而栋与栋的相对位置、面阔进深、屋顶做法都是按苏州游园的通例补配的写意。
 *
 * 画法上只守一条：建筑要贴着水。池在园心，草堂只隔一级台基就看见池面，
 * 石舫干脆半坐在水里，廊沿着北岸走一段就折到辛台脚下。夜里这一园的灯
 * 全落在那一小片黑水上，倒影比建筑更要紧。
 */

const POND_Y = BANK - 0.16;

const PLASTER = lit('#c6cfc9', { map: T.plaster({ meters: 2.4, base: '#cdd4cf' }), rough: 0.94, side: THREE.DoubleSide });
const WOOD = lit('#4b3a2e', { rough: 0.74, metal: 0.03, emissive: '#20140a', ei: 0.22 });
const WOOD_DARK = lit('#2a2118', { rough: 0.8, emissive: '#0e0904', ei: 0.26 });
const STONE = lit('#7f8790', { map: T.paving({ meters: 1.3, base: '#767e86' }), rough: 0.9, side: THREE.DoubleSide });
const ROCK = lit('#8d8274', { map: T.huangshi({ meters: 1.8 }), rough: 0.94, side: THREE.DoubleSide });
const TILE = lit('#41505f', { map: T.tiles({ meters: 1.0, base: '#35424f' }), rough: 0.7, metal: 0.06, side: THREE.DoubleSide, emissive: '#1b2836', ei: 0.34 });
const LATTICE_LIT = lit('#ffe6bd', { rough: 0.9, emissive: '#ffbe86', ei: 0.6, side: THREE.DoubleSide });

const MATS = { wall: PLASTER, wood: WOOD, tile: TILE, stone: STONE, lit: LATTICE_LIT, dark: WOOD_DARK };

/* ------------------------------------------------------------------ 小件 */

/** 亮窗：axis 决定贴在哪一面墙上，(a,b) 是该面上的平面坐标 */
function win(w, h, axis, a, b, y) {
  const g = new THREE.PlaneGeometry(w, h);
  if (axis === 'front') { g.rotateY(Math.PI); g.translate(a, y, b); }
  else if (axis === 'back') g.translate(a, y, b);
  else if (axis === 'right') { g.rotateY(Math.PI / 2); g.translate(b, y, a); }
  else { g.rotateY(-Math.PI / 2); g.translate(b, y, a); }
  return g;
}

/** 苏南观音兜山尖：跟举架走，脊上再兜起一个圆头 */
function endGable(depth, rise, eaveY, { head = 0.7, thick = 0.34, pitch = 0.82 } = { }) {
  const hd = depth / 2, n = 18;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const z = -hd + (depth * i) / n;
    const t = Math.abs(z) / hd;
    const top = eaveY + rise * Math.max(0.05, 1 - t * pitch) + head * Math.exp(-Math.pow(t * 2.1, 2.6));
    pos.push(-thick / 2, 0, z, thick / 2, 0, z, -thick / 2, top, z, thick / 2, top, z);
    uv.push(0, 0, thick, 0, 0, top, thick, top);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 4, b = (i + 1) * 4;
    idx.push(a + 2, a + 3, b + 2, b + 2, a + 3, b + 3, a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 按材质分组合并成一栋，落位与朝向由调用方给 */
function finish(parts, { id, x, z, rot = 0, y = BANK }) {
  const grp = new THREE.Group();
  grp.name = id;
  for (const key of Object.keys(parts)) {
    if (!parts[key] || !parts[key].length) continue;
    const m = mesh(mergeAll(parts[key]), MATS[key] || PLASTER);
    m.name = `${id}-${key}`;
    m.receiveShadow = true;
    grp.add(m);
  }
  grp.position.set(x, y, z);
  grp.rotation.y = rot;
  return grp;
}

/* ------------------------------------------------------------------ 一栋厅堂 */

function hallOf(o) {
  const { w, d, h = 4.3, bays = 4 } = o;
  const parts = { wall: [], wood: [], tile: [], stone: [], lit: [], dark: [] };
  const ridge = [];

  parts.stone.push(meterBox(w + 2.6, 0.55, d + 3.4, 0, 0, -1.0));
  parts.stone.push(meterBox(w + 2.6, 0.26, 2.2, 0, 0.55, -d / 2 - 2.8));
  for (let k = 0; k < 2; k++) {
    parts.stone.push(meterBox(3.4, 0.26, 0.62, 0, 0.3 - k * 0.28, -d / 2 - 3.6 - k * 0.62));
  }
  // 后墙与两山，前檐敞成一排廊
  parts.wall.push(meterBox(w, h, 0.34, 0, 0.55, d / 2 - 0.17));
  for (const sx of [-1, 1]) parts.wall.push(meterBox(0.34, h, d, sx * (w / 2 - 0.17), 0.55, 0));
  const cols = bays + 1;
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (w * i) / (cols - 1);
    parts.wood.push(cyl(0.17, 0.14, h, 9, x, 0.55, -d / 2 - 1.7));
    parts.wood.push(cyl(0.16, 0.14, h - 0.5, 9, x, 0.55, -d / 2 + 0.3));
  }
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + w * (i + 0.5) / bays;
    const bay = w / bays;
    if (o.openMiddle && i === ((bays / 2) | 0) - 1) continue;
    parts.wall.push(meterBox(bay - 0.5, 0.95, 0.16, x, 0.55, -d / 2 + 0.1));
    parts.lit.push(win(bay - 1.1, h - 2.2, 'front', x, -d / 2 + 0.14, 0.55 + 0.95 + (h - 2.2) / 2));
    parts.dark.push(meterBox(bay - 0.9, 0.14, 0.12, x, 0.55 + h - 1.32, -d / 2 + 0.06));
  }
  for (const sx of [-1, 1]) {
    parts.lit.push(win(1.1, 1.35, sx > 0 ? 'right' : 'left', 0, sx * (w / 2 + 0.02), 2.6));
  }

  const roof = gabledRoof({
    span: w + 1.9, depth: d + 3.8, rise: o.rise ?? 2.0, eaveY: 0.55 + h,
    lift: 0.44, cornerOut: 0.85, nu: 20, nv: 8 });
  parts.tile.push(roof.surface);
  if (roof.ridge) ridge.push(roof.ridge);
  for (const sx of [-1, 1]) {
    const g = endGable(d + 3.7, o.rise ?? 2.0, 0.55 + h);
    g.rotateY(Math.PI / 2);
    g.translate(sx * (w / 2 + 0.66), 0, 0);
    parts.wall.push(g);
  }

  const grp = finish(parts, o);
  if (ridge.length) grp.add(mesh(mergeAll(ridge), STONE));
  if (o.plaqueText) {
    const p = plaque(o.plaqueText, 2.3, 0.68, { board: '#2c2318', glowTint: '#ffcf9a', ei: 0.45 });
    p.position.set(0, 0.55 + h - 0.9, -d / 2 - 1.85);
    grp.add(p);
  }
  return grp;
}

/* ------------------------------------------------------------------ 亭 · 台 · 舫 */

function pavilionOf(o) {
  const half = o.half ?? 2.3, h = 3.1;
  const parts = { wood: [], tile: [], stone: [], lit: [] };
  parts.stone.push(meterBox(half * 2 + 1.8, 0.42, half * 2 + 1.8, 0, 0, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.wood.push(cyl(0.13, 0.11, h, 8, sx * half, 0.42, sz * half));
  }
  for (const sz of [-1, 1]) parts.wood.push(meterBox(half * 2, 0.46, 0.12, 0, 0.84, sz * half));
  for (const sx of [-1, 1]) parts.wood.push(meterBox(0.12, 0.46, half * 2, sx * half, 0.84, 0));
  const roof = pavilionRoof({ half: half + 1.2, rise: 1.9, eaveY: 0.42 + h, lift: 1.0, cornerOut: 0.85, sides: 4, perSide: 6, nv: 8 });
  parts.tile.push(roof.surface);
  const finial = new THREE.CylinderGeometry(0.08, 0.14, 0.75, 6);
  finial.translate(0, 0.42 + h + 1.9 + 0.32, 0);
  parts.stone.push(finial);
  const grp = finish(parts, { ...o, y: BANK + (o.yOff ?? 0) });
  if (o.plaqueText) {
    const p = plaque(o.plaqueText, 1.3, 0.44, { board: '#2c2318', glowTint: '#ffcf9a', ei: 0.42 });
    p.position.set(0, 0.42 + h - 0.62, -(half + 0.2));
    grp.add(p);
  }
  return grp;
}

/** 辛台：一台之上再一层，下层的平座出一圈栏杆 */
function towerOf(o) {
  const w = o.w ?? 5.4, d = o.d ?? 4.6, h1 = 3.4, h2 = 2.8;
  const parts = { wall: [], wood: [], tile: [], stone: [], lit: [], dark: [] };
  const ridge = [];
  parts.stone.push(meterBox(w + 1.8, 0.45, d + 1.8, 0, 0, 0));
  parts.wall.push(meterBox(w, h1, d, 0, 0.45, 0));
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + w * (i + 0.5) / 3;
    parts.lit.push(win(w / 3 - 1.1, 1.5, 'front', x, -d / 2 - 0.03, 0.45 + h1 * 0.56));
    parts.dark.push(meterBox(w / 3 - 0.7, 0.14, 0.12, x, 0.45 + h1 * 0.3, -d / 2 - 0.08));
  }
  // 平座：一圈石板 + 每 0.9 米一根望柱
  const py = 0.45 + h1;
  parts.stone.push(meterBox(w + 1.3, 0.22, d + 1.3, 0, py, 0));
  const pn = Math.max(4, Math.round((w + 1.3) / 0.9));
  for (let i = 0; i <= pn; i++) {
    const x = -(w + 1.3) / 2 + (w + 1.3) * (i / pn);
    for (const sz of [-1, 1]) parts.wood.push(meterBox(0.11, 0.8, 0.11, x, py + 0.22, sz * (d / 2 + 0.65)));
  }
  const qn = Math.max(3, Math.round((d + 1.3) / 0.9));
  for (let i = 1; i < qn; i++) {
    const z = -(d + 1.3) / 2 + (d + 1.3) * (i / qn);
    for (const sx of [-1, 1]) parts.wood.push(meterBox(0.11, 0.8, 0.11, sx * (w / 2 + 0.65), py + 0.22, z));
  }
  parts.wall.push(meterBox(w - 1.3, h2, d - 1.3, 0, py + 0.22, 0));
  for (let i = 0; i < 2; i++) {
    const x = -w / 2 + w * (i + 0.5) / 2;
    parts.lit.push(win(1.15, 1.25, 'front', x, -(d - 1.3) / 2 - 0.03, py + 0.22 + h2 * 0.55));
  }
  const roof = gabledRoof({ span: w - 0.3, depth: d + 0.9, rise: 1.55, eaveY: py + 0.22 + h2, lift: 0.5, cornerOut: 0.7, nu: 16, nv: 6 });
  parts.tile.push(roof.surface);
  if (roof.ridge) ridge.push(roof.ridge);
  for (const sx of [-1, 1]) {
    const g = endGable(d + 0.8, 1.55, py + 0.22 + h2, { head: 0.55 });
    g.rotateY(Math.PI / 2);
    g.translate(sx * (w / 2 - 0.6), 0, 0);
    parts.wall.push(g);
  }
  const grp = finish(parts, o);
  if (ridge.length) grp.add(mesh(mergeAll(ridge), STONE));
  if (o.plaqueText) {
    const p = plaque(o.plaqueText, 1.4, 0.46, { board: '#2c2318', glowTint: '#ffcf9a', ei: 0.44 });
    p.position.set(0, py - 0.62, -d / 2 - 0.06);
    grp.add(p);
  }
  return grp;
}

/** 石舫：一段头尖尾方的石台坐在水里，台上一间小舱 */
function boatOf(o) {
  const len = o.len ?? 7.6, wid = o.wid ?? 2.6;
  const sec = roundedSection(0.3, 3);
  const hull = loft([
    { y: -0.55, cx: 0, cz: 0, sx: len * 0.4, sz: wid * 0.34 },
    { y: 0.1, cx: 0, cz: 0, sx: len * 0.5, sz: wid * 0.5 },
    { y: 0.55, cx: len * 0.05, cz: 0, sx: len * 0.44, sz: wid * 0.42 },
    { y: 0.74, cx: len * 0.1, cz: 0, sx: len * 0.3, sz: wid * 0.3 },
  ], (t) => {
    const k = clamp01(t);
    return sec.map(([px, pz]) => [px * (1 - 0.4 * k * k), pz]);
  }, { uvScale: 1.6 });

  const stone = [hull];
  const wood = [], tile = [], lit_ = [];
  stone.push(meterBox(len * 0.42, 2.25, wid * 0.62, -len * 0.04, 0.74, 0));
  wood.push(meterBox(len * 0.48, 0.2, wid * 0.72, -len * 0.04, 2.99, 0));
  const roof = gabledRoof({ span: len * 0.52, depth: wid * 0.98, rise: 1.0, eaveY: 3.19, lift: 0.32, cornerOut: 0.5, nu: 14, nv: 5 });
  tile.push(roof.surface);
  for (let i = 0; i < 2; i++) {
    const x = -len * 0.04 + (i ? 1 : -1) * len * 0.12;
    lit_.push(win(1.0, 1.25, 'front', x, -wid * 0.31 - 0.03, 1.9));
  }
  const grp = finish({ stone, wood, tile, lit: lit_ }, { ...o, y: POND_Y - 0.05 });
  if (roof.ridge) grp.add(mesh(roof.ridge, STONE));
  return grp;
}

/** 贴水短廊：一顶、两排柱、一条石板地栿 */
function corridorOf(points, { h = 2.7, width = 1.9, name = 'corridor' } = { }) {
  const f = pathFrames(points.map((p) => [p[0], 0, p[1]]), { steps: 8 });
  const wood = [], stone = [], tile = [];
  for (let i = 0; i < f.pts.length; i += 4) {
    const p = f.pts[i], r = f.right[i];
    for (const s of [-1, 1]) {
      wood.push(cyl(0.11, 0.09, h, 7, p.x + r.x * s * (width / 2 - 0.14), BANK, p.z + r.z * s * (width / 2 - 0.14)));
    }
  }
  stone.push(quadGrid((u, v) => {
    const i = Math.min(f.pts.length - 1, Math.round(u * (f.pts.length - 1)));
    const p = f.pts[i], r = f.right[i];
    const t = (v - 0.5) * width;
    return [p.x + r.x * t, BANK + 0.16, p.z + r.z * t];
  }, Math.max(14, f.pts.length), 2, { spanU: f.length, spanV: width }));
  const capF = { pts: f.pts.map((p) => new THREE.Vector3(p.x, BANK + h * 0.86, p.z)), right: f.right, dist: f.dist, length: f.length };
  tile.push(wallCap(capF, { width: width + 1.2, rise: 0.52, eaveDrop: 0.26 }));
  const grp = new THREE.Group();
  grp.name = name;
  grp.add(mesh(mergeAll(wood), WOOD));
  grp.add(mesh(mergeAll(stone), STONE));
  grp.add(mesh(mergeAll(tile), TILE));
  return grp;
}

/** 池上的一块石板梁桥 */
function slabBridge(from, to, { width = 1.15 } = { }) {
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const rot = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  const cx = (from[0] + to[0]) / 2, cz = (from[1] + to[1]) / 2;
  const deck = meterBox(L, 0.2, width, 0, 0, 0);
  deck.rotateY(rot);
  deck.translate(cx, POND_Y + 0.46, cz);
  const pier = meterBox(0.66, 0.85, width + 0.26, 0, POND_Y - 0.45, 0);
  pier.rotateY(rot);
  pier.translate(cx, 0, cz);
  return [deck, pier];
}

/* 宅第与洲上要复用这几件，见 compounds.js 与 islet.js */
export { hallOf, pavilionOf, towerOf, corridorOf, endGable, win };

/* ------------------------------------------------------------------ 园墙与门 */

function wallRun(from, to, h, wallParts, capParts) {
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const rot = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  const g = meterBox(L, h, 0.46, 0, 0, 0);
  g.rotateY(rot);
  g.translate((from[0] + to[0]) / 2, BANK, (from[1] + to[1]) / 2);
  wallParts.push(g);
  const f = pathFrames([[from[0], 0, from[1]], [to[0], 0, to[1]]], { steps: 6 });
  const capF = { pts: f.pts.map((p) => new THREE.Vector3(p.x, BANK + h, p.z)), right: f.right, dist: f.dist, length: f.length };
  capParts.push(wallCap(capF, { width: 1.2, rise: 0.46, eaveDrop: 0.2 }));
}

/* ------------------------------------------------------------------ 主入口 */

export function buildGarden(scene) {
  const group = new THREE.Group();
  group.name = 'tuisi-garden';
  const P = GARDEN.plot;
  const gateZ = GARDEN.gate.z, gateHalf = 1.35;

  /* ---- 园墙四面，东墙留门 */
  const walls = [], caps = [];
  wallRun([P.x0, P.z0], [P.x1, P.z0], GARDEN.wallH, walls, caps);
  wallRun([P.x1, P.z0], [P.x1, gateZ - gateHalf], GARDEN.wallH, walls, caps);
  wallRun([P.x1, gateZ + gateHalf], [P.x1, P.z1], GARDEN.wallH, walls, caps);
  wallRun([P.x1, P.z1], [P.x0, P.z1], GARDEN.wallH, walls, caps);
  wallRun([P.x0, P.z1], [P.x0, P.z0], GARDEN.wallH, walls, caps);
  // 西墙上开两只漏窗：墙外是邻宅，窗里透出的光是园子给隔壁看的
  group.add(mesh(mergeAll(walls), PLASTER));
  group.add(mesh(mergeAll(caps), TILE));

  /* ---- 园门：门框石、门楼与门额"退思" */
  const gateParts = [];
  for (const sz of [-1, 1]) gateParts.push(meterBox(0.62, 2.9, 0.52, P.x1, BANK, gateZ + sz * (gateHalf + 0.3)));
  gateParts.push(meterBox(0.74, 0.4, gateHalf * 2 + 1.3, P.x1, BANK + 2.9, gateZ));
  const gateRoof = gabledRoof({
    span: gateHalf * 2 + 2.2, depth: 1.6, rise: 0.75, eaveY: BANK + 3.3,
    lift: 0.3, cornerOut: 0.45, nu: 14, nv: 4 });
  gateParts.push(gateRoof.surface);
  const gate = new THREE.Group();
  gate.name = 'garden-gate';
  gate.add(mesh(mergeAll(gateParts), STONE));
  gate.add(mesh(gateRoof.surface, TILE));
  if (gateRoof.ridge) gate.add(mesh(gateRoof.ridge, STONE));
  const sign = plaque('退思', 1.2, 0.52, { board: '#3a3026', glowTint: '#ffd3a0', ei: 0.62 });
  sign.position.set(P.x1 + 0.42, BANK + 2.62, gateZ);
  sign.rotation.y = Math.PI / 2;
  gate.add(sign);
  group.add(gate);

  /* ---- 池：水面、池底、石驳与压顶 */
  const pondPoly = GARDEN.pondPoly;
  const pond = buildPond(scene, pondPoly, POND_Y);
  const bed = new THREE.Mesh(new THREE.ShapeGeometry(polyToShape(pondPoly), 6).rotateX(-Math.PI / 2), M.dark);
  bed.position.y = POND_Y - 1.6;
  bed.name = 'pond-bed';
  group.add(bed);

  const outer = offsetPoly(pondPoly, -0.1);
  const inner = offsetPoly(pondPoly, 1.15);
  const rim = new THREE.BufferGeometry();
  {
    const n = Math.min(outer.length, inner.length);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < n; i++) {
      pos.push(outer[i][0], POND_Y + 0.24, outer[i][1], inner[i][0], POND_Y + 0.16, inner[i][1]);
      uv.push(outer[i][0] / 1.2, outer[i][1] / 1.2, inner[i][0] / 1.2, inner[i][1] / 1.2);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
    }
    rim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rim.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rim.setIndex(idx);
    rim.computeVertexNormals();
  }
  group.add(mesh(rim, STONE));

  /* ---- 叠石与石峰 */
  const rocks = [];
  for (const [rx, rz] of GARDEN.rocks) {
    for (let k = 0; k < 4; k++) {
      const r = rr(0.6, 1.5);
      const g = blobGeometry(r, { detail: 1, amp: 0.44, squash: 0.8, seed: (rx * 3 + rz + k * 7) | 0 });
      g.translate(rx + rr(-1.4, 1.4), BANK + r * 0.28, rz + rr(-1.4, 1.4));
      rocks.push(g);
    }
  }
  const peak = blobGeometry(1.9, { detail: 2, amp: 0.42, squash: 1.8, seed: 21 });
  peak.translate(GARDEN.pond.cx - 9.5, BANK + 2.4, GARDEN.pond.cz - GARDEN.pond.rz - 2.4);
  rocks.push(peak);
  group.add(mesh(mergeAll(rocks), ROCK));

  /* ---- 五栋：草堂、眠云亭、辛台、石舫、一段贴水廊 */
  const H = GARDEN.hall;
  group.add(hallOf({
    id: 'caotang', x: H.x, z: H.z, rot: Math.PI, w: 12.4, d: 7.2, h: 4.35,
    bays: 4, rise: 2.05, openMiddle: true, plaqueText: '退思草堂' }));
  group.add(pavilionOf({ id: 'minting', ...GARDEN.pavilion, half: 2.35, yOff: 1.2, plaqueText: '眠云亭' }));
  group.add(towerOf({ id: 'xintai', ...GARDEN.tower, w: 5.4, d: 4.6, plaqueText: '辛台' }));
  group.add(boatOf({ ...GARDEN.boat, len: 7.6, wid: 2.6 }));
  group.add(corridorOf([
    [H.x + 6.8, H.z - 2.6], [H.x + 10.8, H.z - 5.4], [GARDEN.tower.x - 3.6, GARDEN.tower.z + 1.4],
  ], { name: 'garden-corridor' }));
  group.add(mesh(mergeAll([
    ...slabBridge([GARDEN.pond.cx - 2, GARDEN.pond.cz - GARDEN.pond.rz + 1.2], [GARDEN.pond.cx - 6, GARDEN.pond.cz - 3]),
    ...slabBridge([GARDEN.boat.x + 1.6, GARDEN.boat.z + 0.6], [GARDEN.pond.cx - 9, GARDEN.pond.cz + 3.5], { width: 1.05 }),
  ]), STONE));

  /* ---- 灯：檐下两对、门洞两只、亭中一只、台上与舫上各一 */
  const spots = [
    [H.x - 4.4, BANK + 3.6, H.z - 5.6, 0.28],
    [H.x + 4.4, BANK + 3.6, H.z - 5.6, 0.28],
    [P.x1 + 0.9, BANK + 2.5, gateZ - 2.0, 0.24],
    [P.x1 + 0.9, BANK + 2.5, gateZ + 2.0, 0.24],
    [GARDEN.pavilion.x, BANK + 1.2 + 2.4, GARDEN.pavilion.z, 0.26],
    [GARDEN.tower.x - 3.4, BANK + 2.8, GARDEN.tower.z + 2.8, 0.23],
    [GARDEN.boat.x, BANK + 3.0, GARDEN.boat.z + 1.4, 0.22],
  ];
  const { shells, halos } = lampBatch(spots, { tint: '#ffc98f', bright: 1.2 });
  halos.name = 'garden-halos';
  group.add(shells);
  group.add(halos);

  scene.add(group);

  return {
    group, pond, pondY: POND_Y, pondPoly,
    /** 真实灯光只给三盏：池上、门洞、草堂前廊 */
    realLights: [
      { x: GARDEN.pond.cx, y: BANK + 3.1, z: GARDEN.pond.cz, i: 330, d: 30, c: '#ffcaa0' },
      { x: P.x1 + 0.5, y: BANK + 2.4, z: gateZ, i: 210, d: 16, c: '#ffd0a2' },
      { x: H.x, y: BANK + 2.4, z: H.z - 1.8, i: 180, d: 15, c: '#ffe0b4' },
    ],
    /** 园池上的光柱落位：水面比镇河高，落位要跟着 pondY */
    waterLamps: spots.map(([x, , z]) => [x, z]) };
}
