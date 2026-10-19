/**
 * 江南建筑通用件：园墙、湖石、亭、殿、廊、植物与水里的那枚月。
 * 场景模块（二泉 / 寄畅园 / 惠山寺 / 直街）都从这里取构件，尺寸一律用米。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, glow, lit, box, mesh, rand, rr,
  chineseRoof, ridgeOrnament, pillarGeo, plaqueMesh, registerOccluder,
} from './kit.js';
import * as T from './textures.js';

/**
 * 一段粉墙黛瓦：局部坐标沿 +X 铺开，调用方给两端 [x,z] 与地面高程。
 * gaps 是按墙长归一化的缺口（门洞），windows 是漏窗的位置。
 */
export function wallRun({ from, to, groundY, h = 4.2, thick = 0.42, gaps = [], windows = [] }) {
  const grp = new THREE.Group();
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  grp.position.set(from[0], 0, from[1]);
  grp.rotation.y = Math.atan2(-dz, dx);

  const segs = [];
  let cursor = 0;
  for (const g of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g[0] > cursor) segs.push([cursor, g[0]]);
    cursor = Math.max(cursor, g[1]);
  }
  if (cursor < 1) segs.push([cursor, 1]);

  const walls = [], caps = [], latt = [], backGlow = [];
  for (const [a, b] of segs) {
    const L = len * (b - a), cx = (len * (a + b)) / 2;
    walls.push(box(L, h, thick, cx, groundY + h / 2, 0));
    caps.push(box(L + 0.3, 0.26, 0.8, cx, groundY + h + 0.13, 0));
  }
  caps.push(box(len, 0.12, 0.5, len / 2, groundY + h + 0.32, 0));
  for (const w of windows) {
    const cx = len * w.t, hh = w.h || 1.3, cy = groundY + (w.y || 2.1);
    latt.push(box(0.16, hh, 0.62, cx, cy, 0));
    backGlow.push(box(0.06, hh - 0.24, 0.4, cx, cy, -0.1));
  }
  grp.add(mesh(walls, M.wall));
  grp.add(mesh(caps, M.roof));
  if (latt.length) {
    grp.add(mesh(latt, M.stoneDark));
    grp.add(mesh(backGlow, glow('#ffcf94', 0.7)));
  }
  return { group: grp, len, yaw: Math.atan2(-dz, dx) };
}

/** 湖石一圈：池岸、叠石、假山的底子都是这个 */
export function rockRing({ cx, cz, hw, hd, y, count = 46, scale = 1, height = 1 }) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rr(-0.05, 0.05);
    const px = cx + Math.cos(a) * (hw + rr(-0.2, 0.7));
    const pz = cz + Math.sin(a) * (hd + rr(-0.2, 0.7));
    const s = rr(0.4, 1.15) * scale;
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1, rr(0.5, 1.0) * height, rr(0.7, 1.2));
    g.rotateY(rand() * 6.28);
    g.translate(px, y + rr(-0.15, 0.4), pz);
    parts.push(g);
  }
  return mesh(parts, lit('#ccd4de', { map: T.lakeStone(), rough: 0.9, emissive: '#141c2c', ei: 0.45 }));
}

/** 独立峰石：寄畅园的太湖石以“瘦、皱”见长，竖起来才像 */
export function peakRock({ x, z, y, h = 4, lean = 0.1 }) {
  const grp = new THREE.Group();
  const parts = [];
  const n = Math.round(h / 1.1);
  for (let i = 0; i < n; i++) {
    const s = (0.7 + rand() * 0.8) * (1 - i / (n * 1.6));
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(0.8, 1.5, 0.7);
    g.rotateY(rand() * 6.28);
    g.rotateZ(lean * (i / n));
    g.translate(lean * i * 0.5, i * 1.05 + 0.4, rand() * 0.3);
    parts.push(g);
  }
  // 孔洞：两块小负形看不出，就打一穿洞的视觉——用环面贴一段暗色
  const m = lit('#c4ccd8', { map: T.lakeStone('#a9b1be'), rough: 0.88, emissive: '#131b2a', ei: 0.45 });
  grp.add(mesh(parts, m));
  grp.position.set(x, y, z);
  grp.castShadow = true;
  return grp;
}

/** 方亭 / 圆亭：台基、柱、额枋、屋顶，可挂匾 */
export function pavilion({ w, d, groundY, h = 3.4, name = '', green = false, roofH = 1.7, round = false }) {
  const grp = new THREE.Group();
  const plinth = round
    ? [new THREE.CylinderGeometry(w / 2 + 0.9, w / 2 + 1.05, 0.48, 12).translate(0, 0.24, 0)]
    : [box(w + 1.6, 0.48, d + 1.6, 0, 0.24, 0)];
  const pillars = [], beams = [];
  if (round) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pillars.push(pillarGeo(h, 0.16, true).clone().translate(Math.cos(a) * w / 2, 0.48, Math.sin(a) * w / 2));
    }
  } else {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pillars.push(pillarGeo(h, 0.17, true).clone().translate(sx * w / 2, 0.48, sz * d / 2));
      }
    }
    beams.push(box(w + 0.5, 0.24, 0.22, 0, 0.48 + h, d / 2));
    beams.push(box(w + 0.5, 0.24, 0.22, 0, 0.48 + h, -d / 2));
    beams.push(box(0.22, 0.24, d + 0.5, w / 2, 0.48 + h, 0));
    beams.push(box(0.22, 0.24, d + 0.5, -w / 2, 0.48 + h, 0));
  }
  grp.add(mesh(plinth, M.stoneDressed));
  grp.add(mesh(pillars, M.pillar));
  if (beams.length) grp.add(mesh(beams, M.beam));
  const rw = round ? w + 2.0 : w + 1.9;
  const rd = round ? w + 2.0 : d + 1.9;
  const rf = mesh([chineseRoof({
    width: rw, depth: rd, height: roofH, ridgeRatio: round ? 0.12 : 0.3,
    curve: 0.7, eaveLift: 0.6, overhang: 0.4,
  })], green ? M.roofGreen : M.roof);
  rf.position.y = 0.48 + h;
  grp.add(rf);
  const rdg = mesh([ridgeOrnament({ width: rw, depth: rd, height: roofH, ridgeRatio: round ? 0.12 : 0.3 })], M.ridge);
  rdg.position.y = 0.48 + h;
  grp.add(rdg);
  grp.add(mesh([box(0.4, 0.4, 0.4, 0, h - 0.2, 0)], glow('#ffd79b', 1.5)));
  if (name) {
    const p = plaqueMesh(name, Math.min(w * 0.95, 4.4), 0.78, { dir: 'h', bg: '#131f33', fg: '#f0dcb4' });
    p.position.set(0, 0.48 + h - 1.0, (round ? w : d) / 2 + 0.24);
    grp.add(p);
  }
  grp.position.y = groundY;
  return grp;
}

/**
 * 殿 / 厅：面阔若干间、进深若干，前后金柱、山墙、满扇槅扇与匾额。
 * 屋顶沿 +Z 展开（面阔方向为 Z），与街屋同向，方便沿街布置。
 */
export function hall({
  bays = 5, bayW = 4.4, depth = 12, h = 6.4, groundY = 0,
  name = '', green = false, twoEave = false, plinth = 0.8, lattice = true,
}) {
  const grp = new THREE.Group();
  const w = bays * bayW;
  const base = [], walls = [], timber = [], litWin = [];
  base.push(box(depth + 3.6, plinth, w + 3.2, 0, plinth / 2, 0));
  for (let k = 0; k < 3; k++) {
    base.push(box(1.3, 0.26, w * 0.5, depth / 2 + 2.4 + k * 1.25, 0.13 + k * 0.26, 0));
  }
  // 柱网：前后金柱各一排，山墙内带附柱
  for (let i = 0; i <= bays; i++) {
    const z = -w / 2 + bayW * i;
    for (const sx of [depth / 2 - 0.7, -depth / 2 + 0.7]) {
      timber.push(pillarGeo(h, 0.26, true).clone().translate(sx, plinth, z));
    }
  }
  // 墙体：后墙实、山墙实、前脸槅扇
  walls.push(box(0.5, h, w + 0.6, -depth / 2 + 0.25, plinth + h / 2, 0));
  walls.push(box(depth, h, 0.5, 0, plinth + h / 2, -w / 2 - 0.2));
  walls.push(box(depth, h, 0.5, 0, plinth + h / 2, w / 2 + 0.2));
  for (let i = 0; i < bays; i++) {
    const z = -w / 2 + bayW * (i + 0.5);
    walls.push(box(0.16, h * 0.78, bayW - 0.5, depth / 2 - 0.5, plinth + h * 0.42, z));
    litWin.push(box(0.07, h * 0.34, bayW - 1.9, depth / 2 - 0.42, plinth + h * 0.46, z));
  }
  // 额枋与斗拱一圈
  const beams = [];
  beams.push(box(0.3, 0.36, w + 0.4, depth / 2 - 0.7, plinth + h, 0));
  beams.push(box(0.3, 0.36, w + 0.4, -depth / 2 + 0.7, plinth + h, 0));
  beams.push(box(depth - 1.2, 0.36, 0.3, 0, plinth + h, w / 2 - 0.6));
  beams.push(box(depth - 1.2, 0.36, 0.3, 0, plinth + h, -w / 2 + 0.6));
  const brackets = [];
  for (let i = 0; i <= bays * 2; i++) {
    const z = -w / 2 + (w * i) / (bays * 2);
    brackets.push(box(0.5, 0.5, 0.5, depth / 2 - 0.7, plinth + h + 0.3, z));
    brackets.push(box(0.5, 0.5, 0.5, -depth / 2 + 0.7, plinth + h + 0.3, z));
  }
  grp.add(mesh(base, M.stoneDressed));
  grp.add(mesh(walls, M.wall));
  grp.add(mesh(timber, M.pillarBright));
  grp.add(mesh(beams, M.beam));
  grp.add(mesh(brackets, M.beam));
  if (lattice) grp.add(mesh(litWin, glow('#ffb463', 0.5)));

  const roofW = h * (twoEave ? 1.16 : 1.04), roofD = w + 3.4;
  const rf = mesh([chineseRoof({
    width: roofW, depth: roofD, height: h * 0.34, ridgeRatio: 0.38, curve: 0.66, eaveLift: 0.42, overhang: 0.8,
  })], green ? M.roofGreen : M.roof);
  rf.position.set(0, plinth + h + 0.5, 0);
  rf.rotation.y = Math.PI / 2;
  grp.add(rf);
  const rd = mesh([ridgeOrnament({ width: roofW, depth: roofD, height: h * 0.34, ridgeRatio: 0.38, overhang: 0.8 })], M.ridge);
  rd.position.set(0, plinth + h + 0.5, 0);
  rd.rotation.y = Math.PI / 2;
  grp.add(rd);
  if (name) {
    const p = plaqueMesh(name, Math.min(w * 0.42, 5.2), 1.15, { dir: 'h', bg: '#16233a', fg: '#e8cf9c' });
    p.position.set(depth / 2 - 0.34, plinth + h * 0.86, 0);
    p.rotation.y = Math.PI / 2;
    grp.add(p);
  }
  for (const s of [-1, 1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.34, 12), M.stoneDressed);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(depth / 2 + 1.9, plinth + 0.55, s * (w / 2 - 0.9));
    grp.add(drum);
  }
  grp.position.y = groundY;
  return { group: grp, w, h: plinth + h, depth };
}

/** 游廊：柱 + 楣子 + 一间间披檐顶，园子里靠它串景 */
export function corridor({ from, to, groundY, h = 2.9, posts = 8, roofW = 2.6 }) {
  const grp = new THREE.Group();
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const pillars = [], beams = [];
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const x = from[0] + dx * t, z = from[1] + dz * t;
    pillars.push(pillarGeo(h, 0.14, true).clone().translate(x, groundY, z));
    pillars.push(pillarGeo(h, 0.14, true).clone().translate(x + (dz / len) * roofW, groundY, z - (dx / len) * roofW));
  }
  const a0 = from, a1 = [from[0] + (dz / len) * roofW, from[1] - (dx / len) * roofW];
  beams.push(box(len, 0.2, 0.2, (a0[0] + a1[0]) / 2 + dx / 2, groundY + h, (a0[1] + a1[1]) / 2 + dz / 2));
  grp.add(mesh(pillars, M.pillar));
  grp.add(mesh(beams, M.beam));
  const rf = mesh([chineseRoof({ width: len + 1, depth: roofW + 1.1, height: 0.8, ridgeRatio: 0.96, overhang: 0.3 })], M.roof);
  rf.position.set(from[0] + dx / 2 + (dz / len) * roofW * 0.4, groundY + h + 0.1, from[1] + dz / 2 - (dx / len) * roofW * 0.4);
  rf.rotation.y = Math.atan2(-dz, dx);
  grp.add(rf);
  return grp;
}

/** 一丛竹 */
export function bambooClump(scene, [x, z], groundY, n = 14) {
  const culms = [], leaves = [];
  for (let i = 0; i < n; i++) {
    const cx = x + rr(-1.4, 1.4), cz = z + rr(-1.4, 1.4);
    const h = rr(3.4, 5.6);
    const c = new THREE.CylinderGeometry(0.05, 0.075, h, 5);
    c.rotateZ(rr(-0.06, 0.06));
    c.translate(cx, groundY + h / 2, cz);
    culms.push(c);
    for (let k = 0; k < 4; k++) {
      const leaf = new THREE.PlaneGeometry(rr(1.1, 2.0), rr(0.7, 1.2));
      leaf.rotateY(rand() * 6.28);
      leaf.rotateZ(rr(-0.6, 0.6));
      leaf.translate(cx + rr(-0.7, 0.7), groundY + h * rr(0.62, 0.98), cz + rr(-0.7, 0.7));
      leaves.push(leaf);
    }
  }
  const grp = new THREE.Group();
  grp.add(mesh(culms, lit('#7f9a82', { rough: 0.85, emissive: '#16241c', ei: 0.4 })));
  grp.add(mesh(leaves, lit('#5f8468', { map: T.bambooLeaf(), rough: 0.9, side: THREE.DoubleSide, emissive: '#10201a', ei: 0.5 })));
  scene.add(grp);
  return grp;
}

/** 荷叶：贴水的圆盘 */
export function lotusLeaves(scene, { cx, cz, hw, hd, y }, count = 90) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
    const px = cx + Math.cos(a) * hw * 0.9 * r, pz = cz + Math.sin(a) * hd * 0.9 * r;
    const s = rr(0.3, 0.8);
    const g = new THREE.CircleGeometry(s, 9);
    g.rotateX(-Math.PI / 2 + rr(-0.22, 0.22));
    g.rotateY(rand() * 6.28);
    g.translate(px, y + rr(0.02, 0.14), pz);
    parts.push(g);
  }
  const m = mesh(parts, lit('#24493a', { rough: 0.62, emissive: '#0b1a13', ei: 0.55, side: THREE.DoubleSide }));
  scene.add(m);
  return m;
}

/** 水里的那枚月 */
export function moonInPool(scene, { x, z, y, size = 1.4 }) {
  const grp = new THREE.Group();
  const mk = (s, hue, hard, op) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(s, 24), new THREE.MeshBasicMaterial({
      map: T.softGlow(hue, hard), transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.material.toneMapped = false;
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    grp.add(m);
    return m;
  };
  const halo = mk(size * 3.6, '255,236,192', 0.5, 0.42);
  const disc = mk(size, '255,246,214', 0.3, 0.95);
  scene.add(grp);
  return { group: grp, disc, halo };
}

/** 一串灯笼（街、廊、院共用同一材质，好一起调亮度） */
let lanternMat = null;
export function lanternMaterial() {
  if (!lanternMat) {
    lanternMat = new THREE.MeshBasicMaterial({ map: T.lanternPaper('#fff2d2', '#e8613a') });
    lanternMat.toneMapped = false;
  }
  return lanternMat;
}

export function lanternCluster(scene, spots, { scale = 1, halo = 4.2 } = {}) {
  const mat = lanternMaterial();
  const grp = new THREE.Group();
  for (const [x, y, z] of spots) {
    const g = new THREE.SphereGeometry(0.3 * scale, 10, 8);
    g.scale(1, 1.3, 1);
    const l = new THREE.Mesh(g, mat);
    l.position.set(x, y, z);
    grp.add(l);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,170,100', 0.14), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    sp.position.set(x, y, z);
    sp.scale.set(halo * scale, halo * scale, 1);
    sp.userData.halo = halo * scale;
    grp.add(sp);
  }
  scene.add(grp);
  return grp;
}

/** 香樟/古树：一团团树冠剪影，街角、园里、寺前都种 */
export function camphorGeo(scale = 1) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.26 * scale, 0.5 * scale, 5.2 * scale, 8);
  trunk.translate(0, 2.6 * scale, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const br = new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 2.2 * scale, 5);
    br.rotateZ((i - 1) * 0.75);
    br.rotateY(i * 2.2);
    br.translate(0, 4.6 * scale, 0);
    parts.push(br);
  }
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2, r = rr(0.6, 3.0) * scale;
    const blob = new THREE.IcosahedronGeometry(rr(1.5, 2.5) * scale, 0);
    blob.translate(Math.cos(a) * r, rr(5.4, 7.6) * scale, Math.sin(a) * r);
    parts.push(blob);
  }
  // 树冠的 Icosahedron 没有索引，和柱子的 Cylinder 混在一起 merge 会失败
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** 一排树：spots 给 [x,z,scale,y] */
export function treeRow(scene, spots, defaultY = 0) {
  const grp = new THREE.Group();
  const big = camphorGeo(1), mid = camphorGeo(0.78);
  for (const [x, z, s = 1, y = defaultY] of spots) {
    const t = new THREE.Mesh(s > 0.9 ? big : mid, M.leaf);
    t.position.set(x, y, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, 4.6, new THREE.Vector3(x, y, z)));
  }
  scene.add(grp);
  return grp;
}

/** 柏树：寺院与泉院要的是竖直的那一支 */
export function cypress(scene, spots, y = 0) {
  const parts = [];
  for (const [x, z] of spots) {
    const h = rr(5.5, 8.5);
    const g = new THREE.ConeGeometry(rr(1.1, 1.7), h, 7, 1);
    g.translate(x, y + h / 2, z);
    parts.push(g);
  }
  const m = mesh(parts, lit('#1e3a2c', { rough: 0.95, emissive: '#0a1712', ei: 0.5 }));
  scene.add(m);
  return m;
}

/**
 * 一块平地。水面不再靠挖洞露出来（两个洞一起挖时三角化会塌），
 * 而是把水面的高程做到地坪之上，由湖石压住边。
 */
export function groundPad({ x0, x1, z0, z1, y, mat, receiveShadow = true }) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  if (receiveShadow) m.receiveShadow = true;
  return m;
}
