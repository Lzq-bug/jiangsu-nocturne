import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, mesh, lit, glow, rand, inscribed, pathFrames, clamp01,
} from './kit.js';
import { gabledRoof, pavilionRoof, wallCap, ridgeTube, slopeEndWall } from './roofs.js';
import * as T from './textures.js';
import { terrainHeight, FEATURES, site, CABLE, LAKE, SHORE } from './data.js';

/**
 * 山上的建筑。形制一律按北方寺观与书院的通例写意铺；只有这几个数是按记载给的：
 * 放鹤亭南北 11.95 米、东西 4.95 米；大石佛通高 11.52 米（三丈六尺）；
 * 东坡石床 3.3×1.3×1.75 米（在 hill.js 里）；索道全长约 1200 米、垂直高差 88 米。
 * 每处建筑都从 data.site() 取自己的地面高，所以房子永远坐在山上而不是浮着。
 */

const C = {
  plaster: [], templeWall: [], roof: [], ridge: [], timber: [], dark: [],
  stone: [], stoneFloor: [], gold: [], floor: [], rock: [], bronze: [], cement: [], glass: [], steel: [],
};
const add = (key, ...geos) => { for (const g of geos) if (g) C[key].push(g); };

export const ANCHORS = { eaves: [], steps: [], rails: [] };
export const plaques = [];
export const interiorLights = [];

const HALF_PI = Math.PI / 2;
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function put(g, x, y, z, rot = 0) {
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}
/** 局部 (x 跨面阔, z 朝前) 旋到世界 */
function at(x, z, rot, lx, lz) {
  return [x + Math.cos(rot) * lx + Math.sin(rot) * lz, z - Math.sin(rot) * lx + Math.cos(rot) * lz];
}
/** 建筑面朝下坡 */
const faceDown = (gx, gz) => Math.atan2(-gx, -gz);
/** 院墙的落点：[x, 地面y, z] */
const wallPt = (cx, cz, rot, lx, lz, y) => {
  const [x, z] = at(cx, cz, rot, lx, lz);
  return [x, y, z];
};

/* ------------------------------------------------------------------ 构件 */

function plinth({ x, z, rot, w, d, topY, h = 0.7, steps = true }) {
  add('stone', put(boxG(w, h, d), x, topY - h, z, rot));
  add('stone', put(boxG(w + 0.34, 0.16, d + 0.34), x, topY - 0.02, z, rot));
  if (!steps) return;
  for (let k = 0; k < 3; k++) {
    const [sx, sz] = at(x, z, rot, 0, d / 2 + 0.5 + k * 0.46);
    add('stone', put(boxG(w * 0.5, 0.2, 0.52), sx, topY - (k + 1) * 0.2 + 0.1, sz, rot));
  }
}

function colonnade({ x, z, rot, xs, zs, baseY, h, r = 0.24, stone = false }) {
  for (const lx of xs) {
    for (const lz of zs) {
      const [px, pz] = at(x, z, rot, lx, lz);
      add(stone ? 'stone' : 'timber', put(new THREE.CylinderGeometry(r * 0.9, r, h, 9), px, baseY + h / 2, pz));
      if (!stone) add('stone', put(boxG(r * 2.4, 0.15, r * 2.4), px, baseY + 0.07, pz, rot));
    }
  }
}

function entablature({ x, z, rot, w, d, y }) {
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * d / 2);
    add('timber', put(boxG(w + 0.3, 0.34, 0.24), px, y - 0.2, pz, rot));
    const [qx, qz] = at(x, z, rot, 0, sz * (d / 2 + 0.38));
    add('dark', put(boxG(w + 1.2, 0.18, 0.18), qx, y + 0.04, qz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * w / 2, 0);
    add('timber', put(boxG(0.24, 0.34, d), px, y - 0.2, pz, rot));
  }
}

function valance({ x, z, rot, w, d, y }) {
  for (const sz of [-1, 1]) {
    const [fx, fz] = at(x, z, rot, 0, sz * (d / 2 + 0.1));
    add('dark', put(boxG(w, 0.44, 0.07), fx, y - 0.62, fz, rot));
    const n = Math.max(3, Math.round(w / 0.7));
    for (let i = 0; i <= n; i++) {
      const [px, pz] = at(fx, fz, rot, -w / 2 + (i * w) / n, 0);
      add('dark', put(boxG(0.1, i % 2 ? 0.24 : 0.42, 0.07), px, y - 0.94, pz, rot));
    }
  }
}

/** 一间面阔 bays 开的厅：前檐开敞，余三面砌墙 */
function hall({
  x, z, rot, bays = 3, bayW = 4.4, depth = 7.2, colH = 4.0, topY,
  name = null, wall = 'plaster', open = true, plinthH = 0.7, rise = 1.7,
  backWall = true,
}) {
  const span = bays * bayW;
  const G = topY;
  plinth({ x, z, rot, w: span + 2.6, d: depth + 2.2, topY: G, h: plinthH });
  add('floor', put(boxG(span, 0.12, depth), x, G + 0.06, z, rot));

  const xs = [];
  for (let i = 0; i <= bays; i++) xs.push(-span / 2 + i * bayW);
  colonnade({ x, z, rot, xs, zs: [-depth / 2, depth / 2], baseY: G, h: colH, r: 0.25 });
  const eaveY = G + colH + 0.22;
  entablature({ x, z, rot, w: span, d: depth, y: eaveY });
  valance({ x, z, rot, w: span, d: depth, y: eaveY });

  const key = wall === 'temple' ? 'templeWall' : 'plaster';
  // 兴化禅寺的大殿后壁要留空：佛与崖就是它的后墙
  if (backWall) {
    const [bx1, bz1] = at(x, z, rot, 0, -depth / 2);
    add(key, put(boxG(span + 0.2, colH, 0.42), bx1, G + colH / 2, bz1, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * span / 2, 0);
    add(key, put(boxG(0.42, colH, depth), px, G + colH / 2, pz, rot));
  }
  if (open) {
    for (const sx of [-1, 1]) {
      const [px, pz] = at(x, z, rot, sx * (span / 2 - 0.6), depth / 2 + 0.34);
      add('dark', put(boxG(1.4, colH - 0.8, 0.1), px, G + (colH - 0.8) / 2 + 0.4, pz, rot + sx * 1.3));
    }
    if (backWall) {
      // 只有后墙存在时才需要屏风；大殿里立在面前的是一丈一的山崖
      const [sx2, sz2] = at(x, z, rot, 0, -depth * 0.3);
      const sheet = new THREE.Mesh(boxG(span * 0.5, colH - 1.4, 0.08), glow('#a3642e', 0.15));
      sheet.position.set(sx2, G + (colH - 1.4) / 2 + 0.5, sz2);
      sheet.rotation.y = rot;
      sheet.name = 'hall-screen';
      interiorLights.push(sheet);
    }
  }

  const r = gabledRoof({ span: span + 2.8, depth: depth + 2.4, rise, eaveY, lift: 0.3, cornerOut: 0.45 });
  add('roof', put(r.surface, x, 0, z, rot));
  add('ridge', put(r.ridge, x, 0, z, rot));
  add('dark', put(boxG(span + 2.4, 0.16, depth + 2.0), x, eaveY - 0.34, z, rot));
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (span / 2 + 0.14), 0);
    add(key, put(slopeEndWall({ depth: depth + 0.6, rise, baseY: G, eaveY, thick: 0.36, pitch: 0.8 }), px, 0, pz, rot));
  }
  if (name) {
    const [px, pz] = at(x, z, rot, 0, depth / 2 + 0.66);
    const m = inscribed(name, 2.3, 0.78, {
      vertical: false, cols: 1, board: '#241708', ink: '#e8d4a6', size: 0.74, glow: '#ffcf94', ei: 0.32,
    });
    m.position.set(px, eaveY - 0.86, pz);
    m.rotation.y = rot;
    plaques.push(m);
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (span / 2 - 0.7), depth / 2 - 0.2);
    ANCHORS.eaves.push({ x: px, y: eaveY - 0.1, z: pz });
  }
  return { eaveY, floorY: G, span, depth };
}

/** 放鹤亭：南北长 11.95 米、东西深 4.95 米（可考），像个长条的敞廊 */
function longPavilion({ x, z, floorY, name = '放鹤亭' }) {
  const L = 11.95, W = 4.95, rot = 0;              // 长边留在南北向上
  add('stone', put(boxG(W + 2.4, 0.34, L + 2.4), x, floorY - 0.17, z, rot));
  add('floor', put(boxG(W + 1.4, 0.1, L + 1.4), x, floorY + 0.02, z, rot));
  const colH = 3.1;
  const rows = [-W / 2 + 0.25, W / 2 - 0.25];
  const cols = [];
  for (let i = 0; i <= 4; i++) cols.push(-L / 2 + (i * L) / 4);
  for (const lz of cols) {
    for (const lx of rows) {
      const [px, pz] = at(x, z, rot, lx, lz);
      add('stone', put(new THREE.CylinderGeometry(0.19, 0.21, colH, 10), px, floorY + colH / 2, pz));
      add('stone', put(boxG(0.56, 0.15, 0.56), px, floorY + 0.07, pz, rot));
    }
  }
  for (const lx of rows) {
    const [px, pz] = at(x, z, rot, lx, 0);
    add('timber', put(boxG(0.26, 0.3, L + 0.4), px, floorY + colH - 0.2, pz, rot));
  }
  for (const lz of cols) {
    const [px, pz] = at(x, z, rot, 0, lz);
    add('timber', put(boxG(W + 0.3, 0.24, 0.24), px, floorY + colH - 0.24, pz, rot));
  }
  // 四面美人靠：山上坐着看的东西多
  for (const lx of rows) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(x, z, rot, lx * 0.92, sz * (L / 2 - 0.35));
      add('timber', put(boxG(0.1, 0.09, L - 1.0), px, floorY + 0.86, pz, rot));
    }
    for (let i = 0; i <= 5; i++) {
      const [px, pz] = at(x, z, rot, lx * 0.92, -L / 2 + 0.5 + (i * (L - 1.0)) / 5);
      add('timber', put(boxG(0.08, 0.8, 0.08), px, floorY + 0.46, pz, rot));
    }
  }
  const eaveY = floorY + colH + 0.1;
  const r = gabledRoof({ span: L + 3.0, depth: W + 2.8, rise: 1.5, eaveY, lift: 0.32, cornerOut: 0.5 });
  add('roof', put(r.surface, x, 0, z, rot + HALF_PI));
  add('ridge', put(r.ridge, x, 0, z, rot + HALF_PI));
  add('dark', put(boxG(W + 1.1, 0.12, L + 1.3), x, eaveY - 0.26, z, rot));
  const [px, pz] = at(x, z, rot, 0, L / 2 + 1.15);
  const m = inscribed(name, 1.5, 0.6, {
    vertical: false, cols: 1, board: '#22160f', ink: '#ead9bb', size: 0.78, glow: '#ffbe7a', ei: 0.3,
  });
  m.position.set(px, eaveY - 0.62, pz);
  m.rotation.y = rot + HALF_PI;
  plaques.push(m);
  for (const sz of [-1, 1]) ANCHORS.eaves.push({ x, y: eaveY - 0.1, z: z + sz * (L / 2 + 0.6) });
  return { eaveY, floorY, L, W };
}

/** 小方亭（招鹤亭、堤口亭） */
function squarePavilion({ x, z, rot = 0, floorY, half = 1.7, name = null }) {
  add('stone', put(boxG(half * 2 + 2.2, 0.3, half * 2 + 2.2), x, floorY - 0.15, z, rot));
  add('floor', put(boxG(half * 2 + 1.4, 0.1, half * 2 + 1.4), x, floorY + 0.02, z, rot));
  const colH = 2.7;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * half, sz * half);
    add('stone', put(new THREE.CylinderGeometry(0.16, 0.18, colH, 9), px, floorY + colH / 2, pz));
  }
  const eaveY = floorY + colH + 0.06;
  const pr = pavilionRoof({ half: half + 1.1, rise: 1.7, eaveY, lift: 0.52, cornerOut: 0.34, sides: 4, perSide: 7, nv: 9 });
  add('roof', put(pr.surface, x, 0, z, rot));
  add('ridge', put(new THREE.SphereGeometry(0.2, 9, 7), x, eaveY + 2.0, z, rot));
  if (name) {
    const [px, pz] = at(x, z, rot, 0, half + 1.0);
    const m = inscribed(name, 1.1, 0.44, {
      vertical: false, cols: 1, board: '#22160f', ink: '#e6d6b6', size: 0.8, glow: '#ffbe7a', ei: 0.26,
    });
    m.position.set(px, eaveY - 0.5, pz);
    m.rotation.y = rot;
    plaques.push(m);
  }
  ANCHORS.eaves.push({ x, y: eaveY - 0.1, z: z + half + 0.8 });
  return { eaveY, floorY };
}

/** 一段院墙：points 是 [x, 地面y, z] */
function wallRun(points, { height = 3.2, thick = 0.6, capWidth = 1.1, key = 'plaster' } = {}) {
  const k = key === 'temple' ? 'templeWall' : key;
  const f = pathFrames(points.map((p) => [p[0], p[1] + height, p[2]]), { steps: 4 });
  add(k, wallCap(f, { width: capWidth, rise: 0.32, eaveDrop: 0.15 }));
  add('ridge', ridgeTube(f, { lift: 0.32, radius: 0.1 }));
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0, z0] = points[i], [x1, y1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.3) continue;
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    add(k, put(boxG(len, height, thick), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, rot));
    add('stone', put(boxG(len + 0.2, 0.3, thick + 0.24), (x0 + x1) / 2, (y0 + y1) / 2 + 0.15, (z0 + z1) / 2, rot));
  }
}

/** 山门：一间门屋，额题寺名 */
function gateHouse({ x, z, rot, topY, name, w = 5.4, d = 2.8, h = 3.5 }) {
  add('stone', put(boxG(w + 1.4, 0.6, d + 1.0), x, topY - 0.6, z, rot));
  add('stone', put(boxG(w + 1.8, 0.18, d + 1.4), x, topY - 0.03, z, rot));
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (w / 2 - 0.4), 0);
    add('timber', put(new THREE.CylinderGeometry(0.22, 0.24, h, 10), px, topY + h / 2, pz));
  }
  add('dark', put(boxG(w - 0.7, h - 0.3, 0.2), x, topY + (h - 0.3) / 2, z, rot));
  const y0 = topY + h + 0.1;
  const r = gabledRoof({ span: w + 3.0, depth: d + 2.0, rise: 0.9, eaveY: y0, lift: 0.26, cornerOut: 0.42 });
  add('roof', put(r.surface, x, 0, z, rot));
  add('ridge', put(r.ridge, x, 0, z, rot));
  add('dark', put(boxG(w + 2.4, 0.14, d + 1.6), x, y0 - 0.3, z, rot));
  const [px, pz] = at(x, z, rot, 0, d / 2 + 0.32);
  const m = inscribed(name, 2.0, 0.66, {
    vertical: false, cols: 1, board: null, ink: '#cfdad6', size: 0.8, glow: '#ffcd96', ei: 0.22,
  });
  m.position.set(px, y0 - 0.95, pz);
  m.rotation.y = rot;
  plaques.push(m);
  ANCHORS.eaves.push({ x, y: y0 - 0.25, z: z + (d / 2 + 0.5) });
  return { topY: y0 };
}

/** 钟楼 / 鼓楼：二层小阁；钟楼上挂那口传重三吨的铁钟 */
function drumTower({ x, z, rot, topY, w = 5.6, bell = false }) {
  const h1 = 3.0;
  add('stone', put(boxG(w + 1.2, 0.5, w + 1.2), x, topY - 0.5, z, rot));
  add('floor', put(boxG(w, 0.14, w), x, topY + 0.03, z, rot));
  const inset = w / 2 - 0.45;
  colonnade({ x, z, rot, xs: [-inset, inset], zs: [-inset, inset], baseY: topY, h: h1, r: 0.2 });
  const eave1 = topY + h1 + 0.16;
  let r = gabledRoof({ span: w + 2.2, depth: w + 2.2, rise: 0.9, eaveY: eave1, lift: 0.26, cornerOut: 0.42 });
  add('roof', put(r.surface, x, 0, z, rot));
  add('ridge', put(r.ridge, x, 0, z, rot));

  const deck = eave1 + 0.72;
  add('stone', put(boxG(w * 0.92, 0.18, w * 0.92), x, deck, z, rot));
  const in2 = w / 2 - 0.95;
  colonnade({ x, z, rot, xs: [-in2, in2], zs: [-in2, in2], baseY: deck + 0.1, h: 2.4, r: 0.17 });
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * in2);
    add('plaster', put(boxG(w - 1.6, 2.4, 0.34), px, deck + 1.3, pz, rot));
  }
  const eave2 = deck + 2.6;
  r = gabledRoof({ span: w + 1.2, depth: w + 1.2, rise: 1.0, eaveY: eave2, lift: 0.28, cornerOut: 0.4 });
  add('roof', put(r.surface, x, 0, z, rot));
  add('ridge', put(r.ridge, x, 0, z, rot));

  let bellMesh = null;
  if (bell) {
    bellMesh = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(0.95, 1.12, 1.7, 14).translate(0, 0, 0),
      new THREE.SphereGeometry(1.05, 12, 8).scale(1, 0.3, 1).translate(0, -0.9, 0),
      new THREE.CylinderGeometry(0.16, 0.16, 0.4, 8).translate(0, 1.0, 0),
    ]), M.bronze);
    bellMesh.name = 'iron-bell';
    return { deck, eaveY: eave2, bell: bellMesh, at: [x, deck + 1.6, z] };
  }
  return { deck, eaveY: eave2, bell: null, at: [x, deck + 1.6, z] };
}

/* ------------------------------------------------------------------ 大石佛 */

/**
 * 北魏大石佛：依崖的半身坐像，通高 11.52 米。
 * 只上半身出自石，胸以下与崖面连成一片，所以座与身之间不留缝。
 */
function buildBuddha({ x, y, z, rot }) {
  const parts = [];
  parts.push(boxG(9.4, 1.6, 5.4).translate(0, 0.8, 0));
  parts.push(boxG(8.2, 0.5, 4.6).translate(0, 1.8, 0));
  parts.push(loftRock([
    { y: 2.0, cx: 0, cz: -0.3, sx: 3.2, sz: 1.8 },
    { y: 4.4, cx: 0, cz: -0.1, sx: 2.8, sz: 1.7 },
    { y: 6.6, cx: 0, cz: 0.2, sx: 2.4, sz: 1.5 },
    { y: 8.0, cx: 0, cz: 0.4, sx: 1.85, sz: 1.3 },
  ]));
  parts.push(new THREE.SphereGeometry(1.8, 14, 10).scale(1, 0.58, 0.78).translate(0, 8.2, 0.3));
  parts.push(new THREE.CylinderGeometry(0.85, 1.05, 1.0, 12).translate(0, 8.8, 0.35));
  parts.push(new THREE.SphereGeometry(1.45, 16, 12).scale(1, 1.12, 1).translate(0, 10.0, 0.4));
  parts.push(new THREE.SphereGeometry(0.75, 10, 8).translate(0, 11.15, 0.42));   // 肉髻
  for (const sx of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.42, 0.55, 4.4, 10);
    arm.rotateZ(sx * 0.16);
    arm.translate(sx * 2.25, 5.2, 0.55);
    parts.push(arm);
    parts.push(new THREE.SphereGeometry(0.58, 10, 8).translate(sx * 2.0, 3.1, 1.5));
  }
  for (let k = 0; k < 3; k++) {                      // 衣纹：三道横襵
    const fold = new THREE.TorusGeometry(2.15 - k * 0.3, 0.15, 5, 16, Math.PI * 0.9);
    fold.rotateY(HALF_PI);
    fold.rotateX(0.2);
    fold.translate(0, 6.4 - k * 1.5, 0.8);
    parts.push(fold);
  }
  const mat = lit('#9a958a', {
    map: T.limestone({ meters: 2.4, base: '#8b867c' }), rough: 0.88,
    emissive: '#3a2a16', ei: 0.95, side: THREE.DoubleSide,
  });
  const figure = new THREE.Mesh(mergeGeometries(parts), mat);
  figure.name = 'great-buddha';

  // 崖面与拱形龛口：像从这块立起的石里出来
  const cliff = [];
  cliff.push(boxG(19, 21, 2.4).translate(0, 9.4, -3.4));
  cliff.push(new THREE.TorusGeometry(5.3, 0.7, 6, 16, Math.PI).translate(0, 7.4, -2.2));
  for (const sx of [-1, 1]) cliff.push(boxG(2.4, 12, 3.2).translate(sx * 8.6, 5.4, -3.0));
  const cm = new THREE.Mesh(mergeGeometries(cliff), M.rockHill);
  cm.name = 'buddha-cliff';

  const grp = new THREE.Group();
  grp.add(figure, cm);
  grp.position.set(x, y, z);
  grp.rotation.y = rot;
  return { group: grp, height: 11.52, figure, mat };
}

/** 一段方形截面的堆叠体（石像的胸腹） */
function loftRock(levels) {
  const pos = [], uv = [], idx = [];
  const sect = [[-1, -0.6], [-0.6, -1], [0.6, -1], [1, -0.6], [1, 0.6], [0.6, 1], [-0.6, 1], [-1, 0.6]];
  const nv = sect.length;
  for (const lv of levels) {
    for (const [px, pz] of sect) {
      pos.push(lv.cx + px * lv.sx, lv.y, lv.cz + pz * lv.sz);
      uv.push(px * lv.sx / 2.4, lv.y / 2.4);
    }
  }
  for (let l = 0; l < levels.length - 1; l++) {
    for (let i = 0; i < nv; i++) {
      const j = (i + 1) % nv;
      const a = l * nv + i, b = l * nv + j, c = (l + 1) * nv + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const centre = pos.length / 3;
  const top = levels[levels.length - 1];
  pos.push(top.cx, top.y, top.cz);
  uv.push(0, 0);
  const last = (levels.length - 1) * nv;
  for (let i = 0; i < nv; i++) idx.push(centre, last + ((i + 1) % nv), last + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 一块圆鼓的巨石（大士岩） */
function blobRock(r, { amp = 0.24, squash = 0.86, seed = 1 } = {}) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position;
  const hash = (x, y, z) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 3.71) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const L = Math.hypot(x, y, z) || 1;
    const q = 2.6;
    const dx = Math.round((x / L) * q) / q, dy = Math.round((y / L) * q) / q, dz = Math.round((z / L) * q) / q;
    const k = 1 + (hash(dx, dy, dz) - 0.5) * 2 * amp;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ 索道 */

/**
 * 西站临湖、东站在环内，线翻过山脊。可考的是那两个数（约 1200 米 / 88 米），
 * 剖面与站址按观感写意。吊箱在绳上走——这一夜里唯一自己动的东西。
 */
function buildCableway() {
  const grp = new THREE.Group();
  grp.name = 'cableway';
  const wy = Math.max(terrainHeight(CABLE.west.x, CABLE.west.z), SHORE);
  const ey = Math.max(terrainHeight(CABLE.east.x, CABLE.east.z), 6);
  const crest = site({ u: 0.605, off: 0.0 });
  const deckW = wy + 1.2, deckE = ey + 1.2;
  const topY = crest.y + CABLE.riseMeters * 0.5;

  const pts = [
    new THREE.Vector3(CABLE.west.x, deckW + 7.5, CABLE.west.z),
    new THREE.Vector3((CABLE.west.x + crest.x) / 2, (deckW + topY) / 2 + 5, (CABLE.west.z + crest.z) / 2),
    new THREE.Vector3(crest.x, topY, crest.z),
    new THREE.Vector3((crest.x + CABLE.east.x) / 2, (topY + deckE) / 2 - 2, (crest.z + CABLE.east.z) / 2),
    new THREE.Vector3(CABLE.east.x, deckE + 6.5, CABLE.east.z),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);

  const ropeMat = lit('#2c333a', { rough: 0.6, metal: 0.5 });
  for (const s of [-0.35, 0.35]) {
    const tube = new THREE.TubeGeometry(curve, 88, 0.09, 5, false);
    tube.translate(s, 0, 0);
    const m = new THREE.Mesh(tube, ropeMat);
    m.name = 'cable-rope';
    grp.add(m);
  }

  const towers = [];
  for (const u of [0.22, 0.5, 0.78]) {
    const p = curve.getPoint(u);
    const g = terrainHeight(p.x, p.z);
    const h = Math.max(3.2, p.y - g + 2.4);
    const parts = [
      boxG(0.45, h, 0.45).translate(p.x, g + h / 2, p.z - 1.1),
      boxG(0.45, h, 0.45).translate(p.x, g + h / 2, p.z + 1.1),
      boxG(0.55, 0.5, 3.0).translate(p.x, g + h, p.z),
      boxG(0.28, 0.28, 2.6).translate(p.x, g + h * 0.55, p.z),
    ];
    const m = new THREE.Mesh(mergeGeometries(parts), M.steel);
    m.name = `cable-tower-${u}`;
    grp.add(m);
    towers.push({ x: p.x, z: p.z, top: g + h });
  }

  // 站房两处：水泥平顶，门口一盏
  const stations = [];
  for (const [sx, sz, sy, tag] of [[CABLE.west.x, CABLE.west.z, deckW, 'west'], [CABLE.east.x, CABLE.east.z, deckE, 'east']]) {
    const parts = [
      boxG(11, 4.2, 7).translate(sx, sy + 2.1, sz),
      boxG(12, 0.5, 8).translate(sx, sy + 4.4, sz),
    ];
    const m = new THREE.Mesh(mergeGeometries(parts), M.cement);
    m.name = `cable-station-${tag}`;
    grp.add(m);
    const glass = new THREE.Mesh(boxG(8.6, 1.7, 0.16).translate(sx, sy + 2.3, sz + 3.55), glow('#bcd8e6', 0.32));
    glass.name = 'cable-station-glass';
    grp.add(glass);
    stations.push({ x: sx, y: sy, z: sz, tag });
  }

  const N = CABLE.cabins;
  const bodyGeo = mergeGeometries([
    boxG(1.7, 1.9, 1.7).translate(0, -1.35, 0),
    boxG(1.95, 0.24, 1.95).translate(0, -0.42, 0),
    boxG(0.12, 0.9, 0.12).translate(0, -0.02, 0),
  ]);
  const bodies = new THREE.InstancedMesh(bodyGeo, lit('#242c35', { rough: 0.7, metal: 0.25 }), N);
  bodies.name = 'cable-cabins';
  const lamps = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.25, 1.05), glow('#ffd9a2', 1.4), N,
  );
  lamps.name = 'cable-cabin-lamps';
  lamps.renderOrder = 5;

  const d = new THREE.Object3D();
  const phase = [];
  for (let i = 0; i < N; i++) phase.push((i / N) * 0.9 + rand() * 0.03);
  const placeCabins = (t) => {
    for (let i = 0; i < N; i++) {
      const raw = (phase[i] + t * 0.011) % 1;
      const u = raw > 0.95 ? 1 - (raw - 0.95) / 0.05 * 0.9 : raw;
      const p = curve.getPoint(clamp01(u));
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      bodies.setMatrixAt(i, d.matrix);
      d.position.set(p.x, p.y - 1.35, p.z + 0.88);
      d.updateMatrix();
      lamps.setMatrixAt(i, d.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
  };
  placeCabins(0);
  grp.add(bodies, lamps);
  return { group: grp, curve, towers, stations, update: placeCabins, deckWest: deckW, deckEast: deckE, topY };
}

/* ------------------------------------------------------------------ 组装 */

export function buildArchitecture(scene) {
  for (const k of Object.keys(C)) C[k].length = 0;
  ANCHORS.eaves.length = 0;
  plaques.length = 0;
  interiorLights.length = 0;

  const group = new THREE.Group();
  group.name = 'architecture';
  const built = {};

  /* -------------------------------------------- 兴化禅寺与北魏大石佛 */
  const TEMPLE = site('temple');
  const tRot = faceDown(TEMPLE.gx, TEMPLE.gz);       // 面朝下坡（东）
  // 佛在坡上，台地就以佛足为顶：往东是砌出来的月台，往西是山本身
  const [budX, budZ] = at(TEMPLE.x, TEMPLE.z, tRot, 0, -13);
  const tTop = terrainHeight(budX, budZ) + 0.4;
  const [cxP, czP] = at(TEMPLE.x, TEMPLE.z, tRot, 0, 5);
  add('stone', put(boxG(44, 14, 50), cxP, tTop - 14, czP, tRot));
  add('stoneFloor', put(boxG(41, 0.22, 47), cxP, tTop + 0.02, czP, tRot));

  const bud = buildBuddha({ x: budX, y: tTop + 0.1, z: budZ, rot: tRot });
  group.add(bud.group);
  built.buddha = bud;
  built.buddhaMid = [budX, tTop + 6.6, budZ];        // 机位要仰看的胸口
  built.templeDeck = tTop;

  // 大殿三间，前檐开敞；佛在殿后，所以殿比佛略靠东
  const [hx, hz] = at(TEMPLE.x, TEMPLE.z, tRot, 0, -4);
  built.hall = hall({
    x: hx, z: hz, rot: tRot, bays: 3, bayW: 4.9, depth: 8.6, colH: 5.4,
    topY: tTop + 0.1, wall: 'temple', open: true, plinthH: 0.7, rise: 2.3,
    backWall: false,
  });
  built.hallFront = at(hx, hz, tRot, 0, built.hall.depth / 2 + 2.6);
  built.hallCenter = [hx, hz];
  // 佛的头与拱龛在殿脊之上：站到月台东头、山门内侧，视线才越过前檐
  built.buddhaStand = at(hx, hz, tRot, 3, built.hall.depth / 2 + 26);
  built.buddhaFace = [budX, tTop + 9.9, budZ];

  // 山门在台地东缘，院墙围住（门两侧留口）
  const [gx, gz] = at(cxP, czP, tRot, 0, 25);
  built.gate = gateHouse({ x: gx, z: gz, rot: tRot, topY: tTop, name: '兴化禅寺' });
  const W = 21, D2 = 24;
  wallRun([wallPt(cxP, czP, tRot, -W, D2, tTop), wallPt(cxP, czP, tRot, -6, D2, tTop)], { height: 3.4, key: 'temple' });
  wallRun([wallPt(cxP, czP, tRot, 6, D2, tTop), wallPt(cxP, czP, tRot, W, D2, tTop)], { height: 3.4, key: 'temple' });
  wallRun([wallPt(cxP, czP, tRot, -W, -D2, tTop), wallPt(cxP, czP, tRot, W, -D2, tTop)], { height: 3.4, key: 'temple' });
  for (const sx of [-1, 1]) {
    wallRun([
      wallPt(cxP, czP, tRot, sx * W, -D2, tTop),
      wallPt(cxP, czP, tRot, sx * W, D2, tTop),
    ], { height: 3.4, key: 'temple' });
  }

  // 钟鼓楼分列车前院两侧
  const [ltx, ltz] = at(cxP, czP, tRot, -11, 15);
  const lt = drumTower({ x: ltx, z: ltz, rot: tRot, topY: tTop, bell: true });
  const bell = lt.bell;
  bell.position.set(...lt.at);
  bell.name = 'iron-bell';
  group.add(bell);
  const [rtx, rtz] = at(cxP, czP, tRot, 11, 15);
  built.bellTower = lt;
  built.drumTower = drumTower({ x: rtx, z: rtz, rot: tRot, topY: tTop });

  // 院中：香炉与石幢
  const [ix, iz] = at(cxP, czP, tRot, 0, 8);
  add('bronze', put(boxG(2.0, 0.2, 2.0), ix, tTop, iz));
  add('bronze', put(new THREE.CylinderGeometry(0.8, 0.62, 1.0, 12), ix, tTop + 0.2, iz));
  const [sx3, sz3] = at(cxP, czP, tRot, -8, 6);
  add('stone', put(new THREE.CylinderGeometry(0.26, 0.32, 3.2, 10), sx3, tTop + 1.6, sz3));
  add('stone', put(boxG(0.9, 0.9, 0.9), sx3, tTop + 3.3, sz3));

  /* ---------------------------------------------- 祖堂与藏经楼（坡上） */
  for (const [k, lz] of [['zutang', -26], ['zangjing', -36]]) {
    const [px, pz] = at(TEMPLE.x, TEMPLE.z, tRot, 8, lz);
    const py = terrainHeight(px, pz) + 0.3;
    built[k] = hall({
      x: px, z: pz, rot: tRot, bays: 3, bayW: 3.6, depth: 5.4, colH: 3.3,
      topY: py, wall: 'plaster', open: false, plinthH: 0.5, rise: 1.3,
    });
  }

  /* -------------------------------------------------- 放鹤亭、泉、招鹤亭 */
  const P = site('pavilion');
  built.pavilion = longPavilion({ x: P.x, z: P.z, floorY: P.y + 0.12 });

  const SPR = site('spring');
  const springY = terrainHeight(SPR.x, SPR.z);
  add('stone', put(new THREE.TorusGeometry(2.5, 0.24, 6, 20).rotateX(HALF_PI), SPR.x, springY + 0.34, SPR.z));
  add('stone', put(new THREE.CylinderGeometry(2.78, 2.78, 0.55, 18), SPR.x, springY - 0.12, SPR.z));
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.42, 22).rotateX(-HALF_PI),
    lit('#0a141a', { rough: 0.14, metal: 0.66, emissive: '#0f1c26', ei: 0.34 }),
  );
  pool.position.set(SPR.x, springY + 0.2, SPR.z);
  pool.name = 'spring-water';
  group.add(pool);
  const stele = new THREE.Mesh(boxG(0.9, 1.7, 0.24), M.stone);
  stele.position.set(SPR.x + 3.1, springY + 0.9, SPR.z - 0.4);
  stele.rotation.y = -0.4;
  group.add(stele);
  built.spring = { x: SPR.x, y: springY, z: SPR.z, water: pool };

  const CALL = site('callpav');
  built.callpav = squarePavilion({
    x: CALL.x, z: CALL.z, rot: faceDown(CALL.gx, CALL.gz),
    floorY: terrainHeight(CALL.x, CALL.z) + 0.1, name: '招鹤亭',
  });

  /* ------------------------------------------------------------ 观景台 */
  const TR = site('terrace');
  const trY = terrainHeight(TR.x, TR.z);
  add('cement', put(new THREE.CylinderGeometry(9.2, 9.9, 1.2, 22), TR.x, trY - 1.1, TR.z));
  add('cement', put(new THREE.CylinderGeometry(9.4, 9.4, 0.18, 22), TR.x, trY + 0.06, TR.z));
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    if (Math.cos(a) < -0.5 && Math.abs(Math.sin(a)) < 0.55) continue;   // 正面留空
    add('steel', put(boxG(0.12, 1.05, 0.12), TR.x + Math.cos(a) * 9.0, trY + 0.68, TR.z + Math.sin(a) * 9.0));
  }
  add('steel', put(new THREE.TorusGeometry(9.0, 0.075, 5, 46).rotateX(HALF_PI), TR.x, trY + 1.2, TR.z));
  built.terrace = { x: TR.x, y: trY, z: TR.z, deck: trY + 0.15, radius: 9.2 };

  /* ------------------------------------------------------------ 大士岩 */
  const D = site('dashiyan');
  const dY = terrainHeight(D.x, D.z);
  const dRot = faceDown(D.gx, D.gz);
  const boulder = new THREE.Mesh(blobRock(7.0, { amp: 0.26, squash: 0.9, seed: 51 }), M.rockHill);
  boulder.position.set(D.x, dY + 2.4, D.z);
  boulder.name = 'dashiyan-rock';
  group.add(boulder);
  const guanyin = new THREE.Mesh(mergeGeometries([
    new THREE.SphereGeometry(0.86, 12, 9).translate(0, 3.7, 2.0),
    new THREE.CylinderGeometry(0.95, 1.5, 3.4, 12).translate(0, 1.6, 2.1),
    new THREE.CylinderGeometry(0.28, 0.32, 2.8, 8).rotateZ(0.5).translate(1.25, 2.6, 2.3),
  ]), lit('#9a9c96', { map: T.limestone({ meters: 2.0 }), rough: 0.86, emissive: '#151311', ei: 0.36 }));
  guanyin.position.set(D.x, dY - 0.4, D.z);
  guanyin.rotation.y = dRot;
  guanyin.name = 'guanyin';
  group.add(guanyin);
  const [dx2, dz2] = at(D.x, D.z, dRot, 0, 10);
  built.dashiHall = hall({
    x: dx2, z: dz2, rot: dRot, bays: 1, bayW: 6.4, depth: 4.8, colH: 3.5,
    topY: terrainHeight(dx2, dz2) + 0.3, wall: 'temple', open: true, plinthH: 0.5, rise: 1.5,
    backWall: false,
  });
  built.dashiFront = at(dx2, dz2, dRot, 0, built.dashiHall.depth / 2 + 3.2);
  built.guanyinMid = [D.x, dY + 2.8, D.z];

  /* -------------------------------------------------------- 云龙书院七进 */
  const AC = site('academy');
  const aRot = faceDown(AC.gx, AC.gz);
  const courts = [];
  for (let i = 0; i < 7; i++) {
    const [px, pz] = at(AC.x, AC.z, aRot, 0, -i * 12.5 - 5);
    const py = terrainHeight(px, pz) + 0.25;
    courts.push(hall({
      x: px, z: pz, rot: aRot, bays: i === 1 ? 3 : 2, bayW: 4.5 - i * 0.16,
      depth: 5.6 - i * 0.12, colH: 3.3 - i * 0.04, topY: py,
      wall: 'plaster', open: i < 3, plinthH: 0.5, rise: 1.2,
      name: i === 0 ? '云龙书院' : null,
    }));
    for (const sx of [-1, 1]) {
      const [wx, wz] = at(px, pz, aRot, sx * 6.8, 3);
      const [ex, ez] = at(px, pz, aRot, sx * 6.8, -8);
      wallRun([[wx, py, wz], [ex, py, ez]], { height: 2.8, thick: 0.5 });
    }
  }
  const [fx2, fz2] = at(AC.x, AC.z, aRot, 0, 9);
  add('stone', put(boxG(15, 0.34, 11), fx2, terrainHeight(fx2, fz2) - 0.12, fz2, aRot));
  built.academy = { courts, front: [fx2, fz2], rot: aRot };

  /* -------------------------------------------------------------- 索道 */
  const cable = buildCableway();
  group.add(cable.group);
  built.cable = cable;

  /* -------------------------------------------------------- 堤口小亭 */
  const cw = LAKE.causeway;
  built.lakeKiosk = squarePavilion({
    x: cw.xTo - 4, z: cw.z + 15, rot: 0.3, floorY: 1.72, half: 1.9,
  });

  /* -------------------------------------------------------- 合并同材质 */
  const KEY = {
    plaster: M.plaster, templeWall: M.templeWall, roof: M.roof, ridge: M.wallCap,
    timber: M.timber, dark: M.timberDark, stone: M.stone, stoneFloor: M.deck, gold: M.gold,
    floor: M.paving, rock: M.rockHill, bronze: M.bronze, cement: M.cement, glass: M.steel, steel: M.steel,
  };
  for (const [k, list] of Object.entries(C)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list);
    if (!merged) continue;
    const m = mesh(merged, KEY[k] || M.stone);
    m.receiveShadow = true;
    m.name = `arch-${k}`;
    group.add(m);
  }
  for (const p of plaques) group.add(p);
  for (const i of interiorLights) group.add(i);
  scene.add(group);

  return { group, anchors: ANCHORS, plaques, interiorLights, built };
}
