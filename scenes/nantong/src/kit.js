import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  brick: '#5c5f66',
  brickWarm: '#7c4c3b',
  plaster: '#9c9382',
  timber: '#362a22',
  tile: '#353b47',
  iron: '#6b3025',
  stone: '#8f9290',
  gold: '#e6c084',
  warm: '#ffd79b',
  cool: '#cfe6ff',
  jade: '#79e8d4',
  ink: '#10141f',
  water: '#04080f',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout — every reload shows the same night */
let seed = 19050731;
export function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + rand() * (b - a);
export const pick = (arr) => arr[(rand() * arr.length) | 0];

/* ------------------------------------------------------------------ materials */
const glowMats = new Map();
/** unlit HDR surface — everything that should feed the bloom pass */
export function glow(color, intensity = 1.6) {
  const key = `${color}-${intensity}`;
  if (!glowMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: rgb(color).multiplyScalar(intensity) });
    m.toneMapped = false; m.fog = false;
    glowMats.set(key, m);
  }
  return glowMats.get(key);
}

export function lit(color, { map = null, emissiveMap = null, rough = 0.85, metal = 0, emissive = 0x000000, ei = 1, side = THREE.FrontSide } = {}) {
  return new THREE.MeshStandardMaterial({
    color: rgb(color), map, emissiveMap, roughness: rough, metalness: metal,
    emissive: rgb(emissive), emissiveIntensity: ei, side,
  });
}

export const M = {};

export function initMaterials() {
  M.brick = lit('#6d6f76', { map: T.brick(), rough: 0.94 });
  M.brickWarm = lit('#6f4b3e', { map: T.brick('#6a4539', '#835d4b'), rough: 0.9 });
  M.plaster = lit('#a89e8c', { map: T.brick('#9c9382', '#b4ab99', { glaze: 0.55 }), rough: 0.92 });
  M.timber = lit('#42322a', { map: T.boards('#362a22', '#4d3c2f'), rough: 0.84 });
  M.lattice = lit('#2f2620', { rough: 0.8 });
  M.tile = lit('#3d4452', { map: T.roofTile(), rough: 0.86 });
  M.ironRoof = lit('#5f3026', { map: T.seamRoof(), rough: 0.5, metal: 0.36 });
  M.stone = lit('#8f9290', { map: T.ashlar(), rough: 0.9 });
  M.stoneDark = lit('#4d5158', { map: T.ashlar('#3f434a', '#525660'), rough: 0.92 });
  M.rock = lit('#666d74', { rough: 0.95 });   // 湖石在上照灯下最容易过曝成一块白豆腐
  M.paving = lit('#5a5f6b', { map: T.paving('#3c4250'), rough: 0.9 });
  M.gravel = lit('#494f5b', { map: T.paving('#333844', 2.4), rough: 0.98 });
  M.lawn = lit('#22301f', { rough: 0.98 });
  M.wood = lit('#4a382a', { map: T.boards(), rough: 0.86 });
  M.ironwork = lit('#1c2230', { rough: 0.45, metal: 0.7 });
  M.foliage = lit('#1b2a1e', { rough: 0.97 });
  M.foliageDark = lit('#131f16', { rough: 0.98 });
  M.bark = lit('#2a2119', { rough: 0.95 });
  M.vine = lit('#2c2a1c', { rough: 0.95 });

  // night glazing stays dark; a lit room is a separate material so the window
  // slider can scale emissive without touching every unlit pane
  M.glass = lit('#16202e', { rough: 0.22, metal: 0.5, emissive: '#0a1018', ei: 0.5 });
  M.litWindow = lit('#3a3630', { emissive: '#ffd9a6', ei: 1.0, rough: 0.35, metal: 0.2 });
  M.litCool = lit('#2f3a44', { emissive: '#cfe6ff', ei: 0.8, rough: 0.3, metal: 0.25 });
  M.showcase = lit('#2a2b30', { emissive: '#ffeccd', ei: 0.55, rough: 0.5 });

  const city = T.cityWindows({ warm: 0.78, density: 0.4 });
  M.city = lit('#5d6c81', { map: city, emissiveMap: city, rough: 0.6, metal: 0.35, emissive: '#ffffff', ei: 0.78 });
  const cityCool = T.cityWindows({ warm: 0.3, density: 0.34 });
  M.cityCool = lit('#556379', { map: cityCool, emissiveMap: cityCool, rough: 0.55, metal: 0.4, emissive: '#ffffff', ei: 0.7 });
  M.silhouette = lit('#0b1018', { rough: 0.9 });
  return M;
}

/* ------------------------------------------------------------------ boxes */

export function box(w, h, d, x = 0, yBottom = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, yBottom + h / 2, z);
  return g;
}

/**
 * Box with metre-scaled UVs instead of 0..1 per face, so one tiling brick or
 * ashlar texture keeps its course size wherever the face happens to be.
 * BoxGeometry group order is +x, -x, +y, -y, +z, -z with four verts each.
 */
export function boxM(w, h, d, x = 0, yBottom = 0, z = 0, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, yBottom + h / 2, z);
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = sizes[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * fu) / uvScale, (uv.getY(k) * fv) / uvScale);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function mesh(parts, material, name = '') {
  const g = Array.isArray(parts) ? mergeGeometries(parts.filter(Boolean)) : parts;
  const m = new THREE.Mesh(g, material);
  if (name) m.name = name;
  return m;
}

/* ------------------------------------------------------------------ polygons */

/**
 * Flat-shaded polygon soup: pass a list of polys (3+ verts each) and get a
 * non-indexed geometry with box-projected, metre-scaled UVs. Roofs, rock and
 * pavilion tops are all built this way because a crisp facet reads better at
 * night than a smoothed one.
 *
 * 每个三角都按正反两个绕序各发一次：屋脊、山花这类面片是手工点出来的，
 * 绕序一旦反了 FrontSide 就会把它整个吞掉，双向发一次就不用担心这个。
 */
export function poly(polys, uvScale = 1.2) {
  const pos = [], nor = [], uv = [];
  const tri = (a, b, c, flip) => {
    const [p, q2, r] = flip ? [a, c, b] : [a, b, c];
    const ux = q2[0] - p[0], uy = q2[1] - p[1], uz = q2[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    // dominant-axis projection keeps the texture scale honest on any facing
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const proj = ax > ay && ax > az ? (pt) => [pt[2] / uvScale, pt[1] / uvScale]
      : ay > az ? (pt) => [pt[0] / uvScale, pt[2] / uvScale]
        : (pt) => [pt[0] / uvScale, pt[1] / uvScale];
    for (const pt of [p, q2, r]) {
      pos.push(pt[0], pt[1], pt[2]);
      nor.push(nx, ny, nz);
      const [u2, v2] = proj(pt);
      uv.push(u2, v2);
    }
  };
  for (const pl of polys) {
    for (let i = 1; i + 1 < pl.length; i++) {
      tri(pl[0], pl[i], pl[i + 1], false);
      tri(pl[0], pl[i], pl[i + 1], true);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // 显式挂一个顺序 index：mergeGeometries 要求同批几何"都带索引"或"都不带"，
  // 而 boxM/cylinder 是索引几何 —— 面片不补 index 就会让整批合并失败返回 null
  const count = pos.length / 3;
  const idx = new Uint32Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** 三边或四边都行：少给一个点就退化成三角形，别把 undefined 塞进面片 */
const q = (a, b, c, d) => (d === undefined ? [a, b, c] : [a, b, c, d]);
const t3 = (a, b, c) => [a, b, c];

/**
 * Two-slope gable over a `w x d` footprint, ridge along X, with eave overhang,
 * a ridge tile and the fascia board you see from below.
 */
export function gableRoof(w, d, rise, x = 0, yEave = 0, z = 0, { overhang = 0.5, thick = 0.34, lift = 0 } = {}) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const y0 = -lift, y2 = rise;
  const polys = [
    // front / back slopes, with the under-eave thickness band
    q([-hw, y0, -hd], [0, y2, -hd], [0, y2, hd], [-hw, y0, hd]),
    q([0, y2, -hd], [hw, y0, -hd], [hw, y0, hd], [0, y2, hd]),
    q([-hw, y0 - thick, -hd], [0, y2 - thick, -hd], [0, y2, -hd], [-hw, y0, -hd]),
    q([0, y2 - thick, -hd], [hw, y0 - thick, -hd], [hw, y0, -hd], [0, y2, -hd]),
    q([-hw, y0 - thick, hd], [hw, y0 - thick, hd], [0, y2 - thick, hd], [0, y2, hd]).reverse(),
    // gable end triangles
    t3([-hw, y0, -hd], [hw, y0, -hd], [0, y2, -hd]),
    t3([hw, y0, hd], [-hw, y0, hd], [0, y2, hd]),
    // ridge cap
    q([-hw * 0.06 - 0.35, y2, -hd - 0.25], [hw * 0.06 + 0.35, y2, -hd - 0.25], [hw * 0.06 + 0.35, y2 + 0.3, hd + 0.25], [-hw * 0.06 - 0.35, y2 + 0.3, hd + 0.25]),
  ];
  const g = poly(polys);
  g.translate(x, yEave, z);
  return g;
}

/**
 * 歇山 roof: hipped skirt rising to a narrow gable on top, corners lifted.
 * `w` along X, `d` along Z.
 */
export function xieshanRoof(w, d, rise, x = 0, yEave = 0, z = 0, { overhang = 0.8, gableFrac = 0.5, lift = 0.6 } = {}) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const gw = hw * gableFrac;
  const iw = gw * 0.66, iz = hd * 0.6;
  const e = [
    [-hw, -lift, -hd], [hw, -lift, -hd], [hw, -lift, hd], [-hw, -lift, hd],
  ];
  const u = [
    [-iw, rise * 0.5, -iz], [iw, rise * 0.5, -iz], [iw, rise * 0.5, iz], [-iw, rise * 0.5, iz],
  ];
  const r = [
    [-gw, rise, -iz], [gw, rise, -iz], [gw, rise, iz], [-gw, rise, iz],
  ];
  const polys = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    polys.push(q(e[i], e[j], u[j], u[i]));
  }
  // long sides of the top gable block
  polys.push(q(u[0], u[1], r[1], r[0]));
  polys.push(q(u[3], r[3], r[2], u[2]));
  // the two gable triangles, capped by a short ridge
  polys.push(t3([r[0][0], rise, r[0][2]], [r[1][0], rise, r[1][2]], [-iw * 0.2, rise * 1.16, 0]));
  polys.push(t3([r[3][0], rise, r[3][2]], [-iw * 0.2, rise * 1.16, 0], [r[2][0], rise, r[2][2]]));
  // under-eave band
  const b = e.map(([px, py, pz]) => [px, py + lift * 1.2, pz]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    polys.push(q(e[i], b[j], b[i]));
    polys.push(q(e[i], e[j], b[j]));
  }
  const g = poly(polys);
  g.translate(x, yEave, z);
  return g;
}

/** 攒尖 pyramid roof for a square pavilion, with a fin stub */
export function pyramidalRoof(w, rise, x = 0, y = 0, z = 0, { overhang = 0.6, lift = 0.4 } = {}) {
  const hw = w / 2 + overhang;
  const c = [[-hw, -lift, -hw], [hw, -lift, -hw], [hw, -lift, hw], [-hw, -lift, hw]];
  const polys = [];
  for (let i = 0; i < 4; i++) polys.push(q(c[i], c[(i + 1) % 4], [0, rise, 0]));
  for (let i = 0; i < 4; i++) polys.push(q(c[i], [0, rise, 0], c[(i + 1) % 4]));
  const g = poly(polys);
  g.translate(x, y, z);
  return g;
}

/** a shed / 卷棚 half-barrel ridge running along X */
export function barrelRoof(w, d, rise, x = 0, y = 0, z = 0, { overhang = 0.5, seg = 6 } = {}) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const polys = [];
  let prev = [-hd, 0];
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const zc = -hd + 2 * hd * t;
    const yc = rise * Math.sin(Math.PI * Math.min(1, t * 1.04)) * 0.9 + (i === seg ? 0 : 0);
    polys.push(q([-hw, prev[1], prev[0]], [hw, prev[1], prev[0]], [hw, yc, zc], [-hw, yc, zc]));
    prev = [zc, yc];
  }
  const g = poly(polys);
  g.translate(x, y, z);
  return g;
}

/* ------------------------------------------------------------------ sections */

/** rounded rectangle in the XZ plane, half sizes 1 x 1, `corner` in 0..1 */
export function roundedSection(corner = 0.24, seg = 4) {
  const r = Math.min(0.95, Math.max(0, corner)), c = 1 - r;
  const pts = [];
  const add = (x, z) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - x) < 1e-6 && Math.abs(last[1] - z) < 1e-6) return;
    pts.push([x, z]);
  };
  const arc = (sx, sz, a0, a1) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      add(sx * c + r * Math.cos(a), sz * c + r * Math.sin(a));
    }
  };
  add(-c, -1);
  arc(1, -1, -Math.PI / 2, 0);
  arc(1, 1, 0, Math.PI / 2);
  arc(-1, 1, Math.PI / 2, Math.PI);
  arc(-1, -1, Math.PI, Math.PI * 1.5);
  if (pts.length > 1) pts.pop();
  return pts;
}

export function loft(levels, section, { uvScale = 1, capTop = true, capBottom = true } = {}) {
  const pos = [], uv = [], idx = [];
  const nv = section.length;
  for (const lv of levels) {
    for (const [px, pz] of section) {
      pos.push(lv.cx + px * lv.sx, lv.y, lv.cz + pz * lv.sz);
      uv.push((lv.cx + px * lv.sx) / uvScale, lv.y / uvScale);
    }
  }
  for (let l = 0; l < levels.length - 1; l++) {
    for (let i = 0; i < nv; i++) {
      const j = (i + 1) % nv;
      const a = l * nv + i, b = l * nv + j, c = (l + 1) * nv + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (l, flip) => {
    const centre = pos.length / 3;
    const lv = levels[l];
    pos.push(lv.cx, lv.y, lv.cz);
    uv.push(lv.cx / uvScale, lv.y / uvScale);
    for (let i = 0; i < nv; i++) {
      const a = l * nv + i, b = l * nv + ((i + 1) % nv);
      if (flip) idx.push(centre, b, a); else idx.push(centre, a, b);
    }
  };
  if (capBottom) cap(0, true);
  if (capTop) cap(levels.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------- near-camera occluders */
const occluders = [];
export function registerOccluder(obj, radius = 3.2, center = null) {
  const at = center || obj.position.clone();
  occluders.push({ obj, radius, at });
  return obj;
}
export function declutter(cameraPos) {
  for (const o of occluders) o.obj.visible = o.at.distanceTo(cameraPos) > o.radius;
}

export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const lerp = (a, b, t) => a + (b - a) * t;
