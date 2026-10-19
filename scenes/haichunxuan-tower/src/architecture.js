/**
 * 西溪古镇的场地：泰东河与晏溪河两水交汇、塔院与海春塔影牌坊、
 * 泰山护国禅寺（山门—钟楼—正殿，寺前三桥并列）、通圣桥、犁木街河房与西溪盐仓监，
 * 东岸是夜航泊岸与灯市（写意添加）。
 * 塔与寺的相对方位、桥名与街名按可考实景；廊棚、灯串与东岸市肆为写意重建。
 */
import * as THREE from 'three';
import {
  M, mesh, box, glow, rand, rr, registerOccluder,
  chineseRoof, ridgeOrnament, pillarGeo, railingGeo, bracketGeo, plaqueMesh, bellGeo,
} from './kit.js';
import { SITE, PAGODA } from './data.js';

const Q = SITE.yardY;
const HW = SITE.river.halfWidth;
const HALF = SITE.river.length / 2;
const CR = SITE.creek;
const CB = CR.z - CR.halfWidth;        // 晏溪河北岸
const CS = CR.z + CR.halfWidth;        // 晏溪河南岸

/** 门、殿、桥、埠头取位；portals / props / crowd 都从这里拿 */
export const LAYOUT = {
  deckY: Q,
  tower: { x: SITE.pagoda.x, z: SITE.pagoda.z, r: PAGODA.tiers[0].rBottom, rot: SITE.pagoda.rot },
  // 绕塔祈福的一圈路径（顺时针），香客沿它走
  circumambulate: { x: SITE.pagoda.x, z: SITE.pagoda.z, r: 7.4 },
  courtGate: { x: SITE.courtGate.x, z: SITE.courtGate.z, w: 5.2, d: 3.2, h: 3.6, floorY: Q, front: Math.PI / 2 },
  paifang: { x: SITE.paifang.x, z: SITE.paifang.z },
  bell: { cx: SITE.bellTower.x, cz: SITE.bellTower.z, deckY: Q + 4.0 },
  hall: { cx: SITE.hall.x, cz: SITE.hall.z, w: SITE.hall.w, d: SITE.hall.d, h: 5.6, floorY: Q + 0.55 },
  hall2: { cx: SITE.hall.x, cz: 48.0, w: 12.0, d: 8.6, h: 5.0, floorY: Q + 0.55 },
  templeGate: { x: SITE.templeGate.x, z: SITE.templeGate.z, w: 8.4, d: 3.4, h: 3.9, floorY: Q, front: Math.PI },
  granary: { x: SITE.granary.x, z: SITE.granary.z },
  threeBridges: SITE.threeBridges,
  tongsheng: SITE.tongsheng,
  eastWharf: SITE.eastWharf,
  westWharf: SITE.westWharf,
};

/* ------------------------------------------------------------------ 墙与地 */

function wallRun(parts, { x, z, len, axis, h = 3.0, y = Q, thick = 0.62 }) {
  if (len <= 0.2) return;
  parts.push(axis === 'x' ? box(len, h, thick, x, y + h / 2, z) : box(thick, h, len, x, y + h / 2, z));
  const cy = y + h + 0.12;
  const n = Math.max(1, Math.round(len / 1.6));
  if (axis === 'x') {
    parts.push(box(len + 0.3, 0.24, thick + 0.34, x, cy, z));
    for (let i = 0; i <= n; i++) parts.push(box(0.34, 0.3, thick + 0.5, x - len / 2 + (len * i) / n, cy + 0.27, z));
  } else {
    parts.push(box(thick + 0.34, 0.24, len + 0.3, x, cy, z));
    for (let i = 0; i <= n; i++) parts.push(box(thick + 0.5, 0.3, 0.34, x, cy + 0.27, z - len / 2 + (len * i) / n));
  }
}

/** 一段沿 X 的岸壁（晏溪河用），带压顶与石级 */
function creekBank(parts, { z, x0, x1, h = 4.6 }) {
  const len = x1 - x0;
  parts.push(box(len, h, 1.2, (x0 + x1) / 2, Q - h / 2 + 0.2, z));
  for (let i = 0; i < Math.round(len / 5.2); i++) parts.push(box(5.0, 0.4, 1.6, x0 + 2.6 + i * 5.2, Q - 0.1, z));
}

/* ------------------------------------------------------------------ 屋 */

function hall(mats, { x, z, w, d, h = 3.6, floorY = Q, front = Math.PI / 2, roof = 'hip',
  name = '', nameW = 1.7, tiers = 1, storyH = 3.0, eaveOver = 0.8, doorW = 1.8, wallMat = null }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = front;

  g.add(mesh([box(w + 1.4, 0.5, d + 1.4, 0, floorY - 0.25, 0)], M.stone));
  const st = [];
  for (let k = 0; k < 3; k++) st.push(box(doorW + 1.4 + k * 0.6, 0.17, 0.75, 0, floorY - 0.5 + k * 0.17, d / 2 + 1.1 + k * 0.75));
  g.add(mesh(st, M.stoneDressed));

  let y = floorY;
  for (let s = 0; s < tiers; s++) {
    const hh = s === tiers - 1 ? h : storyH;
    g.add(mesh([box(w, hh, d, 0, y + hh / 2, 0)], wallMat || mats.wall));
    const n = Math.max(2, Math.round(w / 2.7) + 1);
    const cols = [];
    for (let i = 0; i < n; i++) {
      cols.push(pillarGeo(hh * 0.95, 0.25).translate(-w / 2 + (w * i) / (n - 1), y, d / 2 + 0.18));
      cols.push(pillarGeo(hh * 0.95, 0.25).translate(-w / 2 + (w * i) / (n - 1), y, -d / 2 - 0.18));
    }
    g.add(mesh(cols, M.redPillar));
    const br = [];
    for (let i = 0; i < n - 1; i++) br.push(bracketGeo(0.82).translate(-w / 2 + (w * (i + 0.5)) / (n - 1), y + hh - 0.12, d / 2 + 0.26));
    g.add(mesh(br, M.beam));
    g.add(mesh([box(w + 0.6, 0.42, 0.34, 0, y + hh - 0.3, d / 2 + 0.12), box(w + 0.6, 0.42, 0.34, 0, y + hh - 0.3, -d / 2 - 0.12)], M.beam));
    if (s < tiers - 1) {
      g.add(mesh([box(w + 1.4, 0.3, d + 1.4, 0, y + hh + 0.16, 0)], M.woodDark));
      const rl = [];
      for (const sz of [-1, 1]) rl.push(railingGeo(w + 1.0, { height: 0.9 }).translate(0, y + hh + 0.3, sz * (d / 2 + 0.5)));
      for (const sx of [-1, 1]) {
        const r = railingGeo(d + 1.0, { height: 0.9 });
        r.rotateY(Math.PI / 2);
        r.translate(sx * (w / 2 + 0.5), y + hh + 0.3, 0);
        rl.push(r);
      }
      g.add(mesh(rl, M.stoneDressed));
      const waist = chineseRoof({ width: w + 2.2, depth: 2.8, height: 0.95, hip: false, overhang: 0.4 });
      waist.translate(0, y + hh + 0.3, d / 2 + 0.5);
      g.add(mesh([waist], M.roofGrey));
    }
    y += hh;
  }

  g.add(mesh([box(doorW, h * 0.72, 0.42, 0, floorY + h * 0.36, d / 2 - 0.05),
    box(doorW + 0.34, 0.2, 0.44, 0, floorY + h * 0.74, d / 2)], M.dark));
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w / 3.4, h * 0.46), M.lattice);
    p.position.set(sx * w / 3.9, floorY + h * 0.4, d / 2 + 0.08);
    g.add(p);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(d / 3.2, h * 0.44), M.lattice);
    q.position.set(sx * (w / 2 + 0.07), floorY + h * 0.42, 0);
    q.rotation.y = (Math.PI / 2) * sx;
    g.add(q);
  }

  const rh = Math.max(1.35, w * 0.23);
  const rg = chineseRoof({ width: w, depth: d, height: rh, hip: roof === 'hip', overhang: eaveOver });
  rg.translate(0, y, 0);
  g.add(mesh([rg], mats.roof));
  g.add(mesh([ridgeOrnament({ width: w, depth: d, height: y + rh, ridgeRatio: roof === 'hip' ? 0.42 : 1, overhang: eaveOver })], M.ridge));
  if (roof !== 'hip') {
    for (const sx of [-1, 1]) g.add(mesh([box(0.34, rh * 0.75, d * 0.95, sx * w / 2, y + rh * 0.32, 0)], wallMat || mats.wall));
  }
  if (name) {
    const pl = plaqueMesh(name, nameW, nameW * 0.44, { bg: '#14324a' });
    pl.position.set(0, y - h * 0.3, d / 2 + 0.55);
    g.add(pl);
  }
  registerOccluder(g, 2.2, new THREE.Vector3(x, floorY + 1.5, z));
  return g;
}

/** 牌坊：柱列在路两侧，人从柱间穿过；travel 是路的方向角 */
function paifang({ x, z, travel = 0, text = '海春塔影' }) {
  const g = new THREE.Group();
  g.position.set(x, Q, z);
  g.rotation.y = travel;
  const H = 5.4;
  const parts = [];
  for (const [sx, hh] of [[-3.7, H], [3.7, H], [-1.55, H + 0.75], [1.55, H + 0.75]]) {
    parts.push(box(0.62, hh, 0.62, sx, hh / 2, 0));
    parts.push(box(1.1, 0.3, 1.1, sx, 0.15, 0));
    parts.push(box(0.34, 0.92, 1.55, sx + (sx > 0 ? 0.5 : -0.5), 0.46, 0));
  }
  parts.push(box(8.6, 0.5, 0.72, 0, H + 0.25, 0));
  parts.push(box(9.0, 0.22, 1.05, 0, H + 0.6, 0));
  g.add(mesh(parts, M.stone));
  for (const [w, hh, cx] of [[3.0, 1.15, 0], [2.4, 0.85, -2.65], [2.4, 0.85, 2.65]]) {
    const base = H + (cx === 0 ? 0.85 : 0.55);
    const rg = chineseRoof({ width: w, depth: 1.5, height: hh, hip: false, overhang: 0.36 });
    rg.translate(cx, base, 0);
    g.add(mesh([rg], M.roofTemple));
    g.add(mesh([ridgeOrnament({ width: w, depth: 1.5, height: base + hh, ridgeRatio: 1, overhang: 0.36 })], M.ridge));
  }
  for (const sz of [1, -1]) {
    const pl = plaqueMesh(text, 2.6, 0.98, { bg: '#16324c' });
    pl.position.set(0, H - 0.55, sz * 0.46);
    if (sz < 0) pl.rotation.y = Math.PI;
    g.add(pl);
  }
  for (const sx of [-2.65, 2.65]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow('#ffbe72', 1.9));
    lamp.position.set(sx, H - 1.05, 0);
    g.add(lamp);
  }
  registerOccluder(g, 2.0, new THREE.Vector3(x, Q + 2, z));
  return g;
}

/**
 * 砖拱桥：单孔无铰，券圈直接由砖收分砌成，没有铰石；
 * 跨度、宽与矢高按通圣桥与寺前三桥的常见尺度取。
 */
function brickArchBridge({ at, along = 'z', span = 11.6, width = 4.6, rise = 3.4, ringR = null }) {
  const g = new THREE.Group();
  g.position.set(at.x, 0, at.z);
  // 桥的行走方向沿 axis，跨度方向即水道方向
  if (along === 'z') g.rotation.y = Math.PI / 2;
  const r = ringR || span / 2 - 0.4;
  const spring = Q - 1.4;                 // 券脚落在水面以上一点
  const crown = spring + r;

  // 桥面：单缓拱，从一岸台阶升到券顶
  const deck = [];
  const N = 22;
  const half = span / 2;
  const prof = (t) => {
    const u = THREE.MathUtils.clamp(t, 0, 1);
    return Q + Math.sin(Math.PI * THREE.MathUtils.clamp(u, 0.03, 0.97)) * (crown - Q);
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const x0 = -half + span * t0, x1 = -half + span * t1;
    const seg = box(x1 - x0 + 0.04, 0.46, width, 0, 0, 0);
    seg.rotateZ(-Math.atan2(prof(t1) - prof(t0), x1 - x0));
    seg.translate((x0 + x1) / 2, (prof(t0) + prof(t1)) / 2, 0);
    deck.push(seg);
  }
  g.add(mesh(deck, M.stoneDressed));

  // 券圈：楔形砖一圈，糯米灰浆咬合
  const ring = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    const b = box(0.68, 0.56, width + 0.2, Math.cos(a) * r, Math.sin(a) * r + spring, 0);
    b.rotateZ(a - Math.PI / 2);
    ring.push(b);
  }
  g.add(mesh(ring, M.stone));
  // 券上两侧的金刚墙与龙门石
  g.add(mesh([
    box(1.5, crown + 0.4 - spring, width + 0.3, -r - 0.9, (crown + spring) / 2, 0),
    box(1.5, crown + 0.4 - spring, width + 0.3, r + 0.9, (crown + spring) / 2, 0),
  ], M.stone));
  // 栏板与望柱
  for (const sz of [-width / 2 + 0.16, width / 2 - 0.16]) {
    const rail = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const x = -half + span * t;
      const y = prof(t) + 0.42;
      rail.push(box(0.2, 0.86, 0.2, x, y, sz));
      rail.push(box(1.3, 0.16, 0.32, x, y + 0.48, sz));
    }
    g.add(mesh(rail, M.stone));
  }
  // 两头下岸的石级
  for (const sx of [-1, 1]) {
    const st = [];
    for (let k = 0; k < 4; k++) st.push(box(0.95, 0.24, width, sx * (half + 0.4 + k * 0.95), Q + 0.7 - k * 0.6, 0));
    g.add(mesh(st, M.stoneDressed));
  }
  return { group: g, crownY: prof(0.5) };
}

/** 石级埠头与系船石 */
function wharfSteps({ x, z, face = -1, width = 4.6, axis = 'x' }) {
  const g = new THREE.Group();
  const parts = [];
  for (let k = 0; k < 7; k++) {
    if (axis === 'x') parts.push(box(1.05, 0.32, width, x + face * (0.5 + k * 1.05), Q - 0.4 - k * 0.44, z));
    else parts.push(box(width, 0.32, 1.05, x, Q - 0.4 - k * 0.44, z + face * (0.5 + k * 1.05)));
  }
  for (const dz of [-width / 2 + 0.5, width / 2 - 0.5]) {
    parts.push(axis === 'x' ? box(0.34, 0.62, 0.34, x + face * 1.2, Q + 0.31, z + dz) : box(0.34, 0.62, 0.34, x + dz, Q + 0.31, z + face * 1.2));
  }
  g.add(mesh(parts, M.stoneDressed));
  return g;
}

/** 面向角：南=+Z(0)，北=-Z(π)，东=+X(π/2)，西=-X(-π/2) */
const FACE_ROT = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };

/** 河房一路：硬山两坡、临河出廊棚、前店后宅；axis 是街的方向 */
function dwellingRow({ axis, x0, x1, at, face, step = 8.4, depth = 6.6 }) {
  const g = new THREE.Group();
  const rot = FACE_ROT[face] ?? 0;
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / step));
  for (let i = 0; i < n; i++) {
    const w = step * rr(0.8, 0.95);
    const h = rr(3.1, 4.3);
    const two = rand() > 0.5;
    const grp = new THREE.Group();
    const along = x0 + (axis === 'x' ? 1 : 1) * i * step + rr(-0.3, 0.3);
    grp.position.set(axis === 'x' ? along : at + rr(-0.4, 0.4), 0, axis === 'x' ? at : along);
    grp.rotation.y = rot;
    grp.add(mesh([box(w, h, depth, 0, Q + h / 2, 0), box(w + 0.5, 0.32, depth + 0.5, 0, Q + h + 0.14, 0)], M.wall));
    if (two) grp.add(mesh([box(w * 0.94, 2.4, depth * 0.92, 0, Q + h + 1.2, 0), box(w * 0.94 + 0.4, 0.3, depth * 0.92 + 0.4, 0, Q + h + 2.45, 0)], M.wall));
    const rh = Math.max(1.0, w * 0.19);
    const ry = Q + h + (two ? 2.6 : 0.3);
    const rg = chineseRoof({ width: w + 0.9, depth: depth + 0.7, height: rh, hip: false, overhang: 0.42 });
    rg.translate(0, ry, 0);
    grp.add(mesh([rg], M.roofGrey));
    grp.add(mesh([ridgeOrnament({ width: w + 0.9, depth: depth + 0.7, height: ry + rh, ridgeRatio: 1, overhang: 0.42 })], M.ridge));
    for (const sx of [-w / 4.2, w / 4.2]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w / 3.6, h * (two ? 0.4 : 0.46)), M.lattice);
      p.position.set(sx, Q + h * (two ? 0.66 : 0.5), depth / 2 + 0.06);
      grp.add(p);
    }
    grp.add(mesh([box(1.2, h * 0.5, 0.3, 0, Q + h * 0.25, depth / 2 - 0.04)], M.dark));
    const post = [];
    for (let k = 0; k < 4; k++) post.push(pillarGeo(h * 0.9, 0.15).translate(-w / 2 + (w * k) / 3, Q, depth / 2 + 1.6));
    grp.add(mesh(post, M.woodDark));
    const lean = chineseRoof({ width: w * 1.04, depth: 2.6, height: 0.62, hip: false, overhang: 0.3 });
    lean.translate(0, Q + h * 0.92, depth / 2 + 1.9);
    grp.add(mesh([lean], M.roofGrey));
    for (const sx of [-1, 1]) grp.add(mesh([box(0.3, h + 0.9, depth * 0.98, sx * (w / 2 + 0.15), Q + (h + 0.9) / 2, 0)], M.stoneDark));
    g.add(grp);
  }
  return g;
}

/** 盐仓一廒：长条硬山、高窗放潮、门前盐堆与苦布 */
function granary({ x, z, face = 'south' }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = FACE_ROT[face] ?? 0;
  const w = 15.4, d = 8.6, h = 4.3;
  g.add(mesh([box(w + 1.2, 0.6, d + 1.2, 0, Q + 0.3, 0)], M.stone));
  g.add(mesh([box(w, h, d, 0, Q + 0.6 + h / 2, 0), box(w + 0.6, 0.34, d + 0.6, 0, Q + 0.6 + h + 0.12, 0)], M.redWall));
  const rg = chineseRoof({ width: w + 1.3, depth: d + 0.9, height: 1.7, hip: false, overhang: 0.6 });
  rg.translate(0, Q + 0.6 + h + 0.2, 0);
  g.add(mesh([rg], M.roofGrey));
  g.add(mesh([ridgeOrnament({ width: w + 1.3, depth: d + 0.9, height: Q + 0.6 + h + 1.9, ridgeRatio: 1, overhang: 0.6 })], M.ridge));
  for (const sx of [-w / 3.2, 0, w / 3.2]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.85), M.lattice);
    p.position.set(sx, Q + h * 0.76, d / 2 + 0.07);
    g.add(p);
  }
  g.add(mesh([box(2.6, 3.0, 0.4, 0, Q + 2.1, d / 2 - 0.05)], M.dark));
  const pl = plaqueMesh('西溪盐仓', 2.6, 0.9, { bg: '#3a1f16' });
  pl.position.set(0, Q + h * 0.9, d / 2 + 0.5);
  g.add(pl);
  for (let i = 0; i < 6; i++) {
    const s = rr(0.85, 1.5);
    const pile = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6), M.salt);
    pile.scale.set(1.25, 0.46, 1);
    pile.position.set(rr(-w / 2.4, w / 2.4), Q + s * 0.42, d / 2 + rr(1.8, 3.6));
    pile.receiveShadow = true;
    g.add(pile);
  }
  for (let i = 0; i < 4; i++) {
    const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 1.05, 10), M.woodDark);
    cask.position.set(rr(-w / 2, w / 2), Q + 1.0, d / 2 + rr(1.4, 3.4));
    cask.castShadow = true;
    g.add(cask);
  }
  registerOccluder(g, 3.0, new THREE.Vector3(x, Q + 2, z));
  return g;
}

/* ------------------------------------------------------------------ 钟楼 */

function bellTower({ cx, cz }) {
  const grp = new THREE.Group();
  grp.position.set(cx, 0, cz);
  const w = 6.4, d = 6.4;
  grp.add(mesh([box(w + 1.6, 0.6, d + 1.6, 0, Q + 0.3, 0)], M.stone));
  grp.add(mesh([box(w, 3.4, d, 0, Q + 0.6 + 1.7, 0), box(w + 0.5, 0.32, d + 0.5, 0, Q + 4.15, 0)], M.templeWall));
  const lower = chineseRoof({ width: w + 2.4, depth: d + 2.4, height: 1.5, hip: true, overhang: 0.7 });
  lower.translate(0, Q + 4.35, 0);
  grp.add(mesh([lower], M.roofTemple));

  const deckY = LAYOUT.bell.deckY + 0.35;
  grp.add(mesh([box(w + 0.2, 0.34, d + 0.2, 0, deckY, 0)], M.woodDark));
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.push(pillarGeo(3.1, 0.27).translate(sx * (w / 2 - 0.9), deckY + 0.17, sz * (d / 2 - 0.9)));
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) posts.push(pillarGeo(3.1, 0.24).translate(sx * (w / 2 - 0.9), deckY + 0.17, sz * 1.3));
  for (const sz of [-1, 1]) for (const sx of [-1, 0, 1]) posts.push(pillarGeo(3.1, 0.24).translate(sx * 1.3, deckY + 0.17, sz * (d / 2 - 0.9)));
  grp.add(mesh(posts, M.redPillar));
  const rail = [];
  for (const sz of [-1, 1]) rail.push(railingGeo(w - 0.6, { height: 0.95 }).translate(0, deckY + 0.2, sz * (d / 2 - 0.3)));
  for (const sx of [-1, 1]) {
    const r = railingGeo(d - 0.6, { height: 0.95 });
    r.rotateY(Math.PI / 2);
    r.translate(sx * (w / 2 - 0.3), deckY + 0.2, 0);
    rail.push(r);
  }
  grp.add(mesh(rail, M.stoneDressed));
  const upper = chineseRoof({ width: w + 1.8, depth: d + 1.8, height: 2.0, hip: true, overhang: 0.6 });
  upper.translate(0, deckY + 3.3, 0);
  grp.add(mesh([upper], M.roofTemple));
  grp.add(mesh([ridgeOrnament({ width: w + 1.8, depth: d + 1.8, height: deckY + 5.3, ridgeRatio: 0.36, overhang: 0.6 })], M.ridge));

  const beamY = deckY + 2.7;
  grp.add(mesh([box(w - 1.4, 0.36, 0.44, 0, beamY, 0), box(0.44, 0.36, d - 1.4, 0, beamY, 0)], M.beam));
  const pivot = new THREE.Object3D();
  pivot.position.set(0, beamY - 0.2, 0);
  const log = new THREE.Object3D();
  const bellMesh = new THREE.Mesh(bellGeo({ height: 2.0, radius: 0.82 }), M.bronze);
  bellMesh.position.set(0, -1.05, 0);
  bellMesh.castShadow = true;
  const clapper = new THREE.Object3D();
  clapper.position.set(0, -0.62, 0);
  clapper.add(mesh([box(0.2, 1.15, 0.2, 0, -0.6, 0)], M.woodDark));
  log.add(clapper, bellMesh);
  pivot.add(log);
  grp.add(pivot);
  grp.add(mesh([box(0.3, 0.3, 2.4, 2.6, beamY - 0.85, 0)], M.beam));
  const pl = plaqueMesh('钟楼', 1.5, 0.72, { bg: '#3a1f16' });
  pl.position.set(0, deckY + 2.4, d / 2 + 0.9);
  grp.add(pl);
  // 站在平座上敲钟时楼体不能整组藏掉，所以只留很小的近距剔除
  registerOccluder(grp, 1.0, new THREE.Vector3(cx, Q + 2, cz));
  return { group: grp, pivot, logPivot: log, bellMesh, clapper, deckY, bellPos: new THREE.Vector3(cx, deckY + 1.4, cz) };
}

/* ------------------------------------------------------------------ 组装 */

export function buildQuarter(scene) {
  const group = new THREE.Group();
  group.name = 'xixi-quarter';
  const nodes = [];

  /* 岸上地坪：西岸宽、东岸窄，晏溪河从西岸穿到泰东河 */
  const ground = [
    box(70, 0.6, SITE.river.length, -HW - 35, Q - 0.3, 0),
    box(60, 0.6, SITE.river.length, HW + 30, Q - 0.3, 0),
  ];
  group.add(mesh(ground, M.stoneDark));

  const banks = [];
  for (const sx of [-1, 1]) {
    banks.push(box(1.3, 6.6, SITE.river.length, sx * (HW + 0.55), Q - 3.1, 0));
    for (let k = 0; k < 42; k++) banks.push(box(1.7, 0.46, 6.4, sx * (HW + 0.25), Q - 0.28, -HALF + 4 + k * 8.0));
  }
  group.add(mesh(banks, M.stone));

  // 晏溪河岸：北岸让给犁木街，南岸让给寺前；到河口收口
  const creek = [];
  creekBank(creek, { z: CB, x0: CR.x0, x1: CR.x1 - 2.4 });
  creekBank(creek, { z: CS, x0: CR.x0 + 6, x1: CR.x1 - 2.4 });
  group.add(mesh(creek, M.stone));
  // 河口两翼的驳头
  group.add(mesh([box(3.0, 3.2, 2.2, CR.x1 - 1.2, Q - 1.4, CB + 1.0), box(3.0, 3.2, 2.2, CR.x1 - 1.2, Q - 1.4, CS - 1.0)], M.stoneDressed));

  /* 塔院：临河（东）开门，院内铺地 */
  const cw = SITE.courtWall;
  const gap = 4.2;
  const wall = [];
  wallRun(wall, { x: (cw.x0 + cw.x1) / 2, z: cw.z0, len: cw.x1 - cw.x0, axis: 'x', h: 2.9 });
  wallRun(wall, { x: (cw.x0 + cw.x1) / 2, z: cw.z1, len: cw.x1 - cw.x0, axis: 'x', h: 2.9 });
  wallRun(wall, { x: cw.x0, z: (cw.z0 + cw.z1) / 2, len: cw.z1 - cw.z0, axis: 'z', h: 2.9 });
  wallRun(wall, { x: cw.x1, z: (cw.z0 + LAYOUT.courtGate.z - gap) / 2, len: LAYOUT.courtGate.z - gap - cw.z0, axis: 'z', h: 2.9 });
  wallRun(wall, { x: cw.x1, z: (LAYOUT.courtGate.z + gap + cw.z1) / 2, len: cw.z1 - LAYOUT.courtGate.z - gap, axis: 'z', h: 2.9 });
  group.add(mesh(wall, M.templeWall));

  /* 寺院：三面围墙，山门朝北对着三桥 */
  const tw = SITE.templeWall;
  const tgap = 4.6;
  const twall = [];
  wallRun(twall, { x: tw.x0, z: (tw.z0 + tw.z1) / 2, len: tw.z1 - tw.z0, axis: 'z', h: 3.1 });
  wallRun(twall, { x: tw.x1, z: (tw.z0 + tw.z1) / 2, len: tw.z1 - tw.z0, axis: 'z', h: 3.1 });
  wallRun(twall, { x: (tw.x0 + tw.x1) / 2, z: tw.z1, len: tw.x1 - tw.x0, axis: 'x', h: 3.1 });
  wallRun(twall, { x: (tw.x0 + LAYOUT.templeGate.x - tgap) / 2, z: tw.z0, len: LAYOUT.templeGate.x - tgap - tw.x0, axis: 'x', h: 3.1 });
  wallRun(twall, { x: (LAYOUT.templeGate.x + tgap + tw.x1) / 2, z: tw.z0, len: tw.x1 - LAYOUT.templeGate.x - tgap, axis: 'x', h: 3.1 });
  group.add(mesh(twall, M.templeWall));

  /* 两处铺地 */
  for (const w of [cw, tw]) {
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(w.x1 - w.x0 - 0.8, w.z1 - w.z0 - 0.8), M.pave);
    pave.rotation.x = -Math.PI / 2;
    pave.position.set((w.x0 + w.x1) / 2, Q + 0.03, (w.z0 + w.z1) / 2);
    pave.receiveShadow = true;
    group.add(pave);
  }

  /* 门、殿、楼：塔院门临河，寺的中轴线由北向南是山门—天王殿—东岳殿 */
  nodes.push(hall({ roof: M.roofTemple }, {
    ...LAYOUT.courtGate, wallMat: M.templeWall, roof: 'gable', name: '塔院', nameW: 1.7, doorW: 2.4,
  }));
  nodes.push(hall({ roof: M.roofTemple }, {
    ...LAYOUT.templeGate, wallMat: M.templeWall, roof: 'gable', name: '泰山寺', nameW: 1.9, doorW: 2.6,
  }));
  nodes.push(hall({ roof: M.roofTemple }, {
    x: LAYOUT.hall.cx, z: LAYOUT.hall.cz, w: LAYOUT.hall.w, d: LAYOUT.hall.d, h: LAYOUT.hall.h,
    floorY: LAYOUT.hall.floorY, wallMat: M.templeWall, front: Math.PI, roof: 'hip', name: '天王殿', nameW: 2.1, eaveOver: 1.1,
  }));
  nodes.push(hall({ roof: M.roofTemple }, {
    x: LAYOUT.hall2.cx, z: LAYOUT.hall2.cz, w: LAYOUT.hall2.w, d: LAYOUT.hall2.d, h: LAYOUT.hall2.h,
    floorY: LAYOUT.hall2.floorY, wallMat: M.templeWall, front: Math.PI, roof: 'hip', name: '东岳殿', nameW: 1.9,
  }));
  const bell = bellTower(LAYOUT.bell);
  nodes.push(bell.group);
  nodes.push(paifang({ ...LAYOUT.paifang, travel: Math.PI / 2 }));

  /* 桥：寺前三座并列 + 通圣桥 */
  const bridges = [];
  for (const bx of SITE.threeBridges.xs) {
    const b = brickArchBridge({ at: { x: bx, z: SITE.threeBridges.z }, along: 'z', span: CR.halfWidth * 2 + 3.2, width: 4.2, ringR: 4.4 });
    nodes.push(b.group);
    bridges.push({ ...b, x: bx, z: SITE.threeBridges.z });
  }
  const tongsheng = brickArchBridge({ at: { ...SITE.tongsheng }, along: 'z', span: CR.halfWidth * 2 + 3.6, width: 5.0, ringR: 4.8 });
  nodes.push(tongsheng.group);

  /* 埠头 */
  nodes.push(wharfSteps({ x: HW + 1.0, z: SITE.eastWharf.z, face: -1 }));
  nodes.push(wharfSteps({ x: -HW - 1.0, z: SITE.westWharf.z, face: 1 }));
  nodes.push(wharfSteps({ x: CB + 0.8, z: SITE.granary.z + 1.0, face: 1, axis: 'z' }));

  /* 街市：犁木街贴晏溪河北岸，东岸灯市属写意添加 */
  nodes.push(dwellingRow({ axis: 'x', x0: SITE.limuRow.x0, x1: SITE.limuRow.x1, at: SITE.limuRow.z, face: 'south' }));
  nodes.push(dwellingRow({ axis: 'z', x0: SITE.eastMarket.z0, x1: SITE.eastMarket.z1, at: SITE.eastMarket.x1 - 3.0, face: 'west' }));
  nodes.push(granary({ ...LAYOUT.granary, face: 'south' }));
  // 街后一栋二层小楼给天际线一点起伏
  nodes.push(hall({ roof: M.roofGrey }, {
    x: SITE.eastMarket.x1 + 6, z: 18, w: 9, d: 7, h: 3.6, front: Math.PI, roof: 'gable', tiers: 2, storyH: 3.0,
  }));

  for (const n of nodes) if (n) group.add(n);
  group.traverse((o) => {
    if (o.isMesh && (o.material === M.stone || o.material === M.stoneDressed || o.material === M.stoneDark)) o.receiveShadow = true;
  });
  scene.add(group);

  /* props 取的锚点 */
  const anchors = {
    deckY: Q,
    tower: new THREE.Vector3(SITE.pagoda.x, Q, SITE.pagoda.z),
    towerDoor: new THREE.Vector3(
      SITE.pagoda.x + Math.sin(SITE.pagoda.rot + Math.PI / 8) * PAGODA.tiers[0].rBottom * Math.cos(Math.PI / 8),
      Q,
      SITE.pagoda.z + Math.cos(SITE.pagoda.rot + Math.PI / 8) * PAGODA.tiers[0].rBottom * Math.cos(Math.PI / 8),
    ),
    circumambulate: LAYOUT.circumambulate,
    gateLamps: [
      new THREE.Vector3(LAYOUT.courtGate.x, Q + LAYOUT.courtGate.h + 0.7, LAYOUT.courtGate.z),
      new THREE.Vector3(LAYOUT.templeGate.x, Q + LAYOUT.templeGate.h + 0.7, LAYOUT.templeGate.z),
      new THREE.Vector3(LAYOUT.paifang.x, Q + 4.5, LAYOUT.paifang.z),
    ],
    yard: [
      new THREE.Vector3(SITE.pagoda.x + 6.2, Q, SITE.pagoda.z + 5.0),
      new THREE.Vector3(SITE.pagoda.x - 6.0, Q, SITE.pagoda.z - 5.4),
      new THREE.Vector3(SITE.pagoda.x + 4.6, Q, SITE.pagoda.z - 8.2),
    ],
    street: [],
    creekFront: [],
    wharves: [
      { x: HW + 1.0, z: SITE.eastWharf.z, face: -1 },
      { x: -HW - 1.0, z: SITE.westWharf.z, face: 1 },
    ],
    quay: [new THREE.Vector3(SITE.eastWharf.x, Q, SITE.eastWharf.z)],
  };
  for (let x = SITE.limuRow.x0; x <= SITE.limuRow.x1; x += 7.0) anchors.street.push(new THREE.Vector3(x, Q + 3.0, SITE.limuRow.z - 2.4));
  for (let z = SITE.eastMarket.z0; z <= SITE.eastMarket.z1; z += 7.4) anchors.street.push(new THREE.Vector3(HW + 2.4, Q + 3.0, z));
  for (const bx of SITE.threeBridges.xs) anchors.creekFront.push(new THREE.Vector3(bx, Q + 1.2, SITE.threeBridges.z));

  return {
    group,
    anchors,
    bridges: [
      { kind: 'tongsheng', x: SITE.tongsheng.x, z: SITE.tongsheng.z, crownY: tongsheng.crownY },
      ...bridges.map((b) => ({ kind: 'three', x: b.x, z: b.z, crownY: b.crownY })),
    ],
    bell,
  };
}
