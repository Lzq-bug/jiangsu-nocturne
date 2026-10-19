import * as THREE from 'three';
import {
  M, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, bracketGeo, plaqueMesh,
  box, mesh, rand, rr,
} from './kit.js';
import { POND, DECK } from './data.js';

/**
 * 网师园平面。可核实的是相对方位与尺度感（东宅·中园·西内园，池在中央，
 * 大门朝南临巷）；具体米数按 5400 ㎡ 占地与 447 ㎡ 水面折算后做了写意概括。
 * +X 为东，-Z 为北，地坪 DECK，水面 y=0。
 */
export const LAYOUT = {};

const D = DECK;

/** 面向：'s' 朝南 / 'n' 朝北 / 'e' 朝东 / 'w' 朝西 —— 厅堂的明间总朝这个方向开门 */
const FACING = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

/* ------------------------------------------------------------------ 通用单体 */
/**
 * 一间厅/堂：台基 + 柱网 + 格扇 + 屋面。面阔 w（本地 X）、进深 d（本地 Z），
 * 明间朝 +Z，用 rotY 转向。
 */
function hall({
  cx, cz, w, d, name, plaqueText = name, bays = 3, floorY = D,
  wallH = 3.3, twoStory = false, face = 's', roofMat = null, wallMat = null,
  plaqueW = null, openFront = true, terrace = 0, couplet = null, roofScale = 1,
}) {
  const g = new THREE.Group();
  const roof = roofMat || M.roofGrey;
  const wall = wallMat || M.wall;
  const hw = w / 2, hd = d / 2;

  if (terrace > 0) {
    const t = mesh([box(w + 2.2, 0.42, d + terrace + 1.4, 0, -0.21, terrace / 2 - 0.4), ], M.stone);
    t.receiveShadow = true;
    g.add(t);
    for (let k = 0; k < 3; k++) {
      g.add(mesh(box(w * 0.42, 0.16, 0.5, 0, -0.5 + k * 0.16, hd + terrace + 0.2), M.stoneDressed));
    }
  }

  // 四周墙与柱
  const shellParts = [
    box(0.34, wallH, d, -hw, wallH / 2, 0),
    box(0.34, wallH, d, hw, wallH / 2, 0),
    box(w, wallH, 0.34, 0, wallH / 2, -hd),
  ];
  if (!openFront) shellParts.push(box(w, wallH, 0.34, 0, wallH / 2, hd));
  const shell = mesh(shellParts, wall);
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);

  const colStep = w / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -hw + i * colStep;
    for (const z of [-hd - 0.05, hd + 0.05]) {
      const c = new THREE.Mesh(pillarGeo(wallH + 0.35, 0.19), i === 0 || i === bays ? M.woodDark : M.pillar);
      c.position.set(x, 0, z);
      c.castShadow = true;
      g.add(c);
    }
    const beamRow = [];
    if (i < bays) {
      const xc = -hw + (i + 0.5) * colStep;
      for (const z of [-hd - 0.05, hd + 0.05]) {
        beamRow.push(box(colStep, 0.34, 0.3, xc, wallH + 0.36, z));
        const br = bracketGeo(0.72); br.translate(xc, wallH + 0.55, z);
        beamRow.push(br);
      }
    }
    if (beamRow.length) g.add(mesh(beamRow, M.beam));

    // 山面与后檐的漏窗/格扇
    if (i < bays) {
      const xc = -hw + (i + 0.5) * colStep, bay = colStep * 0.7;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(bay, wallH * 0.72), M.lattice);
      back.position.set(xc, wallH * 0.52, -hd - 0.2);
      back.rotation.y = Math.PI;
      g.add(back);
    }
  }
  // 前檐格扇：开敞处只留两侧两间，明间空出来当门
  if (openFront) {
    for (let i = 0; i < bays; i++) {
      if (i === Math.floor(bays / 2)) continue;
      const xc = -hw + (i + 0.5) * colStep, bay = colStep * 0.86;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(bay, wallH * 0.86), M.lattice);
      s.position.set(xc, wallH * 0.53, hd + 0.12);
      g.add(s);
    }
    // 明间门槛与四扇半启的门
    const doors = [];
    for (const s of [-1, 1]) {
      doors.push(box(colStep * 0.42, wallH * 0.94, 0.1, s * colStep * 0.24, wallH * 0.47, hd + 0.16));
    }
    g.add(mesh(doors, M.woodDark));
  }
  g.add(mesh([
    box(w + 0.8, 0.34, 0.34, 0, wallH + 0.5, -hd - 0.05),
    box(w + 0.8, 0.34, 0.34, 0, wallH + 0.5, hd + 0.05),
    box(0.34, 0.34, d + 0.8, -hw - 0.05, wallH + 0.5, 0),
    box(0.34, 0.34, d + 0.8, hw + 0.05, wallH + 0.5, 0),
  ], M.beam));

  const y = floorY + wallH;
  const rw = w + 3.0 * roofScale, rd = d + 2.6 * roofScale;
  const lower = new THREE.Mesh(chineseRoof({
    width: rw, depth: rd, height: 1.7, ridgeRatio: 0.4, curve: 0.58,
    eaveLift: 0.62, overhang: 0.9 * roofScale, segU: 26, segV: 15,
  }), roof);
  lower.position.set(0, y, 0);
  lower.castShadow = true;
  g.add(lower);

  if (twoStory) {
    const uh = wallH * 0.78, uw = w - 2.2, ud = d - 1.2;
    const up = mesh([
      box(0.32, uh, ud, -uw / 2, y + 1.5 + uh / 2, 0),
      box(0.32, uh, ud, uw / 2, y + 1.5 + uh / 2, 0),
      box(uw, uh, 0.32, 0, y + 1.5 + uh / 2, -ud / 2),
      box(uw, uh * 0.4, 0.32, 0, y + 1.5 + uh / 2, ud / 2),
    ], wall);
    up.castShadow = true;
    g.add(up);
    for (let i = 0; i <= 3; i++) {
      const x = -uw / 2 + (uw * i) / 3;
      const c = new THREE.Mesh(pillarGeo(uh, 0.16), M.woodDark);
      c.position.set(x, y + 1.5, ud / 2);
      g.add(c);
    }
    const rail = new THREE.Mesh(railingGeo(ud + 0.6, { height: 0.72, spacing: 1.1 }), M.stone);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(uw / 2, y + 1.5, 0);
    g.add(rail);
    const upper = new THREE.Mesh(chineseRoof({
      width: uw + 2.6, depth: ud + 2.2, height: 1.6, ridgeRatio: 0.38, curve: 0.56,
      eaveLift: 0.7, overhang: 0.8, segU: 24, segV: 14,
    }), roof);
    upper.position.set(0, y + 1.5 + uh, 0);
    upper.castShadow = true;
    g.add(upper);
    const rg = mesh(ridgeOrnament({ width: uw + 2.6, depth: ud + 2.2, height: 1.6, ridgeRatio: 0.38, overhang: 0.8 }), M.ridge);
    rg.position.set(0, y + 1.5 + uh + 1.6, 0);
    g.add(rg);
    LAYOUT.roofRidge = Math.max(LAYOUT.roofRidge || 0, y + 3.1 + uh);
  } else {
    const rg = mesh(ridgeOrnament({ width: rw, depth: rd, height: 1.7, ridgeRatio: 0.4, overhang: 0.9 * roofScale }), M.ridge);
    rg.position.set(0, y + 1.7, 0);
    g.add(rg);
  }

  const sign = plaqueMesh(plaqueText, plaqueW || Math.min(2.6, w * 0.42), 1.15,
    { dir: 'h', bg: '#152436', fg: '#f2ddb0' });
  sign.position.set(0, y - 0.75, hd + 0.42);
  g.add(sign);
  // 柱联：一对竖匾，园厅最认得出的门面对（只写有可靠记载的）
  if (couplet) {
    const chars = [...couplet];
    for (const s of [-1, 1]) {
      const txt = s < 0 ? chars.slice(0, Math.ceil(chars.length / 2)).join('') : chars.slice(Math.ceil(chars.length / 2)).join('');
      const cp = plaqueMesh(txt, 0.6, 2.4, { dir: 'v', bg: '#5c1f18', fg: '#efdcb4' });
      cp.position.set(s * (hw + 0.34), wallH * 0.52 + 0.3, hd + 0.3);
      g.add(cp);
    }
  }

  g.position.set(cx, floorY, cz);
  g.rotation.y = FACING[face] || 0;
  return { group: g, frontZ: hd + 0.6, ridgeY: y + (twoStory ? 3.2 : 1.7), eaveY: y - 0.5 };
}

/** 亭：攒尖顶，可六角或四方 */
function pavilion({ cx, cz, r = 2.6, name, sides = 6, face = 's', floorY = D, posts = null }) {
  const g = new THREE.Group();
  const n = sides;
  const base = mesh([new THREE.CylinderGeometry(r + 0.85, r + 1.05, 0.4, n * 2, 1)], M.stone);
  base.position.y = -0.2;
  base.receiveShadow = true;
  g.add(base);
  const h = 3.0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const c = new THREE.Mesh(pillarGeo(h, 0.15), M.woodDark);
    c.position.set(x, 0, z);
    c.castShadow = true;
    g.add(c);
  }
  const rail = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + Math.PI / n, a1 = ((i + 1) / n) * Math.PI * 2 + Math.PI / n;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    if (posts && i === posts) continue;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const b = new THREE.BoxGeometry(len, 0.1, 0.16);
    b.translate((x0 + x1) / 2, 0.62, (z0 + z1) / 2);
    b.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.atan2(z1 - z0, x1 - x0)));
    rail.push(b);
    rail.push(box(0.12, 0.72, 0.12, (x0 + x1) / 2, 0.3, (z0 + z1) / 2));
  }
  g.add(mesh(rail, M.stoneDressed));
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(r + 1.5, 2.0, n * 2, 3, true),
    M.roofGrey,
  );
  roof.position.y = h + 0.9;
  roof.castShadow = true;
  g.add(roof);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.gilt);
  cap.position.y = h + 1.95;
  g.add(cap);
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.6, 6), M.gilt);
  finial.position.y = h + 2.2;
  g.add(finial);
  if (name) {
    const sign = plaqueMesh(name, 1.5, 0.72, { dir: 'h', bg: '#152436', fg: '#f2ddb0' });
    sign.position.set(0, h - 0.35, r + 0.5);
    sign.rotation.y = Math.PI;
    g.add(sign);
  }
  g.position.set(cx, floorY, cz);
  return { group: g, crownY: floorY + h + 1.9 };
}

/** 游廊：沿折线布柱、顶、挂落与美人靠 */
function gallery(pts, { width = 1.5, floorY = D } = {}) {
  const g = new THREE.Group();
  const h = 2.5;
  const posts = [], beams = [], roofs = [];
  let total = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.2) continue;
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const n = Math.max(2, Math.round(len / 1.9));
    total += len;
    for (let i = 0; i <= n; i++) {
      const t = (len * i) / n;
      const x = x0 + ux * t, z = z0 + uz * t;
      for (const side of [-1, 1]) {
        const px = x + -uz * side * (width / 2), pz = z + ux * side * (width / 2);
        const c = new THREE.Mesh(pillarGeo(h, 0.12), M.woodDark);
        c.position.set(px, floorY, pz);
        c.castShadow = true;
        g.add(c);
        const b = box(0.2, 0.24, width + 0.2, px, floorY + h + 0.1, pz);
        b.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)));
        beams.push(b);
      }
      if (i < n) {
        const t2 = (len * (i + 0.5)) / n;
        const x2 = x0 + ux * t2, z2 = z0 + uz * t2;
        const seg = len / n;
        const slab = box(seg * 1.05, 0.18, width, x2, floorY - 0.09, z2);
        slab.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)));
        beams.push(slab);
        const rail = box(seg * 1.02, 0.1, 0.14, x2, floorY + 0.78, z2 + 0);
        rail.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)));
        beams.push(rail);
        for (const side of [-1, 1]) {
          const px = x2 + -uz * side * (width / 2), pz = z2 + ux * side * (width / 2);
          const r0 = box(seg * 1.02, 0.09, 0.1, 0, 0, 0);
          r0.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)));
          r0.translate(px, floorY + 0.62, pz);
          beams.push(r0);
        }
      }
    }
    // 廊顶：一条两面坡的薄屋面
    const rw = width + 1.1;
    const rf = new THREE.Mesh(chineseRoof({
      width: len + 0.8, depth: rw, height: 0.62, ridgeRatio: 0.98, curve: 0.42,
      eaveLift: 0.28, overhang: 0.28, segU: 18, segV: 8,
    }), M.roofGrey);
    rf.position.set((x0 + x1) / 2, floorY + h + 0.35, (z0 + z1) / 2);
    rf.rotation.y = Math.atan2(ux, uz) + Math.PI / 2;
    rf.castShadow = true;
    roofs.push(rf);
    // 檐下挂落
    const gu = box(len * 0.94, 0.3, 0.1, (x0 + x1) / 2, floorY + h - 0.25, (z0 + z1) / 2);
    gu.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)));
    beams.push(gu);
  }
  g.add(mesh(beams, M.beam));
  g.add(...roofs);
  LAYOUT.galleryLength = (LAYOUT.galleryLength || 0) + total;
  (LAYOUT.galleries = LAYOUT.galleries || []).push(pts.map(([x, z]) => [x, z]));
  return g;
}

/* ------------------------------------------------------------------ 围墙与门 */
/**
 * 一段粉墙：墙身 + 瓦顶 + 漏窗 + 可选门洞。
 * gaps 为沿墙的开口 [{at:0~1, w:米}]。
 */
function wallRun(x1, z1, x2, z2, { h = 3.1, gaps = [], windows = true } = {}) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
  const ang = Math.atan2(ux, uz);
  const parts = [];
  let cursor = 0;
  const run = (a, b) => {
    if (b - a < 0.05) return;
    const seg = b - a, mid = (a + b) / 2;
    const x = x1 + ux * mid, z = z1 + uz * mid;
    const body = box(0.55, h, seg, 0, h / 2, 0);
    body.applyMatrix4(new THREE.Matrix4().makeRotationY(ang));
    body.translate(x, D, z);
    parts.push(body);
    const cap = box(0.95, 0.26, seg, 0, h + 0.13, 0);
    cap.applyMatrix4(new THREE.Matrix4().makeRotationY(ang));
    cap.translate(x, D, z);
    parts.push(cap);
    if (windows) {
      for (let t = a + 1.6; t < b - 1.2; t += 3.1) {
        const xw = x1 + ux * t, zw = z1 + uz * t;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), M.lattice);
        win.position.set(xw, D + h * 0.62, zw);
        win.rotation.y = ang - Math.PI / 2;
        g.add(win);
      }
    }
  };
  const cuts = gaps.map((gp) => [len * gp.at - gp.w / 2, len * gp.at + gp.w / 2]);
  cuts.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of cuts) { run(cursor, a); cursor = b; }
  run(cursor, len);

  // 门洞：石库门式框 + 砖细上檐
  for (const [a, b] of cuts) {
    const t = (a + b) / 2, w = b - a;
    const x = x1 + ux * t, z = z1 + uz * t;
    const frame = [];
    for (const s of [-1, 1]) frame.push(box(0.34, 2.6, 0.7, s * w / 2, 1.3, 0));
    frame.push(box(w + 0.7, 0.3, 0.7, 0, 2.75, 0));
    const fm = mesh(frame, M.stoneDressed);
    fm.castShadow = true;
    fm.position.set(x, D, z);
    fm.rotation.y = ang;
    g.add(fm);
    const gp = gaps.find((q) => Math.abs(len * q.at - t) < 0.6);
    if (gp && !gp.noCap) {
      const cap = new THREE.Mesh(chineseRoof({
        width: w + 2.0, depth: 1.5, height: 0.6, ridgeRatio: 0.9, curve: 0.5, eaveLift: 0.3, overhang: 0.3,
      }), M.roofGrey);
      cap.position.set(x, D + 3.05, z);
      cap.rotation.y = ang + Math.PI / 2;
      cap.castShadow = true;
      g.add(cap);
    }
    if (gaps.find((gp) => Math.abs(len * gp.at - t) < 0.6)?.plaque) {
      const sp = plaqueMesh(gaps.find((gp) => Math.abs(len * gp.at - t) < 0.6).plaque, 1.3, 0.6,
        { dir: 'h', bg: '#1a2a1a', fg: '#e9dcbb' });
      sp.position.set(x, D + 2.6, z);
      sp.rotation.y = ang - Math.PI / 2;
      g.add(sp);
    }
  }
  const m = mesh(parts, M.wall);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

/* ------------------------------------------------------------------ 池与驳岸 */
/** 池岸多边形（世界坐标），供水体、驳岸、倒影共用 */
export function pondPoints(scale = 1) {
  return POND.outline.map(([a, k]) => [
    Math.sin(a) * POND.rx * k * scale,
    Math.cos(a) * POND.rz * k * scale,
  ]);
}

function pondBank() {
  const g = new THREE.Group();
  const pts = pondPoints(1);
  const wall = [], cap = [];
  const top = D + 0.32, bot = -1.8;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(-dz, dx);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const h = top - bot;
    const b = new THREE.BoxGeometry(len * 1.05, h, 0.55);
    b.rotateY(ang);
    b.translate(mx, (top + bot) / 2, mz);
    wall.push(b);
    const c = new THREE.BoxGeometry(len * 1.05, 0.2, 0.86);
    c.rotateY(ang);
    c.translate(mx, top + 0.1, mz);
    cap.push(c);
  }
  const wm = mesh(wall, M.stone);
  wm.receiveShadow = true;
  wm.castShadow = true;
  const cm = mesh(cap, M.stoneDressed);
  cm.receiveShadow = true;
  g.add(wm, cm);

  for (const [x, z, ang] of [[2, 10.0, 0], [-11.0, 5.0, -0.9], [8.0, -8.6, Math.PI]]) {
    const steps = [];
    for (let k = 0; k < 3; k++) steps.push(box(2.6, 0.2, 0.62, 0, -0.2 - k * 0.34, 0.5 + k * 0.6));
    const sm = mesh(steps, M.stoneDressed);
    sm.position.set(x, D, z);
    sm.rotation.y = ang;
    g.add(sm);
  }
  return g;
}

/* ------------------------------------------------------------------ 东部住宅 */
function residence(anchors) {
  const g = new THREE.Group();
  // 照壁（大门正南，隔巷相对）
  const zb = mesh([
    box(7.0, 3.0, 0.8, 21, D + 1.5, 50.4),
    box(7.6, 0.4, 1.2, 21, D + 3.2, 50.4),
  ], M.wall);
  zb.castShadow = zb.receiveShadow = true;
  g.add(zb);
  const zbCap = new THREE.Mesh(chineseRoof({
    width: 7.6, depth: 1.6, height: 0.66, ridgeRatio: 0.92, curve: 0.5, eaveLift: 0.34, overhang: 0.3,
  }), M.roofGrey);
  zbCap.position.set(21, D + 3.4, 50.4);
  zbCap.castShadow = true;
  g.add(zbCap);
  const zbBody = mesh([box(2.2, 1.6, 0.1, 21, D + 1.7, 50.0)], M.stele);
  g.add(zbBody);

  // 大门：南向，乾隆砖细门楼（写意为多层砖檐挑出的门屋）
  const gate = hall({
    cx: 21, cz: 47.6, w: 6.4, d: 3.4, name: '网师园', plaqueText: '网师园', bays: 3,
    wallH: 3.0, face: 's', openFront: true,
  });
  g.add(gate.group);
  const brickEaves = [];
  for (let k = 0; k < 3; k++) {
    brickEaves.push(box(7.4 - k * 0.7, 0.22, 4.2 - k * 0.5, 21, D + 3.3 + k * 0.3, 47.6));
  }
  const bm = mesh(brickEaves, M.stoneDressed);
  bm.castShadow = true;
  g.add(bm);
  for (const s of [-1, 1]) {
    const lantern = new THREE.Vector3(21 + s * 2.6, D + 2.5, 45.7);
    anchors.eaveLamps.push(lantern);
  }
  LAYOUT.gate = { pos: [21, D, 46.4], front: [21, D, 44.6] };

  // 四进：轿厅 → 万卷堂 → 撷秀楼 → 五峰书屋，另有北端梯云室
  const axle = [
    { id: 'jiaoting', cz: 42.4, w: 8.6, d: 5.0, name: '清能早达', bays: 3, h: 3.2 },
    { id: 'juanshuitang', cz: 30.0, w: 10.6, d: 6.2, name: '万卷堂', bays: 3, h: 3.9, terrace: 2.4 },
    { id: 'xiexiulou', cz: 19.6, w: 9.6, d: 5.4, name: '撷秀楼', bays: 3, h: 3.5, twoStory: true },
    { id: 'wufeng', cz: 10.6, w: 8.4, d: 4.6, name: '五峰书屋', bays: 3, h: 3.4, twoStory: true },
    { id: 'tiyunshi', cz: 2.4, w: 6.8, d: 4.4, name: '梯云室', bays: 3, h: 3.1 },
  ];
  const map = {};
  for (const a of axle) {
    const hh = hall({
      cx: 21, cz: a.cz, w: a.w, d: a.d, name: a.name, plaqueText: a.name, bays: a.bays,
      wallH: a.h, twoStory: !!a.twoStory, face: 's', openFront: true, terrace: a.terrace || 0,
      plaqueW: a.id === 'juanshuitang' ? 2.9 : null, roofScale: 0.62,
    });
    g.add(hh.group);
    map[a.id] = hh;
    LAYOUT[a.id] = { cx: 21, cz: a.cz, w: a.w, d: a.d, eaveY: hh.eaveY, ridgeY: hh.ridgeY, front: a.cz + hh.frontZ };
    // 堂前灯：明间两侧各一
    for (const s of [-1, 1]) {
      anchors.eaveLamps.push(new THREE.Vector3(21 + s * (a.w * 0.32), hh.eaveY, a.cz + hh.frontZ + 0.25));
    }
    if (a.id === 'juanshuitang') LAYOUT.stage.juanshuitang = new THREE.Vector3(21, D + (a.terrace ? 0.4 : 0), a.cz + a.d / 2 + 1.1);
    if (a.id === 'xiexiulou') LAYOUT.stage.xiexiulou = new THREE.Vector3(21, D, a.cz + a.d / 2 + 1.0);
    if (a.id === 'tiyunshi') LAYOUT.stage.tiyunshi = new THREE.Vector3(21, D, a.cz + a.d / 2 + 1.0);
  }

  // 宅前院墙与两进之间的天井隔墙（留出明间通道）
  g.add(wallRun(15.4, 44.0, 15.4, -2.0, { h: 3.2, gaps: [{ at: 0.78, w: 2.4, plaque: '入园林' }] }));
  g.add(wallRun(26.8, 44.0, 26.8, -2.0, { h: 3.2, windows: false }));
  g.add(wallRun(15.4, -2.0, 26.8, -2.0, { h: 3.2, windows: false }));
  g.add(wallRun(15.4, 44.0, 26.8, 44.0, { h: 3.2, windows: false }));
  // 天井不做跨轴界墙：苏州住宅的进间以两厢廊收边，横墙会把机位全堵在门洞里
  for (const z of [36.0, 25.2, 15.0, 6.6]) {
    for (const [x1, x2] of [[16.6, 17.4], [24.8, 25.6]]) g.add(wallRun(x1, z, x2, z, { h: 2.8 }));
  }
  return { group: g, halls: map };
}

/* ------------------------------------------------------------------ 中部主园 */
function centralGarden(anchors) {
  const g = new THREE.Group();

  // 南岸：濯缨水阁（临水两重，北面敞向池）
  const zhuo = hall({
    cx: 2.0, cz: 13.4, w: 9.6, d: 5.6, name: '濯缨水阁', plaqueText: '濯缨水阁', bays: 3,
    wallH: 3.4, face: 'n', openFront: true, twoStory: false, terrace: 0,
  });
  g.add(zhuo.group);
  LAYOUT.yanying = { cx: 2, cz: 13.4, w: 9.6, d: 5.6, eaveY: zhuo.eaveY, ridgeY: zhuo.ridgeY };
  // 水阁的水上平台与支柱：从阁北的明间探到池面上去
  const pl = [];
  for (let i = 0; i <= 6; i++) pl.push(box(1.3, 0.2, 3.4, -1.7 + i * 0.58, D + 0.06, 10.9));
  const plat = mesh(pl, M.stoneDressed);
  plat.receiveShadow = true;
  g.add(plat);
  const piles = [];
  for (let i = 0; i <= 5; i++) for (const z of [9.8, 11.9]) {
    const p = new THREE.CylinderGeometry(0.16, 0.18, D + 1.7, 8);
    p.translate(-1.3 + i * 0.58, (D + 1.7) / 2 - 1.05, z);
    piles.push(p);
  }
  g.add(mesh(piles, M.woodDark));
  const railS = new THREE.Mesh(railingGeo(3.6, { height: 0.82, spacing: 1.1 }), M.stone);
  railS.rotation.y = Math.PI / 2;
  railS.position.set(2, D + 0.18, 9.3);
  g.add(railS);
  LAYOUT.stage.yanying = new THREE.Vector3(2.0, D + 0.2, 10.0);
  anchors.eaveLamps.push(
    new THREE.Vector3(-2.2, zhuo.eaveY - 0.4, 10.2),
    new THREE.Vector3(6.2, zhuo.eaveY - 0.4, 10.2),
    new THREE.Vector3(2.0, D + 3.9, 9.2),
  );

  // 北岸：集虚斋 · 看松读画轩，东端竹外一枝轩与射鸭廊（皆南面向池）
  const jixu = hall({
    cx: 6.5, cz: -15.0, w: 9.0, d: 5.2, name: '集虚斋', plaqueText: '集虚斋', bays: 3,
    wallH: 3.5, face: 's', terrace: 2.2,
  });
  g.add(jixu.group);
  LAYOUT.jixuzhai = { cx: 6.5, cz: -15, w: 9, d: 5.2, eaveY: jixu.eaveY, ridgeY: jixu.ridgeY };
  LAYOUT.stage.jixuzhai = new THREE.Vector3(6.5, D + 0.4, -10.9);
  anchors.eaveLamps.push(new THREE.Vector3(3.2, jixu.eaveY - 0.3, -11.6), new THREE.Vector3(9.8, jixu.eaveY - 0.3, -11.6));

  const zhuwai = hall({
    cx: 11.8, cz: -6.4, w: 6.4, d: 3.6, name: '竹外一枝轩', plaqueText: '竹外一枝轩', bays: 3,
    wallH: 2.9, face: 's', openFront: true,
    couplet: '护檐小屏山缥缈摇风团扇月婵娟',
  });
  g.add(zhuwai.group);
  LAYOUT.zhuwai = { cx: 11.8, cz: -6.4, w: 6.4, d: 3.6, eaveY: zhuwai.eaveY, ridgeY: zhuwai.ridgeY };
  LAYOUT.stage.zhuwai = new THREE.Vector3(11.8, D, -3.9);

  const kaisong = hall({
    cx: -3.5, cz: -15.6, w: 12.4, d: 5.6, name: '看松读画轩', plaqueText: '看松读画轩', bays: 4,
    wallH: 3.8, face: 's', terrace: 2.6, plaqueW: 3.4,
  });
  g.add(kaisong.group);
  LAYOUT.kaisong = { cx: -3.5, cz: -15.6, w: 12.4, d: 5.6, eaveY: kaisong.eaveY, ridgeY: kaisong.ridgeY };
  LAYOUT.stage.kaisong = new THREE.Vector3(-3.5, D + 0.42, -11.2);
  anchors.eaveLamps.push(new THREE.Vector3(-8.4, kaisong.eaveY - 0.3, -11.8), new THREE.Vector3(1.4, kaisong.eaveY - 0.3, -11.8));

  // 西岸：月到风来亭（三面临水，只以一道曲桥系岸）
  const yuedao = pavilion({ cx: -11.6, cz: 1.6, r: 2.5, name: '月到风来亭', sides: 6 });
  g.add(yuedao.group);
  LAYOUT.yuedao = { cx: -11.6, cz: 1.6, crownY: yuedao.crownY };
  const bridgeDeck = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    bridgeDeck.push(box(0.62, 0.16, 1.7, -14.0 + t * 2.0, D - 0.12, 1.6 - Math.sin(t * Math.PI) * 0.9));
  }
  const cb = mesh(bridgeDeck, M.stoneDressed);
  cb.receiveShadow = true;
  g.add(cb);
  for (let i = 0; i < 4; i++) {
    const x = -13.7 + i * 0.75;
    g.add(mesh([box(0.12, 0.7, 0.12, x, D + 0.25, 0.5), box(0.12, 0.7, 0.12, x, D + 0.25, 2.7)], M.woodDark));
  }
  LAYOUT.stage.yuedao = new THREE.Vector3(-11.6, D, 1.6);

  // 南部小院：小山丛桂轩（附蹈和馆、琴室）
  const xs = hall({
    cx: -9.0, cz: 17.4, w: 9.0, d: 5.0, name: '小山丛桂轩', plaqueText: '小山丛桂轩', bays: 3,
    wallH: 3.4, face: 'n', terrace: 2.6, plaqueW: 3.0,
    couplet: '山势盘陀真是画泉流宛委遂成书',
  });
  g.add(xs.group);
  LAYOUT.xiaoshan = { cx: -9, cz: 17.4, w: 9, d: 5, eaveY: xs.eaveY, ridgeY: xs.ridgeY };
  LAYOUT.stage.xiaoshan = new THREE.Vector3(-9.0, D + 0.42, 13.6);
  const daohg = hall({
    cx: -19.6, cz: 19.6, w: 5.0, d: 4.0, name: '蹈和馆', plaqueText: '蹈和馆', bays: 2, wallH: 2.9, face: 'e',
  });
  g.add(daohg.group);
  const qinshi = hall({
    cx: 2.8, cz: 16.4, w: 4.2, d: 3.6, name: '琴室', plaqueText: '琴室', bays: 2, wallH: 2.8, face: 'w',
  });
  g.add(qinshi.group);
  anchors.eaveLamps.push(new THREE.Vector3(-11.6, xs.eaveY - 0.3, 13.2), new THREE.Vector3(-6.4, xs.eaveY - 0.3, 13.2));
  LAYOUT.hu = new THREE.Vector3(-6.8, D, 14.0);   // 投壶：轩前露台之东

  // 沿池回廊：北岸一线折向竹外一枝轩，东端射鸭廊沿水南下，西岸与西南各一段
  g.add(gallery([[-1.2, -11.0], [3.0, -11.6], [6.6, -11.4], [9.6, -9.2], [11.4, -5.6]], { width: 1.4 }));
  g.add(gallery([[13.2, -5.6], [14.8, -2.0], [15.0, 1.8], [14.0, 3.4]], { width: 1.4 }));
  g.add(gallery([[-9.4, 11.0], [-4.6, 11.8], [0.0, 11.6], [2.2, 10.4]], { width: 1.5 }));
  g.add(gallery([[-13.6, 8.0], [-14.2, 3.6], [-14.0, -1.0]], { width: 1.4 }));
  g.add(gallery([[-13.0, 8.8], [-11.0, 12.6], [-9.8, 14.2]], { width: 1.4 }));

  // 东界：园与宅之间的弄堂（宅墙在 residence() 里已沿 x=15.4 立到 z=-2）
  g.add(wallRun(13.0, 22.4, 15.4, 22.4, { h: 3.0 }));
  g.add(wallRun(-16.0, 22.4, -11.0, 22.4, { h: 3.0 }));

  return g;
}

/* ------------------------------------------------------------------ 西部内园 */
function dianshunCourt(anchors) {
  const g = new THREE.Group();
  // 主厅三间带夹屋
  const main = hall({
    cx: -19.4, cz: -14.6, w: 8.2, d: 4.6, name: '殿春簃', plaqueText: '殿春簃', bays: 3,
    wallH: 3.1, face: 's', terrace: 2.2, plaqueW: 2.6,
    couplet: '巢安翡翠春云暖窗护芭蕉夜雨凉',
  });
  g.add(main.group);
  LAYOUT.dianshun = { cx: -19.4, cz: -14.6, w: 8.2, d: 4.6, eaveY: main.eaveY, ridgeY: main.ridgeY };
  LAYOUT.stage.dianshun = new THREE.Vector3(-19.4, D + 0.4, -11.5);
  // 夹屋（簃）
  const jiawu = hall({
    cx: -24.0, cz: -14.2, w: 3.6, d: 4.0, name: '', bays: 2, wallH: 2.6, face: 'e', openFront: true,
  });
  g.add(jiawu.group);
  // 半亭（院南）
  const ban = pavilion({ cx: -22.6, cz: -7.6, r: 1.9, sides: 4, name: '' });
  ban.group.rotation.y = Math.PI / 4;
  g.add(ban.group);
  // 芍药圃：院东一条花畦
  const bed = mesh([box(4.2, 0.28, 3.0, -14.6, D + 0.14, -8.6)], M.stoneDressed);
  bed.receiveShadow = true;
  g.add(bed);
  LAYOUT.peonyBed = [-14.6, D + 0.3, -8.6];

  // 小院围墙，留一道月洞门与北部湖石
  g.add(wallRun(-13.2, -4.0, -13.2, -19.2, { h: 2.7, gaps: [{ at: 0.72, w: 2.0, plaque: '殿春' }] }));
  g.add(wallRun(-25.4, -4.0, -13.2, -4.0, { h: 2.7, gaps: [{ at: 0.34, w: 2.2 }] }));
  g.add(wallRun(-25.4, -19.2, -25.4, -4.0, { h: 2.9, windows: false }));
  g.add(wallRun(-25.4, -19.0, -13.2, -19.0, { h: 2.9, windows: false }));
  anchors.eaveLamps.push(new THREE.Vector3(-21.4, main.eaveY - 0.3, -11.7), new THREE.Vector3(-17.2, main.eaveY - 0.3, -11.7));
  anchors.courtLamps.push(new THREE.Vector3(-22.6, D + 2.4, -7.6));

  // 轩北湖石叠石（写意：一组孔湖石 + 竹）
  const rocks = rockPile(new THREE.Vector3(-19.6, D, -17.6), { spread: 3.6, count: 9, tall: 2.2 });
  g.add(rocks);
  g.add(rockPile(new THREE.Vector3(-15.4, D, -6.0), { spread: 2.2, count: 5, tall: 1.5 }));
  return g;
}

/* ------------------------------------------------------------------ 湖石假山 */
/** 一坨太湖石：几个溶蚀感的球与环，孔洞靠凹球假充 */
function taihuRock(scale = 1) {
  const parts = [];
  const body = new THREE.IcosahedronGeometry(scale, 1);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.34 * Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.2 - x * 2.1);
    p.setXYZ(i, x * k, y * k * 1.32, z * k);
  }
  body.computeVertexNormals();
  parts.push(body);
  for (let i = 0; i < 3; i++) {
    const r = scale * (0.3 + rand() * 0.22);
    const b = new THREE.SphereGeometry(r, 8, 6).toNonIndexed();
    b.translate(scale * rr(-0.8, 0.8), scale * rr(-0.5, 0.9), scale * rr(-0.6, 0.6));
    parts.push(b);
  }
  return parts;
}

function rockPile(at, { spread = 3, count = 7, tall = 2 } = {}) {
  const g = new THREE.Group();
  const geos = [];
  for (let i = 0; i < count; i++) {
    const s = rr(0.5, 1.25);
    for (const gg of taihuRock(s)) {
      gg.translate(at.x + rr(-spread, spread) * 0.6, s * 0.5 + rr(0, tall * 0.4), at.z + rr(-spread, spread) * 0.6);
      geos.push(gg);
    }
  }
  const m = mesh(geos, M.rock);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

/* ------------------------------------------------------------------ 引静桥 */
/** 2.4 m 长、0.7 m 宽的三步桥，栏板作牡丹浮雕；跨出去的窄涧刻"槃涧" */
function yinjingBridge(anchors) {
  const g = new THREE.Group();
  const L = 2.4, W = 0.7, rise = 0.5;
  const shape = new THREE.Shape();
  const N = 32;
  shape.moveTo(-L / 2 - 0.25, 0);
  for (let i = 0; i <= N; i++) {
    const x = -L / 2 - 0.25 + ((L + 0.5) * i) / N;
    const t = Math.max(0, 1 - Math.abs(x) / (L / 2 + 0.25));
    shape.lineTo(x, D - 0.6 + rise * Math.pow(t, 0.8));
  }
  shape.lineTo(L / 2 + 0.25, 0);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.6, 0);
  hole.absarc(0, 0.02, 0.6, 0, Math.PI, false);
  hole.lineTo(-0.6, 0);
  shape.holes.push(hole);
  const solid = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 16 });
  solid.translate(0, 0, -W / 2);
  const deck = new THREE.Mesh(solid, M.stoneDressed);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  // 三步桥面石与低矮栏板
  const rail = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i <= N; i++) {
      const x = -L / 2 + (L * i) / N;
      const t = Math.max(0, 1 - Math.abs(x) / (L / 2));
      const y = D + rise * Math.pow(t, 0.8);
      rail.push(box(L / N * 1.1, 0.34, 0.1, x, y + 0.24, s * (W / 2 - 0.05)));
    }
    rail.push(box(L + 0.3, 0.1, 0.14, 0, D + rise + 0.44, s * (W / 2 - 0.05)));
  }
  g.add(mesh(rail, M.stone));
  // 栏外侧的牡丹浮雕：几片浅浮雕花瓣
  const carve = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = -0.7 + i * 0.7;
    const t = Math.max(0, 1 - Math.abs(x) / (L / 2));
    const y = D + rise * Math.pow(t, 0.8) + 0.24;
    const petal = new THREE.SphereGeometry(0.1, 8, 6);
    petal.scale(1, 0.7, 0.24);
    petal.translate(x, y, s * (W / 2 + 0.02));
    carve.push(petal);
  }
  g.add(mesh(carve, M.stele));

  g.position.set(12.6, 0, 8.6);
  g.rotation.y = 1.0;
  LAYOUT.yinjing = { pos: [12.6, D, 8.6] };

  // 槃涧：池东南引出的一线窄水，两岸叠石收束，涧壁刻"槃涧"、对岸刻"待潮"
  // 涧岸只压两条低石线，堆成坨的湖石会把这座三步桥挤掉
  const jian = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 10.6 + t * 6.6, z = 7.4 + t * 4.2;
    for (const s of [-1, 1]) {
      jian.push(box(0.95, 0.34, 0.42, x + s * 0.78, D - 0.02, z - s * 0.5));
    }
  }
  const jm = mesh(jian, M.stoneDressed);
  jm.castShadow = jm.receiveShadow = true;
  g.add(jm);
  const slab = mesh([box(2.6, 1.9, 0.5, 0, 0.95, 0)], M.stoneDressed);
  slab.position.set(-1.4, D - 0.3, 2.2);
  slab.rotation.y = 1.0 + Math.PI / 2;
  g.add(slab);
  const inscription = plaqueMesh('槃涧', 1.5, 0.78, { dir: 'h', bg: '#6f7581', fg: '#2c3138', border: '#8b919d' });
  inscription.position.set(-1.6, D + 0.8, 2.4);
  inscription.rotation.y = 1.0 + Math.PI / 2;
  g.add(inscription);
  const ins2 = plaqueMesh('待潮', 1.4, 0.74, { dir: 'h', bg: '#6f7581', fg: '#2c3138', border: '#8b919d' });
  ins2.position.set(1.9, D + 0.75, -1.9);
  ins2.rotation.y = 1.0 - Math.PI / 2;
  g.add(ins2);
  anchors.postLamps.push(new THREE.Vector3(10.4, D, 6.2), new THREE.Vector3(15.4, D, 10.6));
  return g;
}

/* ------------------------------------------------------------------ 铺地与散石 */
function paving() {
  const g = new THREE.Group();
  const patches = [
    [21, 35.6, 9, 6], [21, 25.0, 10, 4.6], [21, 15.0, 9, 4.6], [21, 6.6, 8, 4.6],
    [-3.5, -7.6, 12, 3.6], [6.5, -7.4, 9, 3.4], [2, 16.4, 9, 3.4], [-9, 21.0, 10, 4.2],
    [-19.4, -10.4, 8, 4.0], [-18.4, -7.0, 5.4, 4.4], [11.0, -3.0, 4.4, 8.4],
  ];
  const parts = [];
  for (const [x, z, w, d] of patches) parts.push(box(w, 0.12, d, x, D + 0.06, z));
  const m = mesh(parts, M.paving);
  m.receiveShadow = true;
  g.add(m);
  // 散置条石与阶石
  const sc = [];
  for (let i = 0; i < 46; i++) {
    const x = rr(-22, 22), z = rr(-16, 21);
    if (Math.abs(x) < POND.rx * 1.1 && Math.abs(z) < POND.rz * 1.15) continue;
    sc.push(box(rr(0.8, 2.2), 0.14, rr(0.5, 0.9), x, D + 0.07, z));
  }
  const sm = mesh(sc, M.stoneDressed);
  sm.receiveShadow = true;
  g.add(sm);
  return g;
}

/* ------------------------------------------------------------------ 地坪 */
/** 园址大方地，中间按池岸与槃涧挖出水洞——水面就在脚下这一层之下 */
function siteGround() {
  const shape = new THREE.Shape();
  const R = [[-30, -24], [30, -24], [30, 56], [-30, 56]];
  R.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();

  const hole = (pts) => {
    const p = new THREE.Path();
    pts.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)));
    p.closePath();
    shape.holes.push(p);
  };
  hole(pondPoints(0.995));
  const cl = POND.creek;
  const bank = [];
  for (let i = 0; i < cl.length; i++) {
    const prev = cl[Math.max(0, i - 1)], next = cl[Math.min(cl.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    const w = 1.05 - i * 0.16;
    bank.push([cl[i][0] - dz / l * w, cl[i][1] + dx / l * w]);
  }
  for (let i = cl.length - 1; i >= 0; i--) {
    const prev = cl[Math.max(0, i - 1)], next = cl[Math.min(cl.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    const w = 1.05 - i * 0.16;
    bank.push([cl[i][0] + dz / l * w, cl[i][1] - dx / l * w]);
  }
  hole(bank);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false, curveSegments: 16 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, D, 0);
  const m = new THREE.Mesh(geo, M.ground);
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ 组装 */
export function buildQuarter(scene) {
  LAYOUT.stage = {};
  LAYOUT.audience = {};
  const anchors = {
    eaveLamps: [], postLamps: [], courtLamps: [], wallWash: [], moorings: [],
  };

  const root = new THREE.Group();
  root.name = 'wangshi-garden';

  // 地坪：园与宅一片整体，中间按池岸挖洞；巷与照壁前另铺一条
  const ground = siteGround();
  root.add(ground);
  const lane = mesh([
    box(22, 2.4, 8, 21, D - 1.2, 59.5),
    box(30, 2.4, 40, -34, D - 1.2, 4),
    box(30, 2.4, 40, 34, D - 1.2, 4),
  ], M.ground);
  lane.receiveShadow = true;
  root.add(lane);

  root.add(pondBank());
  root.add(residence(anchors).group);
  root.add(centralGarden(anchors));
  root.add(dianshunCourt(anchors));
  root.add(yinjingBridge(anchors));
  root.add(paving());

  // 园之四至
  root.add(wallRun(-25.6, -2.0, -25.6, 20.0, { h: 3.3, windows: false }));
  root.add(wallRun(-25.6, 20.0, -16.4, 20.0, { h: 3.3, gaps: [{ at: 0.5, w: 2.2, plaque: '小山丛桂' }] }));
  root.add(wallRun(-16.4, 20.0, -16.4, 22.6, { h: 3.0 }));
  root.add(wallRun(-25.6, -2.0, -16.0, -2.0, { h: 3.3 }));
  root.add(wallRun(-25.6, -2.0, -16.0, -2.0, { h: 3.2 }));
  root.add(wallRun(-25.6, 20.0, -25.6, 22.6, { h: 3.3 }));
  root.add(wallRun(-25.6, 22.6, 14.0, 22.6, { h: 3.3, windows: true }));
  root.add(wallRun(11.6, -17.0, 15.4, -17.0, { h: 3.2 }));
  root.add(wallRun(15.4, -17.0, 15.4, -2.0, { h: 3.2, gaps: [{ at: 0.35, w: 2.0, plaque: '梯云' }] }));

  // 北部界墙与园角的山
  root.add(wallRun(-25.4, -19.2, 13.0, -19.2, { h: 3.4, windows: false }));
  root.add(wallRun(13.0, -19.2, 15.4, -17.0, { h: 3.4, windows: false }));
  root.add(rockPile(new THREE.Vector3(-12.4, D, 19.4), { spread: 3.4, count: 9, tall: 2.6 }));
  root.add(rockPile(new THREE.Vector3(4.6, D, 19.4), { spread: 3.0, count: 7, tall: 2.2 }));
  root.add(rockPile(new THREE.Vector3(-21.6, D, 15.4), { spread: 3.2, count: 8, tall: 2.4 }));

  // 五峰书屋前五座湖石拟五峰
  for (let i = 0; i < 5; i++) {
    const h = [2.6, 3.4, 4.2, 3.2, 2.4][i];
    const grp = rockPile(new THREE.Vector3(17.9 + i * 1.7, D, 14.3 + (i % 2) * 0.5), { spread: 0.5, count: 3, tall: h * 0.4 });
    grp.scale.set(0.8, h / 2.2, 0.8);
    root.add(grp);
  }

  // 听客聚集点：每处厅堂门前一方空地
  const place = {
    juanshuitang: [21, 34.8], xiexiulou: [21, 24.0], tiyunshi: [21, 5.0], wufeng: [21, 14.4],
    jixuzhai: [6.5, -12.4], kaisong: [-4.2, -12.0], zhuwai: [9.6, -6.6],
    xiaoshan: [-9.6, 14.6], dianshun: [-19.4, -12.4], yanying: [1.0, -15.0],
    yuedao: [-13.4, 2.0], yinjing: [11.0, 6.8], jiaoting: [21, 38.0], menfang: [21, 49.4],
  };
  for (const [k, v] of Object.entries(place)) LAYOUT.audience[k] = new THREE.Vector3(v[0], D, v[1]);

  // 现代照明：洗墙灯藏在石缝与花根，投光打在墙与树上
  for (const [x, z, y] of [[-3.5, -9.8, 1.2], [6.5, -9.6, 1.2], [2.0, 10.0, 1.0], [-14.6, -0.6, 0.9], [-19.4, -11.6, 1.0], [21, 26.6, 1.4]]) {
    anchors.wallWash.push(new THREE.Vector3(x, D + y, z));
  }

  root.position.y = 0;
  scene.add(root);

  LAYOUT.deck = D;
  LAYOUT.pond = { rx: POND.rx, rz: POND.rz };
  anchors.galleries = LAYOUT.galleries || [];
  return { group: root, anchors, LAYOUT };
}
