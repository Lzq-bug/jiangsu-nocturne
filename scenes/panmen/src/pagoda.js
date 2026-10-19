import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, box, mesh } from './kit.js';
import { SITE, LEVEL } from './data.js';
import * as T from './textures.js';

const P = SITE.pagoda;
const N = 8;                        // 平面八角
const baseY = LEVEL.quay + 0.1;

/** 八角棱柱的一段：CylinderGeometry 八边即八角形，UV 绕一周 */
function tierGeo({ r0, r1, h, rot = 0 }) {
  const g = new THREE.CylinderGeometry(r1, r0, h, N, 1, false);
  g.rotateY(rot);
  g.translate(0, h / 2, 0);
  return g;
}

/** 腰檐：一圈出挑的檐口，做成实体裙边（带底盖），檐角抬起并悬风铃 */
function eaveGeo({ r, h, rot = 0 }) {
  const g = new THREE.CylinderGeometry(r * 0.74, r, h, N, 1, false);
  g.rotateY(rot);
  const tips = [];
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * Math.PI * 2 + Math.PI / N;
    const x = Math.cos(a) * r * 0.86, z = Math.sin(a) * r * 0.86;
    tips.push(box(0.42, 0.26, 0.42, x, h * 0.34, z));
    tips.push(box(0.13, 0.4, 0.13, x, -0.14, z));
  }
  return { main: g, tips: merge(tips) };
}

function merge(parts) {
  return mergeGeometries(parts);
}

/** 平座勾栏：檐下的一圈矮栏，返回几何以便并入总组 */
function balustrade({ r, rot = 0 }) {
  const parts = [];
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * Math.PI * 2 + Math.PI / N;
    const b = rot + ((i + 1) / N) * Math.PI * 2 + Math.PI / N;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const x1 = Math.cos(b) * r, z1 = Math.sin(b) * r;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mid = [(x0 + x1) / 2, (z0 + z1) / 2];
    const ang = -Math.atan2(z1 - z0, x1 - x0);
    const rail = box(len, 0.14, 0.2, 0, 0.86, 0);
    rail.rotateY(ang);
    rail.translate(mid[0], 0, mid[1]);
    parts.push(rail);
    const sill = box(len, 0.3, 0.16, 0, 0.18, 0);
    sill.rotateY(ang);
    sill.translate(mid[0], 0, mid[1]);
    parts.push(sill);
    for (const t of [0.08, 0.5, 0.92]) {
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const post = box(0.14, 1.0, 0.14, px, 0.5, pz);
      parts.push(post);
    }
  }
  return merge(parts);
}

/** 每层八面里挑四面开窗，逐层错开一面 */
function faces(rot) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * Math.PI * 2 + Math.PI / N;
    out.push({ i, a });
  }
  return out;
}

function spire(grp, lights, y) {
  const st = new THREE.Group();
  // 刹座：八棱台形木构框架，一粗刹柱加八根小柱
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.6, 1.2, N), M.stoneDressed);
  base.position.y = 0.6;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 7.4, 8), M.beam);
  shaft.position.y = 4.2;
  const small = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / N;
    const g = new THREE.CylinderGeometry(0.11, 0.13, 2.9, 6);
    g.translate(Math.cos(a) * 1.05, 2.3, Math.sin(a) * 1.05);
    small.push(g);
  }
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), M.gilt);
  bowl.position.y = 4.0;
  bowl.scale.y = 0.75;
  st.add(base, shaft, bowl, mesh(small, M.beam));

  let ty = 4.7;
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const r = 0.78 - i * 0.1;
    const ring = new THREE.CylinderGeometry(r, r, 0.16, 14);
    ring.translate(0, ty, 0);
    rings.push(ring);
    ty += 0.44;
  }
  st.add(mesh(rings, M.gilt));
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), glow('#ffe0ab', 1.9));
  finial.position.y = ty + 0.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 8), M.gilt);
  cap.position.y = ty + 1.15;
  st.add(finial, cap);
  st.position.y = y;
  grp.add(st);
  lights.push({ p: [0, y + ty + 0.5, 0], color: '#ffe0ab', halo: 2.4, column: 0 });
  return st;
}

/** 塔院：一圈矮墙、山门与香炉，把塔托在一块干净的暗地上 */
function yard(grp, lights) {
  const r = P.yard.r;
  const parts = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    if (a0 > -0.28 && a0 < 0.28) continue;    // 南面开门
    const chord = r * (a1 - a0) * 1.05;
    const p = box(chord, P.yard.wallTop - baseY, 0.6, 0, (baseY + P.yard.wallTop) / 2, 0);
    p.rotateY(-(a0 + a1) / 2);
    p.translate(Math.sin((a0 + a1) / 2) * r, 0, Math.cos((a0 + a1) / 2) * r);
    parts.push(p);
  }
  grp.add(mesh(parts, M.wall));
  // 月台与香炉
  const terrace = new THREE.Mesh(new THREE.CylinderGeometry(P.r0 + 3.4, P.r0 + 3.8, 0.9, N, 1), M.stoneDressed);
  terrace.position.set(0, baseY + 0.45, 0);
  terrace.rotation.y = Math.PI / N;
  grp.add(terrace);
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 1.1, 10), M.gilt);
  burner.position.set(0, baseY + 1.5, P.r0 + 9);
  grp.add(burner);
  lights.push({ p: [0, baseY + 2.4, P.r0 + 9], color: '#ffb066', halo: 2.4, column: 3 });
}

export function buildPagoda(scene) {
  const group = new THREE.Group();
  group.name = 'ruiguang-tower';
  const lights = [];
  const brick = [];
  const timber = [];
  const carved = [];
  const eaves = [];
  const rails = [];
  const glows = [];

  let y = baseY + 0.9;
  const rot0 = Math.PI / N;
  for (let s = 0; s < P.storeys; s++) {
    const t = s / (P.storeys - 1);
    const r0 = P.r0 * Math.pow(P.taper, s);
    const r1 = P.r0 * Math.pow(P.taper, s + 0.62);
    const h = P.floorH[s];
    const rot = rot0 + (s % 2 ? Math.PI / N : 0);

    const body = tierGeo({ r0, r1, h, rot });
    body.translate(0, y, 0);
    // 下部五层砖砌筒体，六、七层改木构
    (s >= P.timberFrom ? timber : brick).push(body);

    // 腰檐压在每一层顶，出挑大而坡度平，第一层最阔
    const er = r1 + (2.9 - t * 1.1);
    const eh = 0.95 - t * 0.28;
    const ev = eaveGeo({ r: er, h: eh, rot });
    ev.main.translate(0, y + h, 0);
    eaves.push(ev.main);
    const tipG = ev.tips.clone();
    tipG.translate(0, y + h, 0);
    rails.push(tipG);

    // 平座：檐下一圈勾栏
    const bal = balustrade({ r: r1 + 1.0, rot });
    bal.translate(0, y + h - 0.12, 0);
    rails.push(bal);

    // 门窗：四面开，逐层错开，灯就藏在这些面后头
    // 门窗：一层只四面开门，四层以上四面交错开门洞、另四面隐刻直棂窗
    const fs = faces(rot);
    for (const f of fs) {
      const nx = Math.cos(f.a), nz = Math.sin(f.a);
      const rr2 = (r0 + r1) / 2 * 0.98;
      if (f.i % 2 !== s % 2) {
        if (s >= 3) {
          // 隐刻直棂窗：砖壁上刻出的窗形，不透光
          const g = box(1.0, 1.55, 0.16, 0, 0, 0);
          g.rotateY(Math.PI / 2 - f.a);
          g.translate(nx * (rr2 + 0.02), y + h * 0.46, nz * (rr2 + 0.02));
          carved.push(g);
        }
        continue;
      }
      const isDoor = s === 0;
      const w = isDoor ? 1.5 : 1.05;
      const hh = isDoor ? h * 0.42 : h * 0.4;
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), M.lattice);
      // 窗面贴在八角壁上，法线沿半径朝外
      leaf.position.set(nx * (rr2 + 0.14), y + h * (isDoor ? 0.26 : 0.46), nz * (rr2 + 0.14));
      leaf.rotation.y = Math.PI / 2 - f.a;
      glows.push(leaf);
      if (s % 2 === 0 || s === 1) {
        lights.push({
          p: [nx * (rr2 + 0.5), y + h * (isDoor ? 0.3 : 0.46), nz * (rr2 + 0.5)],
          color: s > 3 ? '#ffcf92' : '#ffb066',
          halo: 0.9 + (P.storeys - s) * 0.1,
          column: s === 0 ? 5 : 2.6,
        });
      }
    }
    y += h;
  }

  // 塔顶：攒尖的檐与塔刹
  const topEave = eaveGeo({ r: P.r0 * Math.pow(P.taper, P.storeys) + 1.6, h: 1.1, rot: rot0 });
  topEave.main.translate(0, y, 0);
  eaves.push(topEave.main);
  const topRail = topEave.tips.clone();
  topRail.translate(0, y, 0);
  rails.push(topRail);

  const brickMat = M.towerBrick.clone();
  brickMat.map = M.towerBrick.map.clone();
  brickMat.map.repeat.set(7, 2.2);
  brickMat.map.needsUpdate = true;

  const bodyMesh = mesh(brick, brickMat);
  bodyMesh.castShadow = true;
  const woodMesh = mesh(timber, M.beam);
  woodMesh.castShadow = true;
  group.add(bodyMesh, woodMesh);
  group.add(mesh(eaves, M.roof));
  group.add(mesh(rails, M.ridge));
  group.add(mesh(carved, M.ink));
  for (const g of glows) group.add(g);

  spire(group, lights, y + 1.0);
  yard(group, lights);

  // 塔址：全部几何都在局部坐标里建，摆放只改组位置
  group.position.set(P.x, 0, P.z);
  addLamps(group, lights);
  scene.add(group);
  return { group, lights: group.userData.lamps, top: y + P.spireH };
}

function addLamps(group, spots) {
  const lamps = [];
  for (const s of spots) {
    const p = s.p;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), glow(s.color || '#ffcf92', 1.6));
    bulb.position.set(p[0], p[1], p[2]);
    group.add(bulb);
    if (s.halo) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,206,142', 0.12), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      sp.scale.setScalar(s.halo * 0.5);
      sp.position.set(p[0], p[1], p[2]);
      group.add(sp);
    }
    if (s.column) {
      const wp = new THREE.Vector3(p[0], p[1], p[2]).add(group.position);
      lamps.push({ p: wp, color: s.color, width: s.column * 0.45, depth: s.column });
    }
  }
  group.userData.lamps = lamps;
  return lamps;
}
