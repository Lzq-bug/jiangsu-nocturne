import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  tileNight: '#333b50',
  tileRidge: '#57627c',
  lacquerRed: '#7d211f',
  lacquerBright: '#a8332b',
  vermilion: '#b8412f',
  beam: '#4a2a1d',
  plaster: '#b3a78f',
  stone: '#7b808b',
  stoneDark: '#4b505c',
  gilt: '#d8ab63',
  ink: '#1b1e2a',
  water: '#08101f',
  lanternWarm: '#ffbe72',
  lanternRed: '#ff7a52',
  lanternJade: '#8ff0d2',
  lampGlow: '#ffd79b',
  // 淮安夜色：城砖青灰、官署朱褐、垂柳墨绿、漕灯暖橙
  brick: '#5c6272',
  brickDeep: '#3b4152',
  yamenRed: '#8a2f24',
  willowDark: '#2f4a37',
  willowMid: '#46663f',
  willowLite: '#6b8a52',
  creekGreen: '#2a4a44',
  lampGlow2: '#ffcf8a',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout so every reload shows the same night */
let seed = 20240921;
export function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
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
  // maps carry the hue here, so the base colour stays close to white — a dark
  // colour multiplied by a dark texture reads as black under night lighting
  M.roof = lit('#cdd4e2', { map: T.roofTiles('#2b3346', '#3f4a61', '#6b7a95'), rough: 0.8, side: THREE.DoubleSide, emissive: '#141b2a', ei: 0.66 });
  M.roofGrey = lit('#c3ccd8', { map: T.roofTiles('#242b3a', '#333d4f', '#556175'), rough: 0.84, side: THREE.DoubleSide, emissive: '#161c26', ei: 0.66 });
  M.ridge = lit(PAL.stoneDark, { map: T.stone('#6d7484'), rough: 0.7 });
  M.pillar = lit('#b04033', { map: T.wood('#8a2f24', '#4e1a11'), rough: 0.55 });
  M.beam = lit('#7a4630', { map: T.wood('#5c3524', '#351a11'), rough: 0.7 });
  M.gilt = lit(PAL.gilt, { rough: 0.32, metal: 0.85, emissive: '#3a2408', ei: 0.6 });
  M.wall = lit('#ded4bd', { map: T.plaster('#c9bda4'), rough: 0.95 });
  M.redWall = lit('#9d6a58', { map: T.plaster('#7d4a3e'), rough: 0.9 });
  M.stone = lit('#a8aeba', { map: T.stone('#8b919d'), rough: 0.9 });
  M.stoneDark = lit('#5a6070', { map: T.stone('#4e5563'), rough: 0.92 });
  M.stoneDressed = lit('#b9bfca', { map: T.stone('#9aa0ab'), rough: 0.88 });
  M.stoneDressed.map = M.stoneDressed.map.clone();
  M.stoneDressed.map.repeat.set(0.22, 0.16);
  M.stoneDressed.map.needsUpdate = true;
  // 城台：一砖一砖垒起来的青灰，收分面靠砖缝与下部的水痕立起来
  M.brick = lit('#c3c9d6', { map: T.brickCourse('#5c6272'), rough: 0.94 });
  M.brick.map.repeat.set(1.1, 0.9);
  M.brick.map.needsUpdate = true;
  M.brickDark = lit('#7c8496', { map: T.brickCourse('#3a404f'), rough: 0.96 });
  M.ink = lit('#2a2f3d', { rough: 0.8 });
  M.dark = lit('#141824', { rough: 0.9 });
  M.silk = lit('#d4705a', { rough: 0.6, side: THREE.DoubleSide });
  M.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0x9c7c54, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;
  M.woodDark = lit('#6b4a34', { map: T.wood('#41291d', '#231409'), rough: 0.82 });
  M.wupeng = lit('#3a3f4a', { rough: 0.5, metal: 0.06 });
  M.thatch = lit('#7c6b4a', { rough: 1 });
  M.stele = lit('#ccd2dd', { map: T.stone('#9aa1ae'), rough: 0.86 });
  // 垂柳：夜里不透光，绿色只在灯笼扫过梢头时才显出来。
  // 柳条是插片，必须真开 alphaTest，否则一棵树就是一叠不透明的黑纸。
  M.willowA = new THREE.MeshStandardMaterial({ color: rgb(PAL.willowDark), map: T.willowFrond('#3d5c41'), roughness: 0.98, side: THREE.DoubleSide, transparent: true, alphaTest: 0.34 });
  M.willowB = new THREE.MeshStandardMaterial({ color: rgb(PAL.willowMid), map: T.willowFrond('#4a6b45'), roughness: 0.96, side: THREE.DoubleSide, transparent: true, alphaTest: 0.34 });
  M.willowC = new THREE.MeshStandardMaterial({ color: rgb(PAL.willowLite), map: T.willowFrond('#6b8a52'), roughness: 0.94, side: THREE.DoubleSide, transparent: true, alphaTest: 0.34 });
  // 树冠的暗团：只挂柳条会像一把枯枝，得先有一团墨绿兜底
  M.willowMass = lit('#2b4032', { rough: 1, side: THREE.DoubleSide });
  M.bark = lit('#4a3a2c', { map: T.wood('#3a2b20', '#1d150f'), rough: 0.92 });
  // 更鼓：鼓心生皮，鼓腔朱漆泡钉
  M.drumHead = lit('#e6d6b4', { map: T.drumHead(), rough: 0.72, emissive: '#3a2a12', ei: 0.4, side: THREE.DoubleSide });
  M.drumShell = lit('#9d3a2c', { map: T.wood('#7d2a20', '#3d120c'), rough: 0.6 });
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
  const rows = profile(stations[0]).map(() => 0);
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
  void rows;
  return g;
}

export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** merge a list of [geometry, material] pairs into a single-mesh group-friendly form */
export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
}

/**
 * 更鼓腔 — a barrel drum shell: the profile bulges at the waist and the two ends
 * are open so the skins go on as separate meshes (they take their own material).
 */
export function drumGeo({ radius = 0.62, length = 1.5, seg = 26 } = {}) {
  const pts = [];
  const shape = [
    [0.86, -0.5], [0.95, -0.38], [1.0, -0.16], [1.02, 0.02], [1.0, 0.2], [0.95, 0.38], [0.86, 0.5],
  ];
  for (const [r, y] of shape) pts.push(new THREE.Vector2(r * radius, y * length));
  const parts = [new THREE.LatheGeometry(pts, seg)];
  // 两端鼓圈：压皮的金属箍
  for (const s of [-1, 1]) {
    const ring = new THREE.TorusGeometry(radius * 0.88, radius * 0.055, 6, seg);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, s * length * 0.5, 0);
    parts.push(ring);
  }
  return mergeGeometries(parts);
}

/** 鼓面：微微鼓起的皮面，接住灯与月光 */
export function drumHeadGeo(radius = 0.62, seg = 22) {
  const g = new THREE.SphereGeometry(radius * 3.4, seg, 8, 0, Math.PI * 2, 0, Math.asin(radius / (radius * 3.4)));
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, 0.55);
  return g;
}

