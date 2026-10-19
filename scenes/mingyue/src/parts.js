import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, lit, box, mesh, rand, rr, pillarGeo, railingGeo,
  chineseRoof,
} from '../../src/kit.js';
import * as T from '../../src/textures.js';
import * as TT from './textures.js';
import { MOON_FLOOD } from './data.js';

export const MY = {
  waterY: -0.06,
  /** 月色泛地：0 = 只在池里见月，1 = 满地波文亮成水 */
  flood: { value: 0 },
  time: { value: 0 },
  wave: { value: 1 },
  lamp: { value: 1 },
};

/* ------------------------------------------------------------------ 材质 */
export function initMyMaterials() {
  // kit 的瓦色是给秦淮的暖灯调的，月下要更冷的青灰，否则屋脊全塌成黑块
  M.roof = lit('#e6ebf5', { map: T.roofTiles('#55617d', '#77839e', '#a9b7d0'), rough: 0.74, side: THREE.DoubleSide, emissive: '#26314a', ei: 0.95 });
  M.brick = lit('#c3c8d4', { map: TT.brick('#7b828f'), rough: 0.94, emissive: '#0d1120', ei: 0.4 });
  M.brickWarm = lit('#cdc6b8', { map: TT.brick('#8b8474'), rough: 0.95, emissive: '#120e0a', ei: 0.4 });
  const capMap = T.roofTiles('#39415a', '#55617a', '#8494ae').clone();
  capMap.repeat.set(1.4, 0.5);
  M.wallCap = lit('#c2cadb', { map: capMap, rough: 0.8, side: THREE.DoubleSide, emissive: '#141c2c', ei: 0.6 });
  M.huangshi = lit('#cbb894', { map: TT.huangshi(), rough: 0.95, emissive: '#171006', ei: 0.42 });
  M.moss = lit('#5f6b52', { rough: 0.98, side: THREE.DoubleSide, emissive: '#0e140c', ei: 0.4 });
  M.bamboo = lit('#9fc088', { map: TT.bambooSkin('#5c7a4e'), rough: 0.85, emissive: '#101a10', ei: 0.45 });
  M.bambooLeaf = lit('#6d8a63', { rough: 0.95, side: THREE.DoubleSide, emissive: '#0d150d', ei: 0.4 });
  M.blossom = lit('#9a9c82', { rough: 0.95, side: THREE.DoubleSide, emissive: '#1d2018', ei: 0.5 });
  M.woodDark = lit('#8d6f5a', { map: T.wood('#4a3324', '#291a12'), rough: 0.8 });
  M.paving = pavingMaterial();
  M.stoneSlab = lit('#b3b9c6', { map: T.stone('#8d939f'), rough: 0.9 });
  M.stoneSlab.map = M.stoneSlab.map.clone();
  M.stoneSlab.map.repeat.set(0.34, 0.34);
  return M;
}

/** 碟瓦卵石波文地：月光泛起来时，瓦棱一道一道亮成浪头 */
function pavingMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: '#a9a8a1', map: TT.wavePaving(), roughness: 0.92, metalness: 0.02,
    emissive: '#0a0f1c', emissiveIntensity: 0.5,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlood = MY.flood;
    shader.uniforms.uTime = MY.time;
    shader.uniforms.uWave = MY.wave;
    shader.uniforms.uSrc = { value: new THREE.Vector2(MOON_FLOOD.from[0], MOON_FLOOD.from[1]) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSite;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSite = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSite;
        uniform float uFlood; uniform float uTime; uniform float uWave; uniform vec2 uSrc;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float d = length(vSite.xz - uSrc);
        float front = uFlood * 34.0;
        float reach = smoothstep(front + 2.6, front - 4.2, d) * step(0.001, uFlood);
        float crest = sin(vSite.z * 13.6 + 3.2 * sin(vSite.x * 0.82 + uTime * 0.24) - uTime * 1.5);
        crest = pow(max(crest, 0.0), 11.0);
        float swell = 0.45 + 0.55 * sin(d * 0.75 - uTime * 1.1);
        vec3 moonwash = vec3(0.50, 0.60, 0.86);
        // 只描瓦棱的薄薄一层，亮成霓虹就假了
        totalEmissiveRadiance += moonwash * crest * uWave * reach * 0.3;
        // 靠池子的一圈先湿，像水刚刚漫过来
        totalEmissiveRadiance += moonwash * 0.1 * smoothstep(14.0, 2.0, d) * (0.35 + 0.65 * uFlood);
        totalEmissiveRadiance *= 1.0 + 0.12 * swell * reach;`);
  };
  m.customProgramCacheKey = () => 'mingyue-paving';
  return m;
}

/** 匾额：竖排按从上往下读（见 textures.plaque 的说明） */
export function plaqueMesh(text, w, h, opts) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.MeshBasicMaterial({ map: TT.plaque(text, opts), toneMapped: false });
  const face = new THREE.Mesh(g, m);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h * 1.12, 0.1), M.gilt);
  frame.position.z = -0.06;
  const grp = new THREE.Group();
  grp.add(frame, face);
  face.position.z = 0.03;
  return grp;
}

/* ------------------------------------------------------------------ 墙体 */
/** 墙帽：一道 ridge + 两侧披水，压在院墙上 */
export function wallCapGeo(length) {
  const parts = [];
  const h = 0.22, w = 0.62;
  parts.push(box(length, 0.16, 0.2, 0, h + 0.06, 0));
  for (const s of [-1, 1]) {
    const g = box(length, h, w * 0.62, 0, h * 0.5, s * w * 0.31);
    g.rotateX(s * 0.42);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 一段直墙（沿 X 或沿 Z），含墙帽与石基 */
export function yardWall({ from, to, height = 4.4, cap = true, mat = null }) {
  const grp = new THREE.Group();
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const thick = 0.55;
  const body = box(len, height - 0.5, thick, 0, (height - 0.5) / 2, 0);
  grp.add(mesh(body, mat || M.brick));
  const plinth = box(len + 0.16, 0.5, thick + 0.16, 0, 0.25, 0);
  grp.add(mesh(plinth, M.stoneDark));
  if (cap) {
    const c = new THREE.Mesh(wallCapGeo(len + 0.3), M.wallCap);
    c.position.y = height - 0.5;
    grp.add(c);
  }
  grp.position.set((from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2);
  grp.rotation.y = -Math.atan2(dz, dx);
  return grp;
}

/** 券洞轮廓：矩形门洞上加半圆 */
export function archHole(cx, baseY, halfWidth, topY) {
  const p = new THREE.Path();
  const r = halfWidth;
  const spring = Math.max(baseY, topY - r);
  p.moveTo(cx - r, baseY);
  p.lineTo(cx - r, spring);
  p.absarc(cx, spring, r, Math.PI, 0, true);
  p.lineTo(cx + r, baseY);
  p.closePath();
  return p;
}

/** 带月洞的短墙（入园第一堵，欲扬先抑） */
export function moonDoorWall({ x0, x1, z, cx, r = 1.55, height = 4.2, thickness = 0.5 }) {
  const grp = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(x0 - cx, 0);
  shape.lineTo(x1 - cx, 0);
  shape.lineTo(x1 - cx, height);
  shape.lineTo(x0 - cx, height);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0.12 + r, r, 0, Math.PI * 2, false);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 26 });
  g.translate(cx, 0, -thickness / 2);
  const body = mesh(g, M.brickWarm);
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);
  const plinth = box(x1 - x0 + 0.18, 0.42, thickness + 0.2, (x0 + x1) / 2, 0.21, z);
  grp.add(mesh(plinth, M.stoneDark));
  const cap = new THREE.Mesh(wallCapGeo(x1 - x0 + 0.3), M.wallCap);
  cap.position.set((x0 + x1) / 2, height, z);
  grp.add(cap);
  // 门洞圈边：一道石券
  const ring = new THREE.TorusGeometry(r + 0.09, 0.12, 6, 40);
  const rm = mesh(ring, M.stoneDressed);
  rm.position.set(cx, 0.12 + r, z);
  grp.add(rm);
  return grp;
}

/** 墙上开一个月形窗洞，洞里透光：kind = full 圆月 / crescent 弦月 */
export function moonWindow({ x, y, z, r = 0.75, kind = 'full', rotY = 0, thickness = 0.4, wall = null, wallW = 3.4, wallH = 3.2 }) {
  const grp = new THREE.Group();
  if (wall) {
    const shape = new THREE.Shape();
    shape.moveTo(-wallW / 2, 0);
    shape.lineTo(wallW / 2, 0);
    shape.lineTo(wallW / 2, wallH);
    shape.lineTo(-wallW / 2, wallH);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, r, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, y, -thickness / 2);
    grp.add(mesh(g, M.brickWarm));
  }
  const pane = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.94, 26),
    new THREE.MeshBasicMaterial({ map: TT.moonLattice(kind), side: THREE.DoubleSide, transparent: false }),
  );
  pane.material.toneMapped = false;
  pane.position.set(0, 0, 0);
  const holder = new THREE.Group();
  holder.add(pane);
  holder.position.set(x, y, z);
  holder.rotation.y = rotY;
  grp.add(holder);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 5, 26), M.stoneDressed);
  ring.position.set(x, y, z);
  ring.rotation.y = rotY;
  grp.add(ring);
  return grp;
}

/* ------------------------------------------------------------------ 建筑 */
/**
 * 一座楼/厅：台明 + 墙身 + 前廊柱网 + 腰檐 + 平座美人靠 + 硬山顶。
 * 面阔沿 X，进深沿 Z，front 朝 +Z。
 */
export function hallBuilding({
  bays = 3, bayW = 3.2, depth = 6.2, floors = 1, h1 = 3.7, h2 = 3.1,
  plinth = 0.45, porch = 1.6, roofH = 1.8, wallMat = null, roofMat = null,
  x = 0, z = 0, facing = 0, plaque = null, plaqueOpts = null, couplet = null,
  windows = 0.62, balcony = null,
}) {
  const grp = new THREE.Group();
  const W = bays * bayW;
  const hw = W / 2, hd = depth / 2;
  const wall = wallMat || M.wall;
  const roof = roofMat || M.roof;

  // 台明
  const plat = box(W + 1.4, plinth, depth + porch + 1.2, 0, plinth / 2, porch / 2);
  const platMesh = mesh(plat, M.stoneDressed);
  platMesh.receiveShadow = true;
  grp.add(platMesh);
  // 前台阶
  const st = stairGeo(3, 0.36, plinth / 3, bayW * 1.5);
  const sm = mesh(st, M.stoneDressed);
  sm.position.set(0, 0, hd + porch + 0.6);
  sm.rotation.y = Math.PI;
  grp.add(sm);

  const base = plinth;
  // 一层墙身
  const b1 = box(W, h1, depth, 0, base + h1 / 2, 0);
  const m1 = mesh(b1, wall);
  m1.castShadow = true; m1.receiveShadow = true;
  grp.add(m1);

  const colGeo = pillarGeo(h1 - 0.2, 0.17);
  const colY = base;
  for (let i = 0; i <= bays; i++) {
    const cx = -hw + i * bayW;
    for (const cz of [hd + porch * 0.72, hd + porch * 0.1]) {
      const p = new THREE.Mesh(colGeo, M.pillar);
      p.position.set(cx, colY, cz);
      p.castShadow = true;
      grp.add(p);
    }
    const tie = box(bayW, 0.22, 0.16, cx - bayW / 2, colY + h1 - 0.34, hd + porch * 0.72);
    if (i < bays) grp.add(mesh(tie, M.beam));
  }
  // 檐柱上的挂落
  for (let i = 0; i < bays; i++) {
    const cx = -hw + i * bayW + bayW / 2;
    const drop = box(bayW * 0.78, 0.5, 0.1, cx, colY + h1 - 0.72, hd + porch * 0.72);
    grp.add(mesh(drop, M.woodDark));
  }

  // 腰檐 + 平座（两层时）
  let eaveY = base + h1;
  addWindows(grp, { W, bayW, base, height: h1, zFront: hd - 0.05, bays, warm: floors > 1 ? 0.72 : 0.7, frac: windows, door: floors === 1 });
  if (floors > 1) {
    const skirt = new THREE.Mesh(
      chineseRoof({ width: W + 0.5, depth: depth + porch * 2 + 0.6, height: 0.95, curve: 0.5, eaveLift: 0.55, overhang: 0.45, hip: false }),
      roof,
    );
    skirt.position.y = eaveY + 0.05;
    skirt.castShadow = true;
    grp.add(skirt);
    const floorY = eaveY + 0.62;
    const seat = box(W + 0.6, 0.22, porch + 1.1, 0, floorY, hd + porch * 0.45);
    grp.add(mesh(seat, M.stoneSlab));
    const rail = railingGeo(W + 0.4, { height: 0.95, spacing: 1.4 });
    const r1 = mesh(rail, M.woodDark);
    r1.position.set(0, floorY + 0.11, hd + porch + 0.45);
    grp.add(r1);
    if (balcony !== false) {
      // 美人靠：栏杆前一根略高的斜木
      for (let i = 0; i < bays; i++) {
        const cx = -hw + i * bayW + bayW / 2;
        const lean = box(bayW * 0.9, 0.12, 0.34, cx, floorY + 0.78, hd + porch + 0.3);
        lean.rotateX(-0.34);
        grp.add(mesh(lean, M.woodDark));
      }
    }
    eaveY = floorY + 0.1;
    const b2 = box(W - 0.3, h2, depth - 0.2, 0, eaveY + h2 / 2, 0);
    const m2 = mesh(b2, wall);
    m2.castShadow = true;
    grp.add(m2);
    for (let i = 0; i <= bays; i++) {
      const cx = -hw + i * bayW;
      const p = new THREE.Mesh(pillarGeo(h2 - 0.2, 0.14), M.pillar);
      p.position.set(cx, eaveY, hd + porch * 0.62);
      grp.add(p);
    }
    addWindows(grp, { W, bayW, base: eaveY, height: h2, zFront: hd - 0.05, bays, warm: 0.85, frac: windows });
  }

  // 主顶
  const topY = eaveY + (floors > 1 ? h2 : h1);
  const main = new THREE.Mesh(
    chineseRoof({
      width: W + 1.1, depth: depth + porch * 1.6 + 1.0, height: roofH,
      curve: 0.62, eaveLift: 0.62, overhang: 0.6, hip: false,
    }),
    roof,
  );
  main.position.set(0, topY, porch * 0.28);
  main.castShadow = true; main.receiveShadow = true;
  grp.add(main);
  grp.add(hillRidge(W + 1.1, roofH, porch * 0.28, depth));
  // 山墙收头（硬山）：轮廓照着 chineseRoof 的反曲母线采样，直边三角形会戳出屋面
  const halfDepth = (depth + porch * 1.6 + 1.0) / 2 + 0.6;
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    const N = 10;
    const yAt = (t) => roofH * (1 - (t * (1 - 0.62) + Math.sqrt(t) * 0.62)) * 0.985;
    shape.moveTo(-halfDepth, 0);
    // t 是离脊的比例：t=0 在脊（y=roofH），t=1 落到檐口（y=0）
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      shape.lineTo(-halfDepth * t, yAt(t));
    }
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      shape.lineTo(halfDepth * t, yAt(t));
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(s * (W / 2 + 0.15), topY, porch * 0.28);
    const gm = mesh(g, wall);
    gm.castShadow = true;
    grp.add(gm);
  }

  // 匾与联
  if (plaque) {
    const pw = Math.min(3.1, bayW * 1.02), ph = pw * 0.32;
    const pl = plaqueMesh(plaque, pw, ph, { dir: 'h', bg: '#10233c', ...plaqueOpts });
    pl.position.set(0, topY - 0.62, hd + porch * 0.66);
    grp.add(pl);
  }
  if (couplet) {
    for (const [i, text] of couplet.entries()) {
      const cw = 0.46, chh = Math.min(2.6, h1 * 0.68);
      const cp = plaqueMesh(text, cw, chh, { dir: 'v', bg: '#7d1f1c', fg: '#f0d4a2', border: '#b98a45' });
      cp.position.set((i === 0 ? -1 : 1) * bayW * 0.98, base + h1 * 0.46, hd + porch * 0.72 + 0.2);
      grp.add(cp);
    }
  }

  grp.position.set(x, 0, z);
  grp.rotation.y = facing;
  grp.userData.eaveY = topY;
  grp.userData.lamps = [];
  for (let i = 0; i < bays; i++) {
    grp.userData.lamps.push(new THREE.Vector3(-hw + i * bayW + bayW / 2, base + h1 - 0.95, hd + porch * 0.72 + 0.35));
  }
  return grp;
}

/** 硬山顶的正脊与鸱尾 */
function hillRidge(width, roofH, zOff, depth) {
  const parts = [];
  parts.push(box(width * 0.94, 0.3, 0.34, 0, roofH + 0.2, zOff));
  parts.push(box(width * 0.96, 0.14, 0.5, 0, roofH + 0.05, zOff));
  for (const s of [-1, 1]) {
    parts.push(box(0.34, 0.95, 0.4, s * (width * 0.47 + 0.1), roofH + 0.5, zOff));
    const horn = new THREE.SphereGeometry(0.19, 8, 6);
    horn.scale(1, 1.5, 0.7);
    horn.translate(s * (width * 0.47 + 0.12), roofH + 0.62, zOff);
    parts.push(horn);
  }
  return mesh(parts, M.ridge);
}

/** 每间一樘格子窗，夜里透光 */
function addWindows(grp, { W, bayW, base, height, zFront, bays, warm = 0.8, frac = 0.6, door = false }) {
  const hw = W / 2;
  for (let i = 0; i < bays; i++) {
    const cx = -hw + i * bayW + bayW / 2;
    if (door && i === Math.floor(bays / 2)) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(bayW * 0.58, height * 0.66), windowMat(warm * 0.8));
      pane.position.set(cx, base + height * 0.36, zFront + 0.06);
      grp.add(pane);
      const doorLeaf = box(bayW * 0.6, height * 0.72, 0.1, cx, base + height * 0.36, zFront + 0.02);
      grp.add(mesh(doorLeaf, M.woodDark));
      continue;
    }
    const wh = height * frac * 0.62, ww = bayW * 0.62;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), windowMat(warm));
    pane.position.set(cx, base + height * frac * 0.5 + 0.4, zFront + 0.06);
    grp.add(pane);
    const frame = box(ww + 0.16, wh + 0.16, 0.08, cx, base + height * frac * 0.5 + 0.4, zFront + 0.02);
    grp.add(mesh(frame, M.woodDark));
    // 窗下槛墙
    const sill = box(ww + 0.3, height * 0.3, 0.12, cx, base + height * 0.15, zFront + 0.04);
    grp.add(mesh(sill, M.brickWarm));
  }
}

const winMats = new Map();
function windowMat(warm = 0.8) {
  const key = warm.toFixed(2);
  if (!winMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ map: T.lattice(4, 3), color: new THREE.Color('#c9a878').multiplyScalar(1 + warm * 0.7), side: THREE.DoubleSide });
    m.toneMapped = false;
    winMats.set(key, m);
  }
  return winMats.get(key);
}
export { windowMat };

/** 阶梯：n 级，沿 +Z 下行（顶面在 y=0 附近） */
export function stairGeo(n = 4, tread = 0.4, riseH = 0.16, width = 3.2) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(box(width, riseH * (i + 1), tread * (n - i), 0, riseH * (i + 1) / 2, tread * (n - i) / 2 - 0.02));
  }
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ 廊 */
/**
 * 一段一段排的廊：走线 points（[x,z]）＋每点标高，柱距按间。
 * opts.wall = 'left'|'right' 时在一侧加漏窗墙。
 */
export function corridor({
  points, ys = null, width = 2.5, bayLen = 2.8, height = 2.6,
  pillarR = 0.13, wallSide = null, latticeEvery = 2, z0 = 0,
}) {
  const grp = new THREE.Group();
  const pts = points.map((p, i) => new THREE.Vector3(p[0], (ys ? ys[i] : 0) + z0, p[1]));
  const colGeo = pillarGeo(height - 0.5, pillarR);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const yaw = -Math.atan2(dir.z, dir.x);
    const n = Math.max(1, Math.round(len / bayLen));
    const seg = new THREE.Group();
    seg.position.copy(a);
    seg.rotation.y = yaw;

    const floor = box(len + 0.3, 0.28, width, len / 2, 0.14, 0);
    const fm = mesh(floor, M.stoneSlab);
    fm.receiveShadow = true;
    seg.add(fm);
    const baseStone = box(len + 0.46, 0.16, width + 0.44, len / 2, 0.02, 0);
    seg.add(mesh(baseStone, M.stoneDark));

    for (let k = 0; k <= n; k++) {
      const x = (len * k) / n;
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(colGeo, M.pillar);
        p.position.set(x, 0.26, s * (width / 2 - 0.16));
        p.castShadow = true;
        seg.add(p);
      }
      if (k < n) {
        const beam = box(len / n, 0.2, 0.14, x + len / n / 2, height - 0.34, 0);
        for (const s of [-1, 1]) {
          const bb = beam.clone();
          bb.translate(0, 0, s * (width / 2 - 0.16));
          seg.add(mesh(bb, M.beam));
        }
      }
    }
    // 挂落 + 坐凳栏杆
    for (let k = 0; k < n; k++) {
      const x = (len * (k + 0.5)) / n;
      for (const s of [-1, 1]) {
        if (wallSide && s === (wallSide === 'left' ? -1 : 1)) continue;
        const drop = box((len / n) * 0.8, 0.42, 0.09, x, height - 0.66, s * (width / 2 - 0.16));
        seg.add(mesh(drop, M.woodDark));
        const rail = railingGeo(len / n * 0.92, { height: 0.82, spacing: 1.1 });
        const rm = mesh(rail, M.woodDark);
        rm.position.set(x, 0.26, s * (width / 2 - 0.2));
        seg.add(rm);
      }
      if (wallSide) {
        const s = wallSide === 'left' ? -1 : 1;
        const wall = box(len / n, height - 0.7, 0.3, x, (height - 0.7) / 2 + 0.26, s * (width / 2 - 0.1));
        seg.add(mesh(wall, M.brickWarm));
        if (k % latticeEvery === 1) {
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), windowMat(0.75));
          pane.position.set(x, height * 0.56, s * (width / 2 + 0.08));
          pane.rotation.y = Math.PI;
          seg.add(pane);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 5, 20), M.stoneDressed);
          ring.position.set(x, height * 0.56, s * (width / 2 + 0.12));
          seg.add(ring);
        }
      }
    }
    // 廊顶：一条小硬山，起翘收着点，否则像一把把伞扣在廊上
    const roofLen = len + 0.5;
    const roofPiece = new THREE.Mesh(
      chineseRoof({ width: roofLen, depth: width + 0.8, height: 0.5, curve: 0.55, eaveLift: 0.12, overhang: 0.22, hip: false, segU: 14, segV: 8 }),
      M.wallCap,
    );
    roofPiece.position.set(len / 2, height - 0.42, 0);
    seg.add(roofPiece);
    seg.add(mesh(box(roofLen * 0.98, 0.14, 0.2, len / 2, height + 0.12, 0), M.ridge));
    grp.add(seg);
  }
  return grp;
}

/* ------------------------------------------------------------------ 扇面亭 */
/** 方形或六角小亭：台明 + 柱网 + 四角攒尖 + 坐凳栏杆 */
export function gardenPavilion({ sides = 4, radius = 2.3, pillarH = 2.8, roofH = 2.1, plinth = 0.42, openSide = 0 } = {}) {
  const grp = new THREE.Group();
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.8, radius + 1.0, plinth, sides * 2), M.stoneDressed);
  plat.position.y = plinth / 2;
  plat.receiveShadow = true;
  grp.add(plat);

  const corners = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    corners.push([Math.cos(a) * radius, Math.sin(a) * radius, a]);
  }
  const colGeo = pillarGeo(pillarH, 0.13);
  for (const [cx, cz] of corners) {
    const p = new THREE.Mesh(colGeo, M.pillar);
    p.position.set(cx, plinth, cz);
    p.castShadow = true;
    grp.add(p);
  }
  for (let i = 0; i < sides; i++) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % sides];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const beam = mesh(box(len, 0.18, 0.14, 0, 0, 0), M.beam);
    beam.position.set(mx, plinth + pillarH - 0.22, mz);
    beam.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    grp.add(beam);
    const drop = mesh(box(len * 0.7, 0.4, 0.08, 0, 0, 0), M.woodDark);
    drop.position.set(mx, plinth + pillarH - 0.6, mz);
    drop.rotation.y = beam.rotation.y;
    grp.add(drop);
  }

  const eaveY = plinth + pillarH + 0.18;
  const roof = new THREE.Mesh(
    chineseRoof({
      width: (radius + 0.62) * 2, depth: (radius + 0.62) * 2, height: roofH,
      ridgeRatio: 0.03, curve: 0.58, eaveLift: 0.85, overhang: 0.3, hip: true, segU: 20, segV: 14,
    }),
    M.roof,
  );
  roof.position.y = eaveY;
  roof.castShadow = true; roof.receiveShadow = true;
  grp.add(roof);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M.gilt);
  top.position.y = eaveY + roofH + 0.12;
  grp.add(top);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), M.gilt);
  spire.position.y = eaveY + roofH + 0.42;
  grp.add(spire);

  for (let i = 0; i < sides; i++) {
    if (i === openSide) continue;
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % sides];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const rail = mesh(railingGeo(Math.hypot(x1 - x0, z1 - z0) * 0.9, { height: 0.7, spacing: 0.9 }), M.woodDark);
    rail.position.set(mx, plinth, mz);
    rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    grp.add(rail);
  }
  grp.userData.lamps = [new THREE.Vector3(0, plinth + pillarH - 0.75, 0)];
  grp.userData.eaveY = eaveY + roofH;
  return grp;
}

/** 平面像一把摊开的折扇：前窄后阔，顶随扇脊张开 */
export function fanPavilion({ backR = 3.6, frontR = 1.7, spread = 1.75, pillarH = 2.7, roofH = 1.7, plinth = 0.4 } = {}) {
  const grp = new THREE.Group();
  const seg = 12;
  const section = [];
  for (let i = 0; i <= seg; i++) {
    const a = -spread / 2 + spread * (i / seg);
    section.push([Math.sin(a), Math.cos(a)]);
  }
  // 台明：扇形
  const shape = new THREE.Shape();
  shape.moveTo(section[0][0] * frontR, section[0][1] * frontR);
  for (let i = 1; i <= seg; i++) shape.lineTo(section[i][0] * backR, section[i][1] * backR);
  for (let i = seg; i >= 0; i--) shape.lineTo(section[i][0] * (frontR - 0.5), section[i][1] * (frontR - 0.5));
  shape.closePath();
  const plat = new THREE.ExtrudeGeometry(shape, { depth: plinth, bevelEnabled: false });
  plat.rotateX(-Math.PI / 2);
  const pm = mesh(plat, M.stoneDressed);
  pm.receiveShadow = true;
  grp.add(pm);
  // 柱：扇骨端点
  const corners = [0, Math.round(seg * 0.28), Math.round(seg * 0.72), seg];
  const seen = new Set();
  for (const i of corners) {
    if (seen.has(i)) continue;
    seen.add(i);
    const [sx, sz] = section[i];
    for (const r of [frontR - 0.2, backR - 0.2]) {
      const p = new THREE.Mesh(pillarGeo(pillarH, 0.12), M.pillar);
      p.position.set(sx * r, plinth, -sz * r);
      p.castShadow = true;
      grp.add(p);
    }
  }
  // 扇形顶：母线沿半径反曲，脊从亭心放射
  const pos = [], idx = [];
  const rings = 7;
  for (let s = 0; s <= rings; s++) {
    const t = s / rings;
    const tt = t * 0.45 + Math.sqrt(t) * 0.55;
    for (let i = 0; i <= seg; i++) {
      const a = -spread / 2 + spread * (i / seg);
      const r = frontR + (backR - frontR) * t;
      const lift = Math.pow(Math.abs(i / seg - 0.5) * 2, 2.4) * 0.18;
      pos.push(Math.sin(a) * r, roofH * (1 - tt) + lift * roofH * 0.5, -Math.cos(a) * r);
    }
  }
  const rowLen = seg + 1;
  for (let s = 0; s < rings; s++) {
    for (let i = 0; i < seg; i++) {
      const a = s * rowLen + i, b = a + 1, c = a + rowLen, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const roof = new THREE.Mesh(rg, M.roof);
  roof.position.y = pillarH + plinth + 0.2;
  roof.castShadow = true;
  grp.add(roof);
  // 扇面亭只有两条直边是脊：贴着斜面放，别在顶上插一圈伞骨
  const yBase = pillarH + plinth + 0.2;
  const slant = Math.hypot(backR - frontR, roofH);
  for (const i of [0, seg]) {
    const [sx, sz] = section[i];
    const rib = mesh(box(0.11, 0.11, slant, 0, 0, 0), M.ridge);
    rib.position.set(
      sx * (frontR + backR) / 2,
      yBase + roofH * 0.5,
      -sz * (frontR + backR) / 2,
    );
    rib.rotation.y = Math.atan2(sx, -sz);
    rib.rotation.x = Math.atan2(roofH, backR - frontR);
    grp.add(rib);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.gilt);
  top.position.set(0, pillarH + plinth + 0.2 + roofH * 1.05, -(frontR + 0.2));
  grp.add(top);
  // 坐凳栏杆（后半圈）
  const rail = railingGeo((backR - frontR) * 1.1, { height: 0.72, spacing: 1.0 });
  for (const i of [0, seg]) {
    const [sx, sz] = section[i];
    const r = new THREE.Mesh(rail, M.woodDark);
    r.position.set(sx * (backR - 0.5), plinth, -sz * (backR - 0.5));
    r.rotation.y = Math.PI / 2;
    grp.add(r);
  }
  const back = new THREE.Mesh(railingGeo(backR * 1.5, { height: 0.72, spacing: 1.0 }), M.woodDark);
  back.position.set(0, plinth, -(backR - 0.4));
  grp.add(back);
  grp.userData.lamps = [new THREE.Vector3(0, pillarH + plinth - 0.3, -(frontR + 0.6))];
  return grp;
}

/* ------------------------------------------------------------------ 山、树、石 */
/** 黄石叠山：一层层压扁的块体堆成坡，脚边留洞与蹬道 */
export function rockMass({ spread = [9, 7], peak = 5 } = {}) {
  const grp = new THREE.Group();
  const n = 46;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const h = peak * (1 - t) * rr(0.6, 1.05);
    const a = rand() * Math.PI * 2;
    const rad = rr(0.4, 1) * spread[0] * 0.5 * (0.16 + t * 0.84);
    const w = rr(1.4, 3.4), d = rr(1.2, 3.0), hh = rr(0.7, 1.6);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      p.setXYZ(v, p.getX(v) * rr(0.8, 1.25), p.getY(v) * rr(0.5, 0.8), p.getZ(v) * rr(0.8, 1.25));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.huangshi);
    // IcosahedronGeometry(1) 的直径是 2，不折半就是一块六米宽的巨石
    m.scale.set(w * 0.5, hh * 0.55, d * 0.5);
    m.position.set(Math.cos(a) * rad, h + hh * 0.3, Math.sin(a) * rad * (spread[1] / spread[0]));
    m.rotation.set(rr(-0.14, 0.14), rand() * 6.28, rr(-0.12, 0.12));
    m.castShadow = true; m.receiveShadow = true;
    grp.add(m);
  }
  // 山脚的岽石与蹬道
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = rr(spread[0] * 0.44, spread[0] * 0.62);
    const slab = box(rr(1.0, 2.2), rr(0.3, 0.6), rr(0.8, 1.6), Math.cos(a) * r, rr(0.1, 0.4), Math.sin(a) * r * 0.75);
    slab.rotateY(rand() * 6.28);
    grp.add(mesh(slab, M.huangshi));
  }
  return grp;
}

/** 一棵团冠树：干 + 几团叶（桂花/广玉兰的口气） */
export function shadeTree({ h = 5.4, crown = 2.6, blossom = false } = {}) {
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, h * 0.62, 7), M.woodDark);
  trunk.position.y = h * 0.31;
  trunk.castShadow = true;
  grp.add(trunk);
  const leaf = blossom ? M.blossom : M.leaf;
  for (let i = 0; i < 5; i++) {
    const r = crown * rr(0.55, 0.92);
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v), p.getY(v) * rr(0.52, 0.72), p.getZ(v));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, leaf);
    m.position.set(rr(-crown, crown) * 0.5, h * 0.66 + rr(0, crown * 0.55), rr(-crown, crown) * 0.5);
    m.castShadow = true;
    grp.add(m);
  }
  return grp;
}

/** 一丛竹：几根竿加一小把叶 */
export function bambooClump({ n = 9, h = 4.6 } = {}) {
  const grp = new THREE.Group();
  const g = new THREE.CylinderGeometry(0.045, 0.06, h, 6);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(g, M.bamboo);
    m.position.set(rr(-0.8, 0.8), h / 2, rr(-0.7, 0.7));
    m.rotation.z = rr(-0.1, 0.1);
    m.castShadow = true;
    grp.add(m);
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(rr(0.5, 0.95), rr(0.22, 0.4)), M.bambooLeaf);
      leaf.position.set(rr(-0.55, 0.55), h * (0.45 + k * 0.15), rr(-0.5, 0.5));
      leaf.rotation.set(rr(-0.5, 0.2), rand() * 6.28, rr(-0.6, 0.6));
      grp.add(leaf);
    }
  }
  return grp;
}

/** 湖石/座石：一坨压扁的石头，用来点苔与压边 */
export function featureRock(scale = 1) {
  const g = new THREE.IcosahedronGeometry(scale, 1);
  const p = g.attributes.position;
  for (let v = 0; v < p.count; v++) {
    p.setXYZ(v, p.getX(v) * rr(0.75, 1.2), p.getY(v) * rr(0.5, 0.8), p.getZ(v) * rr(0.75, 1.2));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.huangshi);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
