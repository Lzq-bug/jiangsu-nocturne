import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  concrete: '#6f757c',
  concreteDark: '#4a5158',
  steel: '#5d6878',
  steelDark: '#2b3340',
  asphalt: '#242a31',
  ballast: '#4e4a46',
  tower: '#b9bdb4',
  towerWarm: '#a89b7f',
  stone: '#8b8f8a',
  rail: '#9aa3ad',
  lamp: '#ffe4bb',
  flag: '#c8261f',
  ink: '#0b1016',
  water: '#03080c',
  ship: '#39424c',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout — every reload shows the same night */
let seed = 20261017;
export function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + rand() * (b - a);
export const pick = (arr) => arr[(rand() * arr.length) | 0];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => clamp(t, 0, 1);

/* ------------------------------------------------------------------ materials */
const glowMats = new Map();
/** unlit HDR surface — everything that should feed the bloom pass */
export function glow(color, intensity = 1.6) {
  const key = `g${color}-${intensity}`;
  if (!glowMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: rgb(color).multiplyScalar(intensity) });
    m.toneMapped = false; m.fog = false;
    glowMats.set(key, m);
  }
  return glowMats.get(key);
}

export function lit(color, {
  map = null, emissiveMap = null, alphaMap = null, rough = 0.85, metal = 0,
  emissive = 0x000000, ei = 1, side = THREE.FrontSide, opacity = 1,
  alphaTest = 0, vertexColors = false,
} = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: rgb(color), map, emissiveMap, alphaMap, roughness: rough, metalness: metal,
    emissive: rgb(emissive), emissiveIntensity: ei, side,
    transparent: opacity < 1 || alphaTest > 0, opacity, alphaTest, vertexColors,
    depthWrite: alphaTest > 0 ? true : opacity >= 1,
  });
  return m;
}

export const M = {};

export function initMaterials() {
  /* 混凝土：桥墩、引桥排架、堡基。夜里被月光打到的那面必须是灰白而不是黑 */
  M.concrete = lit(PAL.concrete, { map: T.concrete({ meters: 4.2, base: '#6b7178' }), rough: 0.94, side: THREE.DoubleSide, emissive: '#151d25', ei: 0.34 });
  M.concreteDark = lit(PAL.concreteDark, { map: T.concrete({ meters: 3.2, base: '#464d55' }), rough: 0.95, side: THREE.DoubleSide, emissive: '#10171f', ei: 0.3 });
  M.pier = lit('#7d848b', { map: T.concrete({ meters: 6.4, base: '#71787f', streak: 0.5 }), rough: 0.93, side: THREE.DoubleSide, emissive: '#161e27', ei: 0.34 });
  /* 沉井在水线以下的那一段：潮湿、有水痕 */
  M.pierWet = lit('#5a6167', { map: T.concrete({ meters: 5.2, base: '#575f66', streak: 0.9 }), rough: 0.86, side: THREE.DoubleSide, emissive: '#0a1015', ei: 0.25 });

  /* 钢桁梁：铆合的钢板，夜里吃灯的能力比混凝土强 */
  // 无环境贴图时 metalness 越高越黑：钢梁靠 emissive 撑住，不靠反射
  M.steel = lit(PAL.steel, { map: T.riveted({ meters: 3.6 }), rough: 0.62, metal: 0.22, emissive: '#1b2532', ei: 0.44 });
  M.steelDark = lit(PAL.steelDark, { rough: 0.66, metal: 0.25, emissive: '#121a24', ei: 0.42 });

  /* 桥面 */
  // 同一张图兼作 emissiveMap：车道线在夜里像反光漆那样读得出来
  M.asphalt = lit(PAL.asphalt, { map: T.asphalt(), emissiveMap: T.asphalt(), rough: 0.86, metal: 0.04, emissive: '#cfd8e6', ei: 0.16 });
  M.ballast = lit(PAL.ballast, { map: T.ballast(), rough: 0.97, side: THREE.DoubleSide });
  M.rail = lit(PAL.rail, { rough: 0.42, metal: 0.5, emissive: '#242e3a', ei: 0.4 });
  M.curb = lit('#7d8489', { map: T.paving({ meters: 2.2, base: '#767d84' }), rough: 0.9 });
  M.deckPlate = lit('#454d58', { map: T.deckPlate(), rough: 0.74, metal: 0.18, side: THREE.DoubleSide, emissive: '#141c25', ei: 0.36 });

  /* 桥头堡：黄色调的石材墙面（"金黄色花岗岩"一类的通例，形制为写意） */
  M.tower = lit(PAL.tower, { map: T.stoneFacade({ meters: 3.4 }), rough: 0.88, side: THREE.DoubleSide, emissive: '#33291a', ei: 0.46 });
  M.towerTrim = lit('#9a9070', { map: T.stoneFacade({ meters: 2.2 }), rough: 0.8, emissive: '#2a2317', ei: 0.4 });
  M.stone = lit(PAL.stone, { map: T.paving({ meters: 2.6, base: '#82867f' }), rough: 0.9 });
  M.plaza = lit('#7f8481', { map: T.paving({ meters: 3.4, base: '#717673' }), rough: 0.93, emissive: '#161d22', ei: 0.32 });
  M.statue = lit('#8d9188', { rough: 0.82, emissive: '#141814', ei: 0.24 });

  /* 栏板与浮雕 */
  M.railing = lit('#8d9398', { map: T.paving({ meters: 1.6, base: '#7e848a' }), rough: 0.86, side: THREE.DoubleSide, emissive: '#18202a', ei: 0.34 });
  M.reliefSun = lit('#878d92', { map: T.relief('sun'), rough: 0.8, side: THREE.DoubleSide, emissive: '#3b4550', ei: 0.55 });
  M.reliefScene = lit('#878d92', { map: T.relief('scene'), rough: 0.8, side: THREE.DoubleSide, emissive: '#3b4550', ei: 0.55 });
  M.reliefWorker = lit('#8a8378', { map: T.relief('worker'), rough: 0.76, side: THREE.DoubleSide, emissive: '#191a14', ei: 0.36 });

  /* 发光面：全部 MeshBasicMaterial + toneMapped=false，不吃灯只吃 bloom */
  M.lampGlobe = glow(PAL.lamp, 1.35);
  M.lampCore = glow('#fff3dc', 2.1);
  M.flag = lit(PAL.flag, { rough: 0.52, metal: 0.3, emissive: '#7d1210', ei: 0.62, side: THREE.DoubleSide });
  M.flagGlow = glow('#ff3a24', 1.25);
  M.outline = glow('#ffd9a4', 0.9);
  M.outlineCold = glow('#8fd0ff', 0.8);
  M.beamEdge = glow('#cfe6ff', 0.55);
  M.carHead = glow('#fff6e2', 1.5);
  M.carTail = glow('#ff4a3a', 1.2);
  M.win = lit('#2b3a48', { rough: 0.4, metal: 0.2, emissive: '#ffcf96', ei: 0.55 });
  M.shipWin = glow('#ffd9a0', 1.0);
  M.markRed = glow('#ff5540', 1.1);
  M.markGreen = glow('#5dffb0', 1.1);
  M.white = glow('#ffffff', 1.3);

  M.ink = lit('#0f151c', { rough: 0.9 });
  M.ship = lit(PAL.ship, { rough: 0.78, metal: 0.2, emissive: '#141c26', ei: 0.36 });
  /* 远景体块：不能是纯黑剪影，否则机位一正对就是一块死黑 */
  M.far = lit('#242c3a', { map: T.concrete({ meters: 12, base: '#1b2230' }), rough: 0.95, emissive: '#0b1017', ei: 0.3 });
  // 城的窗子中 emissiveMap 才是主体：没有它，夜里就是一堆黑盒子
  M.city = lit('#232b38', { map: T.cityFacade(), emissiveMap: T.cityFacade(), rough: 0.9, emissive: '#ffc084', ei: 0.8 });
  M.ground = lit('#2b333c', { map: T.concrete({ meters: 16, base: '#232a32' }), rough: 0.96, side: THREE.DoubleSide, emissive: '#111820', ei: 0.34 });
  M.grass = lit('#26332a', { map: T.noise(), rough: 0.96, side: THREE.DoubleSide, emissive: '#0a1208', ei: 0.24 });
  return M;
}

/* ------------------------------------------------------------------ geometry */

export function box(w, h, d, x = 0, yBottom = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, yBottom + h / 2, z);
  return g;
}

/** cylinders are base-anchored too, same convention as box() */
export function cyl(rBottom, rTop, h, seg, x = 0, yBottom = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, false);
  g.translate(x, yBottom + h / 2, z);
  return g;
}

/**
 * A member between two points, box-aligned along its own axis. Truss builders
 * use this for chords, verticals and diagonals.
 */
export function member(p0, p1, thick = 0.9, wide = thick) {
  const a = new THREE.Vector3(p0[0], p0[1], p0[2]);
  const b = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (!Number.isFinite(len) || len < 1e-4) return null;
  const g = new THREE.BoxGeometry(len, wide, thick);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  const c = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** 同一份材质在不同尺度的面上要不同的铺法：克隆一份改 repeat，别改共享的那个 */
const remats = new Map();
export function remat(base, u, v) {
  const key = `${base.uuid}:${u}x${v}`;
  if (remats.has(key)) return remats.get(key);
  const m = base.clone();
  for (const k of ['map', 'emissiveMap', 'alphaMap']) {
    if (!m[k]) continue;
    m[k] = m[k].clone();
    m[k].repeat.set(u, v);
    m[k].needsUpdate = true;
  }
  remats.set(key, m);
  return m;
}

export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts.filter(Boolean)) : parts;
  nanCheck(g, material);
  return new THREE.Mesh(g, material);
}

/**
 * 一个 NaN 顶点就能让整块几何被 three 剔掉（包围球半径 NaN → 不画），
 * 表现是"一孔桁架/一座堡凭空没了"，静帧上看不出来。合并处扫一次。
 */
export function nanCheck(g, material) {
  if (!g || !g.attributes || !g.attributes.position || g.userData.nanChecked) return g;
  g.userData.nanChecked = true;
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i++) {
    if (Number.isFinite(p[i])) continue;
    const name = (material && (material.name || material.color && `#${material.color.getHexString()}`)) || 'material';
    console.error(`NaN 顶点：材质 ${name}，第 ${Math.floor(i / 3)} 个顶点（共 ${p.length / 3}）`, new Error().stack);
    break;
  }
  return g;
}

/** merge a list of geometries into one mesh, skipping nulls */
export function merge(list) {
  return mergeGeometries(list.filter(Boolean));
}

/**
 * Loft a stack of horizontal sections. `levels` is [{y, cx, cz, sx, sz}].
 */
export function loft(levels, section, { uvScale = 1, capTop = true, capBottom = true } = {}) {
  const pos = [], uv = [], idx = [];
  const at = (t) => (typeof section === 'function' ? section(t) : section);
  const nv = at(0).length;
  for (let l = 0; l < levels.length; l++) {
    const lv = levels[l];
    for (const [px, pz] of at(l / (levels.length - 1))) {
      const x = lv.cx + px * lv.sx, z = lv.cz + pz * lv.sz;
      pos.push(x, lv.y, z);
      uv.push(x / uvScale, lv.y / uvScale);
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

/** rectangle in the XZ plane, half sizes 1 x 1 */
export const rectSection = () => [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Parametric quad grid. `fn(u,v)` returns [x,y,z]; UV is written in metres
 * so tiled maps keep their scale.
 */
export function quadGrid(fn, nu, nv, { spanU = 1, spanV = 1, flipU = false, colors = null } = {}) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const [x, y, z] = fn(u, v);
      pos.push(x, y, z);
      uv.push((flipU ? 1 - u : u) * spanU, v * spanV);
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
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ sprites */

/**
 * An additive halo sprite. Everything that has to look bright without casting
 * light uses one of these instead of a real lamp — SwiftShader pays for lights
 * twice over, once in the shader and once in the frame budget.
 */
export function softSprite(hue = '255,228,190', { hard = 0.1, opacity = 0.7 } = {}) {
  const tex = T.softGlow(hue, hard);
  const m = new THREE.SpriteMaterial({
    map: tex, color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity,
  });
  m.toneMapped = false;
  return m;
}

export function halo(parent, x, y, z, size, hue, { opacity = 0.7, hard = 0.1 } = {}) {
  const sp = new THREE.Sprite(softSprite(hue, { hard, opacity }));
  sp.position.set(x, y, z);
  sp.scale.set(size, size, 1);
  sp.renderOrder = 8;
  sp.name = 'halo';
  parent.add(sp);
  return sp;
}

/* --------------------------------------------------- near-camera occluders */
const occluders = [];
export function registerOccluder(obj, radius = 2.6, center = null) {
  const at = center || obj.position.clone();
  occluders.push({ obj, radius, at });
  return obj;
}
export function declutter(cameraPos) {
  for (const o of occluders) o.obj.visible = o.at.distanceTo(cameraPos) > o.radius;
}
