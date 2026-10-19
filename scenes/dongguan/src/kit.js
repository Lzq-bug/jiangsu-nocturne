import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const PAL = {
  lantern: '#ffc470',
  ember: '#ff9440',
  paper: '#ffe2b4',
  moon: '#cfe0ff',
  wood: '#3a2a1d',
  woodDark: '#221a12',
  plaster: '#3b352c',
  tile: '#232528',
  stone: '#4a4740',
  ink: '#0a0d12',
  water: '#050a10',
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
/** unlit HDR surface — everything that is meant to feed the bloom pass */
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
  // 凡按米生成 UV 的面（街面、面门、瓦坡、粉墙）都要配 1:1 铺设的图，
  // 再叠一次 texture.repeat 就等于把石板缩到看不清。
  const shop = T.shopMaps({ tileX: 24, tileY: 14, floorH: 3.5, bay: 2.4 });
  M.shop = lit('#8a7a63', {
    map: shop.albedo, emissiveMap: shop.emissive,
    rough: 0.88, metal: 0.04, emissive: '#ffffff', ei: 1.0,
  });
  M.shopEmissive = shop.emissive;

  M.paving = lit('#6e6355', { map: T.streetPaving(), rough: 0.9, metal: 0.0 });
  M.stoneP = lit('#4d473f', { map: T.blockPaving(), rough: 0.9 });
  M.curb = lit('#403b34', { rough: 0.9 });
  M.plaster = lit('#3d362d', { map: T.noise(), rough: 0.94 });
  M.wood = lit('#3b2a1b', { map: T.woodGrain(), rough: 0.86 });
  M.woodDark = lit('#221810', { map: T.woodGrain({ tile: 1.4, base: '#241a12' }), rough: 0.9 });
  M.roof = lit('#4a4e56', { map: T.roofTiles(), rough: 0.95 });
  M.silhouette = lit('#0c0f14', { rough: 0.92 });
  M.farHouse = lit('#1a1d22', {
    map: T.scatterWindows({ warm: 0.9, density: 0.035 }),
    emissiveMap: T.scatterWindows({ warm: 0.9, density: 0.035 }),
    rough: 0.9, emissive: '#ffffff', ei: 0.55,
  });
  M.bamboo = lit('#2f3a2a', { rough: 0.8 });
  M.leaf = lit('#26301f', { rough: 0.9, side: THREE.DoubleSide });

  M.lampGlow = glow(PAL.lantern, 2.3);
  M.emberGlow = glow(PAL.ember, 1.9);
  M.paperGlow = glow(PAL.paper, 1.35);
  M.moonGlow = glow(PAL.moon, 1.1);
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
 * A four-corner panel with UVs handed in per corner. `dir` is the normal you want
 * to face the camera; the winding is flipped if the computed one disagrees, so a
 * builder never has to reason about vertex order again.
 */
export function quad(corners, { uv, dir = null }) {
  const pos = [];
  for (const c of corners) pos.push(c[0], c[1], c[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv ? uv.flat() : [0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  if (dir) {
    const n = g.getAttribute('normal');
    if (n.getX(0) * dir[0] + n.getY(0) * dir[1] + n.getZ(0) * dir[2] < 0) {
      g.setIndex([0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
    }
  }
  return g;
}

/**
 * Wall panel facing along Z, UVs in metres. `origin` shifts the sheet so a tiled
 * 面门 texture puts its storey bands on the building's own base instead of world y = 0.
 */
export function wallQuad({ x0, x1, y0, y1, z, facing = 1, tile = [24, 14], origin = [0, 0] }) {
  const u = (x) => (x - origin[0]) / tile[0];
  const v = (y) => (y - origin[1]) / tile[1];
  return quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]],
    { uv: [[u(x0), v(y0)], [u(x1), v(y0)], [u(x1), v(y1)], [u(x0), v(y1)]], dir: [0, 0, facing] });
}

/** Wall panel facing along X — 巷壁、牌楼匾额、山墙 */
export function sideQuad({ x, z0, z1, y0, y1, facing = 1, tile = [8, 4], origin = [0, 0] }) {
  const u = (z) => (z - origin[0]) / tile[0];
  const v = (y) => (y - origin[1]) / tile[1];
  return quad([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]],
    { uv: [[u(z0), v(y0)], [u(z1), v(y0)], [u(z1), v(y1)], [u(z0), v(y1)]], dir: [facing, 0, 0] });
}

/** 坡屋顶：沿 X 铺开，从 (z0,y0) 抬到 (z1,y1)，法线自动朝上 */
export function slopeZQuad({ x0, x1, z0, y0, z1, y1, tile = [10, 3.2] }) {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const u = (x) => x / tile[0];
  return quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]],
    { uv: [[u(x0), 0], [u(x1), 0], [u(x1), len / tile[1]], [u(x0), len / tile[1]]], dir: [0, 1, 0] });
}

/** 沿 Z 铺开、高度沿 X 变化的坡面——牌楼的小楼顶用它 */
export function slopeXQuad({ z0, z1, x0, y0, x1, y1, tile = [10, 3.2] }) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const u = (z) => z / tile[0];
  return quad([[x0, y0, z0], [x0, y0, z1], [x1, y1, z1], [x1, y1, z0]],
    { uv: [[u(z0), 0], [u(z1), 0], [u(z1), len / tile[1]], [u(z0), len / tile[1]]], dir: [0, 1, 0] });
}

/**
 * 水平面（街面、广场、巷底、桥面）：BoxGeometry 的 UV 是每面 0..1，
 * 铺不了按米计的石板，所以地面一律走这个。
 */
export function floorQuad({ x0, x1, z0, z1, y, tile = [24, 12], origin = [0, 0] }) {
  const u = (x) => (x - origin[0]) / tile[0];
  const v = (z) => (z - origin[1]) / tile[1];
  return quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]],
    { uv: [[u(x0), v(z0)], [u(x1), v(z0)], [u(x1), v(z1)], [u(x0), v(z1)]], dir: [0, 1, 0] });
}

/**
 * A sloped panel: the bottom edge runs along (z0,y0), the top edge along (z1,y1),
 * both spanning x0..x1. Used for 坡屋顶, whose UVs follow the slope.
 */
export function slopeQuad({ x0, x1, z0, y0, z1, y1, facing = 1, tile = [10, 3.2] }) {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const verts = facing > 0
    ? [x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y1, z1]
    : [x1, y0, z0, x0, y0, z0, x0, y1, z1, x1, y1, z1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(
    [x0 / tile[0], 0, x1 / tile[0], 0, x1 / tile[0], len / tile[1], x0 / tile[0], len / tile[1]], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

/* -------------------------------------------------------------------- 灯辉 */

/**
 * Camera-facing lamp glows as one Points draw call. Each halo carries its own
 * colour, size and flicker phase; the shader applies the scene's fog falloff by
 * hand because additive light must fade to nothing, not to the fog colour.
 */
export function halos(scene, { capacity = 2000, map, fogDensity = 0.0032 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(capacity * 3);
  const col = new Float32Array(capacity * 3);
  const siz = new Float32Array(capacity);
  const pha = new Float32Array(capacity);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uMap: { value: map }, uGain: { value: 1 }, uPx: { value: 620 },
      uTime: { value: 0 }, uFogD: { value: fogDensity }, uFlicker: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      uniform float uPx; uniform float uTime; uniform float uFogD; uniform float uFlicker;
      varying vec3 vC; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = max(-mv.z, 1.0);
        gl_PointSize = clamp(aSize * uPx / d, 1.0, 560.0);
        float f = mix(1.0, 0.86 + 0.14 * sin(uTime * 2.6 + aPhase) + 0.05 * sin(uTime * 7.1 + aPhase * 2.3), uFlicker);
        vC = aColor * f;
        vA = exp(-pow(d * uFogD, 2.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uGain;
      varying vec3 vC; varying float vA;
      void main(){
        float m = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vC * uGain, m * vA);
      }`,
  });
  mat.toneMapped = false;
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);

  let n = 0;
  return {
    points,
    get count() { return n; },
    add(x, y, z, color, size = 1.6, flicker = true) {
      if (n >= capacity) return -1;
      const c = rgb(color);
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
      col[n * 3] = c.r; col[n * 3 + 1] = c.g; col[n * 3 + 2] = c.b;
      siz[n] = size;
      pha[n] = flicker ? rand() * 6.283 : 0;
      n++;
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aPhase.needsUpdate = true;
      return n - 1;
    },
    move(i, x, y, z) {
      if (i < 0 || i >= n) return;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      geo.attributes.position.needsUpdate = true;
    },
    setGain(g) { mat.uniforms.uGain.value = g; },
    setViewport(px) { mat.uniforms.uPx.value = px; },
    update(t) { mat.uniforms.uTime.value = t; },
  };
}

/** 地面灯影：贴在街面上的加法光斑，让檐灯在石板上落出一滩暖色 */
export function lightPools(scene, { capacity = 500, map, y = 0.52, gain = 1 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    color: rgb('#ffffff').multiplyScalar(gain),
  });
  mat.toneMapped = false; mat.fog = false;
  const im = new THREE.InstancedMesh(geo, mat, capacity);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
  im.frustumCulled = false;
  im.renderOrder = 2;
  im.count = 0;
  scene.add(im);

  const d = new THREE.Object3D();
  let n = 0;
  return {
    mesh: im,
    /** rx 是横向半径，rz 可以拉成沿视线方向的长条——浅视角看水面时只有长条读得出来 */
    add(x, z, color, radius, radiusZ = radius) {
      if (n >= capacity) return -1;
      d.position.set(x, y, z);
      d.scale.set(radius * 2, 1, radiusZ * 2);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      im.setMatrixAt(n, d.matrix);
      im.setColorAt(n, rgb(color));
      n++;
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      return n - 1;
    },
    setGain(g) { mat.color.setScalar(g); },
  };
}

/** eased parametric helpers shared by the geometry builders */
export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const lerp = (a, b, t) => a + (b - a) * t;
