import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

/* ------------------------------------------------------------------ palette
   拙政园夜色：粉墙、黛瓦、月白、荷青、灯暖。所有颜色按「composer 内不做
   色调映射、由 OutputPass 统一 ACES + sRGB」标定，故 lit() 的材质偏暗，
   glow() 的材质刻意超过 1.0 才能喂给 bloom。 */
export const PAL = {
  tileNight: '#2c3446',
  tileRidge: '#4d5769',
  plaster: '#cfc7b4',
  plasterCool: '#b9c2cf',
  inkStone: '#4a5060',
  stone: '#8b919d',
  stoneDressed: '#a9b0bd',
  rock: '#6d7686',
  wood: '#5a3a26',
  woodDark: '#33211a',
  lacquer: '#7c2b22',
  gilt: '#cfa860',
  water: '#060f1c',
  lotusLeaf: '#3e6f52',
  lotusBloom: '#e8a7bd',
  lotusSeed: '#cfd8b6',
  plantain: '#3f6b4a',
  bamboo: '#6d8f5a',
  bambooWarm: '#a8b06a',
  /* 个园四季石材：湖石青灰、黄石赭黄、宣石月白、石笋带竖棱 */
  rockLake: '#7c8698',
  rockYellow: '#8f6a3e',
  rockSnow: '#c3ccd8',
  rockShoot: '#828da0',
  plum: '#7b4a3a',
  plumBlossom: '#f0d7de',
  camphor: '#33543f',
  lanternWarm: '#ffc27a',
  lanternRed: '#f2734a',
  lanternJade: '#93e6cf',
  moonWhite: '#dfeaf7',
  projection: '#bcd8f2',
  gold: '#e6c084',
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
export const ri = (a, b) => Math.floor(rr(a, b + 1));

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

export function lit(color, { map = null, rough = 0.85, metal = 0, emissive = 0x000000, ei = 1, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: rgb(color), map, roughness: rough, metalness: metal,
    emissive: rgb(emissive), emissiveIntensity: ei, side, transparent, opacity,
  });
}

export const M = {};
export function initMaterials() {
  // maps carry the hue, base colour stays near white: a dark colour times a dark
  // texture reads as black under night lighting
  M.roof = lit('#c9d1e0', { map: T.roofTiles('#2b3242', '#454f63', '#6f7c95'), rough: 0.78, side: THREE.DoubleSide, emissive: '#131a28', ei: 0.55 });
  M.roofDark = lit('#b6c0d2', { map: T.roofTiles('#212836', '#333c4c', '#54607a'), rough: 0.82, side: THREE.DoubleSide, emissive: '#10151f', ei: 0.5 });
  // 卷棚顶：园林廊、亭不用正脊，瓦垄一路弧过去
  M.roofRoll = lit('#cbd3e2', { map: T.roofTiles('#31394b', '#4c5666', '#7b8799'), rough: 0.75, side: THREE.DoubleSide, emissive: '#141b2a', ei: 0.5 });
  M.ridge = lit(PAL.inkStone, { map: T.stone('#6d7484'), rough: 0.7 });
  M.wall = lit('#e3dcc8', { map: T.plaster('#cfc7b4'), rough: 0.95, emissive: '#1a1c22', ei: 0.35 });
  M.wallGable = lit('#ded8c6', { map: T.plaster('#c4bda9'), rough: 0.96 });
  // 漏窗与长窗：夜里由内灯打透，所以是不参与光照的贴图
  M.lattice = new THREE.MeshBasicMaterial({ map: T.latticeWindow('ice'), color: 0x8f96a8, side: THREE.DoubleSide });
  M.lattice.toneMapped = false;
  M.latticeBlue = new THREE.MeshBasicMaterial({ map: T.latticeWindow('blue'), color: 0x9fb6cc, side: THREE.DoubleSide });
  M.latticeBlue.toneMapped = false;
  M.pillar = lit('#8d4132', { map: T.wood('#6d3126', '#3c1b13'), rough: 0.58 });
  M.pillarDark = lit('#5e3a2a', { map: T.wood('#48291c', '#26140d'), rough: 0.72 });
  M.beam = lit('#7a4c33', { map: T.wood('#5a3524', '#331a11'), rough: 0.7 });
  M.stone = lit('#a8aeba', { map: T.stone('#8b919d'), rough: 0.9 });
  M.stoneDark = lit('#5a6070', { map: T.stone('#4d5462'), rough: 0.92 });
  M.step = lit('#b0b6c2', { map: T.stone('#949aa6'), rough: 0.88 });
  // 细凿条石：石鼓、石桌、桥面与灯座都用它，漏定义会让 three 换上默认白材质
  M.stoneDressed = lit('#8e95a2', { map: T.stone('#7b8290'), rough: 0.86 });
  M.pavement = lit('#9aa1af', { map: T.cobble(), rough: 0.94 });
  M.rock = lit('#7f8899', { map: T.rockSurface(), rough: 0.86, side: THREE.DoubleSide });
  M.gilt = lit(PAL.gilt, { rough: 0.34, metal: 0.8, emissive: '#3a2408', ei: 0.55 });
  M.ink = lit('#262b38', { rough: 0.8 });
  M.dark = lit('#12161f', { rough: 0.9 });
  M.silk = lit('#e0a58c', { rough: 0.6, side: THREE.DoubleSide });
  M.woodFloor = lit('#6c4a33', { map: T.wood('#4c3220', '#2a1710'), rough: 0.8 });
  M.screen = lit('#d8d2c0', { map: T.inkPainting(), rough: 0.9, emissive: '#2b3546', ei: 0.5 });
  M.plumBlossom = lit(PAL.plumBlossom, { rough: 0.95, side: THREE.DoubleSide });
  M.leaf = lit(PAL.camphor, { rough: 0.95, side: THREE.DoubleSide });
  M.leafBright = lit(PAL.bamboo, { rough: 0.92, side: THREE.DoubleSide });
  M.plantain = lit(PAL.plantain, { map: T.plantainLeaf(), rough: 0.9, side: THREE.DoubleSide, emissive: '#122018', ei: 0.4 });
  /* 四季假山四种石材：夜里全靠色相与粗糙度分开，别混成一色 */
  M.rockLake = lit('#9aa4b6', { map: T.rockSurface(), rough: 0.8, side: THREE.DoubleSide, emissive: '#1b2434', ei: 0.74 });
  M.rockYellow = lit('#b6a382', { map: T.rockStrata('#8f7c58'), rough: 0.88, side: THREE.DoubleSide, emissive: '#33291a', ei: 0.7 });
  M.rockSnow = lit('#dde4ef', { map: T.rockQuartz('#aeb8c6'), rough: 0.66, side: THREE.DoubleSide, emissive: '#415470', ei: 0.82 });
  // 竹叶要单独给一档：夜里用樟树的深绿，一丛竹就只剩一把光竿
  M.bambooLeaf = lit('#7fa069', { rough: 0.9, side: THREE.DoubleSide, emissive: '#16240f', ei: 0.55 });
  M.shoot = lit('#a6b0c2', { map: T.shootStriate('#7f8899'), rough: 0.78, side: THREE.DoubleSide, emissive: '#1b2330', ei: 0.5 });
  M.pave = lit('#8b9098', { map: T.pavedFlower(), rough: 0.95 });
  M.brick = lit('#7b8290', { map: T.brickCarve('个园'), rough: 0.9, side: THREE.DoubleSide });
  return M;
}

/* ------------------------------------------------------------------ geometry */

/**
 * 坡屋顶. Origin at the eave line, ridge at +height.
 * hip=false gives a 硬山 (two slopes, gable ends); ridgeRatio=1 gives 卷棚
 * (no crest, the two faces meet in a rounded ridge).
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
      // max() keeps the crease on the hip line — summing them flattens long roofs
      const t = Math.min(1, Math.max(dzN, dxN));
      const s = t * (1 - curve) + Math.sqrt(t) * curve;
      let y = height * (1 - s);
      const corner = Math.pow(dzN, 2.6) * Math.pow(Math.min(1, dxN * 1.35), 1.5);
      y += height * eaveLift * 0.3 * corner + height * 0.08 * Math.pow(dzN, 5);
      pos.push(x, y, z);
      uv.push(x / 5.4, t * 1.4 + dxN * 0.4);
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

/** 正脊 + 吻兽, sitting on a chineseRoof footprint */
export function ridgeOrnament({ width, depth, height, ridgeRatio = 0.42, overhang = 0.5 }) {
  const parts = [];
  const rx = (width / 2) * ridgeRatio;
  const bar = new THREE.BoxGeometry(rx * 2 + 0.5, 0.34, 0.42);
  bar.translate(0, height + 0.14, 0);
  parts.push(bar);
  for (const s of [-1, 1]) {
    const cap = new THREE.BoxGeometry(0.48, 0.82, 0.6);
    cap.translate(s * (rx + 0.3), height + 0.38, 0);
    parts.push(cap);
  }
  return mergeGeometries(parts);
}

export function pillarGeo(height, radius, base = true) {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(radius * 0.9, radius, height, 12, 1);
  shaft.translate(0, height / 2, 0);
  parts.push(shaft);
  if (base) {
    const drum = new THREE.CylinderGeometry(radius * 1.5, radius * 1.62, radius * 1.05, 14);
    drum.translate(0, radius * 0.5, 0);
    parts.push(drum);
  }
  return mergeGeometries(parts);
}

/** 栏杆：地栿 + 寻杖 + 望柱，沿 +X 延伸。园林用低矮美人靠 */
export function railingGeo(length, { height = 0.78, spacing = 1.5, rail = true } = {}) {
  const parts = [];
  const sill = new THREE.BoxGeometry(length, height * 0.4, 0.2);
  sill.translate(0, height * 0.2, 0);
  parts.push(sill);
  if (rail) {
    const top = new THREE.BoxGeometry(length, 0.11, 0.3);
    top.translate(0, height, 0);
    parts.push(top);
    const mid = new THREE.BoxGeometry(length, 0.06, 0.14);
    mid.translate(0, height * 0.66, 0);
    parts.push(mid);
  }
  const n = Math.max(2, Math.round(length / spacing));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (length * i) / n;
    const post = new THREE.BoxGeometry(0.13, height + 0.16, 0.13);
    post.translate(x, (height + 0.16) / 2, 0);
    parts.push(post);
    const cap = new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8);
    cap.translate(x, height + 0.22, 0);
    parts.push(cap);
  }
  return mergeGeometries(parts);
}

/** 吴王靠（美人靠）：栏板上加一道向外倾的坐槛 */
export function benchRailGeo(length, { height = 0.78 } = {}) {
  const parts = [railingGeo(length, { height })];
  const seat = new THREE.BoxGeometry(length * 0.98, 0.07, 0.42);
  seat.rotateX(-0.22);
  seat.translate(0, height * 0.52, 0.24);
  parts.push(seat);
  return mergeGeometries(parts);
}

export function bracketGeo(scale = 1) {
  const parts = [];
  const tiers = [[0.9, 0.24, 0.22], [0.64, 0.2, 0.28], [0.4, 0.18, 0.32]];
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
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: T.plaque(text, opts), toneMapped: false }));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h * 1.14, 0.1), M.gilt);
  frame.position.z = -0.06;
  const grp = new THREE.Group();
  grp.add(frame, mesh);
  mesh.position.z = 0.03;
  return grp;
}

/** 月洞门：白墙上开一个圆，门洞内一圈青砖 */
export function moonGateWall({ width = 8, height = 4.2, r = 1.5, thickness = 0.42 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height); shape.lineTo(-width / 2, height); shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, r, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  const group = new THREE.Group();
  const wallMesh = new THREE.Mesh(g, M.wall);
  wallMesh.position.z = -thickness / 2;
  group.add(wallMesh);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.1, 6, 28), M.stoneDark);
  ring.position.set(0, r, thickness * 0.06);
  group.add(ring);
  return group;
}

/**
 * 漏窗墙：一段白墙，等距开几个花窗洞，洞里挂菱花/冰裂纹。
 * kind 决定窗芯贴图；返回 group 沿 +X 延伸。
 */
export function latticeWall({ length = 12, height = 3.0, openings = 3, kind = 'ice', sill = 1.15, w = 1.15, h = 1.15 }) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0); shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, height); shape.lineTo(-length / 2, height); shape.closePath();
  const step = length / (openings + 1);
  const cores = [];
  for (let i = 1; i <= openings; i++) {
    const cx = -length / 2 + step * i;
    const hole = new THREE.Path();
    hole.moveTo(cx - w / 2, sill); hole.lineTo(cx + w / 2, sill);
    hole.lineTo(cx + w / 2, sill + h); hole.lineTo(cx - w / 2, sill + h); hole.closePath();
    shape.holes.push(hole);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      kind === 'blue' ? M.latticeBlue : M.lattice);
    core.position.set(cx, sill + h / 2, 0);
    cores.push(core);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: false });
  const wallMesh = new THREE.Mesh(g, M.wall);
  wallMesh.position.z = -0.17;
  group.add(wallMesh, ...cores);
  // 瓦顶压檐，白墙才不像一块豆腐
  const cap = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.62), M.roofDark);
  cap.position.y = height + 0.06;
  group.add(cap);
  const sky = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, 0.2), M.roofDark);
  sky.position.y = height + 0.24;
  group.add(sky);
  return group;
}

export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
}

/** 台基：条石一层，顶面在 y=h，前有踏跺 */
export function terraceGeo({ w, d, h = 0.5, steps = true }) {
  const parts = [box(w, h, d, 0, h / 2, 0)];
  parts.push(box(w + 0.4, 0.14, d + 0.4, 0, h + 0.07, 0));
  if (steps) {
    for (let i = 0; i < 3; i++) {
      parts.push(box(2.6, 0.16, 0.5 + i * 0.42, 0, 0.08 + i * 0.16, d / 2 + 0.2 + i * 0.21));
    }
  }
  return mergeGeometries(parts);
}

/* ----------------------------------------------------------- hall / pavilion */

/**
 * 厅堂：台基 + 柱网 + 墙体 + 屋顶。open 为四面厅（远香堂）留空的面。
 * 返回 Group，原点在前檐台阶下、地面标高 0。
 */
export function hall({
  w = 12, d = 8, wallH = 4.2, floors = 1,
  baysX = 3, baysZ = 2, roofH = 2.6, terrace = 0.55,
  openFront = true, openBack = false, openSides = false,
  roof = M.roof, pillars = M.pillar, wallMat = M.wall,
  latticeKind = 'ice', plaque = null, name = '',
} = {}) {
  const group = new THREE.Group();
  const tGeo = terraceGeo({ w: w + 1.4, d: d + 1.4, h: terrace });
  group.add(new THREE.Mesh(tGeo, M.step));

  const H = wallH * floors;
  // 柱网
  const pil = [];
  for (let i = 0; i <= baysX; i++) {
    const x = -w / 2 + (w * i) / baysX;
    pil.push([x, -d / 2], [x, d / 2]);
  }
  for (let j = 1; j < baysZ; j++) {
    const z = -d / 2 + (d * j) / baysZ;
    pil.push([-w / 2, z], [w / 2, z]);
  }
  const pillarGeoM = pillarGeo(H, 0.2);
  for (const [x, z] of pil) {
    const p = new THREE.Mesh(pillarGeoM, pillars);
    p.position.set(x, terrace, z);
    group.add(p);
  }
  // 额枋
  for (const zz of [-d / 2, d / 2]) {
    group.add(new THREE.Mesh(box(w + 0.4, 0.34, 0.26, 0, terrace + H + 0.1, zz), M.beam));
  }
  for (const xx of [-w / 2, w / 2]) {
    group.add(new THREE.Mesh(box(0.26, 0.34, d + 0.4, xx, terrace + H + 0.1, 0), M.beam));
  }
  // 墙体与长窗
  const wallTh = 0.26;
  const addWall = (ww, x, z, rotY, mat = wallMat) => {
    const m = new THREE.Mesh(box(ww, H * 0.96, wallTh, 0, H * 0.48, 0), mat);
    m.position.set(x, terrace, z); m.rotation.y = rotY;
    group.add(m);
  };
  if (!openSides) {
    addWall(d - 0.2, -w / 2, 0, Math.PI / 2);
    addWall(d - 0.2, w / 2, 0, Math.PI / 2);
  }
  const latticeMat = latticeKind === 'blue' ? M.latticeBlue : M.lattice;
  const addWindow = (ww, x, z, rotY) => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(box(ww, H * 0.86, 0.14, 0, H * 0.5, 0), M.pillarDark);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(ww * 0.9, H * 0.78), latticeMat);
    core.position.y = H * 0.5; core.position.z = 0.09;
    const sill = new THREE.Mesh(box(ww + 0.2, 0.16, 0.36, 0, H * 0.1, 0), M.stone);
    g.add(frame, core, sill);
    g.position.set(x, terrace, z); g.rotation.y = rotY;
    group.add(g);
  };
  // 正面：明间开敞、次间装菱花窗，夜里看得见堂内灯
  if (openFront) {
    addWindow(w * 0.24, -w * 0.33, d / 2, 0);
    addWindow(w * 0.24, w * 0.33, d / 2, 0);
  } else addWall(w, 0, d / 2, 0);
  if (openBack) {
    addWindow(w * 0.28, -w * 0.3, -d / 2, Math.PI);
    addWindow(w * 0.28, w * 0.3, -d / 2, Math.PI);
  } else addWall(w, 0, -d / 2, Math.PI);
  //  interior floor + a hint of lit room so the hall is not a shell
  const floor = new THREE.Mesh(box(w - 0.1, 0.1, d - 0.1, 0, terrace + 0.05, 0), M.woodFloor);
  group.add(floor);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, H * 0.8), M.screen);
  inner.position.set(0, terrace + H * 0.5, -d * 0.32);
  group.add(inner);

  // 屋顶
  const ry = terrace + H + 0.3;
  const roofMesh = new THREE.Mesh(chineseRoof({ width: w, depth: d, height: roofH, overhang: 0.85, ridgeRatio: 0.46 }), roof);
  roofMesh.position.y = ry;
  group.add(roofMesh);
  group.add(new THREE.Mesh(ridgeOrnament({ width: w, depth: d, height: roofH + ry, overhang: 0.85 }), M.ridge));
  if (plaque) {
    const p = plaqueMesh(plaque, Math.min(3.2, w * 0.18), 0.78);
    p.position.set(0, terrace + H * 0.82, d / 2 + 0.2);
    group.add(p);
  }
  if (name) {
    const pair = plaqueMesh(name, w * 0.16, 0.7, { vertical: true, size: 46 });
    pair.position.set(-w * 0.42, terrace + H * 0.45, d / 2 + 0.16);
    group.add(pair);
  }
  return group;
}

/**
 * 亭：柱网 + 攒尖/卷棚顶，坐在水边或山上。
 * shape: 'square' | 'hex' | 'fan' | 'round'
 */
export function pavilion({
  shape = 'square', size = 4.6, height = 3.2, roofH = 1.7,
  terrace = 0.4, posts = 4, roofMat = M.roofRoll,
} = {}) {
  const group = new THREE.Group();
  const outline = [];
  const n = shape === 'square' ? 4 : shape === 'hex' ? 6 : shape === 'round' ? 10 : 3;
  const startA = shape === 'fan' ? 0 : Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = startA + (Math.PI * 2 * i) / n;
    outline.push([Math.cos(a) * size / 2, Math.sin(a) * size / 2]);
  }
  // 台基：一圈石砌
  const base = new THREE.ExtrudeGeometry(
    new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z))),
    { depth: terrace, bevelEnabled: false });
  base.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(base, M.step));

  const pg = pillarGeo(height, 0.14);
  for (let i = 0; i < posts; i++) {
    const [x, z] = outline[i % outline.length];
    const p = new THREE.Mesh(pg, M.pillar);
    p.position.set(x, terrace, z);
    group.add(p);
  }
  // 楣子
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size / 2 - 0.05, 0.1, 5, n * 4), M.beam);
  ring.rotateX(Math.PI / 2);
  ring.position.y = terrace + height;
  group.add(ring);

  // 攒尖顶：以顶点收拢的多面
  const apex = new THREE.ConeGeometry(size / 2 + 0.7, roofH, n, 3, false);
  const cone = new THREE.Mesh(apex, roofMat);
  cone.position.y = terrace + height + roofH / 2 + 0.12;
  group.add(cone);
  // 起翘的檐口裙
  const eave = new THREE.Mesh(new THREE.CylinderGeometry(size / 2 + 0.75, size / 2 + 1.05, 0.22, n * 6, 1, true), roofMat);
  eave.position.y = terrace + height + 0.16;
  group.add(eave);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.gilt);
  finial.position.y = terrace + height + roofH + 0.2;
  group.add(finial);
  if (shape !== 'fan') {
    const seat = new THREE.Mesh(new THREE.TorusGeometry(size / 2 - 0.3, 0.14, 4, 22), M.pillarDark);
    seat.rotateX(Math.PI / 2);
    seat.position.y = terrace + 0.45;
    group.add(seat);
  }
  return group;
}

/** 扇形轩（与谁同坐轩那一类）：一面扇弧 + 直山墙 */
export function fanHall({ radius = 4.2, angle = Math.PI * 0.62, height = 3.0, roofH = 1.9 }) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, radius, -angle / 2, angle / 2, false);
  shape.lineTo(0, 0);
  const base = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false });
  base.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(base, M.step));
  // 两条直边做山墙，弧面中段开长窗、两侧实墙——扇形轩的轮廓全靠这圈墙撑
  for (const a of [-angle / 2, angle / 2]) {
    const wall = new THREE.Mesh(box(radius, height, 0.24, 0, 0, 0), M.wall);
    wall.position.set(Math.cos(a) * radius / 2, 0.42 + height / 2, -Math.sin(a) * radius / 2);
    wall.rotation.y = a;
    group.add(wall);
  }
  const open = angle * 0.34;
  const win = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.06, radius - 0.06, height * 0.78, 22, 1, true, Math.PI / 2 - open, open * 2), M.lattice);
  win.position.y = 0.42 + height * 0.46;
  group.add(win);
  for (const s of [-1, 1]) {
    const from = Math.PI / 2 + s * (angle / 2 - (angle * 0.66 - open) / 2);
    const spanA = (angle * 0.66 - open);
    const solid = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.06, radius - 0.06, height, 16, 1, true, from - spanA / 2, spanA), M.wall);
    solid.position.y = 0.42 + height / 2;
    group.add(solid);
  }
  for (const a of [-angle / 2, angle / 2]) {
    const p = new THREE.Mesh(pillarGeo(height, 0.13), M.pillar);
    p.position.set(Math.cos(a) * (radius - 0.2), 0.42, Math.sin(a) * (radius - 0.2));
    group.add(p);
  }
  // 扇形顶：一条弧脊收向尖
  const roofShape = new THREE.Shape();
  roofShape.moveTo(0, 0);
  roofShape.absarc(0, 0, radius + 0.75, -angle / 2, angle / 2, false);
  roofShape.lineTo(0, 0);
  const rg = new THREE.ExtrudeGeometry(roofShape, { depth: 0.24, bevelEnabled: false });
  rg.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(rg, M.roof);
  roof.position.y = 0.42 + height + roofH;
  group.add(roof);
  const slope = new THREE.Mesh(new THREE.ConeGeometry(radius + 0.75, roofH, 24, 2, true, Math.PI / 2 - angle / 2, angle), M.roof);
  slope.position.y = 0.42 + height + roofH / 2;
  group.add(slope);
  return group;
}

/* ------------------------------------------------------------------ bridge */

/** 拱桥：单孔或三孔，桥面按弧线走。沿 +X 延伸 */
export function archBridge({ span = 12, width = 3.2, rise = 2.2, ring = 0.5, deck = 0.28 }) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  const hw = span / 2;
  shape.moveTo(-hw, -rise * 0.35);
  shape.lineTo(hw, -rise * 0.35);
  shape.lineTo(hw, rise + deck);
  // 桥面弧线
  for (let i = 24; i >= 0; i--) {
    const x = -hw + (span * i) / 24;
    const k = 1 - Math.abs(x) / hw;
    shape.lineTo(x, rise * (0.35 + 0.65 * Math.pow(k, 1.35)) + deck);
  }
  shape.closePath();
  const arch = new THREE.Path();
  arch.absellipse(0, -rise * 0.35, hw * 0.8, rise * 0.72, Math.PI, 0, true);
  arch.lineTo(hw * 0.8, -rise * 0.35);
  arch.lineTo(-hw * 0.8, -rise * 0.35);
  shape.holes.push(arch);
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  group.add(new THREE.Mesh(g, M.stone));
  // 栏板一段段跟着桥面弧线走
  const railY = (x) => {
    const k = 1 - Math.abs(x) / hw;
    return rise * (0.35 + 0.65 * Math.pow(k, 1.35)) + deck;
  };
  const segs = 14;
  for (const s of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const x0 = -hw + (span * i) / segs, x1 = -hw + (span * (i + 1)) / segs;
      const xm = (x0 + x1) / 2;
      const len = Math.hypot(x1 - x0, railY(x1) - railY(x0));
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 0.14), M.stoneDressed);
      bar.position.set(xm, railY(xm) + 0.3, s * (width / 2 - 0.1));
      bar.rotation.z = Math.atan2(railY(x1) - railY(x0), x1 - x0);
      group.add(bar);
    }
    for (let i = 0; i <= segs; i += 2) {
      const x = -hw + (span * i) / segs;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.88, 0.17), M.stone);
      post.position.set(x, railY(x) + 0.44, s * (width / 2 - 0.1));
      group.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 8), M.stoneDressed);
      cap.position.set(x, railY(x) + 0.94, s * (width / 2 - 0.1));
      group.add(cap);
    }
  }
  return group;
}

/**
 * 平梁桥 / 三折廊桥（小飞虹一类）：几段低平的石桥面 + 中段盖一间廊屋。
 * 沿 +Z 延伸（横跨一条东西向的水巷）。
 */
export function coveredBridge({ length = 14, width = 3.4, deckY = 0.62, segments = 3, roofH = 1.5, houseLen = 5.2 }) {
  const group = new THREE.Group();
  const seg = length / segments;
  for (let i = 0; i < segments; i++) {
    const z = -length / 2 + seg * (i + 0.5);
    const rise = i === 1 ? 0.32 : 0;
    const slab = new THREE.Mesh(box(width, 0.3, seg - 0.12, 0, deckY + rise, z), M.stoneDressed);
    group.add(slab);
    const girders = [];
    for (const off of [-width * 0.32, width * 0.32]) {
      girders.push(box(0.22, 0.5, seg - 0.1, off, deckY - 0.35 + rise, z));
    }
    group.add(mesh(girders, M.pillarDark));
  }
  // 桥栏
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railingGeo(length - 0.4, { height: 0.7, spacing: 1.2 }), M.stone);
    r.position.set(s * (width / 2 - 0.12), deckY + 0.15, 0);
    r.rotation.y = Math.PI / 2;
    group.add(r);
  }
  // 中段廊屋 + 彩画檐
  const wallH = 2.5;
  const posts = [];
  for (const zz of [-houseLen / 2, houseLen / 2]) {
    for (const s of [-1, 1]) posts.push(box(0.2, wallH, 0.2, s * (width / 2 - 0.2), deckY + wallH / 2, zz));
  }
  group.add(mesh(posts, M.pillar));
  const lintel = mesh([box(0.22, 0.26, houseLen, -width / 2 + 0.2, deckY + wallH, 0),
    box(0.22, 0.26, houseLen, width / 2 - 0.2, deckY + wallH, 0)], M.beam);
  group.add(lintel);
  const roof = new THREE.Mesh(chineseRoof({ width: width + 0.9, depth: houseLen, height: roofH, overhang: 0.4, ridgeRatio: 0.2, curve: 0.5 }), M.roofDark);
  roof.position.y = deckY + wallH + 0.2;
  roof.rotation.y = Math.PI / 2;
  group.add(roof);
  group.add(new THREE.Mesh(box(0.3, 0.2, houseLen + 0.4, 0, deckY + wallH + roofH + 0.24, 0), M.ridge));
  return group;
}

/* ------------------------------------------------------------------ 石舫 */

/** 香洲一类石舫：石砌船身 + 木舱 + 后阁，头尾翘起。沿 +Z，头朝 +Z */
export function stoneBoat({ length = 15, width = 3.4, height = 1.0, cabin = true, tower = true }) {
  const group = new THREE.Group();
  const stations = [];
  const N = 14;
  for (let i = 0; i <= N; i++) stations.push(-length / 2 + (length * i) / N);
  const profile = (z) => {
    const t = (z + length / 2) / length;
    const full = Math.sin(Math.PI * Math.pow(t, 0.85)) * 0.75 + 0.28;
    const half = (width / 2) * full;
    const sheer = -0.55 * Math.pow(t - 0.5, 2) + 0.5;
    return [
      [-half, height * 0.1 + sheer * 0.5],
      [-half * 0.94, height * 0.92 + sheer * 0.5],
      [half * 0.94, height * 0.92 + sheer * 0.5],
      [half, height * 0.1 + sheer * 0.5],
    ];
  };
  const hull = loftHull(profile, stations, false);
  group.add(new THREE.Mesh(hull, M.stone));
  // 甲板
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.14, length * 0.94), M.stoneDressed);
  deck.position.y = height * 0.95;
  group.add(deck);
  // 舷墙
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, length * 0.9), M.stone);
    rail.position.set(s * width * 0.42, height * 1.2, 0);
    group.add(rail);
  }
  if (cabin) {
    const cw = width * 0.66, cl = length * 0.42, ch = 2.1;
    const posts = [];
    for (const zz of [-cl / 2, cl / 2]) {
      for (const s of [-1, 1]) posts.push(box(0.16, ch, 0.16, s * cw / 2, height * 1.2 + ch / 2, zz));
    }
    group.add(mesh(posts, M.pillar));
    const core = new THREE.Mesh(new THREE.PlaneGeometry(cl, ch * 0.8), M.lattice);
    for (const s of [-1, 1]) {
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.92, ch * 0.78), M.lattice);
      w2.position.set(s * cw / 2, height * 1.2 + ch * 0.45, 0);
      w2.rotation.y = Math.PI / 2;
      group.add(w2);
    }
    core.position.set(0, height * 1.2 + ch * 0.45, cl / 2);
    group.add(core);
    const roof = new THREE.Mesh(chineseRoof({ width: cw + 1.0, depth: cl + 0.8, height: 1.0, overhang: 0.34, ridgeRatio: 0.1, curve: 0.45 }), M.roofRoll);
    roof.position.y = height * 1.2 + ch;
    roof.rotation.y = Math.PI / 2;
    group.add(roof);
  }
  if (tower) {
    const tw = width * 0.62, tl = length * 0.2, th = 2.5;
    const zc = -length * 0.32;
    const posts = [];
    for (const zz of [-tl / 2, tl / 2]) for (const s of [-1, 1]) posts.push(box(0.16, th, 0.16, s * tw / 2, height * 1.2 + th / 2, zc + zz));
    group.add(mesh(posts, M.pillar));
    const floor = new THREE.Mesh(box(tw, 0.14, tl, 0, height * 1.2 + th, zc), M.woodFloor);
    group.add(floor);
    const roof = new THREE.Mesh(chineseRoof({ width: tw + 0.9, depth: tl + 0.7, height: 1.2, overhang: 0.3, ridgeRatio: 0.2 }), M.roof);
    roof.position.y = height * 1.2 + th + 0.5;
    roof.rotation.y = Math.PI / 2;
    group.add(roof);
    const railMesh = new THREE.Mesh(railingGeo(tw, { height: 0.6 }), M.stone);
    railMesh.position.set(0, height * 1.2 + th + 0.07, zc + tl / 2);
    group.add(railMesh);
  }
  return group;
}

/* ------------------------------------------------------------------ rockery */

/** 湖石峰：几个被压扁揉皱的球叠成一峰，孔洞靠深色凹腔暗示 */
export function rockPeak({ h = 4.2, r = 1.2, lumps = 5 } = {}) {
  const group = new THREE.Group();
  let y = 0;
  for (let i = 0; i < lumps; i++) {
    const k = i / (lumps - 1 || 1);
    const rad = r * (1 - k * 0.55) * rr(0.8, 1.15);
    const g = new THREE.IcosahedronGeometry(rad, 1);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      const w = 0.34 * Math.sin(px * 2.1 + py * 1.6) * Math.cos(pz * 2.4);
      pos.setXYZ(v, px * (1 + w * 0.4), py * (1 - 0.35 + w * 0.3), pz * (1 + w * 0.4));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.rock);
    m.position.set(rr(-0.25, 0.25) * r, y + rad * 0.55, rr(-0.25, 0.25) * r);
    m.rotation.set(rr(-0.3, 0.3), rr(0, 3), rr(-0.2, 0.2));
    group.add(m);
    y += rad * (0.85 + k * 0.3);
  }
  // 顶部收一个尖
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.22, 7), M.rock);
  cap.position.y = y + h * 0.08;
  group.add(cap);
  group.scale.y = h / Math.max(0.6, y);
  return group;
}

/** 土石山：一层层揉皱的圆台堆成，山顶平可置亭 */
export function hill({ w = 26, d = 16, h = 4.2, terraces = 6, seedShift = 0 } = {}) {
  const group = new THREE.Group();
  for (let i = 0; i < terraces; i++) {
    const k = i / (terraces - 1);
    const rad = (1 - k * 0.62);
    const g = new THREE.CylinderGeometry(w / 2 * rad * 0.92, w / 2 * rad, h / terraces * 1.25, 22, 2);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      const n = 0.16 * Math.sin(px * 0.5 + seedShift) * Math.cos(pz * 0.45 - seedShift)
        + 0.09 * Math.sin(px * 1.2 - pz * 0.9);
      pos.setXYZ(v, px * (1 + n), py + n * 0.5, pz * (1 + n * 0.8));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, i % 2 ? M.rock : M.stoneDark);
    m.position.set(rr(-1, 1) * w * 0.06, (h / terraces) * (i + 0.4), rr(-1, 1) * d * 0.05);
    m.scale.z = d / w;
    group.add(m);
  }
  group.children.forEach((c) => { c.position.y -= h * 0.12; });
  return group;
}

/* ------------------------------------------------------------------ plants */

export function tree({ trunkH = 3.4, crown = 2.6, kind = 'broad' } = {}) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkH * 0.045, trunkH * 0.075, trunkH, 7), M.pillarDark);
  trunk.position.y = trunkH / 2;
  group.add(trunk);
  const blobs = kind === 'pine' ? 4 : 3;
  for (let i = 0; i < blobs; i++) {
    const g = new THREE.IcosahedronGeometry(crown * rr(0.55, 0.9), 1);
    const m = new THREE.Mesh(g, kind === 'plum' ? M.plumBlossom : i % 2 ? M.leaf : M.leafBright);
    m.position.set(rr(-1, 1) * crown * 0.5, trunkH + rr(-0.2, 0.6) * crown, rr(-1, 1) * crown * 0.5);
    m.scale.y = rr(0.62, 0.9);
    group.add(m);
  }
  return group;
}

/**
 * 一丛竹：细竿 + 下垂的叶簇。叶片要小而密，放大到一米就成了一块块板。
 * 整丛合并成两个网格（竿 / 叶）——一丛若留上百个 mesh，全园几万根竹会把
 * draw call 和加载时间一起拖死。
 */
export function bambooClump({ count = 9, height = 4.6, radius = 1.1 } = {}) {
  const group = new THREE.Group();
  const culms = [];
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const a = rr(0, Math.PI * 2), r = rr(0.1, radius);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = height * rr(0.78, 1.08);
    const tilt = rr(-0.07, 0.07);
    const g = new THREE.CylinderGeometry(0.045, 0.06, h, 5);
    g.translate(x, h / 2, z);
    g.rotateZ(tilt);
    culms.push(g);
    for (let j = 0; j < 11; j++) {
      const lf = new THREE.PlaneGeometry(0.66, 0.13);
      lf.rotateZ(rr(-0.7, 0.7));
      lf.rotateX(rr(-1.1, -0.25));
      lf.rotateY(rr(0, Math.PI));
      lf.translate(x + rr(-0.34, 0.34), h * rr(0.55, 0.99), z + rr(-0.34, 0.34));
      leaves.push(lf);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(culms), M.leafBright));
  const leafMesh = new THREE.Mesh(mergeGeometries(leaves), M.bambooLeaf);
  leafMesh.castShadow = true;
  group.add(leafMesh);
  return group;
}

/** 芭蕉：几片大叶从假茎上散开，投影就打在它们身上 */
export function plantain({ count = 5, height = 3.2 } = {}) {
  const group = new THREE.Group();
  const leafGeo = new THREE.PlaneGeometry(2.0, 1.15, 6, 3);
  const p = leafGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -0.22 * Math.pow(Math.abs(x) / 1.0, 2) + 0.1 * Math.sin(y * 2));
  }
  leafGeo.computeVertexNormals();
  for (let i = 0; i < count; i++) {
    const a = rr(0, Math.PI * 2);
    const h = height * rr(0.75, 1.1);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, h, 6), M.leafBright);
    stalk.position.set(Math.cos(a) * rr(0.1, 0.7), h / 2, Math.sin(a) * rr(0.1, 0.7));
    stalk.rotation.z = rr(-0.12, 0.12);
    group.add(stalk);
    for (let j = 0; j < 5; j++) {
      const lf = new THREE.Mesh(leafGeo, M.plantain);
      const spread = (j / 5) * Math.PI * 2 + rr(-0.3, 0.3);
      lf.position.set(Math.cos(spread) * 0.95, h * rr(0.82, 1.02), Math.sin(spread) * 0.95);
      lf.rotation.set(rr(-0.5, -0.1), spread + Math.PI / 2, rr(-0.35, 0.35));
      lf.scale.setScalar(rr(0.85, 1.2));
      group.add(lf);
    }
  }
  return group;
}

/* --------------------------------------------------- near-camera occluders */
const occluders = [];
/**
 * Things that must never fill the frame when the viewer walks up to them.
 * `center` is needed for meshes whose geometry was baked at the site.
 */
export function registerOccluder(obj, radius = 3.2, center = null) {
  const at = center || obj.position.clone();
  occluders.push({ obj, radius, at });
  return obj;
}
export function declutter(cameraPos) {
  for (const o of occluders) o.obj.visible = o.at.distanceTo(cameraPos) > o.radius;
}

/** hanging lantern on a cord — 园灯最常见的样子 */
export function lanternMesh({ size = 0.5, color = PAL.lanternWarm, tassel = true } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(size, 14, 10),
    new THREE.MeshBasicMaterial({ map: T.lanternPaper('#fff2d4', color === PAL.lanternWarm ? '#e8734a' : '#5f8f7a'), toneMapped: false, fog: false }));
  body.scale.y = 1.18;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 1.85, 12, 10),
    new THREE.MeshBasicMaterial({ map: T.softGlow('255,196,124', 0.16), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.material.toneMapped = false;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.42, size * 0.46, size * 0.2, 8), M.gilt);
  cap.position.y = size * 1.14;
  group.add(body, halo, cap);
  if (tassel) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, size * 0.9, 4), glow('#e06a4a', 0.9));
    t.position.y = -size * 1.6;
    group.add(t);
  }
  group.userData.lamp = { body, halo, size };
  return group;
}

/** 石灯笼样式的立灯：青石座 + 灯室 + 暖光 */
export function stoneLamp({ h = 1.5 } = {}) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.24, h * 0.3, h * 0.16, 10), M.stone);
  base.position.y = h * 0.08;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.11, h * 0.13, h * 0.5, 8), M.stone);
  shaft.position.y = h * 0.4;
  const house = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.22, h * 0.24, h * 0.26, 6), M.stoneDressed);
  house.position.y = h * 0.76;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(h * 0.12, 10, 8), glow(PAL.lanternWarm, 2.1));
  flame.position.y = h * 0.76;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.16, 6), M.roofDark);
  roof.position.y = h * 0.94;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.softGlow('255,190,120', 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(h * 0.95);
  halo.position.y = h * 0.76;
  halo.material.toneMapped = false;
  group.add(base, shaft, house, flame, roof, halo);
  group.userData.lamp = { body: flame, halo, size: h * 0.12 };
  return group;
}

/* ---------------------------------------------------- 个园用的通用件 */

/** 梅花形轮廓：五瓣，半径按 r = R(0.7 + 0.3cos5θ) 起伏，用于春山南墙的梅花窗 */
export function flowerOutline(R, { petals = 5, waist = 0.3, seg = 60 } = {}) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const r = R * (1 - waist + waist * Math.cos(petals * a));
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/**
 * 一段带洞的墙：holes 支持长方洞与梅花洞，墙头压一道瓦。
 * 音洞、梅花窗、巷门都从这一个函数出来，改墙形只改一处。
 */
export function wallWithHoles({
  length, height, thickness = 0.45, holes = [], cap = true,
  mat = M.wall, capMat = M.roofDark, sill = 0,
} = {}) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0); shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, height); shape.lineTo(-length / 2, height); shape.closePath();
  for (const h of holes) {
    const path = new THREE.Path();
    if (h.round) {
      // 音洞：早期资料只作"多留圆洞"，那就真开成圆的
      const r = h.r || 0.42;
      path.absarc(h.x, h.y || (h.r || 0.42), r, 0, Math.PI * 2, true);
    } else if (h.flower) {
      const ring = flowerOutline(h.r || 0.55);
      ring.forEach(([dx, dy], i) => {
        const x = h.x + dx, y = (h.y || (h.r || 0.55)) + dy;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
      });
      path.closePath();
    } else {
      const w = h.w || 0.75, hh = h.h || 1.2;
      path.moveTo(h.x - w / 2, (h.y || sill + hh / 2) - hh / 2);
      path.lineTo(h.x + w / 2, (h.y || sill + hh / 2) - hh / 2);
      path.lineTo(h.x + w / 2, (h.y || sill + hh / 2) + hh / 2);
      path.lineTo(h.x - w / 2, (h.y || sill + hh / 2) + hh / 2);
      path.closePath();
    }
    shape.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  const wall = new THREE.Mesh(g, mat);
  wall.position.z = -thickness / 2;
  wall.castShadow = true; wall.receiveShadow = true;
  group.add(wall);
  if (cap) {
    group.add(new THREE.Mesh(box(length + 0.2, 0.18, thickness + 0.34, 0, height + 0.09, 0), capMat));
    group.add(new THREE.Mesh(box(length + 0.2, 0.26, thickness * 0.6, 0, height + 0.3, 0), capMat));
  }
  return group;
}

/**
 * 长廊：沿 XZ 折线一段段接出来，卷棚顶、两柱一开间、下设槛墙。
 * pts 是廊的中线拐点，return 里带上每段的中点，供落灯与立柱使用。
 */
export function corridorRun({ pts, width = 2.6, height = 2.75, roofH = 0.95, spacing = 2.6, base = 0 } = {}) {
  const group = new THREE.Group();
  const middles = [];
  const floorGeo = new THREE.BoxGeometry(1, 0.14, width);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    const seg = new THREE.Group();
    seg.position.set((x0 + x1) / 2, base, (z0 + z1) / 2);
    seg.rotation.y = -ang;
    const n = Math.max(2, Math.round(len / spacing));
    // 柱网与槛墙
    const posts = [];
    for (let k = 0; k <= n; k++) {
      const lx = -len / 2 + (len * k) / n;
      for (const s of [-1, 1]) posts.push(pillarGeo(height, 0.13, false).clone().translate(lx, base + height / 2, s * (width / 2 - 0.14)));
    }
    seg.add(mesh(posts, M.pillar));
    for (const s of [-1, 1]) {
      seg.add(new THREE.Mesh(box(len, 0.62, 0.2, 0, base + 0.31, s * (width / 2 - 0.12)), M.wall));
      seg.add(new THREE.Mesh(box(len + 0.1, 0.1, 0.34, 0, base + 0.66, s * (width / 2 - 0.12)), M.step));
    }
    // 额枋 + 卷棚顶（脊顺廊走）
    for (const s of [-1, 1]) {
      seg.add(new THREE.Mesh(box(len, 0.26, 0.2, 0, base + height + 0.1, s * (width / 2 - 0.14)), M.beam));
    }
    const roof = new THREE.Mesh(
      chineseRoof({ width: len + 0.7, depth: width + 1.1, height: roofH, hip: false, curve: 0.72, overhang: 0.2, ridgeRatio: 1 }),
      M.roofRoll);
    roof.position.y = base + height + 0.22;
    seg.add(roof);
    const fl = new THREE.Mesh(floorGeo, M.pave);
    fl.scale.x = len; fl.position.y = base + 0.07;
    fl.receiveShadow = true;
    seg.add(fl);
    group.add(seg);
    middles.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, ang, len, y: base });
  }
  return { group, middles };
}

/** 蹬道：一块块压实的条石顺着斜面爬，秋山那些险径就靠它 */
export function stoneSteps({ from, to, count = 12, width = 1.5, mat = M.step } = {}) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const k = i / (count - 1 || 1);
    const x = from[0] + (to[0] - from[0]) * k;
    const y = from[1] + (to[1] - from[1]) * k;
    const z = from[2] + (to[2] - from[2]) * k;
    const s = new THREE.Mesh(box(width, 0.16, 0.62, 0, 0, 0), mat);
    s.position.set(x, y, z);
    s.rotation.y = Math.atan2(to[2] - from[2], to[0] - from[0]) + Math.PI / 2;
    s.rotation.z = -Math.atan2(to[1] - from[1], Math.hypot(to[0] - from[0], to[2] - from[2]));
    s.castShadow = true; s.receiveShadow = true;
    group.add(s);
  }
  return group;
}

/** 一块贴地的铺地/土面，y 略高于地坪以免与地面同深 */
export function groundPatch(w, d, x, z, mat = M.pave, y = 0.04) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export { loftHull };
function loftHull(profile, stations, closed = true) {
  const pos = [], uv = [], idx = [];
  const nv = profile(stations[0]).length;
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
