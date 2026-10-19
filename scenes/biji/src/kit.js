import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  plaster: '#cfcabd',       // 粉墙
  plasterShade: '#9a968c',
  tile: '#2b3138',          // 黛瓦
  wood: '#4a3223',          // 立柱、板壁
  woodDark: '#2b1d14',
  bamboo: '#c8a768',        // 篦齿
  comb: '#d8b884',          // 木梳
  stone: '#6b6f74',         // 条石驳岸
  stoneWarm: '#8a8274',
  flag: '#4a4f57',          // 青石板
  lantern: '#ff6a3c',
  lamp: '#ffc46a',
  gold: '#e6c084',
  jade: '#79e8d4',
  ink: '#100f14',
  water: '#050a0c',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout — every reload shows the same night */
let seed = 20261014;
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

export function lit(color, { map = null, emissiveMap = null, rough = 0.85, metal = 0, emissive = 0x000000, ei = 1, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: rgb(color), map, emissiveMap, roughness: rough, metalness: metal,
    emissive: rgb(emissive), emissiveIntensity: ei, side, transparent, opacity,
  });
}

export const M = {};

export function initMaterials() {
  M.plaster = lit(PAL.plaster, { map: T.plaster(), rough: 0.94 });

  const tiles = T.roofTiles();
  // 檐口要从巷里仰看得到底面（椽与望板），单面片会薄成一条漂浮的黑边
  M.tile = lit('#8c9299', { map: tiles, rough: 0.62, metal: 0.12, emissive: '#0a1016', ei: 0.35, side: THREE.DoubleSide });

  M.wood = lit(PAL.wood, { map: T.wood(), rough: 0.72, metal: 0.05 });
  M.woodDark = lit(PAL.woodDark, { map: T.wood('#2c1e15'), rough: 0.8 });

  M.bamboo = lit(PAL.bamboo, { map: T.bamboo(), rough: 0.55, metal: 0.05 });
  const combFine = T.combTeeth({ teeth: 46, base: PAL.comb });
  M.comb = lit('#d8b884', { map: T.combTeeth({ teeth: 16, base: PAL.comb }), rough: 0.44, metal: 0.06 });
  M.combFine = lit('#c8a768', { map: combFine, rough: 0.4, metal: 0.05 });

  M.stone = lit(PAL.stone, { map: T.stoneCourses(), rough: 0.9 });
  M.stoneWarm = lit(PAL.stoneWarm, { map: T.stoneCourses('#9b9282'), rough: 0.88 });
  M.flagWet = lit('#3a3f47', { map: T.paving('#33383f', 3), rough: 0.28, metal: 0.45 });

  // 窗棂: the lamp inside is what the 「店堂灯火」 slider moves
  const lat = T.lattice({ pattern: '方眼', k: 0.8 });
  M.lattice = lit('#caa06a', { map: lat.albedo, emissiveMap: lat.emissive, rough: 0.66, emissive: '#ffffff', ei: 0.95 });
  const latIce = T.lattice({ pattern: '冰裂', k: 0.55, lit: '255,206,150' });
  M.latticeIce = lit('#b08a58', { map: latIce.albedo, emissiveMap: latIce.emissive, rough: 0.7, emissive: '#ffffff', ei: 0.7 });
  const latDark = T.lattice({ pattern: '直棂', k: 0.18, lit: '170,150,130' });
  M.latticeDark = lit('#5a4a3a', { map: latDark.albedo, emissiveMap: latDark.emissive, rough: 0.78, emissive: '#ffffff', ei: 0.22 });

  // 灯笼 body: emissive skin, dimmed by the 「灯笼」 slider
  M.lantern = lit('#8f2a12', { map: T.lanternSkin({ hue: '255,110,64', k: 0.86 }), emissiveMap: T.lanternSkin({ hue: '255,150,80', k: 1 }), rough: 0.6, emissive: '#ffffff', ei: 1.15 });
  // the pavilion's own lamps and 格扇光, driven by 「近水阁灯」
  M.pavilionLamp = lit('#93401a', { map: T.lanternSkin({ hue: '255,188,116', k: 0.9 }), emissiveMap: T.lanternSkin({ hue: '255,204,140', k: 1 }), rough: 0.55, emissive: '#ffffff', ei: 1.1 });
  M.pavilionPanel = lit('#c29a62', { map: lat.albedo, emissiveMap: lat.emissive, rough: 0.62, emissive: '#ffffff', ei: 0.92 });

  M.plank = lit('#3a2517', { map: T.planks(), rough: 0.76 });

  // the new-city towers are lofted with metre UVs: one window tile per ~11 x 8.5 m
  const city = T.cityWindows({ warm: 0.6, density: 0.44 });
  city.repeat.set(1 / 11, 1 / 8.5);
  M.city = lit('#3c4351', { map: city, emissiveMap: city, rough: 0.62, metal: 0.3, emissive: '#ffffff', ei: 0.34 });
  const cityCoolTex = T.cityWindows({ warm: 0.24, density: 0.4 });
  cityCoolTex.repeat.set(1 / 11, 1 / 8.5);
  M.cityCool = lit('#39435a', { map: cityCoolTex, emissiveMap: cityCoolTex, rough: 0.6, metal: 0.34, emissive: '#ffffff', ei: 0.3 });
  M.silhouette = lit('#1b2130', { rough: 0.92 });

  M.metal = lit('#3a3a40', { rough: 0.42, metal: 0.85 });
  M.ink = lit('#1a1a22', { rough: 0.8, metal: 0.15 });
  M.foliage = lit('#1d2a1e', { map: T.noise(), rough: 0.95 });
  return M;
}

/* ------------------------------------------------------------------ geometry */

/**
 * a box sitting on yBottom. Box UVs are 0..1 per face by default, which throws
 * away the metre-scale of every texture; `uv` rewrites them as "one tile per uv
 * metres" so a 40 m wall and a 0.5 m rail carry the same-size brick.
 */
export function box(w, h, d, x = 0, yBottom = 0, z = 0, uv = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uv > 0) {
    const a = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const su = dims[f][0] / uv, sv = dims[f][1] / uv;
      for (let i = 0; i < 4; i++) {
        const j = f * 4 + i;
        a.setXY(j, a.getX(j) * su, a.getY(j) * sv);
      }
    }
    a.needsUpdate = true;
  }
  g.translate(x, yBottom + h / 2, z);
  // checked after the move: a NaN placement is as fatal as a NaN dimension
  return nanCheck(g, `box(${[w, h, d, x, yBottom, z, uv].join(',')})`);
}

/**
 * A NaN vertex kills a merged mesh's bounding sphere, and three.js then culls the
 * whole thing — the geometry simply vanishes from the frame. So every geometry
 * factory checks its output and blames the caller by file:line.
 */
const NL = String.fromCharCode(10);
export function nanCheck(g, tag) {
  if (!g || g.userData.nanChecked) return g;
  g.userData.nanChecked = true;
  const a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    if (!Number.isFinite(a.getX(i)) || !Number.isFinite(a.getY(i)) || !Number.isFinite(a.getZ(i))) {
      const frames = (new Error().stack || '').split(NL).slice(2, 7)
        .map((l) => l.replace(/^\s+at\s+/, '').replace(/\s*\(?(http:[^)]*?)\)?$/, ' @ $1')).join(NL + '    ');
      console.warn(`NaN 顶点 [${tag}] 第 ${i} 个 / ${g.type} n=${a.count}${NL}    ${frames}`);
      break;
    }
  }
  return g;
}

export function mesh(parts, material, name = '') {
  const list = Array.isArray(parts) ? parts : [parts];
  list.forEach((g, i) => nanCheck(g, `${name || (material && (material.name || material.type)) || 'mesh'}#${i}`));
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  const m = new THREE.Mesh(g, material);
  if (name) m.name = name;
  return m;
}

/** vertical cylinder / cone frustum with an n-gon section — drums, baskets, finials */
export function prism(n, rBottom, rTop, h, x = 0, yBottom = 0, z = 0, rotY = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, n, 1, false);
  g.rotateY(rotY);
  g.translate(x, yBottom + h / 2, z);
  return nanCheck(g, `prism(${[n, rBottom, rTop, h, x, yBottom, z].join(',')})`);
}

/**
 * Loft a stack of horizontal sections. `levels` is [{y, cx, cz, sx, sz}];
 * `section` is a closed point list in the XZ plane at unit half size, or a
 * function of the normalised level index returning one.
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
  nanCheck(g, 'loft');
  return g;
}

/** regular polygon section in the XZ plane, unit circumradius */
export function polygonSection(n = 8, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

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

/**
 * 坡屋顶 — a gabled roof spanning `len` along X, sectioned by `profile`, a list
 * of [z, y] pairs running eave → ridge → eave in metres. `camber` lifts both
 * ends of the ridge, which is how the 江南 起翘 reads at night.
 * Returns the roof shell.
 */
export function slopeRoof(len, profile, { camber = 0.35, seg = 10, uvScale = 1.6 } = {}) {
  const n = profile.length;
  const pos = [], uv = [], idx = [];
  for (let s = 0; s <= seg; s++) {
    const t = s / seg, x = -len / 2 + len * t;
    const lift = camber * Math.pow(Math.abs(2 * t - 1), 2.4);
    for (let i = 0; i < n; i++) {
      const [z, y] = profile[i];
      pos.push(x, y + lift, z);
      uv.push(x / uvScale, (y + i * 0.6 + z) / uvScale);
    }
  }
  for (let s = 0; s < seg; s++) {
    for (let i = 0; i < n - 1; i++) {
      const a = s * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  nanCheck(g, 'slopeRoof');
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

/** eased parametric helpers shared by the geometry builders */
export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ 匾额 */
const plaqueMats = new Map();
/** one material per plaque text: a lacquered board with gold glyphs */
export function plaqueMat(text) {
  if (!plaqueMats.has(text)) {
    plaqueMats.set(text, new THREE.MeshStandardMaterial({
      map: T.plaque(text), roughness: 0.55, metalness: 0.1,
      emissive: 0x120c06, emissiveIntensity: 0.5,
    }));
  }
  return plaqueMats.get(text);
}

/* ------------------------------------------------------------------ 幌子 */
const signMats = new Map();
/** one material per banner text — the glyph is baked into the canvas */
export function signMat(text, base = '#d9c48a') {
  const key = `${text}-${base}`;
  if (!signMats.has(key)) {
    signMats.set(key, new THREE.MeshStandardMaterial({
      map: T.signboard(text, { base }), color: 0xffffff,
      roughness: 0.88, side: THREE.DoubleSide, emissive: 0x2a1a08, emissiveIntensity: 0.35,
    }));
  }
  return signMats.get(key);
}
