import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  plaster: '#c3ccc9',
  tile: '#242e3a',
  timber: '#4b3a2e',
  timberDark: '#2a2118',
  stone: '#7b8285',
  huangshi: '#6d5c47',
  bamboo: '#8fae74',
  leaf: '#6c9463',
  paper: '#ffd9a0',
  lamp: '#ffb265',
  gold: '#e6c084',
  ink: '#0b1016',
  water: '#040a0e',
};

export const rgb = (c) => new THREE.Color(c);

/* deterministic layout — every reload shows the same night */
let seed = 20261015;
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
  M.plaster = lit(PAL.plaster, { map: T.plaster(), rough: 0.94, side: THREE.DoubleSide });
  // 黛瓦 is dark, but at night a roof is the main plane that catches the moon:
  // kept high enough that the plan of the garden still reads from above
  M.wallCap = lit('#3d4a5c', { map: T.tiles({ meters: 1.1, base: '#33404f' }), rough: 0.7, metal: 0.06, side: THREE.DoubleSide, emissive: '#16222f', ei: 0.3 });
  M.roof = lit('#42505f', { map: T.tiles({ meters: 1.25, base: '#374455' }), rough: 0.62, metal: 0.08, emissive: '#1d2c3e', ei: 0.38, side: THREE.DoubleSide });
  M.roofWarm = lit('#4a4650', { map: T.tiles({ meters: 1.25, cold: false, base: '#3d3a44' }), rough: 0.68, metal: 0.06, side: THREE.DoubleSide });
  M.timber = lit(PAL.timber, { rough: 0.72, metal: 0.04, emissive: '#241708', ei: 0.22 });
  M.timberDark = lit(PAL.timberDark, { rough: 0.8, emissive: '#0e0904', ei: 0.3 });
  M.stone = lit(PAL.stone, { map: T.paving({ meters: 1.8, base: '#6e747a' }), rough: 0.9 });
  M.paving = lit('#5a6470', { map: T.paving(), rough: 0.92 });
  M.rock = lit('#a08e74', { map: T.huangshi(), rough: 0.94, vertexColors: true, side: THREE.DoubleSide });
  M.rockPlain = lit('#9c8a71', { map: T.huangshi({ meters: 1.8 }), rough: 0.94, side: THREE.DoubleSide });
  M.stele = lit('#8f938a', { map: T.steleWall(), rough: 0.88, emissive: '#101418', ei: 0.25, side: THREE.DoubleSide });
  M.ink = lit('#161d26', { rough: 0.78, metal: 0.15 });
  M.dark = lit('#0d1218', { rough: 0.9 });
  M.silhouette = lit('#0a1014', { rough: 0.92 });
  M.gold = lit('#8f6f3c', { rough: 0.42, metal: 0.85, emissive: '#2c2008', ei: 0.4 });
  M.steel = lit('#4d5563', { rough: 0.48, metal: 0.8 });

  // 灯: a paper shell that carries its own light, and the hot core inside it
  M.lantern = lit(PAL.paper, { rough: 0.62, emissive: PAL.lamp, ei: 0.55, side: THREE.DoubleSide });
  M.lanternCore = glow('#ffcf9a', 1.15);

  // 漏窗: the bars stay timber, the opening is the lamp sheet behind them
  M.latticeFrame = lit('#3a3129', { rough: 0.8, side: THREE.DoubleSide });
  M.latticeLight = lit('#ffe6bd', { rough: 0.9, emissive: '#ffbd82', ei: 0.5 });

  M.bamboo = lit(PAL.bamboo, { rough: 0.62, metal: 0.04, emissive: '#141f13', ei: 0.22 });
  M.leaf = lit('#6d9668', {
    map: T.bambooLeaf(), rough: 0.78, side: THREE.DoubleSide, alphaTest: 0.42,
    emissive: '#101a0c', ei: 0.25,
  });
  M.lotus = lit('#4e5f42', {
    map: T.lotusLeaf(), rough: 0.85, side: THREE.DoubleSide, alphaTest: 0.45,
    emissive: '#0c140c', ei: 0.22,
  });
  // canopy: one dark mass, mottled rather than leafy — at night that reads further
  M.foliage = lit('#3a5230', { map: T.canopy(), rough: 0.95, side: THREE.DoubleSide, emissive: '#0e170c', ei: 0.3 });
  M.mossGround = lit('#3a4634', { map: T.paving({ meters: 1.6, base: '#3f4b3a' }), rough: 0.96 });
  return M;
}

/** a board with characters on it: 匾额 or 柱联. `board` is the ground colour. */
export function inscribed(text, w, h, opts = {}) {
  // the sheet is mapped onto the whole board, so its aspect has to match or the
  // glyphs come out stretched
  const ar = w / h;
  const cw = ar >= 1 ? 1024 : Math.max(96, Math.round(1024 * ar));
  const ch = ar >= 1 ? Math.max(96, Math.round(1024 / ar)) : 1024;
  const map = T.calligraphy(text, { w: cw, h: ch, ...opts });
  const m = new THREE.MeshStandardMaterial({
    // the sheet carries the ink colour, so the base must stay white
    color: new THREE.Color(0xffffff),
    map, transparent: !opts.board, roughness: 0.66, metalness: 0.1,
    emissive: rgb(opts.glow || '#000000'), emissiveIntensity: opts.ei ?? 0, emissiveMap: map,
  });
  const g = new THREE.PlaneGeometry(w, h);
  return new THREE.Mesh(g, m);
}

/* ------------------------------------------------------------------ geometry */

export function box(w, h, d, x = 0, yBottom = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, yBottom + h / 2, z);
  return g;
}

/** cylinders are used for columns and culms: yBottom keeps the same convention */
export function cyl(rBottom, rTop, h, seg, x = 0, yBottom = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, false);
  g.translate(x, yBottom + h / 2, z);
  return g;
}

export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;
  if (g && !g.userData.nanChecked) {
    g.userData.nanChecked = true;
    const p = g.attributes && g.attributes.position;
    if (p) {
      const a = p.array;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i])) {
          const n = (material && material.name) ? material.name : '未命名材质';
          const at = new Error().stack.split('\n').slice(2, 6).map((s) => s.trim()).join(' ← ');
          console.warn(`NaN 顶点：${n} / 顶点数 ${p.count} / 分量 ${i % 3} / ${at}`);
          break;
        }
      }
    }
  }
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

/**
 * Parametric quad grid. `fn(u,v)` returns [x,y,z]; UV is written in metres
 * (spanU along u, spanV along v) so tiled maps keep their scale.
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

/**
 * A smooth walk through control points given as [x, y, z], plus the frames
 * (tangent / right vector / accumulated length) every builder along a 廊 or a
 * 园墙 needs. `steps` is segments per span.
 */
export function pathFrames(points, { steps = 8, y = null } = {}) {
  const vs = points.map((p) => new THREE.Vector3(p[0], y !== null ? y : p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0.08);
  const n = (vs.length - 1) * steps + 1;
  const pts = [], tan = [], right = [], dist = [];
  let len = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const prev = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = curve.getPoint(i / (n - 1));
    const t = curve.getTangent(i / (n - 1)).setY(0).normalize();
    if (i > 0) len += p.distanceTo(prev);
    pts.push(p); tan.push(t); right.push(new THREE.Vector3().crossVectors(up, t).normalize());
    dist.push(len);
    prev.copy(p);
  }
  return { pts, tan, right, dist, length: len, curve };
}

/** a glowing tube along a 2-D point list on a fixed plane height */
export function tubeThrough(points, { radius = 0.16, seg = 3 } = {}) {
  const pts = points.map((p) => (p.length === 2 ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(...p)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
  return new THREE.TubeGeometry(curve, Math.max(12, pts.length * 4), radius, seg, false);
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

/* ------------------------------------------------------------------ shading */

/** paint a per-level tint into a lofted/stacked geometry (moss, damp, dust) */
export function tintLevels(g, levels, colourAt) {
  const pos = g.attributes.position.array;
  const col = new Float32Array(pos.length / 3 * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1];
    let k = 0;
    while (k < levels.length - 1 && levels[k + 1].y < y) k++;
    const a = levels[k], b = levels[Math.min(levels.length - 1, k + 1)];
    const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
    colourAt(c, a.y + (b.y - a.y) * t, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * Inject a wind sway into any lit material. Geometry is expected to be
 * base-anchored (its own y measured up from the ground), so local y is the
 * height the bend scales with; the phase comes from the world position so a
 * grove does not breathe in unison.
 */
export function swayed(material, { amp = 0.05, speed = 1, height = 4, base = 0.12, ref = 'garden' } = {}) {
  const m = material;
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform float uTime; uniform float uWind;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      {
        vec3 lp = transformed;
        #ifdef USE_INSTANCING
          lp = (instanceMatrix * vec4(lp, 1.0)).xyz;
        #endif
        vec3 wp = (modelMatrix * vec4(lp, 1.0)).xyz;
        float hf = clamp(transformed.y / ${height.toFixed(2)} + ${base.toFixed(2)}, 0.0, 1.7);
        hf = hf * hf;
        float ph = uTime * ${speed.toFixed(2)} + wp.x * 0.34 + wp.z * 0.21;
        transformed.x += (sin(ph) + 0.5 * sin(ph * 2.3 + 1.7)) * ${amp.toFixed(3)} * hf * uWind;
        transformed.z += (cos(ph * 0.86) + 0.5 * sin(ph * 1.9)) * ${amp.toFixed(3)} * 0.75 * hf * uWind;
      }
    `);
  };
  m.customProgramCacheKey = () => `sway-${ref}-${amp}-${speed}-${height}-${base}`;
  m.userData.sway = uniforms;
  return m;
}

/**
 * A lumpy canopy/rock blob. Polyhedron geometry is non-indexed, so displacing
 * each vertex by its own random number tears the surface into shards: the offset
 * here is a function of the vertex *direction*, which every copy of that corner
 * computes identically.
 */
export function blobGeometry(radius, { detail = 2, amp = 0.16, squash = 0.72, seed = 0 } = {}) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const hash = (x, y, z) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 7.13) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const L = Math.hypot(x, y, z) || 1;
    // quantise the direction so neighbouring vertices agree
    const q = 3.2;
    const dx = Math.round((x / L) * q) / q, dy = Math.round((y / L) * q) / q, dz = Math.round((z / L) * q) / q;
    const k = 1 + (hash(dx, dy, dz) - 0.5) * 2 * amp;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** eased parametric helpers shared by the geometry builders */
export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const lerp = (a, b, t) => a + (b - a) * t;

/** 举折: a Chinese roof is concave — low pitch at the ridge, steep at the eave */
export const eaveCurve = (t, lift = 0.42) => Math.pow(clamp01(t), 1 + lift);
