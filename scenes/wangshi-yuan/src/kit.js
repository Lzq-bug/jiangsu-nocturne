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
  frost: '#c3dceb',
  // 网师园夜色：粉墙得灯才暖，黛瓦只留一线边，湖石青灰，戏衣的红要压得住夜色
  plasterWarm: '#e6dcc6',
  taihu: '#9aa1ae',
  moss: '#4a5a44',
  peony: '#d8688a',
  osmanthus: '#f0c86a',
  plumWhite: '#f4eaf2',
  costumeRed: '#c0465c',
  costumePale: '#9fd6e8',
  sleeve: '#f6e7cd',
  stageJade: '#8ff0d2',
  huBronze: '#9c7b3f',
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
  M.wall = lit('#c3b9a3', { map: T.plaster('#a89d85'), rough: 0.95 });
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
  M.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0x6b5436, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;

  // 园宅：粉墙黛瓦、栗色木作、湖石与铺地
  M.paving = lit('#d8d6cc', { map: T.paving('#4b4a44'), rough: 0.96 });
  M.rock = lit('#c9cfdb', { map: T.taihuStone('#8f96a2'), rough: 0.86, side: THREE.DoubleSide });
  M.ground = lit('#7b7666', { map: T.stone('#413e37'), rough: 0.99 });
  M.moss = lit(PAL.moss, { rough: 1 });
  M.roofGrey = lit('#d3dbe8', { map: T.roofTiles('#2b3345', '#3d485d', '#66748d'), rough: 0.8, side: THREE.DoubleSide, emissive: '#19202d', ei: 0.85 });
  M.woodDark = lit('#6b4a34', { map: T.wood('#41291d', '#231409'), rough: 0.82 });
  M.stele = lit('#ccd2dd', { map: T.stone('#9aa1ae'), rough: 0.86 });
  M.lacquer = lit('#5a2a20', { map: T.wood('#3c1a14', '#1d0d09'), rough: 0.62 });
  // 戏衣与水袖
  M.costume = lit(PAL.costumeRed, { rough: 0.72, side: THREE.DoubleSide });
  M.costumePale = lit(PAL.costumePale, { rough: 0.74, side: THREE.DoubleSide });
  M.sleeveSilk = lit('#dccbb2', { rough: 0.78, side: THREE.DoubleSide });
  M.bronze = lit(PAL.huBronze, { rough: 0.36, metal: 0.85, emissive: '#241a06', ei: 0.5 });
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

export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/* ------------------------------------------------------------- 合并与灯具 */
/** merge a list of [geometry, material] pairs into a single-mesh group-friendly form */
export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
}

/** 石灯笼/陶灯：一座立于岸石上的小灯 */
export function lampPostGeo({ base = 0.42, shaft = 1.5, head = 0.52 } = {}) {
  const parts = [];
  const foot = new THREE.CylinderGeometry(base, base * 1.25, 0.22, 10);
  foot.translate(0, 0.11, 0);
  parts.push(foot);
  const rod = new THREE.CylinderGeometry(shaft * 0.13, shaft * 0.15, shaft, 8);
  rod.translate(0, 0.22 + shaft / 2, 0);
  parts.push(rod);
  const bowl = new THREE.CylinderGeometry(head, head * 0.55, 0.2, 10);
  bowl.translate(0, 0.22 + shaft + 0.1, 0);
  parts.push(bowl);
  const boxL = new THREE.BoxGeometry(head * 1.5, head * 1.25, head * 1.5);
  boxL.translate(0, 0.22 + shaft + 0.75, 0);
  parts.push(boxL);
  const cap = new THREE.ConeGeometry(head * 1.35, head * 0.8, 4);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, 0.22 + shaft + 1.45, 0);
  parts.push(cap);
  return mergeGeometries(parts);
}
