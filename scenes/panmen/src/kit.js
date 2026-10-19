import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  tileNight: '#39415a',
  tileRidge: '#5b6480',
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
  M.roof = lit('#cfd6e4', { map: T.roofTiles('#39435a', '#54607a', '#7d8ca8'), rough: 0.78, side: THREE.DoubleSide, emissive: '#141b2a', ei: 0.55 });
  M.roofGreen = lit('#cfe0d8', { map: T.roofTiles('#25423c', '#375a50', '#548072'), rough: 0.74, side: THREE.DoubleSide, emissive: '#121d1a', ei: 0.5 });
  M.ridge = lit(PAL.stoneDark, { map: T.stone('#6d7484'), rough: 0.7 });
  M.pillar = lit('#b04033', { map: T.wood('#8c2f26', '#54190f'), rough: 0.55 });
  M.pillarBright = lit('#c4483a', { map: T.wood('#9d352a', '#5d1d15'), rough: 0.5 });
  M.beam = lit('#7a4630', { map: T.wood('#5c3524', '#351a11'), rough: 0.7 });
  M.gilt = lit(PAL.gilt, { rough: 0.32, metal: 0.85, emissive: '#3a2408', ei: 0.6 });
  M.wall = lit('#ded4bd', { map: T.plaster('#c9bda4'), rough: 0.95 });
  M.redWall = lit('#c0554a', { map: T.plaster('#b04a3a'), rough: 0.8 });
  M.stone = lit('#a8aeba', { map: T.stone('#8b919d'), rough: 0.9 });
  M.stoneDark = lit('#5a6070', { map: T.stone('#4e5563'), rough: 0.92 });
  M.stoneDressed = lit('#b9bfca', { map: T.stone('#9aa0ab'), rough: 0.88 });
  M.stoneDressed.map = M.stoneDressed.map.clone();
  M.stoneDressed.map.repeat.set(0.22, 0.16);
  M.stoneDressed.map.needsUpdate = true;
  M.ink = lit('#2a2f3d', { rough: 0.8 });
  M.dark = lit('#141824', { rough: 0.9 });
  M.silk = lit('#d4705a', { rough: 0.6, side: THREE.DoubleSide });
  M.leaf = lit('#2b4d3a', { rough: 0.95, side: THREE.DoubleSide });
  M.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0x9c7c54, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;

  /* 砖石：ExtrudeGeometry 的 UV 是局部米数，repeat 0.5 = 每 2m 一贴，
     正对上 40×20cm 的城砖与条石 */
  M.brick = lit('#c6cbd3', { map: T.cityBrick('#6b6f78'), rough: 0.94, side: THREE.DoubleSide, emissive: '#0d1017', ei: 0.42 });
  scaleMap(M.brick, 0.5, 0.5);
  M.brickWarm = lit('#d8d0c2', { map: T.cityBrick('#7b7366'), rough: 0.92, side: THREE.DoubleSide, emissive: '#150f08', ei: 0.5 });
  scaleMap(M.brickWarm, 0.5, 0.5);
  // 瑞光塔的砖身比城垣更赭，塔灯从每层窗里透出来时就靠它接住暖色
  M.towerBrick = lit('#d9cbb4', { map: T.cityBrick('#7d6a55', '#453a2f', '#9c8a72'), rough: 0.95, side: THREE.DoubleSide, emissive: '#171008', ei: 0.5 });
  scaleMap(M.towerBrick, 0.5, 0.5);
  // 券洞深处的砖几乎吃不到光，单列一种暗料免得洞内被照成白纸
  M.brickInner = lit('#5a5e66', { map: T.cityBrick('#4a4d54', '#2b2e33'), rough: 0.97, side: THREE.DoubleSide, emissive: '#06080d', ei: 0.3 });
  scaleMap(M.brickInner, 0.5, 0.5);
  M.granite = lit('#7f858d', { rough: 0.9 });
  M.graniteWet = lit('#5f666e', { rough: 0.62, metal: 0.06, emissive: '#0b1016', ei: 0.5 });
  M.paving = lit('#8f9299', { map: T.paving('#4a4a4e'), rough: 0.96 });
  M.pavingWarm = lit('#a49c90', { map: T.paving('#575149'), rough: 0.95 });
  M.earth = lit('#332f28', { rough: 1 });
  return M;
}

function scaleMap(mat, u, v) {
  mat.map = mat.map.clone();
  mat.map.repeat.set(u, v);
  mat.map.needsUpdate = true;
  return mat;
}

/** 给 w×d 的平面烘上按米平铺的 UV：一格贴图 = tile 米 */
export function tileUV(geo, w, d, tile = 2) {
  const su = w / tile, sv = d / tile;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
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

/**
 * 合并成一网一料。BoxGeometry/CylinderGeometry 带索引而 ExtrudeGeometry 不带，
 * mergeGeometries 混排两者会直接返回 null，所以一律先转非索引再合。
 */
export function mesh(parts, material) {
  const list = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const g = flat.length === 1 ? flat[0] : mergeGeometries(flat);
  if (!g) throw new Error(`mergeGeometries 失败：${flat.length} 段几何体属性不一致`);
  return new THREE.Mesh(g, material);
}

/* ------------------------------------------------------------ 砖石构件 */

/**
 * 带券洞的墙。立面在 XY 平面（X 沿墙、Y 向上），沿 Z 挤出成厚度。
 * 券洞是 Shape 上的真洞，所以能看穿、也能走进去；洞口从 sill 起而不是从 0 起，
 * 洞若碰到轮廓下边，三角化会退化，留一道门槛石既避开这个坑也本是券门该有的东西。
 *
 * openings: [{ at, width, height, bottom?, spring? }]，单位米。
 * spring 是起拱线高度，缺省按半圆拱推。
 */
export function wallWithArches({ width, height, thick, openings = [], sill = 0.14, curveSegments = 16 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  for (const o of openings) {
    const r = o.width / 2;
    const bottom = o.bottom === undefined ? sill : o.bottom;
    const spring = o.spring === undefined ? bottom + o.height - r : o.spring;
    const hole = new THREE.Path();
    hole.moveTo(o.at - r, bottom);
    hole.lineTo(o.at - r, spring);
    hole.absarc(o.at, spring, r, Math.PI, 0, true);
    hole.lineTo(o.at + r, bottom);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments });
  geo.translate(0, 0, -thick / 2);
  geo.computeVertexNormals();
  return geo;
}

/** 券脸：绕券洞半圈的一排楔形石，比墙面略突出，起拱线以下接两侧券脚石 */
export function archFace(radius, { ring = 0.62, depth = 0.4, count = 13, spring = 0, jamb = 0.9 } = {}) {
  const parts = [];
  const rc = radius + ring / 2;
  for (let i = 0; i < count; i++) {
    const a0 = (Math.PI * i) / count, a1 = (Math.PI * (i + 1)) / count;
    const am = (a0 + a1) / 2;
    const chord = 2 * rc * Math.sin((a1 - a0) / 2) * 1.02;
    const g = new THREE.BoxGeometry(ring, chord, depth);
    g.rotateZ(am - Math.PI / 2);
    g.translate(Math.cos(am) * rc, Math.sin(am) * rc + spring, 0);
    parts.push(g);
  }
  if (spring > 0) {
    for (const s of [-1, 1]) {
      const j = new THREE.BoxGeometry(ring, spring + jamb, depth);
      j.translate(s * rc, (spring + jamb) / 2 - jamb, 0);
      parts.push(j);
    }
  }
  // 拱顶石稍长，是券脸正中的标志
  const key = new THREE.BoxGeometry(ring * 1.25, radius * 0.34, depth * 1.18);
  key.translate(0, rc + radius * 0.02 + spring, 0);
  parts.push(key);
  return mergeGeometries(parts);
}

/** 雉堞：垛墙与垛口相间，沿 +X 铺开，原点在墙顶面中线 */
export function crenellation(length, { height = 1.05, merlon = 1.4, thick = 0.68, y = 0, pitch = 2.5 } = {}) {
  const parts = [];
  const n = Math.max(1, Math.round(length / pitch));
  const step = length / n;
  const w = Math.min(merlon, step * 0.58);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + step * (i + 0.5);
    const m = new THREE.BoxGeometry(w, height, thick);
    m.translate(x, y + height / 2, 0);
    parts.push(m);
    const cap = new THREE.BoxGeometry(w * 1.12, 0.14, thick * 1.16);
    cap.translate(x, y + height + 0.07, 0);
    parts.push(cap);
  }
  const sill = new THREE.BoxGeometry(length, 0.26, thick * 1.06);
  sill.translate(0, y + 0.13, 0);
  parts.push(sill);
  return mergeGeometries(parts);
}

/** 女墙：墙顶内侧的通长矮墙，压一条檐石 */
export function parapet(length, { height = 1.0, thick = 0.5, y = 0 } = {}) {
  const parts = [];
  const body = new THREE.BoxGeometry(length, height, thick);
  body.translate(0, y + height / 2, 0);
  parts.push(body);
  const cope = new THREE.BoxGeometry(length, 0.16, thick * 1.3);
  cope.translate(0, y + height + 0.08, 0);
  parts.push(cope);
  return mergeGeometries(parts);
}

/** 马道：从地面升到墙顶的砖坡道，剖面是直角三角形，沿 Z 给宽度 */
export function rampGeo({ run, rise, width }) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(run, 0);
  s.lineTo(run, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.computeVertexNormals();
  return g;
}

/** 贴着坡面的一条带子：坡面砖皮与两侧宇墙都靠它 */
export function rampShell({ run, rise, width, t = 0.5 }) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(run, rise);
  s.lineTo(run, rise + t);
  s.lineTo(0, t);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.computeVertexNormals();
  return g;
}

/** 石基：墙脚一圈条石，比砖身略出面，是砖城的标准做法 */
export function plinthGeo(width, height, thick, { proud = 0.34, y = 0 } = {}) {
  const g = new THREE.BoxGeometry(width + proud * 2, height, thick + proud * 2);
  g.translate(0, y + height / 2, 0);
  return g;
}
