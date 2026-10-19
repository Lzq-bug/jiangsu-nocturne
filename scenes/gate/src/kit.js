import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  glassNight: '#0d1c30',
  steel: '#9aa4b4',
  concrete: '#6e7583',
  stone: '#8b93a1',
  stoneDark: '#3c4353',
  gold: '#e6c084',
  cyan: '#7fdcff',
  jade: '#79e8d4',
  warm: '#ffd79b',
  ink: '#10141f',
  water: '#04080f',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout — every reload shows the same night */
let seed = 20261010;
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
  const facade = T.facadeMaps();
  // extrude UVs are in metres, so the maps are scaled to cover the whole front
  facade.albedo.offset.set(0.5, 0);
  facade.emissive.offset.set(0.5, 0);
  M.glass = lit('#9fb4cc', { map: facade.albedo, emissiveMap: facade.emissive, rough: 0.34, metal: 0.62, emissive: '#ffffff', ei: 1.05 });
  M.facadeEmissive = facade.emissive;

  const side = T.cityWindows({ warm: 0.5, density: 0.3 });
  side.repeat.set(1 / 3.4, 1 / 7.5);
  const sideEm = T.cityWindows({ warm: 0.62, density: 0.34 });
  sideEm.repeat.set(1 / 3.4, 1 / 7.5);
  M.glassSide = lit('#8fa6c0', { map: side, emissiveMap: sideEm, rough: 0.36, metal: 0.6, emissive: '#ffffff', ei: 0.9 });

  M.steel = lit('#5d6a80', { rough: 0.42, metal: 0.85, emissive: '#0a1424', ei: 0.6 });
  M.mullion = lit('#2a3446', { rough: 0.5, metal: 0.7 });
  M.concrete = lit('#5c6472', { map: T.noise(), rough: 0.95 });
  M.stone = lit('#7d8695', { map: T.paving(), rough: 0.88 });
  M.stoneDark = lit('#3a4152', { map: T.paving('#1a202c'), rough: 0.9 });
  M.deck = lit('#2b3345', { rough: 0.8 });
  M.ink = lit('#1a2031', { rough: 0.75, metal: 0.2 });
  M.dark = lit('#0e1220', { rough: 0.9 });

  const city = T.cityWindows({ warm: 0.78, density: 0.5 });
  M.city = lit('#6e7f96', { map: city, emissiveMap: city, rough: 0.55, metal: 0.4, emissive: '#ffffff', ei: 0.85 });
  const cityCool = T.cityWindows({ warm: 0.22, density: 0.45 });
  M.cityCool = lit('#63748c', { map: cityCool, emissiveMap: cityCool, rough: 0.5, metal: 0.45, emissive: '#ffffff', ei: 0.8 });
  M.silhouette = lit('#0a0f1a', { rough: 0.9 });
  return M;
}

/* ------------------------------------------------------------------ geometry */

export function box(w, h, d, x = 0, yBottom = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, yBottom + h / 2, z);
  return g;
}

export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  return new THREE.Mesh(g, material);
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
  return g;
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
