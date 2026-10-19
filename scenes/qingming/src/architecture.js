/**
 * 清名桥与一桥两岸。几何按 data.js 的实尺常量生成，同材质几何一律合并成少量 mesh，
 * 因为整个 quarter 会被 Reflections 克隆一份做水面倒影。
 */
import * as THREE from 'three';
import {
  M, PAL, lit, glow, box, mesh, rand, rr, chineseRoof, ridgeOrnament, railingGeo,
  plaqueMesh, pillarGeo, registerOccluder,
} from './kit.js';
import * as T from './textures.js';
import { RIVER, BRIDGE, BANK, LANDING, deckY, soffitY } from './data.js';

const Q = RIVER.quayY;
const HW = RIVER.halfWidth;
const BASE = -3.6;
const HALF = BRIDGE.length / 2;
const SPAN = BRIDGE.archR;
const CORRIDOR = 11.2;

/** 横巷位置：西岸（南长街）与东岸（南下塘）的巷口 z */
const ALLEY_W = [-70, 26, 96];
const ALLEY_E = [24, -22, 74];
/** 河埠头位置 */
const WHARF_W = [-96, -52, -18, 34, 62, 108, 142];
const WHARF_E = [-84, -40, 6, 44, 88, 128];

export const QM = { anchors: null };

const rep = (map, u, v) => {
  const m = map.clone();
  m.repeat.set(u, v);
  m.needsUpdate = true;
  return m;
};

const winMats = [];
function win(i = 0) {
  if (!winMats[i]) {
    const tint = ['0xf3c98d', '0xffdca6', '0xe08a4c', '0xbfd8e8'][i];
    const m = new THREE.MeshBasicMaterial({
      map: T.lattice(i % 2 ? 6 : 5, i % 3 ? 3 : 4), color: tint, side: THREE.DoubleSide,
    });
    m.toneMapped = false;
    winMats[i] = m;
  }
  return winMats[i];
}

export function initQMMaterials() {
  // 花岗岩桥身：贴图 repeat 必须克隆后再改，memo() 会把同一张图给到其他材质
  M.granite = lit('#8e95a3', { map: rep(T.stone('#98a0ae'), 0.14, 0.14), rough: 0.84 });
  M.graniteDark = lit('#78808f', { map: rep(T.stone('#4f5765'), 0.12, 0.12), rough: 0.9 });
  M.canalWall = lit('#5c6474', { map: rep(T.stone('#414857'), 0.06, 0.12), rough: 0.95 });
  M.paving = lit('#9aa1ae', { map: rep(T.stone('#787f8c'), 0.3, 0.3), rough: 0.92 });
  M.tileCap = lit('#b9c2d2', { map: rep(T.roofTiles('#2f3849', '#4a5468', '#76839c'), 0.5, 0.2), rough: 0.8, side: THREE.DoubleSide });
  // 月光下的白石栏最容易过曝，压暗成湿花岗岩的灰
  M.stoneDressed.color.set('#7f8794');
  M.stone.color.set('#7d8492');
}

/* 一条 push 顺手把变换烘进几何，方便按材质合并 */
function put(arr, geo, x = 0, y = 0, z = 0, rotY = 0, rotZ = 0) {
  if (rotZ) geo.rotateZ(rotZ);
  if (rotY) geo.rotateY(rotY);
  geo.translate(x, y, z);
  arr.push(geo);
  return geo;
}

/* ------------------------------------------------------------------ 桥 */

function bridgeShape() {
  const s = new THREE.Shape();
  s.moveTo(-HALF, BASE);
  s.lineTo(-HALF, BRIDGE.endY);
  // 西坡台阶：从桥头走到拱肩前
  const x0 = 9.2;
  const n = 17;
  const tread = (HALF - x0) / n;
  const rise = (deckY(x0) - BRIDGE.endY) / n;
  for (let k = 0; k < n; k++) {
    const y = BRIDGE.endY + (k + 1) * rise;
    s.lineTo(-HALF + (k + 1) * tread, y);
    s.lineTo(-HALF + (k + 1) * tread, y + 0.001);
    if (k === n - 1) s.lineTo(-x0, y);
  }
  s.lineTo(-x0, deckY(-x0));
  // 拱肩以上的平滑弧形桥面
  for (let x = -x0; x <= x0 + 0.001; x += 0.6) s.lineTo(x, deckY(x));
  // 东坡台阶（下行）
  for (let k = n - 1; k >= 0; k--) {
    const y = BRIDGE.endY + (k + 1) * rise;
    s.lineTo(HALF - k * tread, y);
    s.lineTo(HALF - k * tread, BRIDGE.endY + k * rise);
  }
  s.lineTo(HALF, BRIDGE.endY);
  s.lineTo(HALF, BASE);
  s.lineTo(SPAN, BASE);
  s.lineTo(SPAN, BRIDGE.springerY);
  s.absarc(0, BRIDGE.springerY, SPAN, 0, Math.PI, false);
  s.lineTo(-SPAN, BASE);
  s.closePath();
  return s;
}

function archFaceGeo() {
  // 券脸：比拱腹外凸一点的半圆环带，两 Facing 都有
  const outer = SPAN + 0.2, inner = SPAN - 0.06;
  const s = new THREE.Shape();
  s.moveTo(inner, BRIDGE.springerY);
  s.absarc(0, BRIDGE.springerY, inner, 0, Math.PI, false);
  s.lineTo(-outer, BRIDGE.springerY);
  s.absarc(0, BRIDGE.springerY, outer, Math.PI, 0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: BRIDGE.width + 0.34, bevelEnabled: false, curveSegments: 30 });
  g.translate(0, 0, -(BRIDGE.width + 0.34) / 2);
  return g;
}

function buildBridge(group, A) {
  const body = new THREE.ExtrudeGeometry(bridgeShape(), {
    depth: BRIDGE.width, bevelEnabled: false, curveSegments: 26,
  });
  body.translate(0, 0, -BRIDGE.width / 2);
  const bm = new THREE.Mesh(body, M.granite);
  bm.castShadow = bm.receiveShadow = true;
  group.add(bm);

  const face = mesh(archFaceGeo(), M.graniteDark);
  face.castShadow = true;
  group.add(face);

  // 拱洞里的一盏暖光：把整孔券顶染黄，灯船穿出来才有背光
  const archLight = new THREE.PointLight(0xffb066, 150, 30, 1.7);
  archLight.position.set(0, BRIDGE.springerY + SPAN * 0.62, 0);
  group.add(archLight);

  // 两侧栏板：沿桥面斜率分段贴过去
  for (const zz of [-1, 1]) {
    const parts = [];
    let px = null;
    for (let x = -HALF + 0.5; x < HALF - 0.4; x += 1.45) {
      const y = deckY(x + 0.72);
      const slope = (deckY(x + 1.5) - deckY(x)) / 1.5;
      const len = Math.hypot(1.5, slope * 1.5) * 0.94;
      const g = railingGeo(len, { height: 0.76, spacing: len / 1.5 });
      g.rotateZ(Math.atan(slope));
      g.translate(x + 0.75, y, zz * (BRIDGE.width / 2 - 0.14));
      parts.push(g);
      if (px !== null && Math.abs(x - px) > 6.6) {
        put(parts, box(0.26, 1.06, 0.26, x + 0.75, y + 0.53, zz * (BRIDGE.width / 2 - 0.14)));
        px = x;
      }
      if (px === null) px = x;
    }
    const rm = mesh(parts, M.stoneDressed);
    rm.castShadow = true;
    group.add(rm);
  }

  // 桥额与拟联：石额压在券顶，联语挂在金刚墙面上（文字为拟作）
  for (const zz of [-1, 1]) {
    const pl = plaqueMesh('清名桥', 2.1, 0.62, { dir: 'h', bg: '#20303c', fg: '#e7dcc2', border: '#8f9aa6' });
    pl.position.set(0, BRIDGE.crownY - 0.46, zz * (BRIDGE.width / 2 + 0.2));
    if (zz < 0) pl.rotation.y = Math.PI;
    group.add(pl);
  }
  const couplet = [['一虹收尽千家火', 1], ['双岸分开万里船', -1]];
  for (const [text, sgn] of couplet) {
    const pl = plaqueMesh(text, 0.62, 3.1, { dir: 'v', bg: '#1d2b36', fg: '#ded3ba', border: '#7f8a96' });
    pl.position.set(sgn * (SPAN + 2.2), 4.1, BRIDGE.width / 2 + 0.22);
    group.add(pl);
  }

  // 券腹灯：把整个圆孔内壁染暖，是"灯船穿桥"的光源
  for (let i = -3; i <= 3; i++) {
    const x = (i / 3) * (SPAN - 1.1);
    const y = soffitY(x) - 0.42;
    A.archLamps.push(new THREE.Vector3(x, y, 0));
    const bulb = mesh(new THREE.SphereGeometry(0.13, 8, 6), glow(PAL.lanternWarm, 2.4));
    bulb.position.set(x, y, 0);
    group.add(bulb);
  }
  // 桥头石灯与拱顶两盏
  for (const sgn of [-1, 1]) {
    for (const zz of [-1, 1]) {
      A.bridgeLamps.push(new THREE.Vector3(sgn * (HALF - 1.2), deckY(sgn * (HALF - 1.2)) + 1.5, zz * (BRIDGE.width / 2 - 0.4)));
      A.bridgeLamps.push(new THREE.Vector3(sgn * 9.4, deckY(sgn * 9.4) + 1.55, zz * (BRIDGE.width / 2 - 0.4)));
    }
  }
  const lanterns = [];
  for (const p of A.bridgeLamps) {
    put(lanterns, pillarGeo(1.5, 0.09, true), p.x, deckY(p.x), p.z);
  }
  group.add(mesh(lanterns, M.beam));
}

/* ------------------------------------------------------------------ 岸线 */

function buildCanalWalls(group, A) {
  for (const sgn of [-1, 1]) {
    const walls = [];
    put(walls, box(1.4, Q - BASE, RIVER.length, sgn * (HW + 0.7), (Q + BASE) / 2, 0));
    const wmesh = mesh(walls, M.canalWall);
    wmesh.receiveShadow = true;
    group.add(wmesh);

    const caps = [], rails = [], bolts = [];
    const wharves = sgn < 0 ? WHARF_W : WHARF_E;
    let z = -RIVER.length / 2 + 4;
    while (z < RIVER.length / 2 - 6) {
      const seg = 5.4;
      const open = wharves.some((wz) => Math.abs(z + seg / 2 - wz) < 2.6);
      if (!open) {
        put(caps, box(2.6, 0.26, seg, sgn * (HW + 0.6), Q + 0.13, z + seg / 2));
        const g = railingGeo(seg - 0.5, { height: 0.9, spacing: 1.35 });
        g.translate(sgn * (HW + 0.45), Q + 0.26, z + seg / 2);
        rails.push(g);
        if (rand() > 0.55) put(bolts, pillarGeo(0.62, 0.14, true), sgn * (HW + 1.05), Q + 0.26, z + seg / 2);
      }
      z += seg;
    }
    const cm = mesh(caps, M.stoneDressed);
    cm.receiveShadow = true;
    const rm = mesh(rails, M.stoneDressed);
    rm.castShadow = true;
    group.add(cm, rm, mesh(bolts, M.stoneDark));

    // 河埠头：一级级湿石头下到水面
    for (const wz of wharves) {
      const steps = [];
      const n = 5;
      for (let i = 0; i < n; i++) {
        put(steps, box(0.62, 0.42, 2.5, sgn * (HW + 2.0 - i * 0.55), Q - i * 0.42 + 0.21, wz));
      }
      put(steps, box(1.1, 0.24, 3.4, sgn * (HW + 2.3), Q + 0.12, wz));
      const sm = mesh(steps, M.paving);
      sm.receiveShadow = true;
      group.add(sm);
      A.quayLamps.push(new THREE.Vector3(sgn * (HW + 2.4), Q + 2.5, wz + 2.0));
    }

    // 探出水面的临水灯：石栏外侧挑出一盏，光柱真的落在河里
    const brackets = [];
    for (let wz = -146; wz < 146; wz += 7.6) {
      if (Math.abs(wz) < CORRIDOR + 2) continue;
      const x = sgn * (HW - 0.75);
      A.waterLamps.push(new THREE.Vector3(x, Q + 1.55, wz));
      put(brackets, box(0.09, 0.09, 1.5, sgn * (HW - 0.15), Q + 1.1, wz));
      put(brackets, box(0.1, 0.62, 0.1, x, Q + 1.25, wz));
    }
    group.add(mesh(brackets, M.beam));
  }
}

function buildLampPosts(group, A) {
  for (const sgn of [-1, 1]) {
    const bank = sgn < 0 ? BANK.west : BANK.east;
    const wharves = sgn < 0 ? WHARF_W : WHARF_E;
    for (let z = -150; z <= 150; z += 15.5) {
      if (Math.abs(z) < CORRIDOR) continue;
      // 河埠头正前方不立灯柱，站在石阶上望桥才不会被灯罩糊住
      if (wharves.some((wz) => Math.abs(z - wz) < 8)) continue;
      const x = bank.rail + sgn * 0.35;
      A.lampPosts.push(new THREE.Vector3(x, Q + 4.05, z));
      const parts = [pillarGeo(4.0, 0.11, true)];
      put(parts, box(0.16, 0.16, 1.7, 0, 3.85, 0));
      const m = mesh(parts, M.beam);
      m.position.set(x, Q, z);
      m.castShadow = true;
      group.add(m);
    }
  }
}

/* ------------------------------------------------------------------ 房屋 */

/**
 * 一排枕河房。face 是临水那面的墙皮 x，inner 是背河（临街）那面。
 * sgn 指向内陆，所以"朝河"永远是 -sgn。河沿一面是人家后门（窗、美人靠、门灯），
 * 另一面开门面街。
 */
function houseRow(group, A, sgn, { from, to, face, inner, kind }) {
  const tw = -sgn;
  const depth = Math.abs(inner - face);
  const cx = (face + inner) / 2;
  const fx = face + tw * 0.09;
  const sx = inner + sgn * 0.09;
  const walls = [], roofs = [], timb = [], dark = [], stone = [];
  const winGeo = [[], [], [], []];
  const zStep = 0.9;
  let z = from;
  while (z < to) {
    const w = rr(6.6, 9.4);
    const zc = z + w / 2;
    // 整间屋子的开间都要让开桥的走廊与横巷，不然山墙会插进巷道口
    if (Math.abs(zc) < CORRIDOR + w / 2) { z += w + zStep; continue; }
    // 东岸御码头那一段退让，埠头与亭子才有地方落
    if (sgn > 0 && zc > LANDING.z - LANDING.length / 2 - 2 && zc < LANDING.z + LANDING.length / 2 + 2) { z += w + zStep; continue; }
    const alleys = sgn < 0 ? ALLEY_W : ALLEY_E;
    if (alleys.some((az) => Math.abs(zc - az) < (w + 4.6) / 2)) { z += w + zStep; continue; }
    const type = kind === 'mix' ? (rand() > 0.55 ? 'wall' : 'house') : kind;
    const h1 = rr(3.0, 3.5), h2 = rr(2.8, 3.2);

    if (type === 'wall') {
      // 围墙夹着宅门：墙头压黛瓦，墙上开漏窗
      const hh = rr(3.1, 4.0);
      put(walls, box(depth * 0.24, hh, w, face + sgn * depth * 0.12, Q + hh / 2, zc));
      put(roofs, box(depth * 0.42, 0.26, w + 0.4, face + sgn * depth * 0.12, Q + hh + 0.2, zc));
      for (let zz = zc - w * 0.3; zz < zc + w * 0.3; zz += rr(4.2, 6.0)) {
        if (rand() > 0.45) {
          put(winGeo[rand() > 0.5 ? 2 : 0], box(0.08, 0.9, 0.9, face + tw * 0.07, Q + hh * 0.62, zz));
          A.eaves.push(new THREE.Vector3(face + tw * 0.8, Q + hh * 0.7, zz));
        }
      }
      if (rand() > 0.55) {
        const dz = zc + rr(-w * 0.2, w * 0.2);
        put(stone, box(0.34, 2.7, 1.7, face + tw * 0.14, Q + 1.35, dz));
        put(dark, box(0.12, 2.1, 1.15, face + tw * 0.26, Q + 1.05, dz));
        A.eaves.push(new THREE.Vector3(face + tw * 1.0, Q + 2.9, dz));
      }
      z += w + zStep;
      continue;
    }

    // 主体：一层 + 二层（二层向河挑出半尺，是枕河人家的通病）
    const storey = rand() > 0.3 ? 2 : 1;
    put(walls, box(depth, h1, w, cx, Q + h1 / 2, zc));
    put(stone, box(depth + 0.3, 0.55, w + 0.24, cx, Q + 0.27, zc));
    if (storey === 2) {
      const jut = tw * 0.55;
      put(walls, box(depth, h2, w * 0.94, cx + jut, Q + h1 + h2 / 2, zc));
      put(timb, box(0.22, h2, w * 0.94, fx + jut, Q + h1 + h2 / 2, zc));
      // 挑楼下的撑木
      if (rand() > 0.5) for (const dz of [-w * 0.3, w * 0.3]) {
        put(timb, box(0.16, h1 * 0.8, 0.16, fx + tw * 0.5, Q + h1 * 0.4, zc + dz));
      }
    }
    const topY = Q + h1 + (storey === 2 ? h2 : 0);
    // 屋顶：脊与河平行，所以把 chineseRoof 转 90°
    const roofW = w + rr(1.0, 1.6), roofD = depth + rr(1.2, 1.9);
    const rh = rr(1.5, 2.2);
    const rg = chineseRoof({ width: roofD, depth: roofW, height: rh, ridgeRatio: 0.5, overhang: 0.45, segU: 16, segV: 12 });
    rg.rotateY(Math.PI / 2);
    rg.translate(cx, topY, zc);
    roofs.push(rg);
    if (rand() > 0.78) {
      const orn = ridgeOrnament({ width: roofD, depth: roofW, height: rh, ridgeRatio: 0.5, overhang: 0.45 });
      orn.rotateY(Math.PI / 2);
      orn.translate(cx, topY, zc);
      roofs.push(orn);
    }

    // 临水一面：窗、门、美人靠
    const nWin = Math.max(1, Math.round(w / 3.4));
    for (let i = 0; i < nWin; i++) {
      const zz = zc - w / 2 + (i + 0.5) * (w / nWin);
      const yb = Q + h1 * 0.55;
      if (rand() > 0.42) put(winGeo[i % 3 === 1 ? 1 : 0], box(0.1, 1.15, 0.95, fx, yb, zz));
      else put(dark, box(0.1, 1.15, 0.95, fx + tw * 0.04, yb, zz));
      if (storey === 2) {
        const y2 = Q + h1 + h2 * 0.5;
        if (rand() > 0.3) put(winGeo[rand() > 0.6 ? 3 : 0], box(0.1, 1.05, 1.0, fx, y2, zz));
        else put(dark, box(0.1, 1.05, 1.0, fx + tw * 0.04, y2, zz));
        if (rand() > 0.5) {
          put(timb, box(0.55, 0.1, 1.6, fx + tw * 0.45, Q + h1 + 0.55, zz));
          put(timb, box(0.08, 0.5, 1.6, fx + tw * 0.72, Q + h1 + 0.85, zz));
        }
      }
      A.windows.push(new THREE.Vector3(fx + tw * 0.45, yb, zz));
    }
    // 后门与门灯
    if (rand() > 0.35) {
      const dz = zc + rr(-w * 0.25, w * 0.25);
      put(dark, box(0.16, 2.1, 1.1, fx, Q + 1.05, dz));
      put(timb, box(0.34, 0.16, 1.5, fx + tw * 0.25, Q + 2.25, dz));
      A.eaves.push(new THREE.Vector3(fx + tw * 0.6, Q + 2.1, dz));
    }
    // 檐下一排灯位
    for (let i = 0; i < 2; i++) {
      A.eaves.push(new THREE.Vector3(fx + tw * 0.75, topY - 0.4, zc - w * 0.25 + i * w * 0.5));
    }
    A.stringEnds.push([
      new THREE.Vector3(fx + tw * 0.5, topY + 0.4, z),
      new THREE.Vector3(fx + tw * 0.5, topY + 0.4, z + w),
    ]);

    // 门面街那一侧
    put(winGeo[0], box(0.1, 1.3, 1.2, sx, Q + 1.1, zc));
    if (rand() > 0.5) put(timb, box(0.1, 1.9, 0.6, sx + sgn * 0.08, Q + 1.4, zc + w * 0.26));
    A.streetLamps.push(new THREE.Vector3(sx + sgn * 0.65, Q + 2.5, zc));
    z += w + zStep;
  }
  const wallMesh = mesh(walls, M.wall);
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  const roofMesh = mesh(roofs, M.roof);
  roofMesh.castShadow = true;
  const timbMesh = mesh(timb, M.beam);
  const darkMesh = mesh(dark, M.dark);
  const stoneMesh = mesh(stone, M.stoneDressed);
  group.add(wallMesh, roofMesh, timbMesh, darkMesh, stoneMesh);
  winGeo.forEach((g, i) => {
    if (!g.length) return;
    const m = mesh(g, win(i));
    group.add(m);
  });
}

/** 横巷：两口粉墙夹一条青石板，尽头一盏巷灯 */
function buildAlley(group, A, sgn, z, { depth, width = 3.2 }) {
  const faceX = sgn < 0 ? BANK.west.face : BANK.east.face;
  const inner = sgn < 0 ? BANK.west.sign : BANK.east.sign;
  const x0 = Math.min(faceX, inner) - 1, x1 = Math.max(faceX, inner) + 1;
  const len = x1 - x0;
  const parts = [], walls = [], winGeo = [];
  put(parts, box(len, 0.14, width, (x0 + x1) / 2, Q + 0.07, z));
  for (const s of [-1, 1]) {
    put(walls, box(len, 3.5, 0.35, (x0 + x1) / 2, Q + 1.75, z + s * (width / 2 + 0.18)));
    put(walls, box(len, 0.24, 0.9, (x0 + x1) / 2, Q + 3.62, z + s * (width / 2 + 0.18)));
  }
  const wm = mesh(walls, M.wall);
  wm.castShadow = wm.receiveShadow = true;
  const fm = mesh(parts, M.paving);
  fm.receiveShadow = true;
  group.add(wm, fm);
  // 巷口门洞与尽头灯
  const mouth = sgn < 0 ? faceX + 0.2 : faceX - 0.2;
  for (const s of [-1, 1]) put(walls, box(0.5, 4.0, 0.6, mouth, Q + 2.0, z + s * (width / 2 + 0.1)));
  group.add(mesh(walls, M.stoneDressed));
  const farX = sgn < 0 ? x0 + 1.4 : x1 - 1.4;
  // 巷子里的漏窗与台阶：粉墙不能一整面都是空的
  const detail = [];
  for (const s of [-1, 1]) {
    const wz = z + s * (width / 2 + 0.02);
    for (let k = 0; k < 3; k++) {
      const wx = x0 + (len * (k + 0.6)) / 3.4;
      if (rand() > 0.42) put(winGeo, box(0.08, 0.86, 0.86, wx, Q + 2.1, wz - s * 0.06));
      if (rand() > 0.7) put(detail, box(0.5, 0.16, 1.1, wx + 1.4, Q + 0.08, wz - s * 0.75));
    }
  }
  put(detail, box(1.1, 0.16, width + 0.6, mouth - sgn * 0.7, Q - 0.08, z));
  group.add(mesh(detail, M.stoneDressed));
  A.gate.push(new THREE.Vector3(mouth - sgn * 0.4, Q + 3.1, z));
  if (winGeo.length) group.add(mesh(winGeo, win(1)));
  A.alleyLamps.push(new THREE.Vector3(farX, Q + 2.9, z));
  const lamp = mesh(new THREE.SphereGeometry(0.19, 8, 6), glow(PAL.lanternWarm, 2.0));
  lamp.position.set(farX, Q + 2.9, z);
  group.add(lamp);
  // 巷内挑出的檐灯
  A.eaves.push(new THREE.Vector3(mouth - sgn * 1.6, Q + 3.3, z));
}

/** 主街外侧的远排屋，给鸟瞰一层压一层的屋脊 */
function buildBackRows(group) {
  const rows = [], roofs = [];
  for (const sgn of [-1, 1]) {
    const base = sgn < 0 ? BANK.west.sign : BANK.east.sign;
    for (let k = 0; k < 4; k++) {
      const x = base + sgn * (5.5 + k * 7.4);
      for (let z = -150; z < 150; z += rr(7, 11)) {
        if (Math.abs(z) < CORRIDOR + 4) continue;
        const w = rr(6, 10), h = rr(3.4, 6.4 + k);
        put(rows, box(6.4, h, w, x, Q + h / 2, z + w / 2));
        const rg = chineseRoof({ width: 6.4, depth: w + 1.2, height: rr(1.2, 1.9), ridgeRatio: 0.46, overhang: 0.4, segU: 12, segV: 8 });
        rg.rotateY(Math.PI / 2);
        rg.translate(x, Q + h, z + w / 2);
        roofs.push(rg);
      }
    }
  }
  const m = mesh(rows, M.ink);
  m.receiveShadow = true;
  const r = mesh(roofs, M.roofGreen);
  group.add(m, r);
}

/** 远处天际线：一圈压着的屋脊与一笔写意的塔影，不指实某座古塔 */
function buildFarSkyline(group) {
  const parts = [];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const bump = Math.abs(Math.sin(a * 2.3 + 0.7)) * 9 + Math.abs(Math.sin(a * 6.1)) * 4 + Math.abs(Math.sin(a * 13.7)) * 2.4;
    const R = 250 + Math.sin(a * 3.1) * 22;
    const h = 7 + bump;
    const g = box(22, h, 16, 0, h / 2 - 1.5, 0);
    g.rotateY(-a + Math.PI / 2);
    g.translate(Math.cos(a) * R, 0, Math.sin(a) * R);
    parts.push(g);
  }
  const m = mesh(parts, M.dark);
  group.add(m);
  // 塔影立在西南远处
  const tower = [];
  for (let k = 0; k < 7; k++) {
    const w = 6.6 - k * 0.72, h = 4.1;
    put(tower, box(w, h, w, -186, 8 + k * h, -210));
    const rg = chineseRoof({ width: w + 1.5, depth: w + 1.5, height: 1.1, ridgeRatio: 0.3, hip: true, overhang: 0.3, segU: 10, segV: 6 });
    rg.translate(-186, 8 + (k + 1) * h, -210);
    tower.push(rg);
  }
  put(tower, box(0.5, 3.2, 0.5, -186, 8 + 7 * 4.1 + 1.6, -210));
  const tm = mesh(tower, M.ink);
  group.add(tm);
}

/* ------------------------------------------------------------------ 御码头 */

function buildLanding(group, A) {
  const { z, x, length } = LANDING;
  const stone = [], timb = [], roofs = [];
  put(stone, box(4.6, 0.4, length, x + 1.6, Q - 0.1, z));
  for (let i = 0; i < 5; i++) {
    put(stone, box(0.6, 0.4, 4.2, x + 3.6 - i * 0.55, Q - 0.2 - i * 0.42, z + 5.4));
    put(stone, box(0.6, 0.4, 4.2, x + 3.6 - i * 0.55, Q - 0.2 - i * 0.42, z - 5.4));
  }
  for (const s of [-1, 1]) put(stone, box(0.24, 0.9, length, x + 3.8, Q + 0.5, z + s * (length / 2 - 0.2)));
  const sm = mesh(stone, M.paving);
  sm.receiveShadow = sm.castShadow = true;
  group.add(sm);

  // 亭：四柱 + 攒尖-ish 屋顶，船客等灯的地方
  const px = x + 0.6, pz = z;
  for (const dx of [-1.9, 1.9]) for (const dz of [-1.9, 1.9]) {
    put(timb, pillarGeo(3.4, 0.13, true), px + dx, Q + 0.2, pz + dz);
  }
  put(timb, box(4.6, 0.22, 4.6, px, Q + 3.55, pz));
  const rg = chineseRoof({ width: 5.6, depth: 5.6, height: 2.0, ridgeRatio: 0.16, overhang: 0.6, segU: 18, segV: 14 });
  rg.translate(px, Q + 3.7, pz);
  roofs.push(rg);
  put(roofs, box(0.34, 0.9, 0.34, px, Q + 5.9, pz));
  const tm = mesh(timb, M.pillar);
  tm.castShadow = true;
  const rm = mesh(roofs, M.roof);
  rm.castShadow = true;
  group.add(tm, rm);

  // 灯杆：埠头四角各一，船上客看得见的暖光
  for (const dz of [-length / 2 + 2, length / 2 - 2]) {
    A.ferryLamps.push(new THREE.Vector3(x + 3.4, Q + 4.2, z + dz));
    A.moorLamps.push(new THREE.Vector3(x + 4.6, Q + 1.4, z + dz * 0.6));
    const pole = mesh([pillarGeo(4.2, 0.1, true)], M.beam);
    pole.position.set(x + 3.4, Q, z + dz);
    group.add(pole);
  }
  const plaque = plaqueMesh('御码头', 1.5, 0.56, { dir: 'h', bg: '#2a1b16', fg: '#f0dcb4', border: '#a2793f' });
  plaque.position.set(x - 1.1, Q + 3.0, z - length / 2 + 1.2);
  plaque.rotation.y = Math.PI / 2;
  group.add(plaque);
  registerOccluder(plaque, 2.4);
}

/* ------------------------------------------------------------------ 石牌坊 */

function buildPaifang(group, A) {
  const x = BANK.west.street, z = -40;
  const stone = [], beams = [];
  for (const s of [-1, 1]) {
    put(stone, box(0.62, 6.6, 0.62, x + s * 3.1, Q + 3.3, z));
    put(stone, box(1.5, 0.5, 1.5, x + s * 3.1, Q + 0.25, z));
    put(beams, chineseRoof({ width: 2.2, depth: 1.2, height: 0.7, ridgeRatio: 0.3, overhang: 0.4, segU: 12, segV: 8 }), );
    beams[beams.length - 1].translate(x + s * 3.1, Q + 6.7, z);
  }
  put(stone, box(7.4, 0.7, 0.9, x, Q + 5.7, z));
  put(stone, box(6.0, 0.5, 0.7, x, Q + 4.9, z));
  const sm = mesh(stone, M.stoneDressed);
  sm.castShadow = true;
  const bm = mesh(beams, M.roof);
  group.add(sm, bm);
  const plaque = plaqueMesh('水弄堂', 2.6, 0.9, { dir: 'h', bg: '#152430', fg: '#ecd9ae', border: '#9c7a44' });
  plaque.position.set(x, Q + 5.35, z + 0.5);
  plaque.rotation.y = Math.PI;
  group.add(plaque);
  A.paifangLamps = [
    new THREE.Vector3(x - 2.6, Q + 6.2, z),
    new THREE.Vector3(x + 2.6, Q + 6.2, z),
  ];
  registerOccluder(sm, 3.4, new THREE.Vector3(x, Q + 3, z));
}

/* ------------------------------------------------------------------ assembly */

export function buildQuarter(scene) {
  const group = new THREE.Group();
  group.name = 'quarter';
  scene.add(group);
  const A = {
    lampPosts: [], eaves: [], windows: [], bridgeLamps: [], archLamps: [], quayLamps: [],
    alleyLamps: [], streetLamps: [], ferryLamps: [], moorLamps: [], stringEnds: [], gate: [],
    waterLamps: [],
  };

  buildCanalWalls(group, A);
  buildBridge(group, A);
  buildLampPosts(group, A);

  // 西岸：河沿人家 + 街西铺面；东岸：河沿人家与围墙宅第相间
  houseRow(group, A, -1, { from: -152, to: 152, face: BANK.west.face, inner: BANK.west.alley, kind: 'house' });
  houseRow(group, A, -1, { from: -152, to: 152, face: BANK.west.sign, inner: BANK.west.sign - 6.6, kind: 'house' });
  houseRow(group, A, 1, { from: -152, to: 152, face: BANK.east.face, inner: BANK.east.alley, kind: 'mix' });
  houseRow(group, A, 1, { from: -152, to: 152, face: BANK.east.sign, inner: BANK.east.sign + 6.4, kind: 'house' });

  for (const z of ALLEY_W) buildAlley(group, A, -1, z, { });
  for (const z of ALLEY_E) buildAlley(group, A, 1, z, { });
  buildPaifang(group, A);
  buildLanding(group, A);
  buildBackRows(group);
  buildFarSkyline(group);

  QM.anchors = A;
  return { group, anchors: A };
}
