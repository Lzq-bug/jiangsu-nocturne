/**
 * 山体几何：把 relief.js 的标高场变成网格，再铺登山道（盘山路 / 石阶神道）与崖壁孤岩。
 *
 * 宫观、灯、索道、洞府一律靠 relief.heightAt 取位；数据层的 PADS 负责把台基那几块削平。
 */
import * as THREE from 'three';
import { lit, rand, rr } from '../../src/kit.js';
import * as T from './textures.js';
import { EXTENT, FOOT_Y, MOUNT, PATHS } from './data.js';
import { heightAt, slopeAt, yawAt, fbm, pathSamples, atPath } from './relief.js';

const hash2 = (i, j) => {
  const n = Math.sin(i * 127.1 + j * 311.7 + 13.7) * 43758.5453;
  return n - Math.floor(n);
};

/* ------------------------------------------------------------------ 山体网格 */
function nanScan(geom, name) {
  const p = geom.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) {
      throw new Error(`NaN 顶点：${name} 第 ${i} 个`);
    }
  }
}

function mountainMesh() {
  const N = 250;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const col = new Float32Array((N + 1) * (N + 1) * 3);
  const uv = new Float32Array((N + 1) * (N + 1) * 2);
  const idx = [];
  const cForest = new THREE.Color('#22301f');
  const cCanopy = new THREE.Color('#161f16');
  const cRock = new THREE.Color('#5d6472');
  const cScree = new THREE.Color('#3a4150');
  const cLow = new THREE.Color('#2b3128');
  const tmp = new THREE.Color();
  const altMax = MOUNT.maxHeight || 340;
  let k = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++, k++) {
      const x = -EXTENT / 2 + (EXTENT * i) / N;
      const z = -EXTENT / 2 + (EXTENT * j) / N;
      const y = heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 26; uv[k * 2 + 1] = z / 26;
      const sl = slopeAt(x, z, 6);
      const alt = Math.max(0, Math.min(1, (y - FOOT_Y) / altMax));
      const grime = fbm(x * 0.03, z * 0.03, 2);
      tmp.copy(cForest).lerp(cCanopy, grime * 0.7);
      tmp.lerp(cLow, 1 - Math.min(1, alt * 2.6));
      tmp.lerp(cScree, Math.min(1, sl * 0.75));
      tmp.lerp(cRock, Math.min(1, Math.max(0, sl * 1.1 - 0.42) + alt * 0.42));
      tmp.multiplyScalar(0.82 + 0.3 * grime);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  nanScan(g, 'mountain');
  const mat = new THREE.MeshStandardMaterial({
    // kit 的 lit() 不接 vertexColors，共享文件不改，这里自己建
    color: 0xdfe6dd, map: T.forestRock(), roughness: 0.97, metalness: 0,
    vertexColors: true, side: THREE.DoubleSide,
    emissive: new THREE.Color('#070b0a'), emissiveIntensity: 0.4,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'mountain';
  return mesh;
}

/* ------------------------------------------------------------------ 登山道 */
/** 沿中心线的贴地带；两侧边缘各按自己的落地高度走，才不会浮在坡外 */
export function ribbonGeo(samples, width, lift = 0.14) {
  const pos = [], uv = [], idx = [];
  const hw = width / 2;
  let run = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const q = samples[Math.min(samples.length - 1, i + 1)];
    const o = samples[Math.max(0, i - 1)];
    const tx = q.x - o.x, tz = q.z - o.z;
    const tl = Math.hypot(tx, tz) || 1e-6;
    const nx = -tz / tl, nz = tx / tl;
    if (i > 0) run += Math.hypot(p.x - samples[i - 1].x, p.z - samples[i - 1].z);
    for (const s of [-1, 1]) {
      const ex = p.x + nx * hw * s, ez = p.z + nz * hw * s;
      pos.push(ex, heightAt(ex, ez) + lift, ez);
      uv.push(s > 0 ? 1 : 0, run / Math.max(2, width));
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  nanScan(g, 'ribbon');
  return g;
}

/** 陡段把带子换成一级一级的条石 */
function stepsAlong(samples, { tread = 0.62, width = 3.4, riser = 0.2 }) {
  const d = new THREE.Object3D();
  const geo = new THREE.BoxGeometry(width, riser, tread * 1.3);
  const inst = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const planar = Math.hypot(b.x - a.x, b.z - a.z);
    const dy = b.y - a.y;
    if (Math.abs(dy) / Math.max(0.2, planar) < 0.28) continue;
    const len = Math.hypot(planar, dy);
    const n = Math.max(1, Math.round(len / tread));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      inst.push({ x, z, y: heightAt(x, z) + riser * 0.4, yaw: Math.atan2(b.x - a.x, b.z - a.z) });
    }
  }
  if (!inst.length) return null;
  const mesh = new THREE.InstancedMesh(geo, lit('#9aa1ae', { map: T.flagstone('#7c8290'), rough: 0.9 }), inst.length);
  inst.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(0, it.yaw, 0);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function cliffRock(x, z, scale) {
  const g = new THREE.IcosahedronGeometry(scale, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const j = 0.72 + 0.5 * hash2(i * 3.1 + x, i * 1.7 + z);
    p.setXYZ(i, p.getX(i) * j, p.getY(i) * (0.6 + j * 0.5), p.getZ(i) * j);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, lit('#828a99', { map: T.strata(), rough: 0.95, side: THREE.DoubleSide, emissive: '#0a0e14', ei: 0.3 }));
  m.position.set(x, heightAt(x, z) + scale * 0.35, z);
  m.rotation.set(rr(-0.2, 0.2), rand() * 6.28, rr(-0.2, 0.2));
  return m;
}

export function buildTerrain(scene) {
  const grp = new THREE.Group();
  grp.name = 'terrain';
  const mountain = mountainMesh();
  grp.add(mountain);

  const roads = [];
  const pathAnchors = {};
  for (const p of PATHS) {
    const samples = pathSamples(p.id, p.perSeg || 22);
    const road = new THREE.Mesh(ribbonGeo(samples, p.width, p.lift ?? 0.16),
      lit('#8b8f9a', {
        map: T.flagstone(p.kind === 'stair' ? '#767c8a' : '#5f6572'),
        rough: 0.92, side: THREE.DoubleSide, emissive: '#0b0e13', ei: 0.32,
      }));
    grp.add(road);
    roads.push({ id: p.id, mesh: road, samples, spec: p });
    if (p.kind === 'stair' && p.steps !== false) {
      const st = stepsAlong(samples, { tread: p.tread || 0.62, width: p.width, riser: p.riser || 0.2 });
      if (st) grp.add(st);
    }
    pathAnchors[p.id] = samples;
  }

  // 崖头与坡面的孤岩：只挑有坡的地方长，平地上一块都不摆
  for (let i = 0; i < 74; i++) {
    const ang = rand() * Math.PI * 2;
    const r = 90 + Math.pow(rand(), 0.6) * EXTENT * 0.34;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (heightAt(x, z) - FOOT_Y < 34) continue;
    const s = 2 + rand() * 6;
    grp.add(cliffRock(x, z, s));
  }

  scene.add(grp);
  return {
    grp,
    mountain,
    roads,
    pathAnchors,
    /** 剖视要切开的网格；cave.js 与 main.js 共用同一组 clippingPlanes */
    clipTargets: [mountain],
    heightAt,
    slopeAt,
    yawAt,
    /** 道面上的取位：t∈[0,1] 沿路径，offset 为横向偏移（右为正） */
    at(id, t, offset = 0, dy = 0) {
      return atPath(id, t, offset, dy);
    },
  };
}
