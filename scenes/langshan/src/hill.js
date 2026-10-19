import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, glow, quadGrid, rand, rr, blobGeometry, cyl, box } from './kit.js';
import * as T from './textures.js';
import { HILL, PADS, RIVER, ROAD, GROUND, SISTER_HILLS, heightAt, steepness, roadAt, site } from './data.js';

/**
 * 山体：一张由 heightAt 直接生成的网格，缓坡吃土色、陡处吃紫琅石色。
 * 其余四山只做远影；江堤、城火与对岸灯带是写意补的。
 */

const SPAN = { x0: -300, x1: 340, z0: -240, z1: 310 };
const NU = 188, NV = 170;

function hillGeometry() {
  const g = quadGrid((u, v) => {
    const x = SPAN.x0 + (SPAN.x1 - SPAN.x0) * u;
    const z = SPAN.z0 + (SPAN.z1 - SPAN.z0) * v;
    return [x, heightAt(x, z), z];
  }, NU, NV, { spanU: SPAN.x1 - SPAN.x0, spanV: SPAN.z1 - SPAN.z0 });
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const earth = new THREE.Color('#3b442f');
  const rock = new THREE.Color('#6b6068');
  const pale = new THREE.Color('#7e7682');
  const low = new THREE.Color('#28301f');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s = steepness(x, z);
    c.copy(earth).lerp(rock, Math.min(1, s * 1.5));
    c.lerp(pale, Math.max(0, (y - 76) / 44) * 0.28 * Math.max(0.25, s));
    c.lerp(low, Math.max(0, 1 - (y - GROUND) / 18) * 0.55);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/* ------------------------------------------------------------------ 石蹬 */

/** 盘山石蹬：跟着路床顶一节一节铺过去，两侧出道牙 */
function steps() {
  const parts = [];
  const n = 150;
  for (let i = 0; i < n; i++) {
    const p = roadAt(i / (n - 1));
    const len = Math.hypot(p.dx, p.dz) || 1;
    const rot = Math.atan2(-p.dz, p.dx);
    const w = ROAD.width * rr(0.88, 1.0);
    const g = box(w, 0.24, Math.max(0.62, len * 1.16));
    g.rotateY(rot);
    g.translate(p.x, p.y - 0.14, p.z);
    parts.push(g);
    for (const s of [-1, 1]) {
      const nx = -Math.sin(rot) * s * (w / 2 + 0.22), nz = Math.cos(rot) * s * (w / 2 + 0.22);
      const k = box(0.36, 0.36, Math.max(0.6, len * 1.16));
      k.rotateY(rot);
      k.translate(p.x + nx, p.y - 0.02, p.z + nz);
      parts.push(k);
    }
  }
  return mesh(mergeGeometries(parts), M.paving);
}

/* ------------------------------------------------------------------ 崖与石 */

/** 西崖：几处突出江面的石台，让剪影有断口 */
function crags() {
  const parts = [];
  let i = 0;
  while (i < 40) {
    i++;
    const a = rr(-2.35, 0.9);
    const rad = rr(0.5, 0.95);
    const x = HILL.cx + Math.cos(a) * HILL.ax * rad * HILL.westSteep;
    const z = HILL.cz + Math.sin(a) * HILL.az * rad;
    if (x > -26) continue;
    const y = heightAt(x, z);
    const r = rr(3.6, 10.5);
    const g = blobGeometry(r, { detail: 1, amp: 0.3, squash: rr(0.5, 0.88), seed: i });
    g.translate(x, y - r * 0.34, z);
    parts.push(g);
  }
  return mesh(mergeGeometries(parts), M.rock);
}

/** 山脚的乱石：让山落到平原上是滚下去的，不是一刀切 */
function boulders() {
  const parts = [];
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2;
    const rad = rr(0.84, 1.14);
    const west = Math.cos(a) < 0;
    const x = HILL.cx + Math.cos(a) * HILL.ax * rad * (west ? HILL.westSteep : 1);
    const z = HILL.cz + Math.sin(a) * HILL.az * rad;
    if (x < RIVER.shoreX + 14) continue;
    const y = heightAt(x, z);
    const r = rr(0.5, 2.4);
    const g = blobGeometry(r, { detail: 1, amp: 0.34, squash: 0.72, seed: 200 + i });
    g.translate(x, y - r * 0.3, z);
    parts.push(g);
  }
  return mesh(mergeGeometries(parts), M.rockPlain);
}

/* ------------------------------------------------------------------ 山林 */

const PAD_BOXES = Object.values(PADS);

function woods() {
  const trunks = [], crowns = [];
  const near = (x, z, r) => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p = roadAt(t);
      if (Math.hypot(p.x - x, p.z - z) < r) return true;
    }
    return false;
  };
  const put = (x, z, h, spread) => {
    const y = heightAt(x, z);
    if (y < GROUND + 0.6) return false;
    trunks.push(cyl(0.24 + h * 0.02, 0.15 + h * 0.012, h * 0.52, 6, x, y - 0.3, z));
    const g = blobGeometry(spread, { detail: 1, amp: 0.26, squash: 0.78, seed: trunks.length });
    g.translate(x, y + h * 0.46, z);
    crowns.push(g);
    return true;
  };
  let planted = 0;
  for (let i = 0; i < 900 && planted < 420; i++) {
    const a = rand() * Math.PI * 2;
    const rad = Math.pow(rand(), 0.6) * 1.03;
    const west = Math.cos(a) < 0;
    const x = HILL.cx + Math.cos(a) * HILL.ax * rad * (west ? HILL.westSteep : 1);
    const z = HILL.cz + Math.sin(a) * HILL.az * rad;
    if (heightAt(x, z) < GROUND + 3.5) continue;
    // 台地里不种树：塔院、殿前、山门平台都留空
    let inPad = false;
    for (const p of PAD_BOXES) {
      if (x > p.x0 - 5 && x < p.x1 + 5 && z > p.z0 - 5 && z < p.z1 + 5) { inPad = true; break; }
    }
    if (inPad) continue;
    if (near(x, z, 5.4)) continue;
    if (Math.hypot(x - 26, z - 0) < 16) continue;
    if (put(x, z, rr(5.5, 13.5), rr(2.3, 4.6))) planted++;
  }
  // 山脚、墓前与堤上的一圈
  for (const [x, z, h] of [
    [152, 122, 12], [206, 82, 13], [166, 134, 10], [128, 62, 9], [-128, 104, 14],
    [-150, 30, 12], [16, 124, 12], [122, 84, 10], [188, 62, 11], [214, 130, 12],
  ]) put(x, z, h, h * 0.34);
  return {
    trunks: mesh(mergeGeometries(trunks), M.timberDark),
    crowns: mesh(mergeGeometries(crowns), M.foliage),
  };
}

/* ------------------------------------------------------------------ 江堤 */

function embankment() {
  const parts = [];
  const wall = new THREE.BoxGeometry(54, 13, 360);
  wall.translate(-208, GROUND - 6.5, 0);
  parts.push(wall);
  parts.push(box(10, 0.32, 360, -190, GROUND - 0.16, 0));
  for (let i = 0; i < 10; i++) {
    const z = -156 + i * 35;
    parts.push(box(1.1, 1.2, 1.1, -186, GROUND + 0.4, z));
    parts.push(box(1.2, 0.7, 6, -199, GROUND - 0.4, z + 14));
  }
  return mesh(mergeGeometries(parts), M.stone);
}

/* ------------------------------------------------------------------ 远影与火 */

function sisterHills() {
  const parts = [];
  for (const h of SISTER_HILLS) {
    const R = Math.max(h.ax, h.az);
    const g = blobGeometry(R * 0.66, { detail: 1, amp: 0.22, squash: h.h / (R * 0.66), seed: R | 0 });
    g.translate(h.x, h.h * 0.52 - 10, h.z);
    parts.push(g);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = 0.5 + 0.45 * Math.abs(Math.sin(a * 2.3 + h.ax));
      const x = h.x + Math.cos(a) * h.ax * rad;
      const z = h.z + Math.sin(a) * h.az * rad;
      const r = rr(26, 52);
      const b = blobGeometry(r, { detail: 1, amp: 0.26, squash: 0.42, seed: (i * 31 + R) | 0 });
      b.translate(x, h.h * 0.3 * rad - 9, z);
      parts.push(b);
    }
  }
  const m = new THREE.Mesh(mergeGeometries(parts), M.hillFar);
  m.name = 'sister-hills';
  return m;
}

const SPREAD = {
  city: { N: 820, x0: -340, x1: 540, z0: -780, z1: -180, y: [2, 15], warm: 0.78 },
  far: { N: 240, x0: -1050, x1: -910, z0: -940, z1: 940, y: [1.2, 5.5], warm: 0.35 },
  town: { N: 260, x0: 130, x1: 430, z0: 40, z1: 330, y: [1.5, 9], warm: 0.9 },
};

/** 一片灯：城的、对岸的、山东南的镇，都用同一个 additive 点云着色器 */
function lightSpread(cfg) {
  const pos = new Float32Array(cfg.N * 3);
  const size = new Float32Array(cfg.N);
  const col = new Float32Array(cfg.N * 3);
  const warm = new THREE.Color('#ffb46a'), cool = new THREE.Color('#9dc0e0');
  for (let i = 0; i < cfg.N; i++) {
    const x = rr(cfg.x0, cfg.x1);
    const z = rr(cfg.z0, cfg.z1);
    pos[i * 3] = x; pos[i * 3 + 1] = rr(cfg.y[0], cfg.y[1]); pos[i * 3 + 2] = z;
    size[i] = rr(1.6, 4.4);
    const c = rand() > cfg.warm ? cool : warm;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTex: { value: T.softGlow('255,206,150', 0.05) }, uTime: { value: 0 }, uOn: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor;
      uniform float uTime; varying vec3 vC; varying float vA;
      void main(){
        vC = aColor;
        vA = 0.6 + 0.4 * sin(uTime * 0.7 + position.x * 0.21 + position.z * 0.17);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * 320.0 / max(24.0, -mv.z), 1.2, 11.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uOn; varying vec3 vC; varying float vA;
      void main(){
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vC * (0.5 + vA * 0.6), t.a * 0.82 * uOn);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

/* ------------------------------------------------------------------ 装配 */

export function buildHill(scene) {
  const group = new THREE.Group();
  group.name = 'hill';

  const body = new THREE.Mesh(hillGeometry(), M.earth);
  body.name = 'hill-body';
  group.add(body);

  group.add(crags(), boulders(), steps(), embankment(), sisterHills());
  const w = woods();
  group.add(w.trunks, w.crowns);

  const spreads = {};
  for (const key of Object.keys(SPREAD)) {
    const s = lightSpread(SPREAD[key]);
    s.mesh.name = `lights-${key}`;
    group.add(s.mesh);
    spreads[key] = s.uni;
  }

  scene.add(group);

  const anchors = {};
  for (const key of Object.keys(PADS)) {
    const p = PADS[key];
    anchors[key] = site((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
  }
  anchors.pagoda = site(26, 0);

  return {
    group,
    body,
    anchors,
    spreads,
    /** 袈裟光幕要盖的那张地形，与 hillGeometry 同一个函数 */
    heightAt,
    update(t) {
      for (const key of Object.keys(spreads)) spreads[key].uTime.value = t;
    },
  };
}
