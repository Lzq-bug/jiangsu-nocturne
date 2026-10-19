import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, mesh, pathFrames, glow, inscribed, rand, quadGrid,
} from './kit.js';
import { gabledRoof, pavilionRoof, wallCap, ridgeTube, slopeEndWall } from './roofs.js';
import { GARDEN, GROUND, BUILDINGS } from './data.js';
import * as T from './textures.js';

/**
 * Every built element of the garden, assembled from 木 / 石 / 瓦 / 粉墙 pieces and
 * baked into one merged mesh per material. Things that must light or animate on
 * their own — 漏窗 sheets, 匾联 boards, eave points where lanterns hang — are
 * handed back through ANCHORS instead of being merged.
 */

const C = {
  plaster: [], roof: [], ridge: [], timber: [], dark: [], stone: [], gold: [], floor: [], stele: [],
};
const add = (key, ...geos) => { for (const g of geos) if (g) C[key].push(g); };

export const ANCHORS = { eaves: [], steps: [], rails: [] };
export const latticeSheets = [];
export const plaques = [];
export const interiorLights = [];

const HALF_PI = Math.PI / 2;
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** rotate about Y, then move into world space; y is the centre of the piece */
function put(g, x, y, z, rot = 0) {
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}
/** local (x across the front, z toward the front) → world */
function at(x, z, rot, lx, lz) {
  return [x + Math.cos(rot) * lx + Math.sin(rot) * lz, z - Math.sin(rot) * lx + Math.cos(rot) * lz];
}
/** local x → the direction (dx, dz); three's Y rotation sends (1,0,0) to (cosθ, -sinθ) */
const rotFor = (dx, dz) => Math.atan2(-dz, dx);

/* ------------------------------------------------------------------ 构件 */

/** 台基: the stone plinth, with three shallow 踏道 in front */
function plinth({ x, z, rot, w, d, h = 0.55, steps = true }) {
  add('stone', put(bx(w, h, d), x, GROUND + h / 2, z, rot));
  add('stone', put(bx(w + 0.34, 0.16, d + 0.34), x, GROUND + h - 0.02, z, rot));
  if (!steps) return;
  for (let k = 0; k < 3; k++) {
    const [sx, sz] = at(x, z, rot, 0, d / 2 + 0.5 + k * 0.44);
    add('stone', put(bx(w * 0.46, 0.18, 0.5), sx, GROUND + h - (k + 1) * 0.18 + 0.09, sz, rot));
  }
}

/** 柱网: a grid of columns, each on a 柱础 */
function colonnade({ x, z, rot, xs, zs, baseY = GROUND, h, r = 0.24, stone = false }) {
  for (const lx of xs) {
    for (const lz of zs) {
      const [px, pz] = at(x, z, rot, lx, lz);
      add(stone ? 'stone' : 'timber', put(new THREE.CylinderGeometry(r * 0.9, r, h, 9), px, baseY + h / 2, pz));
      if (!stone) add('stone', put(bx(r * 2.5, 0.16, r * 2.5), px, baseY + 0.08, pz, rot));
    }
  }
}

/** 额枋 与 檐檩: the horizontal members tying the column heads together */
function entablature({ x, z, rot, w, d, y }) {
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * d / 2);
    add('timber', put(bx(w + 0.3, 0.32, 0.22), px, y - 0.2, pz, rot));
    const [qx, qz] = at(x, z, rot, 0, sz * (d / 2 + 0.36));
    add('dark', put(bx(w + 1.1, 0.18, 0.18), qx, y + 0.04, qz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * w / 2, 0);
    add('timber', put(bx(0.22, 0.32, d), px, y - 0.2, pz, rot));
  }
}

/** 挂落: the open valance under the eave, read as a dark band with a toothed edge */
function valance({ x, z, rot, w, d, y }) {
  for (const sz of [-1, 1]) {
    const [fx, fz] = at(x, z, rot, 0, sz * (d / 2 + 0.1));
    add('dark', put(bx(w, 0.42, 0.07), fx, y - 0.6, fz, rot));
    const n = Math.max(3, Math.round(w / 0.62));
    for (let i = 0; i <= n; i++) {
      const [px, pz] = at(fx, fz, rot, -w / 2 + (i * w) / n, 0);
      add('dark', put(bx(0.09, i % 2 ? 0.24 : 0.4, 0.07), px, y - 0.9, pz, rot));
    }
  }
}

/** 座栏: the railed bench of a 廊 or a pavilion, running along local x */
function bench({ x, z, rot, w, h = 0.9, post = 1.05 }) {
  add('timber', put(bx(w, 0.1, 0.4), x, GROUND + 0.44, z, rot));
  add('timber', put(bx(w, 0.09, 0.09), x, GROUND + h, z, rot));
  const n = Math.max(2, Math.round(w / post));
  for (let i = 0; i <= n; i++) {
    const [px, pz] = at(x, z, rot, -w / 2 + (i * w) / n, 0);
    add('timber', put(bx(0.09, h - 0.42, 0.09), px, GROUND + 0.44 + (h - 0.42) / 2, pz, rot));
  }
}

/**
 * 屋顶 over a rectangular frame. Returns the two front eave points, which is
 * where 檐下灯笼 hang.
 */
function roof({ x, z, rot, span, depth, rise, eaveY, lift = 0.55, cornerOut = 0.8 }) {
  const r = gabledRoof({ span, depth, rise, eaveY, lift, cornerOut });
  add('roof', put(r.surface, x, 0, z, rot));
  add('ridge', put(r.ridge, x, 0, z, rot));
  // 望板: what you actually see of the roof from the ground is its dark underside
  add('dark', put(bx(span + 1.6, 0.14, depth + 1.2), x, eaveY - 0.32, z, rot));
  const hd = depth / 2, hs = span / 2;
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (hs - 0.6), hd - 0.2);
    ANCHORS.eaves.push({ x: px, y: eaveY + lift * 0.5, z: pz });
  }
  return { eaveY };
}

/* ------------------------------------------------------------------ 漏窗 / 匾额 */

const barMats = [];
function latticeBarMat(kind) {
  if (!barMats[kind]) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a3129'), alphaMap: T.lattice(kind), transparent: true,
      alphaTest: 0.4, roughness: 0.82, metalness: 0.03, side: THREE.DoubleSide,
      emissive: new THREE.Color('#0b0e12'), emissiveIntensity: 0.6,
    });
    barMats[kind] = m;
  }
  return barMats[kind];
}

/**
 * A 漏窗: stone sill and lintel, a warm sheet behind, the pattern as bars in
 * front. The sheet is what the 漏窗透光 slider drives.
 */
function latticeWindow({ x, y, z, rot, w, h, kind }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.latticeLight.clone());
  // the lamp sheet has to read from both walks of the 复廊
  sheet.material.side = THREE.DoubleSide;
  sheet.position.z = 0;
  const bars = new THREE.Mesh(new THREE.PlaneGeometry(w, h), latticeBarMat(kind));
  bars.position.z = 0.11;
  // and the pattern has to stand in front of that light on both sides
  const barsBack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), latticeBarMat(kind));
  barsBack.position.z = -0.11;
  const sill = mesh(mergeGeometries([
    bx(w + 0.26, 0.13, 0.56).translate(0, h / 2 + 0.07, 0),
    bx(w + 0.26, 0.15, 0.56).translate(0, -h / 2 - 0.08, 0),
  ]), M.stone);
  g.add(sheet, bars, barsBack, sill);
  latticeSheets.push({ mesh: sheet, base: 0.55, phase: rand() * 6.28 });
  ANCHORS.rails.push([x, z]);
  return g;
}

/** 匾额: a board with characters, hung above the front of a building */
function plaque(text, { x, z, rot, y, front, w, h, board = '#22150f', ink = '#e7d3a6' }) {
  const [px, pz] = at(x, z, rot, 0, front);
  const m = inscribed(text, w, h, { vertical: false, cols: 1, board, ink, size: 0.74, glow: '#ffcf94', ei: 0.34 });
  m.position.set(px, y, pz);
  m.rotation.y = rot;
  plaques.push(m);
  if (board) {
    const frame = new THREE.Mesh(bx(w + 0.2, h + 0.18, 0.1), M.gold);
    frame.position.set(px, y, pz - 0.07 * Math.cos(rot));
    frame.rotation.y = rot;
    plaques.push(frame);
  }
  return m;
}

/* ------------------------------------------------------------------ 厅堂 */

export function hall({
  x, z, rot = 0, bays = 3, bayW = 4.6, depth = 7.6, colH = 3.9,
  name = null, plinthH = 0.55, open = true, sideWindows = true,
}) {
  const span = bays * bayW;
  const G = GROUND + plinthH;
  plinth({ x, z, rot, w: span + 2.6, d: depth + 2.2, h: plinthH });
  add('floor', put(bx(span, 0.12, depth), x, G + 0.06, z, rot));

  const xs = [];
  for (let i = 0; i <= bays; i++) xs.push(-span / 2 + i * bayW);
  colonnade({ x, z, rot, xs, zs: [-depth / 2, depth / 2], baseY: G, h: colH, r: 0.24 });
  colonnade({ x, z, rot, xs: xs.filter((_, i) => i === 0 || i === bays), zs: [-depth / 6, depth / 6], baseY: G, h: colH, r: 0.2 });
  const eaveY = G + colH + 0.2;
  entablature({ x, z, rot, w: span, d: depth, y: eaveY });
  valance({ x, z, rot, w: span, d: depth, y: eaveY });

  // 后墙 与 山墙；前檐开敞
  const [bx1, bz1] = at(x, z, rot, 0, -depth / 2);
  add('plaster', put(bx(span + 0.2, colH, 0.4), bx1, G + colH / 2, bz1, rot));
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * span / 2, 0);
    add('plaster', put(bx(0.4, colH, depth), px, G + colH / 2, pz, rot));
    if (sideWindows) {
      const [wx, wz] = at(x, z, rot, sx * (span / 2 + 0.02), 0.4);
      latticeWindow({ x: wx, y: G + 1.75, z: wz, rot: rot + sx * HALF_PI, w: 1.5, h: 1.25, kind: 2 });
    }
  }

  if (open) {
    // 槅扇 thrown back nearly flat against the front columns
    for (const sx of [-1, 1]) {
      const [px, pz] = at(x, z, rot, sx * (span / 2 - 0.55), depth / 2 + 0.3);
      add('dark', put(bx(1.35, colH - 0.7, 0.1), px, G + (colH - 0.7) / 2 + 0.35, pz, rot + sx * 1.35));
    }
    const [sx1, sz1] = at(x, z, rot, 0, -depth * 0.28);
    add('dark', put(bx(span * 0.66, colH - 0.9, 0.16), sx1, G + (colH - 0.9) / 2 + 0.2, sz1, rot));
    const [sx2, sz2] = at(x, z, rot, 0, -depth * 0.28 + 0.16);
    const screen = new THREE.Mesh(bx(2.6, colH - 1.5, 0.06), glow('#c07a3e', 0.2));
    screen.position.set(sx2, G + (colH - 1.5) / 2 + 0.4, sz2);
    screen.rotation.y = rot;
    screen.name = 'hall-screen';
    interiorLights.push(screen);
  }

  roof({ x, z, rot, span: span + 2.8, depth: depth + 2.4, rise: 1.5, eaveY, lift: 0.62, cornerOut: 0.9 });
  // 硬山: the plaster gable that closes each end under the tiles
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (span / 2 + 0.12), 0);
    add('plaster', put(slopeEndWall({
      depth: depth + 0.6, rise: 1.5, baseY: G, eaveY, thick: 0.34, pitch: 0.78,
    }), px, 0, pz, rot));
  }
  if (name) plaque(name, { x, z, rot, y: eaveY - 0.8, front: depth / 2 + 0.62, w: 2.2, h: 0.74 });
  return { eaveY, floorY: G };
}

/* ------------------------------------------------------------------ 沧浪亭 */

export function pavilion({ x, z, rot = 0, half = 2.5, colH = 3.3, floorY = GROUND }) {
  add('stone', put(bx(half * 2 + 3.2, 0.34, half * 2 + 3.2), x, floorY - 0.17, z, rot));
  add('floor', put(bx(half * 2 + 2.2, 0.1, half * 2 + 2.2), x, floorY + 0.02, z, rot));
  for (const sz of [-1, 1]) add('stone', put(bx(half * 2 + 3.4, 0.12, 0.26), x, floorY + 0.12, z + sz * (half + 1.7), rot));
  const G = floorY;

  // 石柱: a Song pavilion is carried on plain stone columns, unpainted
  for (const lx of [-half, half]) {
    for (const lz of [-half, half]) {
      const [px, pz] = at(x, z, rot, lx, lz);
      add('stone', put(new THREE.CylinderGeometry(0.2, 0.22, colH, 10), px, G + colH / 2, pz));
      add('stone', put(bx(0.6, 0.16, 0.6), px, G + 0.08, pz, rot));
    }
  }
  for (const sz of [-1, 1]) add('timber', put(bx(half * 2, 0.3, 0.24), x, G + colH - 0.2, z + sz * half, rot));
  for (const sx of [-1, 1]) add('timber', put(bx(0.24, 0.3, half * 2), x + sx * half, G + colH - 0.2, z, rot));
  // 美人靠 on the two long sides
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * (half - 0.12));
    add('timber', put(bx(half * 2 - 0.4, 0.09, 0.09), px, G + 0.84, pz, rot));
    for (let i = 0; i <= 6; i++) {
      const [qx, qz] = at(x, pz, rot, -half + 0.2 + (i * (half * 2 - 0.4)) / 6, 0);
      add('timber', put(bx(0.08, 0.78, 0.08), qx, G + 0.47, qz, rot));
    }
  }

  const eaveY = G + colH + 0.1;
  const pr = pavilionRoof({ half: half + 1.5, rise: 2.2, eaveY, lift: 0.95, cornerOut: 0.55, sides: 4, perSide: 9, nv: 11 });
  add('roof', put(pr.surface, x, 0, z, rot));
  // 宝顶
  add('ridge', put(new THREE.SphereGeometry(0.26, 10, 8), x, eaveY + 2.2 + 0.34, z, rot));
  add('ridge', put(new THREE.CylinderGeometry(0.09, 0.16, 0.46, 8), x, eaveY + 2.2 + 0.06, z, rot));
  add('ridge', put(bx(0.9, 0.16, 0.9), x, eaveY + 2.2 - 0.2, z, rot));
  // 角梁: four hip lines that carry the lifted corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + sx * 0.25, eaveY + 2.05, z + sz * 0.25),
      new THREE.Vector3(x + sx * (half + 0.7), eaveY + 0.75, z + sz * (half + 0.7)),
      new THREE.Vector3(x + sx * (half + 1.35), eaveY + 0.1, z + sz * (half + 1.35)),
    ], false, 'catmullrom', 0.1);
    add('dark', new THREE.TubeGeometry(c, 12, 0.12, 4, false));
  }

  plaque('沧浪亭', { x, z, rot, y: eaveY - 0.55, front: half + 1.55, w: 1.4, h: 0.58 });
  // 柱联: the collected couplet, one line on each front column
  for (const [text, sx] of [['清风明月本无价', -1], ['近水远山皆有情', 1]]) {
    const [px, pz] = at(x, z, rot, sx * (half + 0.02), half + 0.02);
    const m = inscribed(text, 0.54, 2.9, {
      vertical: true, cols: 1, board: '#1f1610', ink: '#ead9bb', size: 0.94, glow: '#ffbe7a', ei: 0.26,
    });
    m.position.set(px, G + colH / 2 - 0.15, pz);
    m.rotation.y = rot + sx * 0.6;
    plaques.push(m);
  }
  for (const sz of [1, -1]) ANCHORS.eaves.push({ x, y: eaveY + 0.1, z: z + sz * (half + 1.2) });
  return { eaveY, floorY: G };
}

/* ------------------------------------------------------------------ 看山楼 */

export function tower({ x, z, rot = 0, w = 7.4, d = 6.4 }) {
  const G = GROUND;
  add('stone', put(bx(w + 1.6, 0.55, d + 1.6), x, G + 0.27, z, rot));
  add('floor', put(bx(w, 0.14, d), x, G + 0.58, z, rot));
  const h1 = 3.6, y1 = G + 0.65 + h1;
  colonnade({ x, z, rot, xs: [-w / 2, w / 2], zs: [-d / 2, d / 2], baseY: G + 0.65, h: h1, r: 0.24 });
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * d / 2);
    add('plaster', put(bx(w, h1, 0.4), px, G + 0.65 + h1 / 2, pz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * w / 2, 0);
    add('plaster', put(bx(0.4, h1, d), px, G + 0.65 + h1 / 2, pz, rot));
  }
  // 腰檐: the shallow tiled shelf that divides the two storeys — its ridge lands
  // under the upper floor, so the 平座 sits on top of it
  const deck = y1 + 0.62;
  const eave = gabledRoof({ span: w + 2.6, depth: d + 2.6, rise: 0.55, eaveY: deck - 0.55, lift: 0.3, cornerOut: 0.5 });
  add('roof', put(eave.surface, x, 0, z, rot));
  add('ridge', put(eave.ridge, x, 0, z, rot));
  add('dark', put(bx(w + 1.8, 0.12, d + 1.8), x, deck - 0.85, z, rot));
  add('stone', put(bx(w + 1.3, 0.22, d + 1.3), x, deck - 0.11, z, rot));
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * (d / 2 + 0.55));
    add('timber', put(bx(w + 1.1, 0.09, 0.09), px, deck + 0.92, pz, rot));
    add('timber', put(bx(w + 1.1, 0.12, 0.36), px, deck + 0.42, pz, rot));
    for (let i = 0; i <= 7; i++) {
      const [qx, qz] = at(px, pz, rot, -(w + 1.0) / 2 + (i * (w + 1.0)) / 7, 0);
      add('timber', put(bx(0.09, 0.95, 0.09), qx, deck + 0.46, qz, rot));
    }
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (w / 2 + 0.55), 0);
    add('timber', put(bx(0.09, 0.95, d + 1.1), px, deck + 0.46, pz, rot));
  }

  const h2 = 2.9;
  colonnade({ x, z, rot, xs: [-w / 2 + 0.5, w / 2 - 0.5], zs: [-d / 2 + 0.5, d / 2 - 0.5], baseY: deck, h: h2, r: 0.21 });
  {
    const [px, pz] = at(x, z, rot, 0, -d / 2 + 0.5);
    add('plaster', put(bx(w - 0.8, h2, 0.36), px, deck + h2 / 2, pz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (w / 2 - 0.5), 0);
    add('plaster', put(bx(0.36, h2, d - 1.0), px, deck + h2 / 2, pz, rot));
  }
  const eaveY = deck + h2 + 0.16;
  entablature({ x, z, rot, w: w - 0.8, d: d - 0.8, y: eaveY });
  valance({ x, z, rot, w: w - 0.8, d: d - 0.8, y: eaveY });
  roof({ x, z, rot, span: w + 1.6, depth: d + 1.4, rise: 1.25, eaveY, lift: 0.5, cornerOut: 0.7 });
  plaque('看山楼', { x, z, rot, y: eaveY - 0.72, front: d / 2 + 0.2, w: 1.6, h: 0.62 });
  return { deck, eaveY };
}

/* ------------------------------------------------------------------ 观鱼处 */

export function platform({ x, z, rot = 0, w = 4.4, d = 3.6, deckY = GROUND + 0.4 }) {
  add('stone', put(bx(w, 0.26, d), x, deckY, z, rot));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (w / 2 - 0.5), sz * (d / 2 - 0.5));
    add('stone', put(new THREE.CylinderGeometry(0.16, 0.18, deckY + 2.6, 8), px, (deckY - 2.6 + deckY) / 2 - 0.1, pz));
  }
  // 栏杆 on three sides, open to the bank on the fourth
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * (d / 2 - 0.08));
    add('timber', put(bx(w - 0.2, 0.09, 0.09), px, deckY + 0.92, pz, rot));
    add('timber', put(bx(w - 0.2, 0.12, 0.34), px, deckY + 0.42, pz, rot));
  }
  const [px2, pz2] = at(x, z, rot, w / 2 - 0.08, 0);
  add('timber', put(bx(0.09, 0.92, d - 0.2), px2, deckY + 0.5, pz2, rot));
  for (let i = 0; i <= 5; i++) {
    const t = -w / 2 + 0.2 + (i * (w - 0.4)) / 5;
    for (const sz of [-1, 1]) {
      const [qx, qz] = at(x, z, rot, t, sz * (d / 2 - 0.08));
      add('timber', put(bx(0.08, 0.9, 0.08), qx, deckY + 0.45, qz, rot));
    }
  }
  const [sx3, sz3] = at(x, z, rot, -(w / 2 + 0.7), 0);
  add('stone', put(bx(1.6, 0.2, 1.9), sx3, deckY - 0.16, sz3, rot));
  ANCHORS.eaves.push({ x: px2, y: deckY + 1.5, z: pz2 });
  return { deckY };
}

/* ------------------------------------------------------------------ 廊 */

/**
 * A straight length of 廊. With `windows` the middle carries a wall of 漏窗
 * (that is what makes it a 复廊); without it the span is open on both sides.
 */
export function corridorRun(p0, p1, {
  width = 2.8, colH = 2.9, windows = true, middle = 'wall', kind0 = 0, benchSide = 1,
} = {}) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return null;
  const rot = rotFor(dx, dz);
  const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
  const eaveY = GROUND + colH + 0.16;

  const n = Math.max(2, Math.round(len / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i * len) / n;
    for (const sz of [-1, 1]) {
      const [px, pz] = at(cx, cz, rot, t, sz * (width / 2));
      add('timber', put(new THREE.CylinderGeometry(0.14, 0.16, colH, 8), px, GROUND + colH / 2, pz));
      add('stone', put(bx(0.4, 0.13, 0.4), px, GROUND + 0.06, pz, rot));
    }
  }
  for (const sz of [-1, 1]) {
    const [px, pz] = at(cx, cz, rot, 0, sz * (width / 2 + 0.1));
    add('dark', put(bx(len, 0.15, 0.15), px, eaveY - 0.08, pz, rot));
    add('dark', put(bx(len, 0.08, 0.06), px, eaveY - 0.58, pz, rot));
  }
  add('floor', put(bx(len, 0.1, width), cx, GROUND + 0.03, cz, rot));

  const wallT = 0.4;
  if (windows) {
    const count = Math.max(1, Math.round(len / 2.0));
    const step = len / count;
    // the wall is built as sill band + header band + piers, so the windows are gaps
    add('plaster', put(bx(len, 0.85, wallT), cx, GROUND + 0.42, cz, rot));
    add('plaster', put(bx(len, colH - 2.3, wallT), cx, GROUND + colH - (colH - 2.3) / 2, cz, rot));
    for (let i = 0; i <= count; i++) {
      const t = -len / 2 + step * i;
      const [px, pz] = at(cx, cz, rot, t, 0);
      add('plaster', put(bx(step * 0.3, colH - 0.85, wallT), px, GROUND + 0.85 + (colH - 0.85) / 2, pz, rot));
      if (i < count) {
        const [wx, wz] = at(cx, cz, rot, t + step / 2, 0);
        latticeWindow({
          x: wx, y: GROUND + 1.5, z: wz, rot,
          w: step * 0.52, h: 1.12, kind: (kind0 + i) % T.LATTICE_COUNT,
        });
      }
    }
  } else if (middle !== 'none') {
    add('plaster', put(bx(len, colH, wallT), cx, GROUND + colH / 2, cz, rot));
  }

  const r = gabledRoof({ span: len + 1.3, depth: width + 1.4, rise: 0.8, eaveY, lift: 0.3, cornerOut: 0.4 });
  add('roof', put(r.surface, cx, 0, cz, rot));
  add('ridge', put(r.ridge, cx, 0, cz, rot));
  add('dark', put(bx(len + 0.9, 0.12, width + 1.0), cx, eaveY - 0.3, cz, rot));

  if (benchSide) {
    const [px, pz] = at(cx, cz, rot, 0, benchSide * (width / 2 - 0.3));
    add('timber', put(bx(len * 0.9, 0.1, 0.38), px, GROUND + 0.44, pz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(cx, cz, rot, sx * (len / 2 - 0.5), width / 2 + 0.3);
    ANCHORS.eaves.push({ x: px, y: eaveY - 0.1, z: pz });
  }
  return { eaveY, mid: [cx, cz], len, rot };
}

/** a 廊 as a chain of straight runs with a heavier post at every turn */
export function corridorPath(points, opts = {}) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const r = corridorRun(points[i], points[i + 1], { ...opts, kind0: i });
    if (r) out.push(r);
  }
  for (let i = 1; i < points.length - 1; i++) {
    const [x, z] = points[i];
    const h = opts.colH || 2.9;
    add('timber', put(new THREE.CylinderGeometry(0.19, 0.21, h, 8), x, GROUND + h / 2, z));
  }
  return out;
}

/* ------------------------------------------------------------------ 园墙 / 门 */

export function wallRun(points, { height = 3.5, thick = 0.7, capWidth = 1.2 } = {}) {
  const y = GROUND + height;
  const f = pathFrames(points.map(([x, z]) => [x, y, z]), { steps: 5, y });
  add('plaster', wallCap(f, { width: capWidth, rise: 0.34, eaveDrop: 0.16 }));
  add('ridge', ridgeTube(f, { lift: 0.34, radius: 0.1 }));
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    segments.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, len: Math.hypot(dx, dz), rot: rotFor(dx, dz) });
  }
  return { segments, f, height, thick };
}

/** the body of a wall run: plaster below the cap, a stone kerb at the foot */
export function wallBody({ cx, cz, len, rot }, { height = 3.5, thick = 0.7 }) {
  if (len < 0.2) return;
  add('plaster', put(bx(len, height, thick), cx, GROUND + height / 2, cz, rot));
  add('stone', put(bx(len + 0.2, 0.32, thick + 0.26), cx, GROUND + 0.16, cz, rot));
}

export function gateDoor({ x, z, rot = 0, width = 3.6, height = 3.4, name = null }) {
  const G = GROUND;
  for (const sx of [-1, 1]) add('stone', put(bx(0.52, height, 0.95), x + sx * (width / 2 + 0.26), G + height / 2, z, rot));
  add('stone', put(bx(width + 1.2, 0.44, 1.0), x, G + height + 0.22, z, rot));
  add('dark', put(bx(width, height - 0.1, 0.24), x, G + (height - 0.1) / 2, z, rot));
  add('stone', put(bx(width, 0.14, 1.05), x, G + 0.07, z, rot));
  const y0 = G + height + 0.44;
  const r = gabledRoof({ span: width + 3.2, depth: 2.4, rise: 0.7, eaveY: 0, lift: 0.4, cornerOut: 0.6 });
  add('roof', put(r.surface, x, y0 - 0.5, z, rot));
  add('ridge', put(r.ridge, x, y0 - 0.5, z, rot));
  for (let i = -3; i <= 3; i++) {
    const [px, pz] = at(x, z, rot, i * 0.62, 1.1);
    add('dark', put(bx(0.34, 0.28, 0.28), px, y0 - 0.62, pz, rot));
  }
  if (name) plaque(name, { x, z, rot, y: y0 + 0.05, front: 1.25, w: 1.7, h: 0.56, board: null, ink: '#cfe0dd' });
  ANCHORS.eaves.push({ x: x - 1.9, y: G + height - 0.3, z: z + 0.9 });
  ANCHORS.eaves.push({ x: x + 1.9, y: G + height - 0.3, z: z + 0.9 });
  return { y0 };
}

/** 月洞门: a circular opening in a partition wall */
export function moonGate({ x, z, rot = 0, r = 1.3, wallW = 5.4, wallH = 3.2, thick = 0.55 }) {
  const G = GROUND;
  const side = (wallW / 2 - r) / 2 + r * 0.1;
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (r + side), 0);
    add('plaster', put(bx(side * 2, wallH, thick), px, G + wallH / 2, pz, rot));
  }
  const N = 15;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    const [px, pz] = at(x, z, rot, Math.cos(a) * (r + 0.3), 0);
    add('plaster', put(bx(0.66, 0.66, thick), px, G + r + 0.1 + Math.sin(a) * (r + 0.3), pz, rot));
  }
  add('dark', put(bx(wallW, wallH, 0.12), x, G + wallH / 2, z, rot));
  add('stone', put(bx(r * 2.2, 0.13, thick + 0.3), x, G + 0.06, z, rot));
  const cap = wallRun([[x - wallW / 2, z], [x + wallW / 2, z]], { height: wallH });
  for (const s of cap.segments) wallBody(s, { height: wallH - 0.6, thick });
  void N;
}

/* ------------------------------------------------------------------ 桥 / 石坊 */

export function stoneBridge({ x, z, span = 24, width = 3.4, rise = 1.6, deckY = GROUND }) {
  const N = 20;
  const crown = (t) => deckY + rise * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  const deck = [], rails = [];
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const z0 = z - span / 2 + span * t0, z1 = z - span / 2 + span * t1;
    const y0 = crown(t0), y1 = crown(t1);
    const len = Math.hypot(z1 - z0, y1 - y0) - 0.05;
    const tilt = Math.atan2(y1 - y0, z1 - z0);
    const g = bx(width, 0.3, len);
    g.rotateX(-tilt);
    g.translate(x, (y0 + y1) / 2 + 0.15, (z0 + z1) / 2);
    deck.push(g);
    for (const sx of [-1, 1]) {
      const rg = bx(0.15, 0.8, len);
      rg.rotateX(-tilt);
      rg.translate(x + sx * (width / 2 - 0.08), (y0 + y1) / 2 + 0.68, (z0 + z1) / 2);
      rails.push(rg);
    }
  }
  add('stone', mergeGeometries(deck), mergeGeometries(rails));
  const posts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, pz = z - span / 2 + span * t, py = crown(t);
    for (const sx of [-1, 1]) {
      const g = bx(0.24, 1.05, 0.24);
      g.translate(x + sx * (width / 2 - 0.08), py + 0.86, pz);
      posts.push(g);
      const cap = bx(0.32, 0.12, 0.32);
      cap.translate(x + sx * (width / 2 - 0.08), py + 1.44, pz);
      posts.push(cap);
    }
  }
  add('stone', mergeGeometries(posts));
  // the two abutments, so the bridge lands in ground rather than floating
  for (const sz of [-1, 1]) add('stone', put(bx(width + 1.2, 2.6, 1.4), x, deckY - 1.0, z + sz * (span / 2 - 0.4)));
  return { crownY: deckY + rise };
}

export function stoneArchway({ x, z, rot = 0, name = '沧浪胜迹' }) {
  const G = GROUND;
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * 2.3, 0);
    add('stone', put(bx(0.56, 4.4, 0.56), px, G + 2.2, pz, rot));
    add('stone', put(bx(1.15, 0.32, 1.15), px, G + 0.16, pz, rot));
    // 抱鼓石
    add('stone', put(new THREE.CylinderGeometry(0.44, 0.44, 0.26, 12).rotateX(HALF_PI), px, G + 0.5, pz, rot));
  }
  add('stone', put(bx(5.5, 0.44, 0.52), x, G + 3.6, z, rot));
  add('stone', put(bx(5.5, 0.3, 0.46), x, G + 4.15, z, rot));
  add('dark', put(bx(4.5, 0.5, 0.42), x, G + 3.88, z, rot));
  const r = gabledRoof({ span: 6.4, depth: 1.7, rise: 0.52, eaveY: 0, lift: 0.34, cornerOut: 0.5 });
  add('roof', put(r.surface, x, G + 4.5, z, rot));
  add('ridge', put(r.ridge, x, G + 4.5, z, rot));
  plaque(name, { x, z, rot, y: G + 3.88, front: 0.3, w: 2.5, h: 0.6, board: null, ink: '#d5dfdc' });
  return { top: G + 5.2 };
}

/* ------------------------------------------------------------------ 碑壁 */

export function steleWall({ xFrom, xTo, z, height = 3.2 }) {
  const len = xTo - xFrom, cx = (xFrom + xTo) / 2, G = GROUND;
  // the carved face is a grid so its UV can run in metres
  add('stele', quadGrid((u, v) => [xFrom + u * len, G + 0.34 + v * (height - 0.5), z - 0.36], 30, 4,
    { spanU: len, spanV: height }));
  add('stone', put(bx(len + 0.4, height, 0.6), cx, G + height / 2, z + 0.02));
  add('stone', put(bx(len + 0.9, 0.3, 1.05), cx, G + 0.15, z));
  const cap = wallRun([[xFrom - 0.6, z + 0.16], [xTo + 0.6, z + 0.16]], { height: height + 0.34 });
  for (const s of cap.segments) wallBody(s, { height: height + 0.1, thick: 0.7 });
  return { cx, topY: G + height };
}

/* ------------------------------------------------------------------ assembly */

/**
 * Build the whole garden. `site` carries the pavilion's footing, which comes from
 * the hill builder so the 亭 always sits on the crest it was measured from.
 */
export function buildArchitecture(scene, site = { x: -6, z: 5, y: 8.7 }) {
  for (const k of Object.keys(C)) C[k].length = 0;
  ANCHORS.eaves.length = 0;
  latticeSheets.length = 0;
  plaques.length = 0;
  interiorLights.length = 0;

  const W = GARDEN.wall, G = GARDEN.gate, B = BUILDINGS;

  /* 园墙：北墙留门洞，其余三面闭合 */
  const segs = [
    [[W.xW, W.zN], [G.x - G.width / 2 - 0.7, W.zN]],
    [[G.x + G.width / 2 + 0.7, W.zN], [W.xE, W.zN]],
    [[W.xE, W.zN], [W.xE, W.zS]],
    [[W.xE, W.zS], [W.xW, W.zS]],
    [[W.xW, W.zS], [W.xW, W.zN]],
  ];
  for (const s of segs) {
    const run = wallRun(s, { height: 3.5 });
    for (const s2 of run.segments) wallBody(s2, { height: 3.5, thick: 0.7 });
  }

  /* 门 · 桥 · 石坊 */
  gateDoor({ x: G.x, z: W.zN, rot: 0, width: G.width, height: G.height });
  stoneBridge({
    x: GARDEN.bridge.x, z: GARDEN.bridge.z, span: GARDEN.bridge.span,
    width: GARDEN.bridge.width, rise: GARDEN.bridge.rise, deckY: GROUND + 0.1,
  });
  stoneArchway({ x: GARDEN.archway.x, z: GARDEN.archway.z });

  /* 复廊：园之骨 */
  corridorPath(GARDEN.corridor, { width: 2.9, colH: 2.95, windows: true, benchSide: 1 });
  corridorPath(GARDEN.westCorridor, { width: 2.4, colH: 2.7, windows: false, middle: 'none', benchSide: -1 });

  /* 建筑 */
  const built = {};
  built.mingdao = hall({ x: B.mingdao.x, z: B.mingdao.z, rot: B.mingdao.rot, bays: 3, bayW: 4.6, depth: 7.6, colH: 4.0, name: '明道堂' });
  built.mianshui = hall({ x: B.mianshui.x, z: B.mianshui.z, rot: B.mianshui.rot, bays: 2, bayW: 4.1, depth: B.mianshui.d, colH: 3.3, name: '面水轩', plinthH: 0.4 });
  built.cuilinglong = hall({ x: B.cuilinglong.x, z: B.cuilinglong.z, rot: B.cuilinglong.rot, bays: 1, bayW: 5.6, depth: B.cuilinglong.d, colH: 3.1, name: '翠玲珑', plinthH: 0.3 });
  built.kanshan = tower({ x: B.kanshan.x, z: B.kanshan.z, rot: B.kanshan.rot, w: B.kanshan.w, d: B.kanshan.d });
  built.guanyu = platform({ x: B.guanyu.x, z: B.guanyu.z, rot: B.guanyu.rot, w: 4.6, d: 3.8, deckY: GROUND + 0.4 });
  built.pavilion = pavilion({ x: site.x, z: site.z, rot: 0, half: 2.5, colH: 3.3, floorY: site.y });

  /* 分景：堂院 与 山 之间一道短墙，开月洞门 */
  const yw = wallRun([[12, 17], [12, 27]], { height: 3.2 });
  for (const s of yw.segments) wallBody(s, { height: 3.2, thick: 0.55 });
  moonGate({ x: 12, z: 29.6, rot: HALF_PI, r: 1.25, wallW: 4.4, wallH: 3.0 });

  /* 碑廊：南墙内侧 */
  const S = GARDEN.steleWall;
  steleWall(S);
  corridorRun([S.xFrom - 1, S.z - 3.0], [S.xTo + 1, S.z - 3.0], { width: 2.6, colH: 2.8, windows: false, middle: 'none', benchSide: 1 });

  const group = new THREE.Group();
  group.name = 'architecture';
  const KEY = {
    plaster: M.plaster, roof: M.roof, ridge: M.wallCap, timber: M.timber,
    dark: M.timberDark, stone: M.stone, gold: M.gold, floor: M.paving, stele: M.stele,
  };
  for (const [k, list] of Object.entries(C)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list);
    if (!merged) continue;
    const m = mesh(merged, KEY[k]);
    m.receiveShadow = true;
    m.name = `arch-${k}`;
    group.add(m);
  }
  for (const g of latticeSheets) group.add(g.mesh.parent);
  for (const p of plaques) group.add(p);
  for (const i of interiorLights) group.add(i);
  scene.add(group);

  return { group, latticeSheets, interiorLights, plaques, built, anchors: ANCHORS };
}
