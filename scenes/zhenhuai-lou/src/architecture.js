import * as THREE from 'three';
import {
  M, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, bracketGeo, plaqueMesh,
  box, mesh, rand, rr, drumGeo, drumHeadGeo,
} from './kit.js';
import { CANAL, TOWER, STATIONS } from './data.js';
import * as T from './textures.js';

const Q = CANAL.deckY;              // 岸顶（河街与楼前街同一高程）
const HW = CANAL.halfWidth;         // 文渠水面半宽
const TW = TOWER;

/** 城台的几个控制面，机位、穿越门与鼓都从这里回读，改形制只改 data.js 的 TOWER */
const S_OUT = TW.cx - (TW.baseDepth / 2 + TW.batter);   // 台底南面
const N_OUT = TW.cx + (TW.baseDepth / 2 + TW.batter);   // 台底北面
const S_TOP = TW.cx - TW.baseDepth / 2;                  // 台顶南沿
const N_TOP = TW.cx + TW.baseDepth / 2;                  // 台顶北沿
const HALF_L = TW.baseLen / 2;
const TOP_Y = Q + TW.baseH;                              // 台顶
const F1_Y = TOP_Y + TW.plinth;                          // 一层地
const F2_Y = F1_Y + TW.wall1 + 0.3;                      // 二层平座地
const RIDGE_Y = F2_Y + TW.wall2 + TW.roofH;              // 上屋脊

/** 建筑实体的位置，供穿越门、热点与鼓声回读 */
export const LAYOUT = {};

const withShadow = (parts, mat, shadow = true) => {
  const m = mesh(Array.isArray(parts) ? parts : [parts], mat);
  if (shadow) m.castShadow = m.receiveShadow = true;
  return m;
};

/* ------------------------------------------------------------------ 渠岸 */
/** 文渠：砌石驳岸，北岸是楼前街，南岸是河房与南门大街 */
function banks() {
  const stone = [], ground = [];
  for (const s of [-1, 1]) {
    const inner = HW * s;
    const wall = new THREE.BoxGeometry(2.0, Q + 2.8, CANAL.length);
    wall.translate(inner + s * 1.0, (Q + 2.8) / 2 - 2.4, 0);
    stone.push(wall);
    const cop = new THREE.BoxGeometry(0.8, 0.34, CANAL.length);
    cop.translate(inner + s * 1.9, Q + 0.17, 0);
    stone.push(cop);
    // 北岸留出楼前街的宽度，南岸压给河房与大街
    const width = s > 0 ? 34 : 40;
    const g = new THREE.BoxGeometry(width, 0.7, CANAL.length + 60);
    g.translate(inner + s * (width / 2 + 1.4), Q - 0.35, 0);
    ground.push(g);
  }
  const g = new THREE.Group();
  g.add(withShadow(ground, M.stoneDark), withShadow(stone, M.stone));
  return g;
}

/** 石级河埠、缆桩与系船石 */
function quayFurniture(anchors) {
  const g = new THREE.Group();
  const steps = [], bollards = [];
  for (const s of [-1, 1]) {
    for (let z = -66; z <= 66; z += 15) {
      const k0 = s < 0 ? 4 : 3;
      for (let k = 0; k < k0; k++) {
        steps.push(box(2.8, 0.44, 0.7, s * (HW + 0.3 - k * 0.6), Q - 0.5 - k * 0.5, z));
      }
      const b = new THREE.CylinderGeometry(0.2, 0.28, 0.95, 8);
      b.translate(s * (HW + 2.5), Q + 0.48, z + 5.4);
      bollards.push(b);
      anchors.moorings.push(new THREE.Vector3(s * (HW + 1.2), Q - 1.0, z));
    }
  }
  g.add(withShadow(steps, M.stone), withShadow(bollards, M.stoneDark));

  // 楼前那一段临渠石栏：中间让给三思桥，只在上下游各续一段
  for (const [x, z0, z1] of [[-HW - 3.0, -70, -22], [-HW - 3.0, 22, 70],
    [HW + 3.0, -70, -22], [HW + 3.0, 22, 70]]) {
    const rail = new THREE.Mesh(railingGeo(z1 - z0, { height: 0.86, spacing: 1.7 }), M.stone);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(x, Q, (z0 + z1) / 2);
    g.add(rail);
  }
  return g;
}

/* ------------------------------------------------------------------ 三思桥 */
/**
 * 单孔石拱桥。渠面宽十七米，半圆碹会顶穿桥面，所以用椭圆弧的浅碹——
 * 江淮的桥洞多是这个样子。
 */
function stoneArchBridge({ z, span, rise, half, archRx, archRy, name }, anchors) {
  const g = new THREE.Group();
  const body = span + 1.6;
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
  soffit.moveTo(-archRx, 0.2);
  soffit.absellipse(0, 0.2, archRx, archRy, 0, Math.PI, false);
  soffit.lineTo(-archRx, 0.2);
  shape.holes.push(soffit);

  const solid = new THREE.ExtrudeGeometry(shape, { depth: half * 2, bevelEnabled: false, curveSegments: 26 });
  solid.translate(0, 0, z - half);
  const deck = new THREE.Mesh(solid, M.stone);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);

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
        parts.push(new THREE.SphereGeometry(0.16, 8, 6).translate(x, y + 1.56, zz));
      }
    }
    g.add(withShadow(parts, M.stone));
    const plaque = plaqueMesh(name, 2.2, 0.8, { dir: 'h', bg: '#243040', fg: '#dfe6f2' });
    plaque.position.set(0, deckY(0) * 0.52, s * (half + 0.03) + z);
    plaque.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(plaque);
  }
  // 桥堍石灯：南堍接大街，北堍接楼前街
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const x = s * (body + 0.6), zz = z + k * (half - 0.25);
    g.add(withShadow([
      box(0.6, 0.34, 0.6, x, Q + 0.17, zz),
      box(0.4, 2.0, 0.4, x, Q + 1.3, zz),
      new THREE.SphereGeometry(0.32, 10, 7).translate(x, Q + 2.55, zz),
      box(0.5, 0.66, 0.5, x, Q + 3.05, zz),
    ], M.stone));
    anchors.bridgeLamps.push(new THREE.Vector3(x, Q + 3.0, zz));
  }
  for (let i = -3; i <= 3; i++) {
    const a = (i / 3.6) * Math.PI * 0.8;
    anchors.archLamps.push(new THREE.Vector3(Math.cos(a) * (archRx - 0.6), 0.4 + Math.sin(a) * (archRy - 0.5), z));
  }
  LAYOUT.bridge = {
    at: z, span, half, crownY: deckY(0),
    southToe: -(body + 1.8), northToe: body + 1.8, deckY,
  };
  return { group: g, deckY, crownY: deckY(0), at: z, span, half };
}

/* ------------------------------------------------------------------ 城台 */
/**
 * 砖砌城台：横断面是收分的梯形，中辟南北贯通的券门。
 * 断面画在局部 XY 里（u 是横向＝世界 Z，v 是高度），沿局部 Z 挤出洞深（＝世界 X），
 * 再绕 Y 转 -90° 把挤出方向摆到南北轴上——早先按 baseDepth 画断面，等于把通道砌成了东西向。
 */
function towerBase(anchors) {
  const g = new THREE.Group();
  const halfBot = TW.baseLen / 2 + TW.batter;
  const halfTop = TW.baseLen / 2;
  const passage = TW.baseDepth + TW.batter * 2;

  const shape = new THREE.Shape();
  shape.moveTo(-halfBot, 0);
  shape.lineTo(halfBot, 0);
  shape.lineTo(halfTop, TW.baseH);
  shape.lineTo(-halfTop, TW.baseH);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-TW.archR, 0);
  hole.lineTo(-TW.archR, TW.archJam);
  hole.absarc(0, TW.archJam, TW.archR, Math.PI, 0, true);
  hole.lineTo(TW.archR, 0);
  hole.closePath();
  shape.holes.push(hole);

  const solid = new THREE.ExtrudeGeometry(shape, { depth: passage, bevelEnabled: false, curveSegments: 20 });
  solid.rotateY(-Math.PI / 2);
  solid.translate(N_OUT, Q - 0.25, 0);
  const mass = new THREE.Mesh(solid, M.brick);
  mass.castShadow = mass.receiveShadow = true;
  g.add(mass);

  // 台脚石榫与台顶线脚：砖墙直接落地会显得像一块整石
  g.add(withShadow([
    box(passage + 1.2, 0.6, TW.baseLen + 1.4, TW.cx, Q - 0.1, 0),
    box(TW.baseDepth + 1.4, 0.42, TW.baseLen + 1.0, TW.cx, TOP_Y - 0.22, 0),
  ], M.stoneDressed));

  // 券脸：洞口上沿压一道碹口石，门额嵌在其上。
  // 台面是收分的斜面，任何贴在平均高度上的装饰圈都会浮起来，所以只做平直的两条。
  for (const s of [-1, 1]) {
    const faceX = s > 0 ? (N_TOP + N_OUT) / 2 : (S_TOP + S_OUT) / 2;
    const lintel = plaqueMesh('南北枢机', 3.3, 0.95, { dir: 'h', bg: '#2a3140', fg: '#e6dcc0' });
    lintel.position.set(faceX + s * 0.34, Q + TW.archJam + TW.archR + 1.2, 0);
    lintel.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(lintel);
  }
  // 洞里的地墁与两壁灯
  g.add(withShadow(box(TW.baseDepth + 3, 0.14, TW.archR * 2 - 0.3, TW.cx, Q - 0.14, 0), M.stoneDark));
  for (const s of [-1, 1]) for (const k of [-0.4, 0.4]) {
    anchors.gateLamps.push(new THREE.Vector3(TW.cx + s * (TW.baseDepth / 2 - 1.2), Q + 2.4, TW.archR * k));
  }

  // 台顶女墙：周圈一宇，正南北在券门中线上断开
  const py = TOP_Y + 0.06;
  const parapet = [];
  for (const s of [-1, 1]) {
    const x = TW.cx + s * (TW.baseDepth / 2 - 0.36);
    for (const [z0, z1] of [[-HALF_L + 0.4, -TW.archR - 1.2], [TW.archR + 1.2, HALF_L - 0.4]]) {
      const len = z1 - z0;
      parapet.push(box(0.78, 1.05, len, x, py + 0.52, (z0 + z1) / 2));
      parapet.push(box(0.98, 0.2, len, x, py + 1.16, (z0 + z1) / 2));
    }
  }
  for (const s of [-1, 1]) {
    const z = s * (HALF_L - 0.36);
    parapet.push(box(TW.baseDepth - 0.7, 1.05, 0.78, TW.cx, py + 0.52, z));
    parapet.push(box(TW.baseDepth - 0.5, 0.2, 0.98, TW.cx, py + 1.16, z));
    for (let k = -2; k <= 2; k++) parapet.push(box(0.9, 0.6, 0.62, TW.cx + k * 2.4, py + 1.56, z));
  }
  g.add(withShadow(parapet, M.brick));
  g.add(withShadow(box(TW.baseDepth - 0.9, 0.16, TW.baseLen - 0.9, TW.cx, TOP_Y + 0.06, 0), M.stone));

  /**
   * 登城坡道：贴着城台东端落地的一整块斜墁，踏缝只画在坡面上。
   * 放在东端是为了不挡券门与楼前鼓位，也不跨到渠面上去。
   */
  const run = 10.2, rise = TW.baseH, wide = 3.4;
  const rampShape = new THREE.Shape();
  rampShape.moveTo(0, 0);
  rampShape.lineTo(run, 0);
  rampShape.lineTo(0, rise);
  rampShape.closePath();
  const rampGeo = new THREE.ExtrudeGeometry(rampShape, { depth: wide, bevelEnabled: false });
  rampGeo.rotateY(-Math.PI / 2);
  rampGeo.translate(TW.cx + wide / 2, Q - 0.2, HALF_L);
  const ramp = new THREE.Mesh(rampGeo, M.brick);
  ramp.castShadow = ramp.receiveShadow = true;
  g.add(ramp);

  // 坡面上的踏缝与两侧的随坡栏墙：先转后移，绕自己的中心躺到坡上去
  const slope = Math.atan2(rise, run);
  const treads = [], rails = [];
  for (let k = 1; k <= 12; k++) {
    const t = k / 13;
    const z = HALF_L + run * (1 - t), y = Q - 0.2 + rise * t;
    const tread = new THREE.BoxGeometry(wide - 0.2, 0.14, 0.94);
    tread.rotateX(-slope);
    tread.translate(TW.cx, y + 0.12, z);
    treads.push(tread);
    for (const s of [-1, 1]) {
      const wall = new THREE.BoxGeometry(0.55, 1.0, run / 12 * 1.16);
      wall.rotateX(-slope);
      wall.translate(TW.cx + s * (wide / 2), y + 0.34, z);
      rails.push(wall);
    }
  }
  g.add(withShadow(treads, M.stone));
  g.add(withShadow(rails, M.brick));
  // 坡顶与台顶交接的那一小段甬道
  g.add(withShadow(box(wide + 0.6, 0.2, 2.6, TW.cx, TOP_Y + 0.14, HALF_L + 1.3), M.stone));
  LAYOUT.stair = { x: TW.cx, topZ: HALF_L + 1.0, footZ: HALF_L + run - 1.4, y: TOP_Y + 0.2 };

  LAYOUT.base = { S_OUT, S_TOP, N_TOP, N_OUT, TOP_Y, HALF_L, archR: TW.archR, archJam: TW.archJam };
  return g;
}

/* ------------------------------------------------------------------ 楼阁 */
/**
 * 台上的两层楼阁：面阔三间（沿 Z），进深两间半（沿 X），重檐青瓦。
 * 南北都是正脸——南悬"彩彻云衢"、北悬"镇淮楼"，所以两面都砌门装窗。
 * 注意 chineseRoof 的 width 是屋脊方向：立面朝南北，屋面就要绕 Y 转 90°。
 */
function towerPavilion(anchors) {
  const g = new THREE.Group();
  const w = TW.hallW, d = TW.hallD;
  const h1 = TW.wall1, h2 = TW.wall2;
  const bay = w / 3;

  const plinth = withShadow([
    box(d + 2.6, TW.plinth, w + 2.6, TW.cx, TOP_Y + TW.plinth / 2, 0),
    box(d + 3.2, 0.26, w + 3.2, TW.cx, TOP_Y + TW.plinth + 0.13, 0),
  ], M.stone);
  g.add(plinth);

  // 一层的墙：南北开明间门洞，东西两山是整面砖
  const shell = [];
  for (const s of [-1, 1]) {
    const x = TW.cx + s * d / 2;
    for (const k of [-1, 1]) shell.push(box(0.55, h1, bay / 2 - 0.1, x, F1_Y + h1 / 2, k * (bay / 2 + bay / 4)));
    shell.push(box(0.55, 1.15, bay - 0.2, x, F1_Y + h1 - 0.58, 0));
  }
  for (const s of [-1, 1]) shell.push(box(d, h1, 0.6, TW.cx, F1_Y + h1 / 2, s * w / 2));
  g.add(withShadow(shell, M.brickDark));

  // 檐柱一圈
  const cols = [];
  for (let i = 0; i <= 3; i++) {
    const z = -w / 2 + (w * i) / 3;
    for (const s of [-1, 1]) cols.push(pillarGeo(h1 + 0.35, 0.28).translate(TW.cx + s * (d / 2 + 0.9), F1_Y, z));
  }
  for (const s of [-1, 1]) for (const dz of [-1, 1]) {
    cols.push(pillarGeo(h1 + 0.35, 0.26).translate(TW.cx + s * (d / 2 + 0.9), F1_Y, dz * (w / 2 + 0.8)));
  }
  g.add(withShadow(cols, M.pillar));

  // 额枋、平板枋绕周一圈，斗口出一跳承腰檐
  const y1 = F1_Y + h1;
  const arch = [];
  for (const s of [-1, 1]) {
    arch.push(box(0.42, 0.5, w + 1.8, TW.cx + s * (d / 2 + 0.9), y1 + 0.25, 0));
    arch.push(box(0.5, 0.34, w + 2.1, TW.cx + s * (d / 2 + 0.9), y1 + 0.66, 0));
    arch.push(box(d + 2.1, 0.5, 0.42, TW.cx, y1 + 0.25, s * (w / 2 + 0.8)));
    arch.push(box(d + 2.4, 0.34, 0.5, TW.cx, y1 + 0.66, s * (w / 2 + 0.8)));
  }
  g.add(withShadow(arch, M.beam));
  for (let i = 0; i <= 3; i++) {
    const z = -w / 2 + (w * i) / 3;
    for (const s of [-1, 1]) {
      const br = bracketGeo(0.95);
      br.translate(TW.cx + s * (d / 2 + 0.9), y1 + 0.83, z);
      g.add(mesh(br, M.beam));
      anchors.rafterLamps.push(new THREE.Vector3(TW.cx + s * (d / 2 + 2.0), y1 + 0.45, z));
    }
  }

  // 腰檐压在一层檐口之下，二层平座才踩得住它：位置高了，站上回廊就只看见檐底
  const waist = new THREE.Mesh(chineseRoof({
    width: w + 5.2, depth: d + 5.2, height: 1.3, ridgeRatio: 0.72, curve: 0.58,
    eaveLift: 0.58, overhang: 1.15, segU: 26, segV: 14,
  }), M.roof);
  waist.rotation.y = Math.PI / 2;
  waist.position.set(TW.cx, y1 - 1.1, 0);
  waist.castShadow = true;
  g.add(waist);

  // 二层平座：外挑一圈回廊，四面设栏，鼓就搁在它底下的台顶上
  const deck = withShadow([
    box(d + 3.4, 0.34, w + 3.4, TW.cx, F2_Y - 0.17, 0),
    box(d + 3.9, 0.2, w + 3.9, TW.cx, F2_Y - 0.42, 0),
  ], M.beam);
  g.add(deck);
  const rails = [];
  for (const s of [-1, 1]) {
    rails.push(railingGeo(w + 3.0, { height: 0.98, spacing: 1.5 }).translate(0, 0, s * (w / 2 + 1.5)));
    rails.push(railingGeo(d + 2.6, { height: 0.98, spacing: 1.5 }).rotateY(Math.PI / 2).translate(s * (d / 2 + 1.5), 0, 0));
  }
  const railMesh = mesh(rails, M.stone);
  railMesh.position.set(TW.cx, F2_Y, 0);
  railMesh.castShadow = true;
  g.add(railMesh);
  for (let i = 0; i <= 6; i++) {
    const z = -w / 2 - 1.0 + (w + 2.0) * (i / 6);
    for (const s of [-1, 1]) g.add(mesh(box(1.2, 0.3, 0.34, TW.cx + s * (d / 2 + 1.35), F2_Y - 0.62, z), M.beam));
  }

  // 二层的墙与槅扇
  const up = [];
  for (const s of [-1, 1]) up.push(box(d, h2, 0.55, TW.cx, F2_Y + h2 / 2, s * w / 2));
  for (const s of [-1, 1]) {
    const x = TW.cx + s * d / 2;
    for (let i = 0; i < 3; i++) {
      const z = -w / 2 + bay * (i + 0.5);
      up.push(i === 1
        ? box(0.5, 0.9, bay - 0.3, x, F2_Y + h2 - 0.45, z)
        : box(0.5, h2, bay - 0.3, x, F2_Y + h2 / 2, z));
    }
  }
  g.add(withShadow(up, M.brickDark));
  for (const s of [-1, 1]) {
    const x = TW.cx + s * (d / 2 + 0.32);
    for (let i = 0; i < 3; i++) {
      const z = -w / 2 + bay * (i + 0.5);
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(bay - 0.5, h2 - 0.9), M.lattice);
      leaf.position.set(x, F2_Y + (h2 - 0.9) / 2 + 0.45, z);
      leaf.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(leaf);
      anchors.latticeLamps.push(new THREE.Vector3(x + s * 0.4, F2_Y + h2 * 0.55, z));
    }
    for (let i = 0; i <= 3; i++) {
      const c = new THREE.Mesh(pillarGeo(h2 + 0.25, 0.24), M.pillar);
      c.position.set(x + s * 0.45, F2_Y, -w / 2 + (w * i) / 3);
      c.castShadow = true;
      g.add(c);
    }
  }

  const y2 = F2_Y + h2;
  const upper = [];
  for (const s of [-1, 1]) {
    upper.push(box(0.4, 0.46, w + 1.6, TW.cx + s * (d / 2 + 0.8), y2 + 0.23, 0));
    upper.push(box(d + 1.8, 0.46, 0.4, TW.cx, y2 + 0.23, s * (w / 2 + 0.7)));
    const br = bracketGeo(1.0);
    br.translate(TW.cx + s * (d / 2 + 0.8), y2 + 0.46, 0);
    g.add(mesh(br, M.gilt));
  }
  g.add(withShadow(upper, M.beam));

  // 上檐：重檐歇山。江淮的屋角不像江南那样吊，起翘收到 0.55
  const top = new THREE.Mesh(chineseRoof({
    width: w + 6.2, depth: d + 6.2, height: TW.roofH, ridgeRatio: 0.3, curve: 0.6,
    eaveLift: 0.55, overhang: 1.4, segU: 30, segV: 18,
  }), M.roof);
  top.rotation.y = Math.PI / 2;
  top.position.set(TW.cx, y2 + 0.72, 0);
  top.castShadow = true;
  g.add(top);
  const rg = mesh(ridgeOrnament({
    width: w + 6.2, depth: d + 6.2, height: TW.roofH, ridgeRatio: 0.3, overhang: 1.4,
  }), M.ridge);
  rg.rotation.y = Math.PI / 2;
  rg.position.set(TW.cx, y2 + 0.72 + TW.roofH, 0);
  rg.castShadow = true;
  g.add(rg);
  g.add(withShadow([
    box(0.5, 0.9, 0.5, TW.cx, y2 + TW.roofH + 1.2, 0),
    new THREE.SphereGeometry(0.34, 10, 8).translate(TW.cx, y2 + TW.roofH + 1.8, 0),
  ], M.gilt));

  // 双匾：挂在腰檐与上檐之间的明间檐下
  const signY = F2_Y + h2 * 0.6;
  const south = plaqueMesh('彩彻云衢', 4.6, 1.25, { dir: 'h', bg: '#15243a', fg: '#f3dfb2' });
  south.position.set(TW.cx - d / 2 - 0.66, signY, 0);
  south.rotation.y = -Math.PI / 2;
  g.add(south);
  const north = plaqueMesh('镇淮楼', 4.6, 1.25, { dir: 'h', bg: '#15243a', fg: '#f3dfb2' });
  north.position.set(TW.cx + d / 2 + 0.66, signY, 0);
  north.rotation.y = Math.PI / 2;
  g.add(north);
  anchors.signLamps.push(
    new THREE.Vector3(TW.cx - d / 2 - 1.0, signY + 1.2, 0),
    new THREE.Vector3(TW.cx + d / 2 + 1.0, signY + 1.2, 0),
  );

  // 翼角悬铃
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const x = TW.cx + s * (d / 2 + 3.2), z = k * (w / 2 + 3.2);
    g.add(mesh([
      box(0.08, 0.5, 0.08, x, y2 + 0.5, z),
      new THREE.ConeGeometry(0.16, 0.3, 7).translate(x, y2 + 0.1, z),
    ], M.gilt));
  }

  // 一层南北明间的门扇与门槛，山墙上的漏窗
  for (const s of [-1, 1]) {
    const x = TW.cx + s * (d / 2 + 0.36);
    g.add(mesh([
      box(0.14, 3.0, bay / 2 - 0.2, x, F1_Y + 1.5, -bay / 2 + 0.1),
      box(0.14, 3.0, bay / 2 - 0.2, x, F1_Y + 1.5, bay / 2 - 0.1),
      box(0.5, 0.22, bay, x, F1_Y + 0.11, 0),
    ], M.woodDark));
    anchors.towerLamps.push(
      new THREE.Vector3(x + s * 0.55, F1_Y + 2.9, -bay * 0.78),
      new THREE.Vector3(x + s * 0.55, F1_Y + 2.9, bay * 0.78),
    );
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = TW.cx + s * (d / 2 + 0.34);
    const z = -w / 2 + w * (i + 0.5) / 3;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), M.lattice);
    win.position.set(x, F1_Y + 2.1, z);
    win.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(win);
    anchors.windowGlow.push(new THREE.Vector3(x + s * 0.2, F1_Y + 2.2, z));
  }

  LAYOUT.tower = {
    cx: TW.cx, floorY: F1_Y, deckY: F2_Y, ridgeY: RIDGE_Y, signY,
    southFaceX: TW.cx - d / 2 - 0.66, northFaceX: TW.cx + d / 2 + 0.66,
    terraceY: TOP_Y, halfW: w / 2, halfD: d / 2,
  };
  return g;
}

/* ------------------------------------------------------------------ 更鼓 */
/**
 * 台顶明间门前的鼓架与一面大鼓：鼓腔横放，两面分朝南北，
 * 桥上与署前都看得见鼓皮。交出枢轴与鼓面，击鼓模块按同一点摆动、发亮。
 */
function drumStage(anchors) {
  const g = new THREE.Group();
  const x = S_TOP + 1.7, z = 0, r = 0.66, len = 1.55;
  const standY = TOP_Y + 1.05;

  const legs = [];
  for (const s of [-1, 1]) for (const k of [-1, 1]) legs.push(box(0.16, 1.05, 0.16, x + s * 0.62, TOP_Y + 0.52, z + k * 0.62));
  legs.push(box(1.6, 0.18, 1.6, x, TOP_Y + 1.02, z));
  g.add(withShadow(legs, M.woodDark));

  const pivot = new THREE.Object3D();
  pivot.position.set(x, standY + r * 0.4, z);
  const shell = new THREE.Mesh(drumGeo({ radius: r, length: len }), M.drumShell);
  shell.rotation.z = Math.PI / 2;
  shell.castShadow = true;
  pivot.add(shell);
  const heads = [];
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(drumHeadGeo(r), M.drumHead);
    head.position.x = s * (len / 2 - 0.04);
    head.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    head.scale.setScalar(0.98);
    pivot.add(head);
    heads.push(head);
  }
  g.add(pivot);

  const nails = [];
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    nails.push(new THREE.SphereGeometry(0.05, 6, 5)
      .translate(x + s * (len / 2 + 0.02), standY + r * 0.4 + Math.cos(a) * r * 0.74, z + Math.sin(a) * r * 0.74));
  }
  g.add(mesh(nails, M.gilt));

  // 一对鼓槌：斜搁在鼓面上方，击打时荡向鼓心
  const mallets = [];
  for (const s of [-1, 1]) {
    const mp = new THREE.Object3D();
    mp.position.set(x + s * 0.34, standY + r * 1.55, z + 0.62);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 7), M.beam);
    shaft.position.set(0, -0.36, -0.2);
    shaft.rotation.x = -0.55;
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), M.silk);
    bob.position.set(0, -0.76, -0.46);
    mp.add(shaft, bob);
    g.add(mp);
    mallets.push(mp);
  }

  anchors.drumLamps.push(new THREE.Vector3(x, standY + r * 2.4, z - 1.0));
  anchors.terraceLamps.push(
    new THREE.Vector3(x, TOP_Y + 1.2, -TW.archR - 2.4),
    new THREE.Vector3(x, TOP_Y + 1.2, TW.archR + 2.4),
  );
  LAYOUT.drum = { x, z, y: standY + r * 0.4, headX: len / 2, faceY: standY + r * 0.4 };
  return { group: g, pivot, heads, mallets, shell };
}

/* ------------------------------------------------------------------ 南岸河房与南门大街 */
/** 河房：前门卸货后门住家，临水一列立柱撑起廊檐；街对面再压一排铺面 */
function southStreet(anchors) {
  const g = new THREE.Group();
  const walls = [], roofs = [], cols = [], shedParts = [], steps = [];
  const x0 = -HW - 4.6;                         // 河房临水面所在的线
  for (let i = 0; i < 17; i++) {
    const z = -52 + i * 6.6 + rr(-1.4, 1.4);
    if (Math.abs(z) < 7) continue;              // 三思桥两堍前面留空地
    const front = rr(4.8, 6.6);
    const depth = rr(5.4, 8.0);
    const h = rr(3.0, 4.0);
    const two = rand() > 0.66;
    const cx = x0 - depth / 2;
    walls.push(box(depth, h, front, cx, Q + h / 2, z));
    if (two) walls.push(box(depth * 0.84, h * 0.66, front * 0.84, cx - 0.4, Q + h + h * 0.33, z));
    const rg = chineseRoof({
      width: front + 1.5, depth: depth + 1.5, height: 1.1, ridgeRatio: 0.42,
      curve: 0.52, eaveLift: 0.42, overhang: 0.4,
    });
    rg.rotateY(Math.PI / 2);
    rg.translate(cx, Q + h + (two ? h * 0.66 : 0) + 0.1, z);
    roofs.push(rg);
    anchors.windowGlow.push(new THREE.Vector3(x0 - 0.4, Q + h * 0.6, z + rr(-1.1, 1.1)));
    anchors.houseEaves.push(new THREE.Vector3(x0 - 1.3, Q + 2.6, z));
    for (const zz of [z - front / 2, z + front / 2]) cols.push(box(0.17, 2.7, 0.17, x0 - 1.5, Q + 1.35, zz));
    const shed = new THREE.BoxGeometry(2.6, 0.16, front + 1.1);
    shed.translate(x0 - 1.3, Q + 2.74, z);
    shedParts.push(shed);
    if (i % 3 === 1) {
      for (let k = 0; k < 3; k++) steps.push(box(2.2, 0.34, 0.62, x0 - 1.7 - k * 0.48, Q - 0.5 - k * 0.4, z + 1.3));
    }
    anchors.shopLamps.push(
      new THREE.Vector3(x0 - 1.0, Q + 2.3, z - front * 0.3),
      new THREE.Vector3(x0 - 1.0, Q + 2.3, z + front * 0.3),
    );
  }
  g.add(withShadow(walls, M.wall), withShadow(roofs, M.roofGrey));
  g.add(withShadow(cols, M.woodDark), withShadow(shedParts, M.woodDark));
  g.add(withShadow(steps, M.stone));

  // 南北大街：从桥南堍直穿河房到城里
  const streetX = x0 - 6.8;
  g.add(withShadow(box(7.6, 0.22, CANAL.length * 0.62, streetX, Q + 0.11, 0), M.stoneDark));
  for (let z = -48; z <= 48; z += 8) {
    const pole = new THREE.CylinderGeometry(0.08, 0.12, 3.9, 6);
    pole.translate(streetX + 4.3, Q + 1.95, z);
    g.add(mesh([pole, box(0.8, 0.1, 0.1, streetX + 3.9, Q + 3.85, z)], M.ink));
    anchors.streetLamps.push(new THREE.Vector3(streetX + 3.6, Q + 3.5, z));
  }
  // 街对面的铺面
  const shopWall = [];
  for (let i = 0; i < 12; i++) {
    const z = -46 + i * 8 + rr(-1.6, 1.6);
    const front = rr(4.4, 6.2), h = rr(2.8, 3.6);
    const cx = streetX - 4.6;
    shopWall.push(box(5.4, h, front, cx, Q + h / 2, z), box(5.8, 0.3, front + 0.8, cx, Q + h + 0.15, z));
    anchors.windowGlow.push(new THREE.Vector3(cx + 2.5, Q + h * 0.55, z + rr(-1, 1)));
    anchors.shopLamps.push(new THREE.Vector3(streetX - 1.8, Q + 2.2, z));
  }
  g.add(withShadow(shopWall, M.wall));

  // 市招：布幌伸出廊外，写字的一面朝街、背面朝河
  const names = ['茶', '酒', '漕', '盐', '布', '药', '灯', '米', '舟', '伞', '香', '帽'];
  for (let i = 0; i < names.length; i++) {
    const z = -44 + i * 7.6 + rr(-1.6, 1.6);
    const onRiver = rand() > 0.5;
    const x = onRiver ? x0 - 2.2 : streetX - 4.4;
    const mat = new THREE.MeshBasicMaterial({
      map: T.banner(names[i]), transparent: true, side: THREE.DoubleSide, alphaTest: 0.42, fog: true,
    });
    mat.toneMapped = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), mat);
    m.position.set(x, Q + 2.85, z);
    m.rotation.y = (onRiver ? 1 : -1) * Math.PI / 2 + rr(-0.12, 0.12);
    g.add(m, mesh(box(0.07, 0.07, 1.4, x + (onRiver ? 0.7 : -0.7), Q + 3.85, z), M.woodDark));
    anchors.shopLamps.push(new THREE.Vector3(x, Q + 3.8, z));
  }
  LAYOUT.street = { riverFrontX: x0, streetX, eyeY: Q + 1.9 };
  return g;
}

/* ------------------------------------------------------------------ 楼北：署前街与漕运总督署 */
function yamen(anchors) {
  const g = new THREE.Group();
  g.add(withShadow(box(13, 0.22, 56, TW.cx + 19, Q + 0.11, 0), M.stoneDark));

  // 署前街东偏一座一字影壁：正对大街的中线要留给楼与署之间的行走
  const zbX = TW.cx + 11.5, zbZ = 9.5;
  g.add(withShadow([
    box(1.1, 3.4, 9.6, zbX, Q + 1.7, zbZ),
    box(1.7, 0.45, 10.2, zbX, Q + 3.6, zbZ),
  ], M.redWall));
  const cap = new THREE.Mesh(chineseRoof({
    width: 10.8, depth: 2.4, height: 0.9, ridgeRatio: 0.88, curve: 0.5, eaveLift: 0.35, overhang: 0.35,
  }), M.roofGrey);
  cap.rotation.y = Math.PI / 2;
  cap.position.set(zbX, Q + 3.9, zbZ);
  cap.castShadow = true;
  g.add(cap);
  for (const dz of [-3.4, 0, 3.4]) anchors.courtLamps.push(new THREE.Vector3(zbX - 1.0, Q + 2.1, zbZ + dz));

  // 署门：五间三洞的官署门，檐下只留两盏灯
  const gx = TW.cx + 26.5, wGate = 20, h = 5.0;
  g.add(withShadow([
    box(7.2, h, wGate, gx, Q + h / 2, 0),
    box(8.0, 0.5, wGate + 1.6, gx, Q + h + 0.25, 0),
  ], M.redWall));
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
    const c = new THREE.Mesh(pillarGeo(h + 0.4, 0.3), M.pillar);
    c.position.set(gx + s * 3.8, Q, i * 6.4);
    c.castShadow = true;
    g.add(c);
  }
  const roof = new THREE.Mesh(chineseRoof({
    width: wGate + 3.6, depth: 9.4, height: 1.8, ridgeRatio: 0.6, curve: 0.52, eaveLift: 0.42, overhang: 0.8,
  }), M.roofGrey);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(gx, Q + h + 0.5, 0);
  roof.castShadow = true;
  g.add(roof);
  const sign = plaqueMesh('漕运总督署', 5.2, 1.3, { dir: 'h', bg: '#1a2334', fg: '#e7dcc0' });
  sign.position.set(gx - 3.9, Q + h - 1.2, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  for (const dz of [-6.4, 6.4]) {
    g.add(withShadow([
      box(0.55, 0.4, 0.55, gx - 4.3, Q + 0.2, dz),
      box(0.38, 2.6, 0.38, gx - 4.3, Q + 1.6, dz),
      new THREE.SphereGeometry(0.32, 10, 7).translate(gx - 4.3, Q + 3.1, dz),
      box(0.52, 0.6, 0.52, gx - 4.3, Q + 3.6, dz),
    ], M.stone));
    anchors.gateLamps.push(new THREE.Vector3(gx - 4.3, Q + 3.5, dz));
  }
  anchors.yamenLamps.push(
    new THREE.Vector3(gx - 4.6, Q + h - 0.9, -3.2),
    new THREE.Vector3(gx - 4.6, Q + h - 0.9, 3.2),
  );

  // 署后的屋脊：只压出体量，不再细做
  const back = [];
  for (let i = 0; i < 16; i++) {
    const z = -30 + i * 4.2 + rr(-1, 1), x = gx + rr(6, 26);
    const h2 = rr(2.8, 5.4), w2 = rr(4, 7);
    back.push(box(w2, h2, h2 * 1.2, x, Q + h2 / 2, z));
  }
  g.add(withShadow(back, M.wall));
  LAYOUT.yamen = { gateX: gx, wallX: TW.cx + 8.0 };
  return g;
}

/** 楼的东西两侧贴几进民居把街的边界合住；西边补一段城墙作天际线的界 */
function blocks(anchors) {
  const g = new THREE.Group();
  const parts = [], roofs = [];
  for (let i = 0; i < 30; i++) {
    const z = rr(-58, 58);
    const x = (rand() > 0.5 ? 1 : -1) * rr(HW + 13, HW + 30);
    if (Math.abs(x - TW.cx) < 13 && Math.abs(z) < 15) continue;          // 楼前那一片要空着
    if (x > TW.cx + 6 && Math.abs(z) < 14) continue;                     // 楼与署之间的中轴不砌房
    if (STATIONS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < 8)) continue;
    const h = rr(2.6, 3.8), front = rr(4.4, 6.8), depth = rr(4.6, 7.4);
    parts.push(box(depth, h, front, x, Q + h / 2, z));
    const rg = chineseRoof({
      width: front + 1.2, depth: depth + 1.2, height: 0.95, ridgeRatio: 0.44,
      curve: 0.5, eaveLift: 0.38, overhang: 0.35,
    });
    rg.rotateY(Math.PI / 2);
    rg.translate(x, Q + h + 0.05, z);
    roofs.push(rg);
    anchors.windowGlow.push(new THREE.Vector3(x - depth / 2 + 0.4, Q + h * 0.55, z + rr(-1, 1)));
  }
  g.add(withShadow(parts, M.wall), withShadow(roofs, M.roofGrey));

  const wall = [];
  for (let i = 0; i < 26; i++) {
    const z = -72 + i * 5.6;
    wall.push(box(2.6, 5.0, 5.6, -HW - 48, Q + 2.5, z));
    if (i % 2 === 0) wall.push(box(2.9, 0.8, 1.1, -HW - 48, Q + 5.4, z));
  }
  g.add(withShadow(wall, M.brick));
  for (let i = 0; i < 5; i++) anchors.courtLamps.push(new THREE.Vector3(-HW - 46.4, Q + 5.0, -60 + i * 26));
  return g;
}

/* ------------------------------------------------------------------ 装配 */
export function buildQuarter(scene) {
  const anchors = {
    towerLamps: [], latticeLamps: [], signLamps: [], rafterLamps: [], gateLamps: [],
    terraceLamps: [], bridgeLamps: [], archLamps: [], shopLamps: [], houseEaves: [],
    windowGlow: [], streetLamps: [], courtLamps: [], yamenLamps: [], drumLamps: [],
    moorings: [], stringEnds: [],
  };
  const group = new THREE.Group();
  group.name = 'quarter';
  group.add(banks());
  group.add(quayFurniture(anchors));

  const sansi = stoneArchBridge({
    z: 0, span: 11.4, rise: 4.3, half: 2.6, archRx: 7.6, archRy: 3.2, name: '三思桥',
  }, anchors);
  group.add(sansi.group);

  group.add(towerBase(anchors));
  group.add(towerPavilion(anchors));
  const drum = drumStage(anchors);
  group.add(drum.group);

  group.add(southStreet(anchors));
  group.add(yamen(anchors));
  group.add(blocks(anchors));

  scene.add(group);

  // 跨渠灯串：一道在桥上游、一道在桥下游，夜里渠上只有这两条横线
  anchors.stringEnds.push(
    [new THREE.Vector3(-HW - 2.6, Q + 3.4, 26), new THREE.Vector3(HW + 2.6, Q + 3.8, 32)],
    [new THREE.Vector3(HW + 2.4, Q + 3.2, -30), new THREE.Vector3(-HW - 2.8, Q + 3.6, -24)],
  );
  return { group, anchors, drum, bridge: sansi, bridges: [sansi] };
}
