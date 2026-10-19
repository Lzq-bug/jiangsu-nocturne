import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

/**
 * 安丰色牌：夜里的海是青的，盐是白的，灶火是橙的，堤土是枯黄的。
 * 一个场景只改这一处，其余模块都从这里取色。
 */
export const PAL = {
  tileNight: '#333c50',
  tileRidge: '#565f78',
  lacquerRed: '#7d211f',
  vermilion: '#b8412f',
  beam: '#4a2a1d',
  plaster: '#b3a78f',
  brick: '#6f7488',
  stone: '#7b808b',
  stoneDark: '#4b505c',
  gilt: '#d8ab63',
  ink: '#141a26',
  water: '#071120',
  sea: '#0a1a2a',
  lanternWarm: '#ffbe72',
  lanternRed: '#ff7a52',
  lampGlow: '#ffd79b',
  // 盐与潮
  salt: '#dfe7ea',
  brine: '#7f93a6',
  dikeEarth: '#4a4534',
  dikeGrass: '#5c6142',
  seaRock: '#77808e',
  // 灶火
  ember: '#ff8a3c',
  emberDeep: '#c2481f',
  flame: '#ffd39a',
  smoke: '#9aa3ad',
  reed: '#b6ab7c',
  reedDark: '#5e5a3c',
  willow: '#3d5642',
  sail: '#c8b189',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout so every reload shows the same night */
let seed = 20261014;
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
  M.roof = lit('#8f99ad', { map: T.roofTiles('#1b212c', '#2f3846', '#66758f'), rough: 0.78, side: THREE.DoubleSide, emissive: '#1e2a3d', ei: 0.9 });
  M.roofDark = lit('#9aa4b6', { map: T.roofTiles('#171d27', '#28303d', '#57657f'), rough: 0.84, side: THREE.DoubleSide, emissive: '#18223a', ei: 0.8 });
  M.thatch = lit('#c8b78d', { map: T.thatchRoof('#4a4231'), rough: 0.98, side: THREE.DoubleSide, emissive: '#161309', ei: 0.42 });
  M.ridge = lit(PAL.stoneDark, { map: T.stone('#6d7484'), rough: 0.7 });
  M.pillar = lit('#a34a38', { map: T.wood('#7f2f24', '#4b1810'), rough: 0.58 });
  M.beam = lit('#7a4630', { map: T.wood('#5c3524', '#351a11'), rough: 0.7 });
  M.woodDark = lit('#7d5a41', { map: T.wood('#4a2f21', '#2a1a10'), rough: 0.82, emissive: '#120b06', ei: 0.5 });
  M.mat = lit('#bda97e', { map: T.matWeave('#4a3f2b'), rough: 0.92, side: THREE.DoubleSide });
  M.sail = lit(PAL.sail, { map: T.matWeave('#6b5a3a'), rough: 0.88, side: THREE.DoubleSide });
  M.gilt = lit(PAL.gilt, { rough: 0.32, metal: 0.85, emissive: '#3a2408', ei: 0.6 });
  M.wall = lit('#a89e88', { map: T.plaster('#9a9078'), rough: 0.95 });
  M.redWall = lit('#c0554a', { map: T.plaster('#b04a3a'), rough: 0.8 });
  M.brick = lit('#7d8290', { map: T.stone('#545a68'), rough: 0.9 });
  M.brickDark = lit('#7e8492', { map: T.stone('#4e5563'), rough: 0.92 });
  M.stone = lit('#8d93a0', { map: T.stone('#71788a'), rough: 0.9 });
  M.stoneDark = lit('#5a6070', { map: T.stone('#4e5563'), rough: 0.92 });
  M.stoneDressed = lit('#b9bfca', { map: T.stone('#9aa0ab'), rough: 0.88 });
  M.stoneDressed.map = M.stoneDressed.map.clone();
  M.stoneDressed.map.repeat.set(0.22, 0.16);
  M.stoneDressed.map.needsUpdate = true;
  M.flag = lit('#949cab', { map: T.flagstone('#4c525d'), rough: 0.82 });
  M.rock = lit('#b6bdca', { map: T.seaRock(), rough: 0.94 });
  M.earth = lit('#6d6a58', { map: T.dikeEarth(), rough: 0.99, side: THREE.DoubleSide });
  // 长堤是一条 430 m 的带子，贴图不按比例重铺就会被拉成一片糊
  M.earth.map = M.earth.map.clone();
  M.earth.map.repeat.set(3, 150);
  M.earth.map.needsUpdate = true;
  M.grass = lit('#8f9a72', { map: T.dikeEarth(), rough: 1, side: THREE.DoubleSide });
  M.salt = lit(PAL.salt, { map: T.saltCrust(), rough: 0.62, metal: 0.04, emissive: '#2a3440', ei: 0.4 });
  M.brine = lit('#31404c', { rough: 0.28, metal: 0.12, emissive: '#0d1a22', ei: 0.5 });
  M.ink = lit('#2a2f3d', { rough: 0.8 });
  M.dark = lit('#141824', { rough: 0.9 });
  M.silk = lit('#d4705a', { rough: 0.6, side: THREE.DoubleSide });
  M.leaf = lit('#2b4032', { rough: 0.96, side: THREE.DoubleSide });
  M.reed = lit(PAL.reed, { map: T.reedPlume(), rough: 0.98, side: THREE.DoubleSide, transparent: true });
  M.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0x5c4630, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;
  M.ember = lit(PAL.ember, { rough: 0.7, emissive: PAL.ember, ei: 2.2 });
  M.stele = lit('#ccd2dd', { map: T.stone('#9aa1ae'), rough: 0.86 });
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
    const horn = new THREE.CylinderGeometry(0.09, 0.3, 1.15, 6, 1, false, 0, Math.PI);
    horn.rotateX(Math.PI / 2);
    horn.rotateZ(s * -0.5);
    horn.translate(s * (rx + 0.34), height + 1.0, 0);
    parts.push(horn);
  }
  return mergeGeometries(parts);
}

/** 硬山山墙：随屋顶反曲收分的梯形墀头，苏北民居最认得出的轮廓 */
export function gableWallGeo({ width, wallHeight, roofRise, thickness = 0.42, step = 5 } = {}) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  shape.moveTo(-hw, 0);
  shape.lineTo(-hw, wallHeight);
  // 阶梯落下的博风：分成几级，比一条斜线更像砌出来的山墙
  for (let i = 1; i <= step; i++) {
    const t = i / step;
    const x = -hw + width * t;
    const y = wallHeight + roofRise * (1 - Math.pow(2 * t - 1, 2)) * (1 - 0.06 * i);
    shape.lineTo(x, y);
    if (i < step) shape.lineTo(x, y - roofRise * 0.08);
  }
  shape.lineTo(hw, wallHeight);
  shape.lineTo(hw, 0);
  shape.lineTo(-hw, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return g;
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

/** 石碑：方趺 + 碑身 + 碑首，正面贴 steleFace 的贴图 */
export function steleMesh({ width = 1.1, height = 3.0, depth = 0.28, face = null } = {}) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(boxGeo(width * 1.5, height * 0.16, depth * 2.1, 0, height * 0.08, 0), M.stone);
  const body = new THREE.Mesh(boxGeo(width, height * 0.86, depth, 0, height * (0.16 + 0.43), 0), M.stele);
  const cap = new THREE.Mesh(boxGeo(width * 1.12, height * 0.09, depth * 1.2, 0, height * 0.985, 0), M.stone);
  grp.add(base, body, cap);
  if (face) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.86, height * 0.7),
      new THREE.MeshBasicMaterial({ map: face, toneMapped: false, transparent: false }),
    );
    plate.material.color.setRGB(0.62, 0.66, 0.72);
    plate.position.set(0, height * 0.56, depth / 2 + 0.012);
    grp.add(plate);
  }
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

/** 担挑：一人 + 前后可倾的扁担，灶丁与脚夫用 */
export function porterGeo(scale = 1) {
  const parts = [figureGeo(scale)];
  const pole = new THREE.CylinderGeometry(0.045 * scale, 0.045 * scale, 1.7 * scale, 5);
  pole.rotateZ(Math.PI / 2);
  pole.translate(0, 1.42 * scale, 0);
  parts.push(pole);
  for (const s of [-1, 1]) {
    const basket = new THREE.CylinderGeometry(0.26 * scale, 0.2 * scale, 0.3 * scale, 9);
    basket.translate(s * 0.78 * scale, 1.18 * scale, 0);
    parts.push(basket);
  }
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

export function boxGeo(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** 堆状物：盐坨、卤泥堆、柴堆共用一条圆滑的钟形回转轮廓 */
export function moundGeo({ radius = 3, height = 2.2, seg = 22 } = {}) {
  const profile = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    profile.push(new THREE.Vector2(radius * Math.cos(t * Math.PI * 0.5), height * Math.sin(t * Math.PI * 0.5)));
  }
  return new THREE.LatheGeometry(profile, seg);
}

/* --------------------------------------------------- near-camera occluders */
const occluders = [];
/**
 * Objects that must never fill the frame when the viewer walks up to them.
 * `center` is needed for meshes whose geometry was baked at the site (position
 * stays at the origin), otherwise the object's own position is used.
 */
/** center 省略时按物体当前世界坐标算——灯柱这类是先登记后摆位的 */
export function registerOccluder(obj, radius = 3.2, center = null) {
  occluders.push({ obj, radius, at: center });
  return obj;
}
const _oc = new THREE.Vector3();
export function declutter(cameraPos) {
  for (const o of occluders) {
    const at = o.at || o.obj.getWorldPosition(_oc);
    o.obj.visible = at.distanceTo(cameraPos) > o.radius;
  }
}

/** merge a list of geometry parts into one mesh */
export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
}

/** 沿 Z 轴铺设的带状地面：给堤身、纤道、滩涂用，横断面是点集 */
export function stripGeo({ section, length, z0 = 0, wobble = 0.0 }) {
  const pos = [], uv = [], idx = [];
  const rows = Math.max(2, Math.round(length / 4));
  const nv = section.length;
  for (let r = 0; r <= rows; r++) {
    const z = z0 + (length * r) / rows;
    const k = wobble ? Math.sin(r * 0.7) * wobble : 0;
    for (let i = 0; i < nv; i++) {
      pos.push(section[i][0] + (i % 2 ? k * 0.4 : k), section[i][1], z);
      uv.push(i / (nv - 1), r / rows);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < nv - 1; i++) {
      const a = r * nv + i, b = a + 1, c = a + nv, d = c + 1;
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
