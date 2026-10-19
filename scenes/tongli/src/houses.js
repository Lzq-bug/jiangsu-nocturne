import * as THREE from 'three';
import { mergeAll, mesh, lit, rand, rr, meterBox, guanyinGable, nanCheck } from './kit.js';
import * as T from './textures.js';
import { ISLANDS, BANK, inReserve } from './data.js';
import { perimeterFrames, offsetPoly } from './land.js';
import { gabledRoof } from './roofs.js';

/**
 * 民居：镇子的主体。
 * 每一块地按"环"来铺——贴着沿河街一圈，往里再一圈两圈，直到这块地被填满。
 * 环与环之间留 12-14 米，正好是一进屋加一条火巷；屋里进深随机、面阔随机，
 * 于是从河上看过去是一条不断折动的檐线，而不是棋盘。
 *
 * 形制口径：江南民居通例——粉墙黛瓦、硬山举架、山墙作观音兜（苏南常见的那种
 * 圆头山尖，不是徽州的马头墙）、临水一面开门开窗、有的后檐挑到河上作水阁。
 * 这些都是按通例摆的写意，不对应任何一栋可核的老宅。
 */

const WIN_COLS = 4, WIN_ROWS = 2;
const SHEET = T.windowSheet();
const DOOR = T.doorSheet();

const WALL = lit('#b9c2c1', { map: T.plaster({ meters: 2.6, base: '#c2cbc8' }), rough: 0.95, side: THREE.DoubleSide });
const WALL_DARK = lit('#8f99a0', { map: T.plaster({ meters: 2.6, base: '#8a949b' }), rough: 0.96, side: THREE.DoubleSide });
const SILL = lit('#7c848a', { map: T.paving({ meters: 1.5, base: '#6f777d' }), rough: 0.92 });
const TILE = lit('#414f5f', { map: T.tiles({ meters: 1.15, base: '#333f4d' }), rough: 0.72, metal: 0.05, side: THREE.DoubleSide, emissive: '#18222e', ei: 0.32 });
const RIDGE = lit('#4d5768', { map: T.paving({ meters: 1.2, base: '#414b58' }), rough: 0.8 });
const TIMBER = lit('#33281f', { rough: 0.82, emissive: '#170f07', ei: 0.24 });
const WINDOW = lit('#2b2118', { map: SHEET, emissiveMap: SHEET, emissive: '#ffffff', ei: 0.86, rough: 0.7, side: THREE.DoubleSide });
const DOORFACE = lit('#241d16', { map: DOOR, rough: 0.85, side: THREE.DoubleSide, emissive: '#120c06', ei: 0.3 });

/* ------------------------------------------------------------------ 环上的取样 */

/** 沿闭合环的弧长 s 处取一个连续的位置与朝向（frames 是密采样） */
function ringAt(frames, s) {
  const total = frames.total;
  const t = ((s % total) + total) % total;
  let i = 0;
  for (let k = 1; k < frames.length; k++) {
    if (frames[k].s > t) { i = k - 1; break; }
    if (k === frames.length - 1) i = k;
  }
  const a = frames[i], b = frames[(i + 1) % frames.length];
  const segEnd = i + 1 === frames.length ? total : b.s;
  const span = segEnd - a.s || 1;
  const f = Math.max(0, Math.min(1, (t - a.s) / span));
  return {
    x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f,
    tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz,
  };
}

/** 环的取样点之间步长要够密，否则转角处朝向跳 */
const RING_STEP = 1.6;

/* ------------------------------------------------------------------ 一栋屋 */

/**
 * 一栋江南民居的几何。局部坐标：+X 顺着街、+Z 指向地里（背河）、原点在外檐线的中点，
 * y=0 是屋内地面。返回按材质分好组的几何片，调用方负责变换与合并。
 */
function houseParts({ w, d, floors = 1, h1 = 3.6, h2 = 3.2, porch = false, shed = false }) {
  const out = { wall: [], dark: [], sill: [], tile: [], ridge: [], timber: [], win: [], door: [] };
  const hw = w / 2, hd = d / 2;
  const totalH = h1 + (floors > 1 ? h2 : 0);

  /* ---- 墙体与石勒脚 */
  out.wall.push(meterBox(w, h1, d, 0, 0, 0));
  out.sill.push(meterBox(w + 0.24, 0.8, d + 0.24, 0, -0.16, 0));
  if (floors > 1) {
    // 二层稍收一点，檐口那道平座就是老街立面上的一条横线
    out.wall.push(meterBox(w - 0.5, h2, d - 0.3, 0, h1, 0.1));
    out.dark.push(meterBox(w + 0.42, 0.26, d + 0.42, 0, h1 - 0.22, 0));
  }

  /* ---- 屋顶：两坡硬山，前后出檐 */
  const eaveY = (floors > 1 ? h1 + h2 : h1) - 0.15;
  const rise = rr(1.15, 1.75) + (floors > 1 ? 0.25 : 0);
  const roof = gabledRoof({
    span: w + 1.15, depth: d + 1.0, rise, eaveY,
    lift: 0.3, cornerOut: 0.5, nu: 12, nv: 5,
  });
  out.tile.push(roof.surface);
  if (roof.ridge) out.ridge.push(roof.ridge);
  for (const sx of [-1, 1]) {
    const g = guanyinGable({ depth: d + 0.95, rise, baseY: eaveY - 0.25, eaveY: eaveY, head: rr(0.5, 0.95) });
    g.rotateY(Math.PI / 2);
    g.translate(sx * (w / 2 + 0.06), 0, 0);
    out.wall.push(g);
  }

  /* ---- 临河一面：窗、门、 occasional 檐廊 */
  const face = -hd - 0.04;
  const rows = floors > 1 ? [h1 * 0.52, h1 + h2 * 0.55] : [h1 * 0.55];
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r];
    const nWin = Math.max(1, Math.round(w / rr(2.6, 3.8)));
    for (let i = 0; i < nWin; i++) {
      if (r === 0 && i === Math.floor(nWin / 2) && w > 5.4) {
        // 正中一间是门
        out.door.push(doorQuad(1.15, 2.1, 0, 1.1, face - 0.03));
        continue;
      }
      if (rand() > 0.88) continue;
      const x = -hw + (w * (i + 0.5)) / nWin;
      const ww = rr(0.95, 1.45), wh = rr(0.85, 1.25);
      out.win.push(winQuad(ww, wh, 'front', x, face - 0.03, y));
      out.timber.push(meterBox(ww + 0.22, 0.16, 0.12, x, y - wh / 2 - 0.1, face - 0.05));
    }
  }
  // 山墙上也开一两扇
  for (const sx of [-1, 1]) {
    if (rand() > 0.5) continue;
    out.win.push(winQuad(rr(0.8, 1.1), rr(0.8, 1.1), sx > 0 ? 'x+' : 'x-',
      rr(-hd * 0.4, hd * 0.4), sx * (hw + 0.05), h1 * rr(0.45, 0.7)));
  }

  /* ---- 檐廊：河街上那一小条雨罩，柱子撑着 */
  if (porch) {
    const pw = 1.9;
    out.tile.push((() => {
      const g = gabledRoof({ span: w + 0.6, depth: pw * 2, rise: 0.5, eaveY: h1 * 0.86, lift: 0.1, cornerOut: 0.2, nu: 10, nv: 3, withRidge: false }).surface;
      g.translate(0, 0, -hd - pw * 0.55);
      return g;
    })());
    for (const cx of [-hw + 0.6, hw - 0.6]) {
      out.timber.push(meterBox(0.2, h1 * 0.82, 0.2, cx, 0, -hd - pw * 0.9));
    }
  }

  /* ---- 水阁：前檐挑到河上，下面几根石柱泡在水里 */
  if (shed) {
    const out0 = rr(2.2, 3.6);
    out.wall.push(meterBox(w * rr(0.6, 0.9), h1 * 0.8, out0, 0, 0.55, -(hd + out0 / 2)));
    out.tile.push((() => {
      const g = gabledRoof({ span: w, depth: out0 * 2, rise: 0.8, eaveY: h1 * 0.86, lift: 0.12, cornerOut: 0.2, nu: 10, nv: 3, withRidge: false }).surface;
      g.translate(0, 0, -(hd + out0 * 0.55));
      return g;
    })());
    for (const cx of [-w * 0.3, w * 0.3]) {
      out.dark.push(meterBox(0.42, 3.9, 0.42, cx, -2.6, -(hd + out0 * 0.78)));
    }
    out.win.push(winQuad(1.0, 0.9, 'front', rr(-w * 0.2, w * 0.2), -(hd + out0) - 0.06, h1 * 0.5));
  }

  return out;
}

/**
 * 一个窗面片。朝向 by 轴：'z' 朝外檐（-Z）、'zp' 朝内（+Z）、'x±' 朝两侧山墙。
 * UV 指到窗图上属于自己的那一格，全镇几百扇窗共用一次 draw call。
 */
function faceQuad(w, h, cell) {
  const g = new THREE.PlaneGeometry(w, h);
  const k = ((cell ?? (rand() * WIN_COLS * WIN_ROWS) | 0) % (WIN_COLS * WIN_ROWS) + WIN_COLS * WIN_ROWS) % (WIN_COLS * WIN_ROWS);
  const cx = k % WIN_COLS, cy = (k / WIN_COLS) | 0;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = (cx + uv.getX(i)) / WIN_COLS;
    const v = 1 - (cy + 1 - uv.getY(i)) / WIN_ROWS;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return g;
}

/** 立面上的一扇窗：axis 决定贴在哪一面墙，(a,b) 是该面上的位置 */
function winQuad(w, h, axis, a, b, y, cell) {
  const g = faceQuad(w, h, cell);
  if (axis === 'front') { g.rotateY(Math.PI); g.translate(a, y, b); }        // 临河一面
  else if (axis === 'back') g.translate(a, y, b);
  else if (axis === 'x+') { g.rotateY(Math.PI / 2); g.translate(b, y, a); }
  else { g.rotateY(-Math.PI / 2); g.translate(b, y, a); }
  return g;
}

/** 一扇门 */
function doorQuad(w, h, x, y, z) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI);
  g.translate(x, y, z);
  return g;
}

/* ------------------------------------------------------------------ 一块地 */

function layoutIsland(isl, bags, opts) {
  const poly = isl.poly;
  const box0 = (() => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { x0, x1, z0, z1 };
  })();

  // 地块的短边决定能铺几排：窄圩上再往里排就翻到对面去了
  const minHalf = Math.min(box0.x1 - box0.x0, box0.z1 - box0.z0) / 2;
  let ring = 0;
  let inset = 4.6;
  let budget = opts.perIsland;
  while (ring < 6 && budget > 0 && inset + 6 < minHalf) {
    const inner = offsetPoly(poly, inset);
    // 缩得太狠或者已经碎了就停
    let per = 0;
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (per < 34) break;
    const frames = perimeterFrames(inner, RING_STEP);
    const gap = rr(0.5, 0.9);
    let s = rand() * 7;
    while (s < frames.total && budget > 0) {
      const w = rr(4.6, 9.4);
      const d = rr(5.6, 10.5);
      const f = ringAt(frames, s + w / 2);
      s += w + gap;
      // 别让屋角戳出地块外面去（沿河街的那一圈要贴着街）
      const px = f.x + f.nx * (d / 2 - (ring === 0 ? 0.2 : 0));
      const pz = f.z + f.nz * (d / 2 - (ring === 0 ? 0.2 : 0));
      if (px < box0.x0 - 6 || px > box0.x1 + 6 || pz < box0.z0 - 6 || pz > box0.z1 + 6) continue;
      // 园子与四处大宅各占一方，民居不许压上去
      if (inReserve(px, pz, 2.4)) continue;
      budget--;
      placeHouse(bags, {
        x: px, z: pz, tx: f.tx, tz: f.tz, nx: f.nx, nz: f.nz,
        w, d,
        floors: ring === 0 ? (rand() > 0.58 ? 2 : 1) : (rand() > 0.8 ? 2 : 1),
        porch: ring === 0 && rand() > 0.72,
        shed: ring === 0 && rand() > 0.86,
      });
    }
    inset += rr(12.5, 15.5);
    ring++;
  }
}

function placeHouse(bags, p) {
  const floors = p.floors;
  const parts = houseParts({
    w: p.w, d: p.d, floors,
    h1: rr(3.35, 4.15), h2: rr(2.85, 3.45),
    porch: p.porch, shed: p.shed,
  });
  // 局部 +X 顺街、+Z 指向地里
  const m = new THREE.Matrix4();
  const xAxis = new THREE.Vector3(p.tx, 0, p.tz);
  let zAxis = new THREE.Vector3(-p.tz, 0, p.tx);
  const inward = new THREE.Vector3(p.nx, 0, p.nz);
  if (zAxis.dot(inward) < 0) { xAxis.negate(); zAxis.negate(); }
  m.makeBasis(xAxis, new THREE.Vector3(0, 1, 0), zAxis);
  m.setPosition(p.x, BANK + 0.04, p.z);

  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) {
      g.applyMatrix4(m);
      nanCheck(g, key === 'wall' ? WALL : TILE);
      bags[key].push(g);
    }
  }
  bags.houses++;
  // 沿河的窗与门要往水里落一份光：记下图腾，交给 props.js 去点灯柱
  if (p.shed || p.porch) bags.frontLights.push([p.x - p.nx * (p.d / 2 + 0.4), p.z - p.nz * (p.d / 2 + 0.4)]);
}

/* ------------------------------------------------------------------ 主入口 */

export function buildHouses(scene, { perIsland = 74 } = {}) {
  const bags = {
    wall: [], dark: [], sill: [], tile: [], ridge: [], timber: [], win: [], door: [],
    houses: 0, frontLights: [],
  };
  for (const isl of ISLANDS) layoutIsland(isl, bags, { perIsland });

  const g = new THREE.Group();
  g.name = 'houses';
  const add = (key, material, name) => {
    if (!bags[key].length) return null;
    const merged = mergeAll(bags[key]);
    if (!merged) return null;
    const m = mesh(merged, material);
    m.name = name;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  add('wall', WALL, 'house-walls');
  add('dark', WALL_DARK, 'house-dark');
  add('sill', SILL, 'house-sill');
  add('tile', TILE, 'house-tiles');
  add('ridge', RIDGE, 'house-ridges');
  add('timber', TIMBER, 'house-timber');
  const winMesh = add('win', WINDOW, 'house-windows');
  winMesh.renderOrder = 2;
  add('door', DOORFACE, 'house-doors');

  scene.add(g);
  return {
    group: g, windows: winMesh, count: bags.houses,
    frontLights: bags.frontLights,
    /** 窗灯总量：夜里家家点灯与只点几盏，是这一景的两个档位 */
    setWindow(v) {
      WINDOW.emissiveIntensity = 0.15 + 1.05 * v;
      DOORFACE.emissiveIntensity = 0.06 + 0.3 * v;
    },
    materials: { WALL, WALL_DARK, TILE, WINDOW, DOORFACE },
  };
}

/** 园墙与镇内几处大宅的黄泥墙：单独一种面，免得和民居混成一片 */
export function wallMaterial() {
  return lit('#a8aca4', { map: T.plaster({ meters: 2.2, base: '#adb2aa' }), rough: 0.95, side: THREE.DoubleSide });
}

