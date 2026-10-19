import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  // 夜色：长江上的青黑与大江尽头的冷蓝
  ink: '#040810',
  night: '#08111c',
  star: '#d3e4ff',
  // 金山寺灯火：塔灯金、殿灯暖、山门朱
  towerGold: '#ffd76a',
  lanternWarm: '#ffbe72',
  vermilion: '#8e2f24',
  wallYellow: '#d7bd8b',
  // 江上的冷光：对岸钠灯与船灯
  quay: '#ff9a5e',
  deckCold: '#9fd8ff',
  // 构筑物
  brick: '#8d7d66',
  brickDark: '#4c4436',
  stone: '#b6bcc6',
  stoneDark: '#5a606c',
  gilt: '#d8ab63',
  bronze: '#8a6d3b',
  bronzeDark: '#4e3d1e',
  wood: '#6b2a20',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout so every reload shows the same night */
let seed = 11201045;
export function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15) | 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7) | 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + rand() * (b - a);

/* ------------------------------------------------------------------ materials */
const glowMats = new Map();
/** unlit HDR surface used for everything that should feed the bloom pass */
export function glow(color, intensity = 1.6) {
  const key = `${color}-${intensity}`;
  if (!glowMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: rgb(color).multiplyScalar(intensity) });
    m.toneMapped = false; m.fog = false;
    glowMats.set(key, m);
  }
  return glowMats.get(key);
}

export function lit(color, { map = null, rough = 0.85, metal = 0, emissive = 0x000000, ei = 1, side = THREE.FrontSide } = {}) {
  return new THREE.MeshStandardMaterial({
    color: rgb(color), map, roughness: rough, metalness: metal,
    emissive: rgb(emissive), emissiveIntensity: ei, side,
  });
}

export const M = {};
export function initMaterials() {
  // 贴图带色时基色贴近白：暗色 × 暗贴图在夜景灯光下会直接糊成黑
  M.gilt = lit(PAL.gilt, { rough: 0.32, metal: 0.85, emissive: '#3a2408', ei: 0.6 });
  M.bronze = lit(PAL.bronze, { rough: 0.34, metal: 0.9, emissive: '#241a06', ei: 0.55 });
  M.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0xa07f52, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;
  // 殿宇灰瓦与塔的砖色檐瓦：金山寺是寺裹山，屋瓦一层压一层，夜里全靠这一色读体量
  M.roofTemple = lit('#d5cbb6', { map: T.roofTiles('#312c26', '#4a4238', '#7d7361'), rough: 0.8, side: THREE.DoubleSide, emissive: '#16130f', ei: 0.5 });
  M.roofTower = lit('#cbbfa8', { map: T.roofTiles('#2c2a2c', '#453f40', '#786d68'), rough: 0.82, side: THREE.DoubleSide, emissive: '#141212', ei: 0.5 });
  // 慈寿塔的青砖与寺墙的黄粉
  M.brick = lit('#cfc4ae', { map: T.brickWall('#6d6455', '#3b3630', '#9a8f7a'), rough: 0.94, emissive: '#1a1611', ei: 0.5 });
  M.wall = lit('#e3d3ae', { map: T.plaster('#cbb689'), rough: 0.94, emissive: '#20190d', ei: 0.5 });
  M.vermilion = lit('#c7adaa', { map: T.wood('#7a2b21', '#3f120c'), rough: 0.72, emissive: '#1c0806', ei: 0.5 });
  M.marble = lit('#dfe3ea', { map: T.stone('#c3c9d2'), rough: 0.86, emissive: '#191d24', ei: 0.45 });
  return M;
}

/* ------------------------------------------------------------------ geometry */

/**
 * Parametric Chinese roof. Profile is concave (反曲) and the corners lift (起翘).
 * Origin sits at the eave line, ridge rises to +height.
 */
export function chineseRoof({
  width, depth, height,
  ridgeRatio = 0.42, curve = 0.62, eaveLift = 0.5,
  overhang = 0.5, segU = 26, segV = 18, hip = true,
} = {}) {
  const hw = width / 2 + overhang, hd = depth / 2 + overhang;
  const rx = hip ? (width / 2) * ridgeRatio : hw;
  const dxs = Math.max(0.0001, hw - rx);
  const pos = [], uv = [], idx = [];
  const nu = segU, nv = segV;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const x = -hw + (2 * hw * i) / nu;
      const z = -hd + (2 * hd * j) / nv;
      const dzN = Math.abs(z) / hd;
      const dxN = Math.max(0, Math.abs(x) - rx) / dxs;
      // max() puts the crease exactly on the hip line, which is what a 庑殿 roof is;
      // summing them instead flattens the whole slope once the roof gets elongated
      const t = Math.min(1, Math.max(dzN, dxN));
      const s = t * (1 - curve) + Math.sqrt(t) * curve;
      let y = height * (1 - s);
      // corner upturn along the hip, plus a shallow eave kick
      const corner = Math.pow(dzN, 2.6) * Math.pow(Math.min(1, dxN * 1.35), 1.5);
      y += height * eaveLift * 0.35 * corner + height * 0.09 * Math.pow(dzN, 5);
      pos.push(x, y, z);
      uv.push(x / 6.1, t * 1.5 + dxN * 0.4);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** ridge beam + end ornaments, matching a chineseRoof footprint */
export function ridgeOrnament({ width, depth, height, ridgeRatio = 0.42, overhang = 0.5 }) {
  const parts = [];
  const hw = width / 2 + overhang;
  const rx = (width / 2) * ridgeRatio;
  const bar = new THREE.BoxGeometry(rx * 2 + 0.5, 0.34, 0.42);
  bar.translate(0, height + 0.14, 0);
  parts.push(bar);
  for (const s of [-1, 1]) {
    const endCap = new THREE.BoxGeometry(0.5, 0.9, 0.6);
    endCap.translate(s * (rx + 0.3), height + 0.4, 0);
    parts.push(endCap);
    // 鸱吻
    const horn = new THREE.CylinderGeometry(0.09, 0.3, 1.15, 6, 1, false, 0, Math.PI);
    horn.rotateX(Math.PI / 2);
    horn.rotateZ(s * -0.5);
    horn.translate(s * (rx + 0.34), height + 1.0, 0);
    parts.push(horn);
  }
  return mergeGeometries(parts);
}

export function pillarGeo(height, radius, base = true) {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(radius * 0.88, radius, height, 12, 1);
  shaft.translate(0, height / 2, 0);
  parts.push(shaft);
  if (base) {
    const drum = new THREE.CylinderGeometry(radius * 1.45, radius * 1.6, radius * 1.1, 14);
    drum.translate(0, radius * 0.5, 0);
    parts.push(drum);
    const ring = new THREE.TorusGeometry(radius * 1.5, radius * 0.16, 6, 16);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, radius * 1.05, 0);
    parts.push(ring);
  }
  return mergeGeometries(parts);
}

/** 栏杆: ground sill + hand rail + posts, running along +X */
export function railingGeo(length, { height = 1.05, spacing = 1.6, rail = true } = {}) {
  const parts = [];
  const sill = new THREE.BoxGeometry(length, height * 0.42, 0.22);
  sill.translate(0, height * 0.21, 0);
  parts.push(sill);
  if (rail) {
    const top = new THREE.BoxGeometry(length, 0.12, 0.3);
    top.translate(0, height, 0);
    parts.push(top);
    const mid = new THREE.BoxGeometry(length, 0.07, 0.16);
    mid.translate(0, height * 0.72, 0);
    parts.push(mid);
  }
  const n = Math.max(2, Math.round(length / spacing));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (length * i) / n;
    const post = new THREE.BoxGeometry(0.15, height + 0.22, 0.15);
    post.translate(x, (height + 0.22) / 2, 0);
    parts.push(post);
    const cap = new THREE.CylinderGeometry(0.11, 0.13, 0.18, 8);
    cap.translate(x, height + 0.3, 0);
    parts.push(cap);
  }
  return mergeGeometries(parts);
}

/** simple dougong block stack under an eave */
export function bracketGeo(scale = 1) {
  const parts = [];
  const tiers = [[1.0, 0.26, 0.24], [0.72, 0.22, 0.3], [0.46, 0.2, 0.34]];
  let y = 0;
  for (const [w, h, d] of tiers) {
    const b = new THREE.BoxGeometry(w * scale, h * scale, d * scale);
    b.translate(0, y + (h * scale) / 2, 0);
    parts.push(b);
    y += h * scale;
  }
  return mergeGeometries(parts);
}

/** 须弥座: a temple terrace with a moulded upper course */
export function terraceGeo({ width, depth, height, rebate = 0.9 }) {
  const parts = [];
  const lower = new THREE.BoxGeometry(width, height * 0.62, depth);
  lower.translate(0, height * 0.31, 0);
  parts.push(lower);
  const upper = new THREE.BoxGeometry(width - rebate, height * 0.38, depth - rebate);
  upper.translate(0, height * 0.81, 0);
  parts.push(upper);
  const cap = new THREE.BoxGeometry(width + 0.5, 0.18, depth + 0.5);
  cap.translate(0, height + 0.09, 0);
  parts.push(cap);
  return mergeGeometries(parts);
}

/** 石阶 — a flight of steps climbing along +Z, tread count derived from the rise */
export function stairsGeo(width, rise, run, treads = 24) {
  const parts = [];
  for (let i = 0; i < treads; i++) {
    const f = i / treads;
    const h = rise / treads;
    parts.push(new THREE.BoxGeometry(width, h, run / treads)
      .translate(0, h * (i + 0.5), run * (1 - f) - run / treads / 2));
    parts.push(new THREE.BoxGeometry(width * 0.34, h * 0.55, 0.16)
      .translate(0, h * i + h * 0.28, run * (1 - f)));
  }
  return mergeGeometries(parts);
}

/**
 * 券墙 — a wall face with an arched opening left empty, so the dark interior
 * reads through it. Returns geometry parts for the two jambs, the lintel above
 * the spring line, and the half-ring that dresses the arch head.
 */
export function archFacade({ width, height, depth, openW, openH }) {
  const r = openW / 2;
  const jambW = Math.max(0.3, (width - openW) / 2);
  const straight = Math.max(0.3, openH - r);
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(jambW, height, depth, s * (openW / 2 + jambW / 2), height / 2, 0));
  }
  parts.push(box(width, height - straight - r, depth, 0, height - (height - straight - r) / 2, 0));
  const ring = new THREE.TorusGeometry(r + 0.16, 0.16, 6, 16, Math.PI);
  ring.translate(0, straight, 0);
  parts.push(ring);
  const sill = box(openW, 0.24, depth + 0.2, 0, 0.12, 0);
  parts.push(sill);
  return parts;
}

/** paper lantern: a ribbed ellipsoid with a warm core */
export function lanternGeo(rx = 0.3, ry = 0.4) {
  const g = new THREE.SphereGeometry(rx, 12, 9);
  g.scale(1, ry / rx, 1);
  return g;
}

export function plaqueMesh(text, w, h, opts) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.MeshBasicMaterial({ map: T.plaque(text, opts), toneMapped: false });
  const mesh = new THREE.Mesh(g, m);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h * 1.12, 0.1), M.gilt);
  frame.position.z = -0.06;
  const grp = new THREE.Group();
  grp.add(frame, mesh);
  mesh.position.z = 0.03;
  return grp;
}

/** points along a hanging catenary between two world points */
export function stringPath(from, to, sag = 1.4, segments = 24) {
  const pts = [];
  const v = new THREE.Vector3().subVectors(to, from);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().copy(from).addScaledVector(v, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return pts;
}

export function figureGeo(scale = 1) {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.16 * scale, 0.24 * scale, 1.05 * scale, 7);
  body.translate(0, 0.62 * scale, 0);
  parts.push(body);
  const head = new THREE.SphereGeometry(0.15 * scale, 8, 6);
  head.translate(0, 1.28 * scale, 0);
  parts.push(head);
  const arm = new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 0.62 * scale, 5);
  arm.rotateZ(0.25);
  arm.translate(0.26 * scale, 0.85 * scale, 0);
  parts.push(arm);
  return mergeGeometries(parts);
}

/** lofted hull: profile(z) -> array of [x,y] points, sampled along length */
export function loftHull(profile, stations, closed = true) {
  const pos = [], uv = [], idx = [];
  const nv = profile(0).length;
  for (let s = 0; s < stations.length; s++) {
    const z = stations[s];
    const prof = profile(z);
    for (let i = 0; i < prof.length; i++) {
      pos.push(prof[i][0], prof[i][1], z);
      uv.push(i / (prof.length - 1), s / (stations.length - 1));
    }
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < nv - 1; i++) {
      const a = s * nv + i, b = a + 1, c = a + nv, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (closed) {
    for (let i = 0; i < nv - 1; i++) {
      const a = (stations.length - 1) * nv + i, b = a + 1, c = i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/* --------------------------------------------------- near-camera occluders */
const occluders = [];
/**
 * Objects that must never fill the frame when the viewer walks up to them.
 * `center` is needed for meshes whose geometry was baked at the site (position
 * stays at the origin), otherwise the object's own position is used.
 */
export function registerOccluder(obj, radius = 3.2, center = null) {
  const at = center || obj.position.clone();
  occluders.push({ obj, radius, at });
  return obj;
}
export function declutter(cameraPos) {
  for (const o of occluders) o.obj.visible = o.at.distanceTo(cameraPos) > o.radius;
}

/** merge a list of [geometry, material] pairs into a single-mesh group-friendly form */
export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
}

/**
 * 风铎 — the small bell hung from a pagoda eave: a flared cup on a rivet,
 * with a 舌 inside so the mouth reads as a wall rather than a flat disc.
 */
export function windBellGeo({ height = 0.6, radius = 0.24 } = {}) {
  const parts = [];
  const cup = new THREE.CylinderGeometry(radius * 0.42, radius, height, 9, 1, true);
  cup.translate(0, height / 2, 0);
  parts.push(cup);
  const crown = new THREE.SphereGeometry(radius * 0.46, 9, 6);
  crown.scale(1, 0.7, 1);
  crown.translate(0, height, 0);
  parts.push(crown);
  const rim = new THREE.TorusGeometry(radius * 0.98, radius * 0.09, 5, 12);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, height * 0.04, 0);
  parts.push(rim);
  const tongue = new THREE.CylinderGeometry(radius * 0.08, radius * 0.16, height * 0.7, 6);
  tongue.translate(0, height * 0.3, 0);
  parts.push(tongue);
  return mergeGeometries(parts);
}
