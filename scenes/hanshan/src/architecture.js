import * as THREE from 'three';
import {
  M, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, bracketGeo, plaqueMesh,
  box, mesh, rand, rr, bellGeo,
} from './kit.js';
import { CANAL, STATIONS } from './data.js';
import * as T from './textures.js';

const Q = CANAL.deckY;             // 岸顶（纤道与河街同一高程）
const HW = CANAL.halfWidth;        // 水面半宽
const WALL_X = -HW - 7;            // 寺前黄墙所在的线，其余寺内建筑都由它往里推

/** 建筑实体的位置，供穿越门、热点与钟声回读 */
export const LAYOUT = {};

/* ------------------------------------------------------------------ 河岸 */
/** 上塘河：砌石驳岸 + 西岸纤道 + 东岸市前宽地 */
function banks() {
  const stone = [], ground = [];
  for (const s of [-1, 1]) {
    const inner = HW * s;
    const wall = new THREE.BoxGeometry(2.0, Q + 2.6, CANAL.length);
    wall.translate(inner + s * 1.0, (Q + 2.6) / 2 - 2.2, 0);
    stone.push(wall);
    const cop = new THREE.BoxGeometry(0.8, 0.34, CANAL.length);
    cop.translate(inner + s * 1.9, Q + 0.17, 0);
    stone.push(cop);
    const width = s < 0 ? 26 : 44;      // 西岸要给寺前留地，东岸是市
    const g = new THREE.BoxGeometry(width, 0.7, CANAL.length + 70);
    g.translate(inner + s * (width / 2 + 1.4), Q - 0.35, 0);
    ground.push(g);
  }
  const g = new THREE.Group();
  const quay = mesh(stone, M.stone);
  quay.receiveShadow = true;
  const land = mesh(ground, M.stoneDark);
  land.receiveShadow = true;
  g.add(land, quay);
  return g;
}

/** 石埠、缆桩与系船石 */
function quayFurniture(anchors) {
  const g = new THREE.Group();
  const steps = [], bollards = [];
  for (const s of [-1, 1]) {
    for (let z = -70; z <= 70; z += 14) {
      const k0 = s < 0 ? 3 : 4;
      for (let k = 0; k < k0; k++) {
        steps.push(box(3.0, 0.46, 0.72, s * (HW + 0.3 - k * 0.62), Q - 0.5 - k * 0.52, z));
      }
      const b = new THREE.CylinderGeometry(0.2, 0.28, 1.0, 8);
      b.translate(s * (HW + 2.4), Q + 0.5, z + 5);
      bollards.push(b);
      anchors.moorings.push(new THREE.Vector3(s * (HW + 1.2), Q - 1.0, z));
    }
  }
  const sMesh = mesh(steps, M.stone); sMesh.receiveShadow = true;
  const bMesh = mesh(bollards, M.stoneDark); bMesh.castShadow = true;
  g.add(sMesh, bMesh);

  // 西岸纤道的石栏：只在下游一段，寺前那段要留给埠头
  const rail = new THREE.Mesh(railingGeo(96, { height: 0.86, spacing: 1.7 }), M.stone);
  rail.rotation.y = Math.PI / 2;
  rail.position.set(-HW - 3.0, Q, -54);
  g.add(rail);
  return g;
}

/* ------------------------------------------------------------------ 石拱桥 */
/** 单孔石拱桥：桥身挤出 + 随拱的栏板，枫桥与江村桥共用 */
function stoneArchBridge({ z, span, rise, half, arch, name, plaqueSize = [2.4, 0.86] }, anchors) {
  const g = new THREE.Group();
  const body = span + 1.2;
  const deckY = (x) => Q + 0.2 + rise * Math.max(0, 1 - (x / span) ** 2) ** 0.86;

  const shape = new THREE.Shape();
  shape.moveTo(-body, 0.1);
  for (let i = 0; i <= 64; i++) {
    const x = -body + (2 * body * i) / 64;
    shape.lineTo(x, deckY(Math.min(span, Math.max(-span, x))) - 0.62);
  }
  shape.lineTo(body, 0.1);
  shape.closePath();
  const soffit = new THREE.Path();
  soffit.moveTo(-arch, 0.1);
  soffit.absarc(0, 0.3, arch, 0, Math.PI, false);
  soffit.lineTo(-arch, 0.1);
  shape.holes.push(soffit);

  const solid = new THREE.ExtrudeGeometry(shape, { depth: half * 2, bevelEnabled: false, curveSegments: 24 });
  solid.translate(0, 0, z - half);
  const m = new THREE.Mesh(solid, M.stoneDressed);
  m.castShadow = m.receiveShadow = true;
  g.add(m);

  for (const s of [-1, 1]) {
    const segs = 44, parts = [];
    for (let i = 0; i < segs; i++) {
      const x = -span + (2 * span * i) / segs;
      const xn = -span + (2 * span * (i + 1)) / segs;
      const y = (deckY(x) + deckY(xn)) / 2;
      const zz = s * (half - 0.12) + z;
      const len = Math.hypot(xn - x, deckY(xn) - deckY(x)) * 1.03;
      const b = new THREE.BoxGeometry(len, 0.94, 0.24);
      b.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(deckY(xn) - deckY(x), xn - x)));
      b.translate(x + (xn - x) / 2, y + 0.7, zz);
      parts.push(b);
      if (i % 3 === 0) {
        parts.push(box(0.22, 1.34, 0.32, x, y + 0.86, zz));
        const cap = new THREE.SphereGeometry(0.16, 8, 6);
        cap.translate(x, y + 1.56, zz);
        parts.push(cap);
      }
    }
    parts.push(box(1.2, 0.28, 0.4, 0, deckY(0) + 1.2, s * (half - 0.12) + z));
    const pm = mesh(parts, M.stone);
    pm.castShadow = true;
    g.add(pm);
    const plaque = plaqueMesh(name, plaqueSize[0], plaqueSize[1], { dir: 'h', bg: '#243040', fg: '#dfe6f2' });
    plaque.position.set(0, deckY(0) * 0.55, s * (half + 0.03) + z);
    plaque.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(plaque);
  }
  // 桥堍石灯：桥头最认得出的两件
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const x = s * (body + 0.5), zz = z + k * (half - 0.25);
    const st = mesh([
      box(0.62, 0.34, 0.62, x, Q + 0.17, zz),
      box(0.42, 2.1, 0.42, x, Q + 1.4, zz),
      new THREE.SphereGeometry(0.34, 10, 7).translate(x, Q + 2.7, zz),
      box(0.5, 0.7, 0.5, x, Q + 3.2, zz),
    ], M.stone);
    st.castShadow = true;
    g.add(st);
    anchors.bridgeLamps.push(new THREE.Vector3(x, Q + 3.15, zz));
  }
  // 拱腹里一排灯，桥洞亮成一孔
  for (let i = -3; i <= 3; i++) {
    const a = (i / 3.6) * Math.PI * 0.8;
    anchors.archLamps.push(new THREE.Vector3(Math.cos(a) * (arch - 0.35), 0.5 + Math.sin(a) * (arch - 0.4), z));
  }
  return { group: g, deckY, crownY: deckY(0), at: z, span, half };
}

/* ------------------------------------------------------------------ 殿宇通用体 */
/**
 * 台基 + 檐柱 + 墙体 + 格扇 + 重檐。大雄宝殿、藏经楼、枫江楼共用。
 * 立面朝东（面向运河），所以面阔沿 Z、进深沿 X。
 */
function hall({ cx, cz, w, d, wallH, name, plaqueW = 5.6, twoStory = false, anchors }) {
  const g = new THREE.Group();
  const platH = 1.5, fy = Q + platH;
  const plat = mesh(box(w + 6, platH, d + 6, cx, Q + platH / 2, cz), M.stone);
  plat.castShadow = plat.receiveShadow = true;
  g.add(plat);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railingGeo(d + 6, { height: 0.98, spacing: 1.5 }), M.stone);
    r.position.set(cx + s * (w / 2 + 3), fy, cz);
    r.rotation.y = Math.PI / 2;
    g.add(r);
  }
  // 正面在东（朝运河），台基的慢道也开在东头
  const stair = [];
  for (let k = 0; k < 4; k++) {
    stair.push(box(0.85, 0.4, 4.6, cx + w / 2 + 3.4 + k * 0.38, fy - 0.4 - k * 0.38, cz));
    stair.push(box(4.4, 0.4, 0.8, cx + w / 2 + 3.0, fy - 0.4 - k * 0.38, cz - 2.2 - k * 0.1));
  }
  const stm = mesh(stair, M.stone); stm.receiveShadow = true;
  g.add(stm);

  const openA = (d - 3.2) / 4 + 0.8;
  const shell = mesh([
    box(0.5, wallH, d, cx - w / 2, fy + wallH / 2, cz),
    box(0.5, wallH, openA * 2, cx + w / 2, fy + wallH / 2, cz + (d / 2 + 1.6) / 2 - 0.1),
    box(0.5, wallH, openA * 2, cx + w / 2, fy + wallH / 2, cz - (d / 2 + 1.6) / 2 + 0.1),
    box(w, wallH, 0.5, cx, fy + wallH / 2, cz + d / 2),
    box(w, wallH, 0.5, cx, fy + wallH / 2, cz - d / 2),
  ], M.templeWall);
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);

  const bays = Math.max(3, Math.round(w / 3.6));
  for (let i = 0; i <= bays; i++) {
    const z = cz - d / 2 + (d * i) / bays;
    for (const dx of [-w / 2 - 1.2, w / 2 + 1.2]) {
      const c = new THREE.Mesh(pillarGeo(wallH + 0.5, 0.3), M.redPillar);
      c.position.set(cx + dx, fy, z);
      c.castShadow = true;
      g.add(c);
    }
    if (i < bays) {
      const zc = cz - d / 2 + (d * (i + 0.5)) / bays, bay = d / bays;
      const beams = [];
      for (const dx of [-w / 2 - 1.2, w / 2 + 1.2]) {
        beams.push(box(0.42, 0.5, bay, cx + dx, fy + wallH + 0.3, zc));
        const br = bracketGeo(1.0); br.translate(cx + dx, fy + wallH + 0.55, zc);
        beams.push(br);
      }
      beams.push(box(w + 3, 0.5, 0.4, cx, fy + wallH + 0.3, z));
      g.add(mesh(beams, M.beam));
      g.add(mesh([box(0.4, 0.36, 0.4, cx - w / 2 - 1.2, fy + wallH + 0.75, zc)], M.gilt));
    }
    anchors.hallLamps.push(new THREE.Vector3(cx + w / 2 + 1.8, fy + wallH - 0.6, z));
  }
  g.add(mesh([
    box(0.5, 0.6, d + 3, cx - w / 2 - 1.2, fy + wallH + 0.35, cz),
    box(0.5, 0.6, d + 3, cx + w / 2 + 1.2, fy + wallH + 0.35, cz),
  ], M.beam));

  for (let i = 0; i < 4; i++) {
    const z = cz - d / 2 + 1.2 + i * (d - 2.4) / 3;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), M.lattice);
    win.position.set(cx + w / 2 + 1.45, fy + 1.7, z);
    win.rotation.y = Math.PI / 2;
    g.add(win);
    anchors.hallWindows.push(new THREE.Vector3(cx + w / 2 + 1.7, fy + 1.9, z));
  }

  const y = fy + wallH;
  // 屋顶是绕 Y 旋转 90° 放的，所以 chineseRoof 的 width 实际落在 Z（面阔）、depth 落在 X（进深）
  const lowerRoof = new THREE.Mesh(chineseRoof({
    width: d + 4.6, depth: w + 4.6, height: 2.4, ridgeRatio: 0.44, curve: 0.62,
    eaveLift: 0.6, overhang: 1.3, segU: 28, segV: 18,
  }), M.roofTemple);
  lowerRoof.rotation.y = Math.PI / 2;
  lowerRoof.position.set(cx, y, cz);
  lowerRoof.castShadow = true;
  g.add(lowerRoof);

  if (twoStory) {
    const lw = w - 2.6, ld = d - 1.8, lh = wallH * 0.8;
    const upper = mesh([
      box(0.5, lh, ld, cx + lw / 2, y + 1.6 + lh / 2, cz),
      box(0.5, lh, ld, cx - lw / 2, y + 1.6 + lh / 2, cz),
      box(lw, lh, 0.5, cx, y + 1.6 + lh / 2, cz + ld / 2),
      box(lw - 2.6, lh, 0.5, cx + 1.3, y + 1.6 + lh / 2, cz - ld / 2),
    ], M.templeWall);
    upper.castShadow = true;
    g.add(upper);
    const rail2 = new THREE.Mesh(railingGeo(ld + 1, { height: 0.85, spacing: 1.4 }), M.stone);
    rail2.rotation.y = Math.PI / 2;
    rail2.position.set(cx + lw / 2 + 1.0, y + 1.55, cz);
    g.add(rail2);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(pillarGeo(lh, 0.24), M.redPillar);
      c.position.set(cx + lw / 2 + 1.0, y + 1.6, cz - ld / 2 + (ld * i) / 2);
      g.add(c);
      anchors.courtLamps.push(new THREE.Vector3(cx + lw / 2 + 1.7, y + 2.9, cz - ld / 2 + (ld * i) / 2));
    }
    const upperRoof = new THREE.Mesh(chineseRoof({
      width: ld + 4.0, depth: lw + 4.0, height: 2.4, ridgeRatio: 0.4, curve: 0.6,
      eaveLift: 0.75, overhang: 1.1, segU: 26, segV: 16,
    }), M.roofTemple);
    upperRoof.rotation.y = Math.PI / 2;
    upperRoof.position.set(cx, y + 1.6 + lh, cz);
    upperRoof.castShadow = true;
    g.add(upperRoof);
    const rg = mesh(ridgeOrnament({ width: ld + 4.0, depth: lw + 4.0, height: 2.4, ridgeRatio: 0.4, overhang: 1.1 }), M.ridge);
    rg.rotation.y = Math.PI / 2;
    rg.position.set(cx, y + 1.6 + lh + 2.4, cz);
    g.add(rg);
    const sign = plaqueMesh(name, plaqueW * 0.8, 1.4, { dir: 'h', bg: '#1a2a3a', fg: '#f3dfb2' });
    sign.position.set(cx + lw / 2 + 1.7, y + 2.5, cz);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  } else {
    const upperRoof = new THREE.Mesh(chineseRoof({
      width: d - 1.4, depth: w - 2.2, height: 2.8, ridgeRatio: 0.4, curve: 0.6,
      eaveLift: 0.78, overhang: 1.0, segU: 26, segV: 16,
    }), M.roofTemple);
    upperRoof.rotation.y = Math.PI / 2;
    upperRoof.position.set(cx, y + 2.9, cz);
    upperRoof.castShadow = true;
    g.add(upperRoof);
    const rg = mesh(ridgeOrnament({ width: d - 1.4, depth: w - 2.2, height: 2.8, ridgeRatio: 0.4, overhang: 1.0 }), M.gilt);
    rg.rotation.y = Math.PI / 2;
    rg.position.set(cx, y + 5.7, cz);
    g.add(rg);
    const sign = plaqueMesh(name, plaqueW, 1.7, { dir: 'h', bg: '#123057', fg: '#f5e2b4' });
    sign.position.set(cx + w / 2 + 2.0, y + 1.2, cz);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }
  return { group: g, floorY: fy, frontX: cx + w / 2 + 1.6, ridgeY: y + (twoStory ? 4.0 : 5.7) };
}

/* ------------------------------------------------------------------ 寒山寺 */
/** 沿河黄墙：寺在运河边最标志性的一道面，山门是它开的一个口 */
function templeWall(anchors) {
  const g = new THREE.Group();
  const zA = -34, zB = 16, h = 4.0;
  const segs = [[zA, -4.2], [0.2, zB]];
  for (const [a, b] of segs) {
    const len = b - a, zc = (a + b) / 2;
    const wall = mesh([
      box(0.85, h, len, WALL_X, Q + h / 2, zc),
      box(1.3, 0.5, len, WALL_X, Q + h + 0.25, zc),
    ], M.templeWall);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    const cap = new THREE.Mesh(chineseRoof({
      width: len + 1.2, depth: 2.0, height: 0.72, ridgeRatio: 0.92, curve: 0.5, eaveLift: 0.3, overhang: 0.3,
    }), M.roofGrey);
    cap.rotation.y = Math.PI / 2;
    cap.position.set(WALL_X, Q + h + 0.5, zc);
    cap.castShadow = true;
    g.add(cap);
    // 墙下的素面台与一排漏窗/壁灯
    for (let z = a + 3; z < b - 2.5; z += 5.5) {
      g.add(mesh(box(0.95, 0.5, 3.4, WALL_X, Q + 0.35, z), M.stone));
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), M.lattice);
      win.position.set(WALL_X - 0.5, Q + 2.3, z);
      win.rotation.y = -Math.PI / 2;
      g.add(win);
      anchors.wallLamps.push(
        new THREE.Vector3(WALL_X - 0.8, Q + 2.3, z),
        new THREE.Vector3(WALL_X + 0.75, Q + 1.5, z),
      );
    }
  }
  // 照壁：院中偏南的一面萧墙，不挡山门望大殿的中线
  const zbx = WALL_X - 3.0, zbz = -9;
  const zb = mesh([
    box(1.1, 3.2, 7.4, zbx, Q + 1.6, zbz),
    box(1.6, 0.45, 7.8, zbx, Q + 3.4, zbz),
  ], M.templeWall);
  zb.castShadow = true;
  g.add(zb);
  const zbCap = new THREE.Mesh(chineseRoof({ width: 8.6, depth: 2.2, height: 0.8, ridgeRatio: 0.9, curve: 0.5, eaveLift: 0.35, overhang: 0.3 }), M.roofGrey);
  zbCap.rotation.y = Math.PI / 2;
  zbCap.position.set(zbx, Q + 3.7, zbz);
  g.add(zbCap);
  for (const dz of [-3.2, 0, 3.2]) anchors.wallLamps.push(new THREE.Vector3(zbx - 0.8, Q + 2.0, zbz + dz));
  LAYOUT.wall = { x: WALL_X, zA, zB, topY: Q + h + 1.2 };
  return g;
}

/** 山门：三开间门式，嵌在黄墙里，匾书"寒山寺" */
function templeGate(anchors) {
  const g = new THREE.Group();
  const cz = -2, colH = 5.6;
  LAYOUT.gate = { x: WALL_X, cz, floorY: Q + 0.1, width: 4.4 };
  const piers = [];
  for (const dz of [-5.0, -2.4, 2.4, 5.0]) {
    piers.push(box(1.15, colH, 1.15, WALL_X, Q + colH / 2, cz + dz));
    piers.push(box(1.5, 0.5, 1.5, WALL_X, Q + 0.25, cz + dz));
  }
  const pm = mesh(piers, M.templeWall);
  pm.castShadow = pm.receiveShadow = true;
  g.add(pm);
  for (const dz of [-3.7, 3.7]) g.add(mesh(box(0.7, 0.7, 7.4, WALL_X, colH * 0.52 + Q, cz + dz), M.beam));

  const mid = new THREE.Mesh(chineseRoof({ width: 6.0, depth: 2.6, height: 1.5, ridgeRatio: 0.75, curve: 0.55, eaveLift: 0.6, overhang: 0.6 }), M.roofTemple);
  mid.rotation.y = Math.PI / 2;
  mid.position.set(WALL_X, Q + colH + 0.2, cz);
  mid.castShadow = true;
  g.add(mid);
  const midRidge = mesh(ridgeOrnament({ width: 6.0, depth: 2.6, height: 1.5, ridgeRatio: 0.75, overhang: 0.6 }), M.ridge);
  midRidge.rotation.y = Math.PI / 2;
  midRidge.position.set(WALL_X, Q + colH + 1.7, cz);
  g.add(midRidge);
  for (const s of [-1, 1]) {
    const low = new THREE.Mesh(chineseRoof({ width: 4.0, depth: 2.2, height: 1.0, ridgeRatio: 0.88, curve: 0.5, eaveLift: 0.45, overhang: 0.4 }), M.roofGrey);
    low.rotation.y = Math.PI / 2;
    low.position.set(WALL_X, Q + colH * 0.62, cz + s * 3.7);
    low.castShadow = true;
    g.add(low);
    anchors.gateLamps.push(new THREE.Vector3(WALL_X + 0.7, Q + colH * 0.5, cz + s * 3.7));
  }
  // 门额朝河：山门的外面就是纤道与水面，船上看过来正是这一面
  const sign = plaqueMesh('寒山寺', 4.4, 1.5, { dir: 'h', bg: '#1d3b2c', fg: '#f6e5bb' });
  sign.position.set(WALL_X + 0.75, Q + colH - 1.1, cz);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  // 门扇与门槛
  g.add(mesh([
    box(0.14, 3.1, 2.2, WALL_X - 0.5, Q + 1.6, cz - 1.2),
    box(0.14, 3.1, 2.2, WALL_X - 0.5, Q + 1.6, cz + 1.2),
    box(1.0, 0.28, 4.6, WALL_X - 0.5, Q + 0.14, cz),
  ], M.woodDark));
  anchors.gateLamps.push(new THREE.Vector3(WALL_X + 1.0, Q + 3.3, cz - 2.6), new THREE.Vector3(WALL_X + 1.0, Q + 3.3, cz + 2.6));
  // 门前一对石狮
  for (const dz of [-6.4, 6.4]) {
    const lx = WALL_X + 1.7;
    const s = mesh([
      box(1.1, 0.7, 1.1, lx, Q + 0.35, cz + dz),
      box(0.7, 0.9, 1.3, lx, Q + 1.15, cz + dz),
      new THREE.SphereGeometry(0.42, 9, 7).translate(lx, Q + 1.9, cz + dz - 0.4),
    ], M.stone);
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

/**
 * 钟楼：方形两层，腰檐平座，二层明间悬仿唐梵钟。
 * 交出钟体、撞木的枢轴，钟声模块按同一点摆动与发声。
 */
function bellTower(anchors) {
  const g = new THREE.Group();
  const cx = WALL_X - 2.0, cz = 7.0, w = 7.0, d = 7.0;
  const platH = 1.2, fy = Q + platH;
  const plat = mesh([
    box(w + 4, platH, d + 4, cx, Q + platH / 2, cz),
    box(w + 4.6, 0.4, d + 4.6, cx, Q + platH + 0.2, cz),
  ], M.stone);
  plat.castShadow = plat.receiveShadow = true;
  g.add(plat);
  const st = [];
  for (let k = 0; k < 3; k++) st.push(box(3.6, 0.4, 0.8, cx, Q + platH - 0.4 - k * 0.4, cz - d / 2 - 2.6 - k * 0.8));
  g.add(mesh(st, M.stone));

  const lowerH = 3.4, upperH = 3.6;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const c = new THREE.Mesh(pillarGeo(lowerH + 0.4, 0.3), M.redPillar);
    c.position.set(cx + dx * (w / 2 - 0.5), fy, cz + dz * (d / 2 - 0.5));
    c.castShadow = true;
    g.add(c);
  }
  const wall1 = mesh([
    box(0.45, lowerH, d, cx - w / 2 + 0.3, fy + lowerH / 2, cz),
    box(0.45, lowerH, d, cx + w / 2 - 0.3, fy + lowerH / 2, cz),
    box(w, lowerH, 0.45, cx, fy + lowerH / 2, cz + d / 2 - 0.3),
    box(2.2, lowerH, 0.45, cx - (w / 2 - 1.3), fy + lowerH / 2, cz - d / 2 + 0.3),
    box(2.2, lowerH, 0.45, cx + (w / 2 - 1.3), fy + lowerH / 2, cz - d / 2 + 0.3),
  ], M.templeWall);
  wall1.castShadow = true;
  g.add(wall1);

  const waist = new THREE.Mesh(chineseRoof({
    width: w + 3.4, depth: d + 3.4, height: 1.3, ridgeRatio: 0.72, curve: 0.55, eaveLift: 0.6, overhang: 0.8,
  }), M.roofTemple);
  waist.rotation.y = Math.PI / 2;
  waist.position.set(cx, fy + lowerH, cz);
  waist.castShadow = true;
  g.add(waist);
  for (const dz of [-1, 1]) {
    const r = new THREE.Mesh(railingGeo(w - 0.4, { height: 0.9, spacing: 1.3 }), M.stone);
    r.position.set(cx, fy + lowerH + 0.35, cz + dz * (d / 2 + 1.3));
    g.add(r);
  }
  for (const dx of [-1, 1]) {
    const r = new THREE.Mesh(railingGeo(d - 0.4, { height: 0.9, spacing: 1.3 }), M.stone);
    r.rotation.y = Math.PI / 2;
    r.position.set(cx + dx * (w / 2 + 1.3), fy + lowerH + 0.35, cz);
    g.add(r);
  }

  const upY = fy + lowerH + 0.5;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const c = new THREE.Mesh(pillarGeo(upperH, 0.25), M.redPillar);
    c.position.set(cx + dx * (w / 2 - 0.4), upY, cz + dz * (d / 2 - 0.4));
    c.castShadow = true;
    g.add(c);
  }
  g.add(mesh([
    box(0.55, 0.5, d + 0.6, cx, upY + upperH + 0.2, cz),
    box(w + 0.6, 0.5, 0.55, cx, upY + upperH + 0.2, cz - 1.2),
    box(w + 0.6, 0.5, 0.55, cx, upY + upperH + 0.2, cz + 1.2),
  ], M.beam));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const br = bracketGeo(1.1);
    br.translate(cx + dx * (w / 2 - 0.4), upY + upperH - 0.15, cz + dz * (d / 2 - 0.4));
    g.add(mesh(br, M.gilt));
  }
  const top = new THREE.Mesh(chineseRoof({
    width: w + 3.0, depth: d + 3.0, height: 2.3, ridgeRatio: 0.18, curve: 0.6, eaveLift: 0.85, overhang: 1.0,
  }), M.roofTemple);
  top.position.set(cx, upY + upperH + 0.4, cz);
  top.castShadow = true;
  g.add(top);
  g.add(mesh([
    box(0.14, 0.9, 0.14, cx, upY + upperH + 3.1, cz),
    new THREE.SphereGeometry(0.26, 10, 8).translate(cx, upY + upperH + 3.8, cz),
  ], M.gilt));

  // 悬钟：吊梁之下，钟心即撞点
  const bellY = upY + 0.9;
  const beamY = upY + upperH - 0.2;
  const hang = beamY - bellY;
  const pivot = new THREE.Object3D();
  pivot.position.set(cx, beamY, cz);
  const bellMesh = new THREE.Mesh(bellGeo({ height: 2.5, radius: 0.92 }), M.bronze);
  bellMesh.position.set(0, -hang, 0);
  bellMesh.castShadow = true;
  const ropes = mesh([
    box(0.07, hang, 0.07, -0.4, -hang / 2, 0),
    box(0.07, hang, 0.07, 0.4, -hang / 2, 0),
  ], M.woodDark);
  pivot.add(bellMesh, ropes);
  g.add(pivot);
  // 撞钟木：钟前悬的一根圆木，敲时荡向钟身
  const logPivot = new THREE.Object3D();
  logPivot.position.set(cx, beamY, cz - 3.1);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 2.6, 10), M.woodDark);
  log.rotation.z = Math.PI / 2;
  log.position.set(0, -1.1, 2.5);
  log.castShadow = true;
  const logRopes = mesh([
    box(0.05, 2.3, 0.05, -1.05, 0.05, 2.5),
    box(0.05, 2.3, 0.05, 1.05, 0.05, 2.5),
  ], M.ink);
  logPivot.add(log, logRopes);
  g.add(logPivot);

  const sign = plaqueMesh('钟楼', 2.4, 1.05, { dir: 'v', bg: '#1d3b2c', fg: '#f6e5bb' });
  sign.position.set(cx, upY + upperH * 0.55, cz - d / 2 - 0.95);
  g.add(sign);
  anchors.bellLamps.push(
    new THREE.Vector3(cx - 2.2, upY + 1.3, cz - d / 2 - 0.9),
    new THREE.Vector3(cx + 2.2, upY + 1.3, cz - d / 2 - 0.9),
    new THREE.Vector3(cx, bellY + 2.9, cz),
  );
  anchors.courtLamps.push(
    new THREE.Vector3(cx - 3.4, Q + 1.6, cz - d / 2 - 2.4),
    new THREE.Vector3(cx + 3.4, Q + 1.6, cz - d / 2 - 2.4),
  );
  LAYOUT.bell = {
    cx, cz, floorY: fy, deckY: upY, bellPos: new THREE.Vector3(cx, bellY + 1.25, cz),
    crownY: beamY + upperH, stair: new THREE.Vector3(cx, Q, cz - d / 2 - 2.6),
  };
  return { group: g, pivot, bellMesh, logPivot };
}

/** 普明宝塔：方形五层楼阁式塔，逐层收分，檐角悬铃 */
function pagoda(anchors) {
  const g = new THREE.Group();
  const cx = WALL_X - 19.0, cz = -24.0, tiers = 5;
  const plat = mesh([
    box(15, 1.4, 15, cx, Q + 0.7, cz),
    box(15.8, 0.4, 15.8, cx, Q + 1.6, cz),
  ], M.stone);
  plat.castShadow = plat.receiveShadow = true;
  g.add(plat);
  let y = Q + 1.8;
  for (let k = 0; k < tiers; k++) {
    const w = 9.6 - k * 1.3, d = w, hh = 4.4 - k * 0.32;
    const body = mesh([
      box(0.5, hh, d, cx + w / 2, y + hh / 2, cz),
      box(0.5, hh, d, cx - w / 2, y + hh / 2, cz),
      box(w, hh, 0.5, cx, y + hh / 2, cz + d / 2),
      box(w - 2.4, hh, 0.5, cx + 1.2, y + hh / 2, cz - d / 2),
    ], k === 0 ? M.templeWall : M.wall);
    body.castShadow = true;
    g.add(body);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = new THREE.Mesh(pillarGeo(hh, 0.2), M.redPillar);
      c.position.set(cx + dx * (w / 2 + 0.75), y, cz + dz * (d / 2 + 0.75));
      g.add(c);
    }
    const floor = mesh(box(w + 2.4, 0.35, d + 2.4, cx, y + hh + 0.15, cz), M.beam);
    floor.castShadow = true;
    g.add(floor);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(railingGeo(w + 1.6, { height: 0.7, spacing: 1.2 }), M.stone);
      r.position.set(cx, y + hh + 0.32, cz + s * (d / 2 + 1.1));
      g.add(r);
      const r2 = new THREE.Mesh(railingGeo(d + 1.6, { height: 0.7, spacing: 1.2 }), M.stone);
      r2.rotation.y = Math.PI / 2;
      r2.position.set(cx + s * (w / 2 + 1.1), y + hh + 0.32, cz);
      g.add(r2);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.5), M.lattice);
    door.position.set(cx - w / 2 - 0.32, y + 1.35, cz);
    door.rotation.y = -Math.PI / 2;
    g.add(door);
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), M.lattice);
      win.position.set(cx, y + hh * 0.55, cz + s * (d / 2 + 0.32));
      g.add(win);
    }
    const roof = new THREE.Mesh(chineseRoof({
      width: w + 3.6, depth: d + 3.6, height: 1.55, ridgeRatio: 0.12, curve: 0.6,
      eaveLift: 0.95, overhang: 0.9, segU: 22, segV: 14,
    }), M.roofTemple);
    roof.position.set(cx, y + hh + 0.5, cz);
    roof.castShadow = true;
    g.add(roof);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + dx * (w / 2 + 1.9), pz = cz + dz * (d / 2 + 1.9);
      g.add(mesh(box(0.09, 0.42, 0.09, px, y + hh + 0.15, pz), M.ink));
      anchors.pagodaLamps.push(new THREE.Vector3(px, y + hh - 0.2, pz));
    }
    anchors.pagodaTierLamps.push(new THREE.Vector3(cx - w / 2 - 0.8, y + hh * 0.6, cz));
    y += hh + 0.95;
  }
  const top = y + 0.3;
  g.add(mesh([
    new THREE.SphereGeometry(0.6, 12, 9).translate(cx, top + 0.5, cz),
    box(0.28, 1.4, 0.28, cx, top + 1.5, cz),
    new THREE.ConeGeometry(0.7, 1.6, 10).translate(cx, top + 2.9, cz),
    new THREE.TorusGeometry(0.52, 0.07, 6, 14).rotateX(Math.PI / 2).translate(cx, top + 1.8, cz),
  ], M.gilt));
  anchors.pagodaTop = new THREE.Vector3(cx, top + 2.2, cz);
  LAYOUT.pagoda = { cx, cz, floorY: Q + 1.8, topY: top + 3.4, baseY: top };
  return g;
}

/** 碑廊：一排柱廊，正中立的俞樾书《枫桥夜泊》诗碑 */
function steleCorridor(anchors) {
  const g = new THREE.Group();
  const len = 13, h = 3.2, bays = 4;
  const deck = mesh(box(len + 2, 0.4, 4.4, 0, 0.2, 0), M.stone);
  deck.receiveShadow = true;
  g.add(deck);
  for (let i = 0; i <= bays; i++) {
    const x = -len / 2 + (len * i) / bays;
    for (const dz of [-1.7, 1.7]) {
      const c = new THREE.Mesh(pillarGeo(h, 0.2), M.redPillar);
      c.position.set(x, 0.4, dz);
      c.castShadow = true;
      g.add(c);
    }
    if (i < bays) {
      const xc = -len / 2 + (len * (i + 0.5)) / bays;
      g.add(mesh([box(len / bays, 0.42, 0.3, xc, 0.4 + h, -1.7),
        box(len / bays, 0.42, 0.3, xc, 0.4 + h, 1.7)], M.beam));
    }
  }
  const roof = new THREE.Mesh(chineseRoof({
    width: len + 3.0, depth: 5.2, height: 1.2, ridgeRatio: 0.9, curve: 0.52, eaveLift: 0.45, overhang: 0.6,
  }), M.roofGrey);
  roof.position.set(0, 0.4 + h + 0.2, 0);
  roof.castShadow = true;
  g.add(roof);

  const poemMat = new THREE.MeshStandardMaterial({ map: T.poemStone(), roughness: 0.82 });
  const main = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.8), poemMat);
  main.position.set(0, 2.5, 2.06);
  const body = mesh([
    box(2.2, 3.8, 0.5, 0, 2.5, 2.3),
    box(2.7, 0.5, 0.9, 0, 4.6, 2.3),
    box(1.4, 0.7, 3.0, 0, 0.75, 2.3),
  ], M.stele);
  body.castShadow = true;
  g.add(main, body);
  for (const x of [-4.4, 4.4]) {
    g.add(mesh([box(1.5, 2.8, 0.42, x, 2.0, 2.2), box(1.9, 0.4, 0.8, x, 3.6, 2.2),
      box(2.0, 0.55, 1.4, x, 0.68, 2.2)], M.stele));
  }
  for (const x of [-4.4, 0, 4.4]) anchors.steleLamps.push(new THREE.Vector3(x, 3.2, -1.0));

  g.position.set(WALL_X - 5.4, Q, -19.5);
  LAYOUT.stele = { x: WALL_X - 5.4, z: -19.5 + 2.06, back: -19.5, y: Q + 2.5 };
  return g;
}

/* ------------------------------------------------------------------ 铁铃关 */
/** 关城：跨驿道的券门 + 垛口 + 向南延伸的一段城墙 */
function gatePass(anchors) {
  const g = new THREE.Group();
  const cx = HW + 9.0, cz = 42, w = 9.5, d = 11.0, h = 6.4;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(d / 2, h);
  shape.lineTo(-d / 2, h);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-2.0, 0);
  hole.absarc(0, 0.2, 2.0, 0, Math.PI, false);
  hole.lineTo(-2.0, 0);
  shape.holes.push(hole);
  const solid = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 18 });
  solid.rotateY(Math.PI / 2);
  solid.translate(cx - w / 2, Q - 0.2, cz);
  const mass = new THREE.Mesh(solid, M.stoneDressed);
  mass.castShadow = mass.receiveShadow = true;
  g.add(mass);

  // 马道与垛口
  g.add(mesh(box(w, 0.3, d, cx, Q - 0.2 + h + 0.15, cz), M.stone));
  const crenel = [];
  for (let i = 0; i <= 10; i++) {
    const z = cz - d / 2 + (d * i) / 10;
    if (i % 2 === 0 && Math.abs(z - cz) > 1.6) crenel.push(box(w, 0.85, 0.9, cx, Q - 0.2 + h + 0.72, z));
  }
  for (let i = 0; i <= 4; i++) {
    const x = cx - w / 2 + (w * i) / 4;
    if (i % 2 === 0) crenel.push(box(0.9, 0.85, 0.7, x, Q - 0.2 + h + 0.72, cz - d / 2));
  }
  g.add(mesh(crenel, M.stone));

  const ry = Q - 0.2 + h + 1.15;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) {
    const c = new THREE.Mesh(pillarGeo(3.0, 0.22), M.redPillar);
    c.position.set(cx + dx * (w / 2 - 0.9), ry, cz + dz * (d / 2 - 1.4));
    g.add(c);
  }
  const hut = mesh(box(w - 1.8, 2.4, d - 3.2, cx, ry + 1.2, cz), M.wall);
  hut.castShadow = true;
  g.add(hut);
  const hr = new THREE.Mesh(chineseRoof({
    width: d + 1.6, depth: w + 1.6, height: 1.3, ridgeRatio: 0.5, curve: 0.55, eaveLift: 0.55, overhang: 0.5,
  }), M.roofGrey);
  hr.rotation.y = Math.PI / 2;
  hr.position.set(cx, ry + 2.5, cz);
  hr.castShadow = true;
  g.add(hr);
  const sign = plaqueMesh('铁铃关', 3.2, 1.15, { dir: 'h', bg: '#2b2f3a', fg: '#e9e2c8' });
  sign.position.set(cx - w / 2 - 0.4, ry + 1.3, cz);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  const lintel = plaqueMesh('枫桥敌楼', 2.9, 0.9, { dir: 'h', bg: '#243040', fg: '#dfe6f2' });
  lintel.position.set(cx - w / 2 - 0.25, Q + 4.6, cz);
  lintel.rotation.y = -Math.PI / 2;
  g.add(lintel);

  const wall = [];
  for (let i = 0; i < 7; i++) {
    const z = cz + d / 2 + 0.6 + i * 4.4;
    wall.push(box(2.0, 4.2, 4.4, cx + w / 2 - 1.0, Q + 2.1, z));
    if (i % 2 === 0) wall.push(box(2.2, 0.7, 1.0, cx + w / 2 - 1.0, Q + 4.5, z));
  }
  const wm = mesh(wall, M.stoneDressed);
  wm.castShadow = wm.receiveShadow = true;
  g.add(wm);

  anchors.guanLamps.push(
    new THREE.Vector3(cx - w / 2 - 0.8, Q + 2.4, cz - 1.7),
    new THREE.Vector3(cx - w / 2 - 0.8, Q + 2.4, cz + 1.7),
    new THREE.Vector3(cx, ry + 0.6, cz - d / 2 + 0.9),
  );
  for (let i = 0; i < 4; i++) anchors.courtLamps.push(new THREE.Vector3(cx + w / 2 - 1.0, Q + 4.2, cz + d / 2 + 2.4 + i * 8.8));
  LAYOUT.guan = { cx, cz, w, d, topY: ry + 2.0 };
  return g;
}

/* ------------------------------------------------------------------ 东岸河市 */
/** 河房：前门卸货后门住家，临水一列立柱撑起廊棚 */
function townHouses(anchors) {
  const g = new THREE.Group();
  const walls = [], roofs = [], shedParts = [], cols = [], steps = [];
  const x0 = HW + 4.4;                       // 河房临水面所在的线
  for (let i = 0; i < 15; i++) {
    const z = -46 + i * 7.4 + rr(-1.6, 1.6);
    if (Math.abs(z - 42) < 9.5) continue;    // 关城前留出空地
    const front = rr(5.4, 7.4);              // 面阔（沿 Z）
    const depth = rr(5.6, 8.4);              // 进深（沿 X）
    const h = rr(3.0, 4.2);
    const two = rand() > 0.62;
    const cx = x0 + depth / 2;
    walls.push(box(depth, h, front, cx, Q + h / 2, z));
    if (two) walls.push(box(depth * 0.84, h * 0.7, front * 0.84, cx + 0.4, Q + h + h * 0.35, z));
    const rg = chineseRoof({
      width: front + 1.6, depth: depth + 1.6, height: 1.15, ridgeRatio: 0.45,
      curve: 0.55, eaveLift: 0.45, overhang: 0.4,
    });
    rg.rotateY(Math.PI / 2);
    rg.translate(cx, Q + h + (two ? h * 0.7 : 0) + 0.1, z);
    roofs.push(rg);
    anchors.windowGlow.push(new THREE.Vector3(x0 - 0.4, Q + h * 0.6, z + rr(-1.2, 1.2)));
    anchors.houseEaves.push(new THREE.Vector3(x0 - 1.4, Q + 2.7, z));
    // 廊棚
    for (const zz of [z - front / 2, z + front / 2]) cols.push(box(0.18, 2.8, 0.18, x0 - 1.6, Q + 1.4, zz));
    const shed = new THREE.BoxGeometry(2.8, 0.16, front + 1.2);
    shed.translate(x0 - 1.4, Q + 2.82, z);
    shedParts.push(shed);
    if (i % 3 === 1) {
      for (let k = 0; k < 3; k++) steps.push(box(2.4, 0.36, 0.66, x0 - 1.8 - k * 0.5, Q - 0.5 - k * 0.42, z + 1.4));
    }
    anchors.shopLamps.push(
      new THREE.Vector3(x0 - 1.1, Q + 2.4, z - front * 0.3),
      new THREE.Vector3(x0 - 1.1, Q + 2.4, z + front * 0.3),
    );
    if (i % 2 === 0) anchors.windowGlow.push(new THREE.Vector3(x0 + depth * 0.7, Q + h * 0.55, z + rr(-1, 1)));
  }
  g.add(meshOf(walls, M.wall, true));
  g.add(meshOf(roofs, M.roofGrey, true));
  g.add(meshOf(cols, M.woodDark, true));
  g.add(meshOf(shedParts, M.woodDark, true));
  const sm = meshOf(steps, M.stone, false);
  sm.receiveShadow = true;
  g.add(sm);

  // 石板街与街灯
  const street = mesh(box(4.4, 0.24, 116, x0 + 8.4, Q + 0.12, 4), M.stoneDark);
  street.receiveShadow = true;
  g.add(street);
  for (let z = -40; z <= 52; z += 9) {
    const x = x0 + 10.6;
    const pole = new THREE.CylinderGeometry(0.08, 0.13, 4.0, 6);
    pole.translate(x, Q + 2.0, z);
    g.add(mesh([pole, box(0.8, 0.1, 0.1, x - 0.4, Q + 3.95, z)], M.ink));
    anchors.streetLamps.push(new THREE.Vector3(x - 0.62, Q + 3.6, z));
  }

  // 市招：伸到廊外的布幌
  const names = ['酒', '茶', '船', '米', '布', '渔', '香', '灯'];
  for (let i = 0; i < names.length; i++) {
    const z = -40 + i * 12 + rr(-2, 2);
    if (Math.abs(z - 42) < 8) continue;
    const mat = new THREE.MeshBasicMaterial({
      map: T.banner(names[i]), transparent: true, side: THREE.DoubleSide, alphaTest: 0.42, fog: true,
    });
    mat.toneMapped = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.1), mat);
    m.position.set(x0 - 2.3, Q + 2.9, z);
    m.rotation.y = -Math.PI / 2 + rr(-0.14, 0.14);
    g.add(m);
    g.add(mesh(box(0.08, 0.08, 1.5, x0 - 1.6, Q + 3.95, z), M.woodDark));
    anchors.shopLamps.push(new THREE.Vector3(x0 - 2.0, Q + 3.9, z));
  }
  LAYOUT.town = { frontX: x0, streetX: x0 + 8.4 };
  return g;
}
const meshOf = (parts, mat, shadow) => {
  const m = mesh(parts, mat);
  if (shadow) m.castShadow = m.receiveShadow = true;
  return m;
};

/* ------------------------------------------------------------------ 埠头与临水楼 */
function riverside(anchors) {
  const g = new THREE.Group();
  // 御码头：寺前的大石埠，客船就泊在这里
  const cx = WALL_X + 3.6, cz = 20;
  const plat = mesh([
    box(6.4, 0.5, 14, cx, Q - 0.05, cz),
    box(7.4, 0.35, 15, cx, Q - 0.5, cz),
  ], M.stone);
  plat.receiveShadow = true;
  g.add(plat);
  const steps = [];
  for (let k = 0; k < 4; k++) {
    steps.push(box(3.8, 0.42, 0.8, cx - 3.0 - k * 0.66, Q - 0.55 - k * 0.44, cz + 3.4));
    steps.push(box(3.8, 0.42, 0.8, cx - 3.0 - k * 0.66, Q - 0.55 - k * 0.44, cz - 3.4));
  }
  const sm = mesh(steps, M.stone); sm.receiveShadow = true;
  g.add(sm);
  for (const dz of [-6.6, 6.6]) {
    const lx = cx - 3.4;
    const lan = mesh([
      box(0.5, 0.4, 0.5, lx, Q + 0.2, cz + dz),
      box(0.34, 2.2, 0.34, lx, Q + 1.5, cz + dz),
      new THREE.SphereGeometry(0.3, 10, 7).translate(lx, Q + 2.9, cz + dz),
      box(0.6, 0.3, 0.6, lx, Q + 3.25, cz + dz),
    ], M.stone);
    lan.castShadow = true;
    g.add(lan);
    anchors.ferryLamps.push(new THREE.Vector3(lx, Q + 3.1, cz + dz));
  }
  const rail = new THREE.Mesh(railingGeo(14, { height: 0.9, spacing: 1.7 }), M.stone);
  rail.rotation.y = Math.PI / 2;
  rail.position.set(cx + 3.0, Q + 0.2, cz);
  g.add(rail);
  LAYOUT.wharf = { x: cx, z: cz, deckY: Q + 0.2 };

  // 枫江楼：两层的临水楼阁，下游那一岸的对景
  const fj = hall({
    cx: WALL_X - 1.6, cz: -42, w: 9.0, d: 7.4, wallH: 3.6, name: '枫江楼',
    plaqueW: 3.4, twoStory: true, anchors,
  });
  g.add(fj.group);
  const pj = [];
  for (const dz of [-4.0, 0, 4.0]) pj.push(box(0.4, Q + 2.0, 0.4, -HW - 1.6, (Q + 2.0) / 2 - 1.0, -42 + dz));
  pj.push(box(3.2, 0.28, 9.6, -HW - 0.8, Q - 0.1, -42));
  const pjm = mesh(pj, M.woodDark);
  pjm.castShadow = true;
  g.add(pjm);
  const pr = new THREE.Mesh(railingGeo(9, { height: 0.85, spacing: 1.5 }), M.stone);
  pr.rotation.y = Math.PI / 2;
  pr.position.set(-HW - 2.2, Q, -42);
  g.add(pr);
  anchors.ferryLamps.push(new THREE.Vector3(-HW - 1.4, Q + 1.2, -38.5), new THREE.Vector3(-HW - 1.4, Q + 1.2, -45.5));
  return g;
}

/* ------------------------------------------------------------------ 装配 */
export function buildQuarter(scene) {
  const anchors = {
    gateLamps: [], bellLamps: [], hallLamps: [], hallWindows: [], courtLamps: [],
    pagodaLamps: [], pagodaTierLamps: [], steleLamps: [], wallLamps: [],
    bridgeLamps: [], archLamps: [], guanLamps: [], shopLamps: [], houseEaves: [],
    windowGlow: [], streetLamps: [], ferryLamps: [], moorings: [], stringEnds: [],
    pagodaTop: null,
  };
  const group = new THREE.Group();
  group.name = 'quarter';
  group.add(banks());
  group.add(quayFurniture(anchors));

  const fengqiao = stoneArchBridge({ z: 34, span: 12.6, rise: 5.9, half: 2.9, arch: 7.0, name: '枫桥' }, anchors);
  const jiangcun = stoneArchBridge({ z: -62, span: 10.4, rise: 4.2, half: 2.3, arch: 5.6, name: '江村桥', plaqueSize: [2.1, 0.76] }, anchors);
  group.add(fengqiao.group, jiangcun.group);

  group.add(templeWall(anchors));
  group.add(templeGate(anchors));
  const tower = bellTower(anchors);
  group.add(tower.group);

  const mainHall = hall({ cx: WALL_X - 24.0, cz: -3.0, w: 15, d: 11, wallH: 6.0, name: '大雄宝殿', plaqueW: 5.6, anchors });
  group.add(mainHall.group);
  const sutra = hall({ cx: WALL_X - 22.0, cz: 14.0, w: 11, d: 8.4, wallH: 4.2, name: '藏经楼', plaqueW: 4.0, twoStory: true, anchors });
  group.add(sutra.group);
  LAYOUT.hall = { cx: WALL_X - 24.0, cz: -3.0, w: 15, d: 11, floorY: mainHall.floorY, frontX: mainHall.frontX, ridgeY: mainHall.ridgeY };

  group.add(pagoda(anchors));
  group.add(steleCorridor(anchors));
  group.add(riverside(anchors));
  group.add(gatePass(anchors));
  group.add(townHouses(anchors));

  // 塔院与配殿的体量，把寺内的空地填住
  const court = [];
  for (let i = 0; i < 9; i++) {
    const x = WALL_X - rr(9, 24), z = rr(-30, 14);
    if (STATIONS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < 7)) continue;
    court.push(box(rr(3, 4.4), rr(2.8, 4.6), rr(3.4, 5.6), x, Q + 1.6, z));
  }
  const cm = mesh(court, M.wall);
  cm.castShadow = true;
  group.add(cm);

  scene.add(group);

  // 跨河灯串只留两道，夜里是河上仅有的横线
  anchors.stringEnds.push(
    [new THREE.Vector3(-HW - 2.4, Q + 3.6, 12), new THREE.Vector3(HW + 2.4, Q + 4.0, 18)],
    [new THREE.Vector3(-HW - 2.4, Q + 3.4, -30), new THREE.Vector3(HW + 2.8, Q + 3.8, -24)],
  );
  return {
    group, anchors,
    bell: tower,
    bridges: [fengqiao, jiangcun],
    fengqiao, jiangcun,
  };
}
