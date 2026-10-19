import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  // 夜色：运河上的青黑与城里的暖橘
  ink: '#050810',
  night: '#0a1120',
  star: '#cfe0ff',
  // 巷灯：灯笼橘、灯串金、河上红灯
  lanternWarm: '#ffb86b',
  lanternGold: '#ffd894',
  lanternRed: '#e04a38',
  lanternJade: '#9ff0d8',
  // 投影灯落在粉墙上的冷白
  gobo: '#cfe4ff',
  // 街巷界面
  wall: '#d9cfba',
  wallShade: '#8f8878',
  tileDark: '#2c3340',
  tileGrey: '#4a5262',
  zinc: '#39404d',
  woodDark: '#4a2b1c',
  woodRed: '#7c3b23',
  stone: '#8a8f98',
  stoneDark: '#4d525d',
  gilt: '#d8ab63',
  bronze: '#8a6d3b',
  bronzeDark: '#4e3d1e',
  vermillion: '#a8322a',
  // —— 连岛·开渔夏夜：滩涂、船体与航标（新增键，以上原键一律不动）
  sand: '#d9c9a2',
  wetSand: '#6b7480',
  rock: '#8b9199',
  reef: '#556b60',
  hull: '#9a6440',
  hullTrim: '#d3bd94',
  rope: '#c9b489',
  net: '#93a8a2',
  rust: '#7d4a2b',
  steel: '#98a3b0',
  glass: '#c6dcf0',
  moonWhite: '#e8f1ff',
  harborGold: '#ffc46a',
  navGreen: '#37e08c',
  navRed: '#ff4f43',
  navWhite: '#f4f8ff',
  foam: '#eaf3f8',
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
  // 贴图带色时基色贴近白：暗色 × 暗贴图在夜景灯光下会直接糊成黑
  M.gilt = lit(PAL.gilt, { rough: 0.32, metal: 0.85, emissive: '#3a2408', ei: 0.6 });
  M.bronze = lit(PAL.bronze, { rough: 0.34, metal: 0.9, emissive: '#241a06', ei: 0.55 });
  M.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0xa8845a, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;
  // 小青瓦：黛色，夜里只读出一条一条的瓦垄
  M.roofTile = lit('#c9cfd9', { map: T.roofTiles('#20252f', '#333c4b', '#5d697e'), rough: 0.86, side: THREE.DoubleSide, emissive: '#0f131b', ei: 0.5 });
  // 二期钛锌板：深灰、平整、比瓦亮一点，用来读"新针脚"
  M.roofZinc = lit('#9aa6b6', { map: T.seamMetal('#2b313c', '#4a5364'), rough: 0.44, metal: 0.5, side: THREE.DoubleSide, emissive: '#141a24', ei: 0.45 });
  // 粉墙：夜里被檐下灯洗出一条上亮下暗的渐变
  M.wall = lit('#efe6d4', { map: T.plaster('#cfc6b2'), rough: 0.94, side: THREE.DoubleSide, emissive: '#1a1712', ei: 0.35 });
  M.wallDark = lit('#b9b2a2', { map: T.plaster('#9a9384'), rough: 0.96, side: THREE.DoubleSide, emissive: '#100e0b', ei: 0.3 });
  // 压顶石与条石
  M.stone = lit('#aeb4bd', { map: T.stone('#8d9199'), rough: 0.9, emissive: '#12151b', ei: 0.35 });
  M.stoneDark = lit('#7d838d', { map: T.stone('#5f646d'), rough: 0.92, emissive: '#0b0e13', ei: 0.3 });
  // 木构：立柱与门扇用深栗，梁枋用暗朱
  M.wood = lit('#c69a76', { map: T.wood('#4a2b1c', '#2f1a10'), rough: 0.72, emissive: '#170c06', ei: 0.4 });
  M.woodRed = lit('#c08b6e', { map: T.wood('#6d2f1e', '#43190f'), rough: 0.68, emissive: '#1c0a05', ei: 0.45 });
  M.vermillion = lit(PAL.vermillion, { rough: 0.66, emissive: '#2a0806', ei: 0.5 });
  // 铺地：弹石与条石
  M.pave = lit('#9aa0aa', { map: T.cobble(), rough: 0.95, emissive: '#0f1218', ei: 0.32 });
  // 连岛·开渔：沙滩/湿沙的干湿线、船体木壳与码头混凝土（贴图带色，基色一律接近白）
  M.sand = lit('#e6d8ba', { map: T.sand(), rough: 0.97, side: THREE.DoubleSide, emissive: '#191510', ei: 0.34 });
  M.wetSand = lit('#c3cad4', { map: T.wetSand(), rough: 0.3, metal: 0.06, emissive: '#0e1319', ei: 0.32 });
  M.rock = lit('#c6cbd3', { map: T.rock(), rough: 0.9, side: THREE.DoubleSide, emissive: '#0f1216', ei: 0.3 });
  M.reef = lit('#a8b3ab', { map: T.reef(), rough: 0.72, metal: 0.04, side: THREE.DoubleSide, emissive: '#0c1210', ei: 0.3 });
  M.hull = lit('#dcc6aa', { map: T.hull(), rough: 0.76, side: THREE.DoubleSide, emissive: '#150d07', ei: 0.35 });
  M.hullTrim = lit(PAL.hullTrim, { rough: 0.7, emissive: '#171008', ei: 0.35 });
  M.plank = lit('#d3bfa2', { map: T.plank(), rough: 0.88, side: THREE.DoubleSide, emissive: '#110d09', ei: 0.3 });
  M.rope = lit('#d8c79c', { map: T.rope(), rough: 0.88, emissive: '#12100a', ei: 0.3 });
  M.canopy = lit('#e8e4da', { map: T.flagStripe('#c2503c', '#f2eee4'), rough: 0.93, side: THREE.DoubleSide, emissive: '#141210', ei: 0.3 });
  M.concrete = lit('#ccced3', { map: T.concrete(), rough: 0.95, emissive: '#0d0f13', ei: 0.3 });
  M.metal = lit('#b9c0ca', { map: T.rust('#8a4c2d', '#727b88'), rough: 0.46, metal: 0.7, emissive: '#12151b', ei: 0.35 });
  M.glass = lit(PAL.glass, { rough: 0.16, metal: 0.12, emissive: '#1c2834', ei: 0.55 });
  M.glass.transparent = true; M.glass.opacity = 0.44;
  M.net = lit('#dbe2dc', { map: T.net(), rough: 0.9, side: THREE.DoubleSide, emissive: '#101412', ei: 0.3 });
  M.net.transparent = true; M.net.depthWrite = false;
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
/** from/to 允许 [x,y,z] 或 Vector3：layout 里的挂点写的是数组，别在调用方各转一遍 */
export function stringPath(from, to, sag = 1.4, segments = 24) {
  const v3 = (p) => (p && p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));
  const a = v3(from), b = v3(to);
  const pts = [];
  const v = new THREE.Vector3().subVectors(b, a);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().copy(a).addScaledVector(v, t);
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

/** merge a list of [geometry, material] pairs into a single-mesh group-friendly form */
export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
}

/**
 * 梵钟 — a bonshō-style bell: near-cylindrical body, domed crown, 蒲牢 loop on top.
 * The profile is revolved twice (outer then inset) so the mouth reads as a wall
 * with a dark膛 rather than a flat disc.
 */
export function bellGeo({ height = 2.6, radius = 1.05, seg = 30 } = {}) {
  const wall = 0.11 * radius;
  const shape = [
    [0.94, 0], [1.0, 0.07], [1.0, 0.32], [1.05, 0.55], [1.07, 0.75],
    [1.02, 0.9], [0.86, 0.98], [0.6, 1.01], [0.33, 1.0], [0.16, 0.95],
  ];
  const outer = shape.map(([x, y]) => new THREE.Vector2(x * radius, y * height));
  const inner = shape.map(([x, y], i) =>
    new THREE.Vector2(Math.max(0.03 * radius, x * radius - (i ? wall : 0)), y * height - (i === 0 ? 0.06 * height : 0)));
  const parts = [new THREE.LatheGeometry(outer, seg), new THREE.LatheGeometry(inner, seg)];
  const collar = new THREE.CylinderGeometry(radius * 0.44, radius * 0.52, height * 0.05, seg);
  collar.translate(0, height * 0.99, 0);
  parts.push(collar);
  // 钟带：上下各一道凸弦纹，是梵钟最认得出的细节
  for (const f of [0.16, 0.86]) {
    const band = new THREE.TorusGeometry(radius * 1.03, radius * 0.035, 5, seg);
    band.rotateX(Math.PI / 2);
    band.translate(0, height * f, 0);
    parts.push(band);
  }
  const loop = new THREE.TorusGeometry(radius * 0.2, radius * 0.075, 6, 14);
  loop.rotateY(Math.PI / 2);
  loop.translate(0, height * 1.06, 0);
  parts.push(loop);
  return mergeGeometries(parts);
}

/* ------------------------------------------------------- 江南街巷的构筑件 */

/**
 * 马头墙（封火墙）：沿 +X 一路跌落的台阶山墙，每级压一道青瓦墙帽。
 * `dir` 为 +1 时向 +X 升高，-1 反之。
 */
export function fireWallGeo({ length, baseH = 4.2, steps = 3, rise = 0.9, thick = 0.42, capRise = 0.34, dir = 1 }) {
  const parts = [];
  const seg = length / steps;
  for (let i = 0; i < steps; i++) {
    const h = baseH + rise * (dir > 0 ? i : steps - 1 - i);
    const x0 = -length / 2 + i * seg;
    parts.push(box(seg, h, thick, x0 + seg / 2, h / 2, 0));
    // 墙帽：出檐的薄板，两端微微起翘
    const cap = box(seg + 0.24, 0.16, thick + 0.34, x0 + seg / 2, h + 0.08, 0);
    parts.push(cap);
    const lip = box(seg + 0.24, 0.1, 0.16, x0 + seg / 2, h + 0.2, (thick / 2 + 0.16) * Math.sign(1));
    parts.push(lip);
    const lip2 = box(seg + 0.24, 0.1, 0.16, x0 + seg / 2, h + 0.2, -(thick / 2 + 0.16));
    parts.push(lip2);
    if (i < steps - 1) {
      // 级与级之间的落水短墙
      const nx = x0 + seg;
      const nh = baseH + rise * (dir > 0 ? i + 1 : steps - 2 - i);
      parts.push(box(0.3, Math.abs(nh - h) + 0.4, thick, nx, Math.max(h, nh) - 0.1, 0));
    }
  }
  void capRise;
  return mergeGeometries(parts);
}

/** 一段普通院墙 + 瓦顶，沿 +X 铺开，原点在墙底中线 */
export function wallRunGeo({ length, height = 3.4, thick = 0.4, tiles = true }) {
  const parts = [box(length, height, thick, 0, height / 2, 0)];
  if (tiles) {
    parts.push(box(length + 0.2, 0.14, thick + 0.3, 0, height + 0.07, 0));
    parts.push(box(length + 0.2, 0.12, 0.14, 0, height + 0.2, (thick + 0.3) / 2 - 0.07));
    parts.push(box(length + 0.2, 0.12, 0.14, 0, height + 0.2, -((thick + 0.3) / 2 - 0.07)));
  }
  return mergeGeometries(parts);
}

/** 石库门：门框两墩 + 门罩，开口居中，原点在门槛中线 */
export function gateFrameGeo({ opening = 2.0, height = 2.9, depth = 0.9, pier = 0.62 }) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(pier, height, depth, s * (opening / 2 + pier / 2), height / 2, 0));
    parts.push(box(pier + 0.16, 0.2, depth + 0.16, s * (opening / 2 + pier / 2), height + 0.1, 0));
  }
  parts.push(box(opening + pier * 2 + 0.3, 0.34, depth + 0.1, 0, height + 0.17, 0));
  // 门罩：一小段双坡檐，是石库门最认得出的部分
  const canopy = chineseRoof({ width: opening + pier * 2 + 1.2, depth: 1.1, height: 0.52, curve: 0.5, eaveLift: 0.7, overhang: 0.16, segU: 14, segV: 6, hip: false });
  canopy.translate(0, height + 0.5, 0);
  parts.push(canopy);
  return mergeGeometries(parts);
}

/** 双扇板门 + 门钉 + 门环（门环单独给发光件） */
export function doorGeo({ width = 1.9, height = 2.7, thick = 0.12 }) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(width / 2 - 0.03, height, thick, s * width / 4, height / 2, 0));
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const stud = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6);
        stud.rotateX(Math.PI / 2);
        stud.translate(s * (width / 4 + (c - 1) * 0.16 * s * s), height * (0.24 + r * 0.19), thick / 2 + 0.02);
        parts.push(stud);
      }
    }
  }
  return mergeGeometries(parts);
}

/** 台阶式河埠头：从巷面下到水面，沿 +Z 跌落 */
export function wharfGeo({ width = 4.2, steps = 6, drop = 3.2, tread = 0.62 }) {
  const parts = [];
  const h = drop / steps;
  for (let i = 0; i < steps; i++) {
    parts.push(box(width, h, tread, 0, drop - h * (i + 0.5), i * tread + tread / 2));
  }
  // 两侧八字抱石
  for (const s of [-1, 1]) {
    const cheek = box(0.5, drop + 0.4, steps * tread + 0.4, s * (width / 2 + 0.2), (drop + 0.4) / 2 - 0.2, steps * tread / 2);
    cheek.rotateX(0);
    parts.push(cheek);
  }
  return mergeGeometries(parts);
}

/** 半圆石券：桥洞的券圈，跨度 2r，沿 +X 展开 */
export function archRingGeo({ r = 3.2, width = 4.6, ring = 0.34, seg = 22 }) {
  const parts = [];
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    const am = (a0 + a1) / 2;
    const len = r * (a1 - a0) + 0.08;
    // 券圈在 XY 平面内（跨河方向为 X），沿 Z 挤出桥宽
    const b = new THREE.BoxGeometry(len, ring, width);
    b.rotateZ(am + Math.PI / 2);
    b.translate(Math.cos(am) * r, Math.sin(am) * r, 0);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

/** 纸灯笼：略鼓的桶形 + 上下箍 */
export function lanternGeo({ r = 0.28, h = 0.62, seg = 10 } = {}) {
  const body = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
  body.scale(1, h / (2 * r), 1);
  const top = new THREE.CylinderGeometry(r * 0.42, r * 0.5, 0.06, 8);
  top.translate(0, h / 2, 0);
  const bot = new THREE.CylinderGeometry(r * 0.5, r * 0.42, 0.06, 8);
  bot.translate(0, -h / 2, 0);
  const tassel = new THREE.CylinderGeometry(0.02, 0.05, 0.2, 5);
  tassel.translate(0, -h / 2 - 0.13, 0);
  return mergeGeometries([body, top, bot, tassel]);
}

/** 幌子/招幌：一根挑杆加一面竖旗 */
export function bannerPoleGeo({ arm = 1.1, height = 2.2 } = {}) {
  const parts = [];
  const post = new THREE.CylinderGeometry(0.045, 0.05, height, 6);
  post.translate(0, height / 2, 0);
  parts.push(post);
  const armBar = box(arm, 0.06, 0.06, arm / 2, height - 0.1, 0);
  parts.push(armBar);
  return mergeGeometries(parts);
}

/** 天井四周的廊：一步一柱，檐口走一圈 */
export function corridorGeo({ length, spacing = 1.9, height = 2.9, depth = 1.5 }) {
  const parts = [];
  const n = Math.max(2, Math.round(length / spacing));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (length * i) / n;
    const p = new THREE.CylinderGeometry(0.13, 0.15, height, 9);
    p.translate(x, height / 2, depth / 2);
    parts.push(p);
    const drum = new THREE.CylinderGeometry(0.22, 0.26, 0.16, 10);
    drum.translate(x, 0.08, depth / 2);
    parts.push(drum);
  }
  parts.push(box(length + 0.4, 0.24, depth, 0, height + 0.12, depth / 2));
  parts.push(box(length + 0.4, 0.16, 0.2, 0, height + 0.32, depth - 0.1));
  return mergeGeometries(parts);
}

/* ================================================== 连岛·开渔夏夜：船 / 堤 / 滩 / 旗 */

/** 材质懒取：构件函数可能在 initMaterials() 之前被调用，取不到就补跑一次 */
const matOf = (k) => M[k] || (initMaterials(), M[k]);

/** 顶点坐标的确定性 hash（0~1）：岩石扰动专用，禁止 Math.random */
function vhash(x, y, z) {
  let n = (Math.imul(Math.round(x * 977) + 1, 15731) ^ Math.imul(Math.round(y * 977) + 1, 789221)) ^ Math.imul(Math.round(z * 977) + 1, 1376312591);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * 木质尖底渔船船体。沿 Z 放样一条开口剖面：右舷墙顶 → 舭部 → 龙骨 → 左舷墙顶
 * → 内缘 → 舱内底板 → 右舷内板，于是舷墙有厚度、舷内是空膛（人可上船坐板），
 * 船尾的舷线与尾板略高。几何中心归零，+Z 朝船头。
 */
export function hullGeo(len = 7, beam = 2.4, depth = 1.05) {
  const half = beam / 2, NS = 16, wall = Math.max(0.045, beam * 0.035), fb = depth * 0.46;
  const stations = [];
  for (let i = 0; i <= NS; i++) stations.push(-len / 2 + (len * i) / NS);
  const sect = (z) => {
    const t = (z + len / 2) / len;
    const aft = Math.max(0, 0.42 - t) / 0.42, fwd = Math.max(0, t - 0.42) / 0.58;
    const k = Math.max(0.06, (1 - Math.pow(aft, 1.7) * 0.38) * (1 - Math.pow(fwd, 1.05) * 0.93));
    const yk = -depth * (1 - 0.5 * Math.pow(fwd, 1.5) - 0.14 * Math.pow(aft, 2.2));   // 龙骨：首尾上抬
    const top = fb * (1 + 0.3 * Math.pow(aft, 1.2) - 0.6 * Math.pow(fwd, 1.1));       // 舷线：尾高首低，读得出渔船的艉楼
    return { k, yk, top, yin: yk + wall * 1.15 };
  };
  const outer = [[1, 1], [0.975, 0.7], [0.8, 0.34], [0.42, 0.08], [0, 0]];
  const inner = [[0.86, 0.36], [0.5, 0.05], [0, 0.05], [0.5, 0.05], [0.86, 0.36]];
  const profile = (z) => {
    const { k, yk, top, yin } = sect(z), w = half * k, pts = [];
    for (const [a, b] of outer) pts.push([w * a, yk + (top - yk) * b]);
    for (let i = pts.length - 2; i >= 0; i--) pts.push([-pts[i][0], pts[i][1]]);
    pts.push([-w + wall, top - wall * 0.5]);
    for (const [a, b] of inner) pts.push([w * a, Math.max(yin, yk + (top - yk) * b) + wall]);
    pts.push([w - wall, top - wall * 0.5]);
    return pts;
  };
  const parts = [loftHull(profile, stations, false)];
  for (const t of [0.2, 0.44, 0.68, 0.88]) {          // 坐板：横跨舷内，夜里人坐着分拣渔具
    const z = -len / 2 + len * t, s = sect(z);
    parts.push(box(half * s.k * 1.66, wall * 0.9, 0.24, 0, s.yk + (s.top - s.yk) * 0.4, z));
  }
  const st = sect(stations[NS]), ar = sect(stations[0]);
  parts.push(box(0.09, fb * 1.5, 0.12, 0, st.top + fb * 0.22, len / 2 - 0.06));
  parts.push(box(half * ar.k * 1.72, fb * 0.94, 0.12, 0, ar.top - fb * 0.06, -len / 2 + 0.05));
  parts.push(box(0.11, 0.1, len * 0.66, 0, -depth - 0.03, -len * 0.04));
  const g = mergeGeometries(parts);
  g.center(); g.computeBoundingSphere();
  return g;
}

/** 桅杆 + 横桁 + 索具线（Group，锚点在桅根 y=0） */
export function mastGeo(h = 6, r = 0.09) {
  const grp = new THREE.Group(), wood = matOf('wood');
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 1.08, h, 8), wood);
  pole.position.y = h / 2;
  const yard = new THREE.Mesh(box(h * 0.4, r * 1.5, r * 1.5, 0, h * 0.8, 0), wood);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 8, 6), wood);
  cap.position.y = h;
  grp.add(pole, yard, cap);
  const line = new THREE.LineBasicMaterial({ color: rgb('#cdbb98'), transparent: true, opacity: 0.82 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const stays = [
    stringPath(V(0, h * 0.97, 0), V(h * 0.24, h * 0.1, h * 0.4), h * 0.02, 10),
    stringPath(V(0, h * 0.97, 0), V(-h * 0.2, h * 0.1, -h * 0.36), h * 0.02, 10),
    stringPath(V(h * 0.19, h * 0.8, 0), V(h * 0.2, h * 0.3, 0), h * 0.06, 8),
    stringPath(V(-h * 0.19, h * 0.8, 0), V(-h * 0.2, h * 0.3, 0), h * 0.06, 8),
  ];
  for (const pts of stays) grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), line));
  grp.userData = { pole, yard, stays, line };
  return grp;
}

/**
 * 消波块（扭王字块）：中心球加四根圆头棒沿四面体方向伸出，mergeGeometries 合一。
 * 低模但轮廓明确，堆在西大堤上读得出连环剪影；几何重心归零。
 */
export function tetrapodGeo(size = 1.2) {
  const rad = size * 0.16, arm = size * 0.46, up = new THREE.Vector3(0, 1, 0);
  const parts = [new THREE.SphereGeometry(rad * 1.26, 10, 8)];
  for (const d of [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]) {
    const v = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    const g = new THREE.CapsuleGeometry(rad, arm, 3, 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, v));
    g.translate(v.x * arm * 0.5, v.y * arm * 0.5, v.z * arm * 0.5);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.center(); g.computeBoundingSphere();
  return g;
}

/**
 * 沙滩遮阳伞：八棱锥布面（uv 沿圆周展开，条纹贴图自然读成八瓣）+ 下裙 + 中杆。
 * 收拢：把 userData.canopy / skirt 的 xz scale 压到 0.16 即可，杆子不动。锚点在伞座。
 */
export function umbrellaGeo() {
  const grp = new THREE.Group(), R = 1.3, H = 2.15, cloth = matOf('canopy'), metal = matOf('metal');
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(R, 0.36, 8, 1, true), cloth);
  canopy.position.y = H + 0.02; canopy.name = 'canopy';
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.88, 0.14, 8, 1, true), cloth);
  skirt.position.y = H - 0.24; skirt.name = 'skirt';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.046, H + 0.2, 7), metal);
  pole.position.y = (H + 0.2) / 2; pole.name = 'pole';
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), metal);
  knob.position.y = H + 0.22;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.14, 9), matOf('concrete'));
  foot.position.y = 0.07;
  grp.add(pole, canopy, skirt, knob, foot);
  grp.userData = { canopy, skirt, pole };
  return grp;
}

/** 海蚀基岩：低模二十面体 + 顶点 hash 扰动，非索引重算法线 → 钝角棱面（r 为外接半径） */
export function rockGeo(r = 1, detail = 1) {
  const src = new THREE.IcosahedronGeometry(r, Math.max(0, detail | 0));
  const g = src.index ? src.toNonIndexed() : src;   // 非索引 → 每个面独立法线，钝角读得出来
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = vhash(v.x, v.y, v.z), b = vhash(v.z * 2, v.x, v.y * 2);
    v.multiplyScalar(0.78 + 0.34 * a);
    v.y *= 0.74 + 0.1 * b;
    v.x += (a - 0.5) * r * 0.18; v.z += (b - 0.5) * r * 0.18;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** 三角渔旗：uv.x 从旗杆 0 → 旗梢 1，波浪 shader 按 u 位移即可；旗脚落在原点 */
export function flagGeo(w = 0.9, h = 0.6, cols = 8, rows = 3) {
  const pos = [], uv = [], idx = [], nv = rows + 1;
  for (let i = 0; i <= cols; i++) {
    const u = i / cols, hh = h * (1 - u * 0.92);
    for (let j = 0; j <= rows; j++) { pos.push(u * w, (j / rows - 0.5) * hh, 0); uv.push(u, j / rows); }
  }
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  return g;
}

/** 码头混凝土块（Mesh，锚点在底面中心）：顶口收一档当作倒角 */
export function concreteBlock(w = 1.2, h = 0.5, d = 0.6) {
  const e = Math.min(0.07, Math.min(w, d) * 0.09);
  const g = mergeGeometries([
    box(w, h - e, d, 0, (h - e) / 2, 0),
    box(w - e * 2, e, d - e * 2, 0, h - e / 2, 0),
  ]);
  g.computeBoundingSphere();
  return new THREE.Mesh(g, matOf('concrete'));
}

/** 实例化：list = { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz]|number }[]，返回已 updateMatrix 的 InstancedMesh */
export function instanced(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const d = new THREE.Object3D();
  list.forEach((it, i) => {
    const p = it.p || [0, 0, 0], r = it.r || [0, 0, 0], s = it.s == null ? 1 : it.s;
    d.position.set(p[0], p[1], p[2]);
    d.rotation.set(r[0], r[1], r[2]);
    if (typeof s === 'number') d.scale.setScalar(s); else d.scale.set(s[0], s[1], s[2]);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.count = list.length;
  im.frustumCulled = false;   // 沿堤、沿滩铺开的实例群整体包围盒太大，交给逐段剔除
  return im;
}

