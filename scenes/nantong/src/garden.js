/**
 * 园林要素与岸线：沿河步道、驳岸、荷池、石梁桥、假山、亭、水榭、紫藤架、
 *  path 与树。园子按"园馆一体"的读法排：墙内一线树影，池与桥做前庭，
 * 馆舍退在后面 —— 从河上看过来，先看见的是树梢和屋脊。
 */
import * as THREE from 'three';
import { box, boxM, pyramidalRoof, barrelRoof, rr, pick } from './kit.js';
import { Batch, place, balustrade, ironFence, tree, pergola, rockPile, scholarStone, lampPost, gardenLamp, lantern, lotusRemnant } from './parts.js';
import { YUAN, RIVER } from './data.js';

export function buildGarden(scene) {
  const group = new THREE.Group();
  group.name = 'garden';
  scene.add(group);
  const B = new Batch();
  const anchors = [];
  const { pool } = YUAN;
  const zw = YUAN.wallZ;

  /* ------------------------------------------------------------ 沿河步道 */
  const road0 = RIVER.southZ + 1.2;      // 河坎
  const road1 = zw - 0.6;               // 墙根
  B.add('paving', boxM(YUAN.halfWidth * 2 + 40, 0.5, road1 - road0, 0, -0.5, (road0 + road1) / 2, 1));
  // 河坎石驳岸：一道压顶石 + 岸壁，把水面与步道的接缝盖住
  B.add('stone', boxM(YUAN.halfWidth * 2 + 60, 0.34, 1.1, 0, 0.16, road0 - 0.3, 1));
  B.add('stoneDark', boxM(YUAN.halfWidth * 2 + 60, 1.5, 0.8, 0, -1.6, road0 - 1.0, 1));
  balustrade(B, { from: [-YUAN.halfWidth - 10, road0 - 0.5], to: [YUAN.halfWidth + 10, road0 - 0.5], h: 0.92, gap: 1.6 });
  // 行道树与路灯：一整条沿河的绿线
  for (let i = 0; i < 26; i++) {
    const x = -YUAN.halfWidth - 6 + (i / 25) * (YUAN.halfWidth * 2 + 12);
    if (Math.abs(x + 10) < 6) continue;    // 门口让开
    if (i % 2 === 0) lampPost(B, { x, z: road0 + 0.6, h: 5.6, arms: 2 });
    tree(B, { x: x + rr(-1.2, 1.2), z: road1 - 1.1, h: rr(8.4, 11.5), kind: pick(['plane', 'plane', 'willow']) });
    anchors.push({ pos: [x, 1.4, road0 + 0.6], color: '#ffc78a', width: 2.6, depth: 15 + rr(0, 7), intensity: 0.55 });
  }

  /* ------------------------------------------------------------ 园内地坪 */
  // 四块围出荷池，留出池面（倒影要能从池子里看穿）
  const pN = pool.cz - pool.hz, pS = pool.cz + pool.hz, pW = pool.cx - pool.hx, pE = pool.cx + pool.hx;
  const hw = YUAN.halfWidth, far = zw + 300;
  B.add('gravel', boxM(hw * 2 + 30, 0.5, pN - (zw + 0.6), 0, -0.5, (zw + 0.6 + pN) / 2, 1));
  B.add('gravel', boxM(pW - (-hw - 12), 0.5, pS - pN, (-hw - 12 + pW) / 2, -0.5, (pN + pS) / 2, 1));
  B.add('gravel', boxM(hw + 12 - pE, 0.5, pS - pN, (pE + hw + 12) / 2, -0.5, (pN + pS) / 2, 1));
  B.add('gravel', boxM(hw * 2 + 30, 0.5, far - pS, 0, -0.5, (pS + far) / 2, 1));
  // 草坪
  for (const [cx, cz, w, d] of [
    [-72, 40, 62, 26], [96, 44, 44, 22], [-96, 84, 46, 40], [8, 88, 60, 30], [96, 118, 70, 44], [-40, 150, 78, 60],
  ]) B.add('lawn', boxM(w, 0.14, d, cx, 0, cz, 1));
  // 主路：进门一条正路，再横向一条绕池
  B.add('paving', boxM(6.4, 0.16, 44, -10, 0.02, zw + 22, 1));
  B.add('paving', boxM(150, 0.16, 5.2, 4, 0.02, zw + 5.4, 1));
  B.add('paving', boxM(5.2, 0.16, 60, pE + 5, 0.02, pool.cz + 22, 1));
  B.add('paving', boxM(48, 0.16, 4.6, 58, 0.02, 120, 1));
  for (let i = 0; i < 9; i++) {
    const x = -66 + i * 16;
    gardenLamp(B, { x, z: zw + 5.4 + (i % 2 ? 3.4 : -3.4), h: 0.86 });
    anchors.push({ pos: [x, 0.9, zw + 5.4], color: '#ffcf94', width: 1.6, depth: 5.5, intensity: 0.3 });
  }

  /* ------------------------------------------------------------ 荷池 */
  // 池岸：压顶石 + 内壁，池底留在 -1.6 以下不挡倒影
  const cop = 0.62;
  for (const [w, d, cx, cz] of [
    [pool.hx * 2 + cop * 2, cop, pool.cx, pN - cop / 2],
    [pool.hx * 2 + cop * 2, cop, pool.cx, pS + cop / 2],
  ]) B.add('stone', boxM(w, 0.42, d, cx, 0.02, cz, 1));
  for (const [w, d, cx, cz] of [
    [cop, pool.hz * 2 + cop * 2, pW - cop / 2, pool.cz],
    [cop, pool.hz * 2 + cop * 2, pE + cop / 2, pool.cz],
  ]) B.add('stone', boxM(w, 0.42, d, cx, 0.02, cz, 1));
  for (const [from, to] of [
    [[pW - 0.9, pN - 0.9], [pE + 0.9, pN - 0.9]],
    [[pW - 0.9, pS + 0.9], [pE + 0.9, pS + 0.9]],
  ]) balustrade(B, { from, to, h: 0.72, gap: 1.5 });
  // 残荷
  for (let i = 0; i < 34; i++) {
    lotusRemnant(B, { x: rr(pW + 3, pE - 3), z: rr(pN + 2, pS - 2), y: 0.1 });
  }

  /* --------------------------------------------------------- 跨池石梁桥 */
  {
    const bx = YUAN.bridgeX, z0 = pN - 1.6, z1 = pool.cz + 17;
    const spans = 4, len = z1 - z0, sw = len / spans;
    for (let i = 0; i < spans; i++) {
      const cz = z0 + sw * (i + 0.5);
      B.add('stone', place(box(3.1, 0.34, sw + 0.3), { x: bx, y: 0.86, z: cz }));
      B.add('stone', place(box(3.5, 0.5, 0.9), { x: bx, y: 0.3, z: z0 + sw * i }), );
      if (i < spans - 1) {
        B.add('stone', place(box(2.2, 1.0, 1.2), { x: bx, y: -0.4, z: z0 + sw * (i + 1) }));
      }
    }
    for (const s of [-1, 1]) {
      balustrade(B, { from: [bx + s * 1.4, z0], to: [bx + s * 1.4, z1], h: 0.78, gap: 1.9 });
    }
    lantern(B, { x: bx - 1.4, y: 1.9, z: (z0 + z1) / 2, r: 0.24, color: '#ff9f57' });
    lantern(B, { x: bx + 1.4, y: 1.9, z: (z0 + z1) / 2, r: 0.24, color: '#ff9f57' });
    anchors.push({ pos: [bx, 1.6, (z0 + z1) / 2], color: '#ff9f57', width: 1.6, depth: 6, intensity: 0.5 });
  }

  /* ------------------------------------------------------------ 假山与石 */
  rockPile(B, { x: -44, z: 32, w: 26, h: 8.2, d: 15, chunks: 34 });
  rockPile(B, { x: -62, z: 24, w: 14, h: 4.6, d: 10, chunks: 16 });
  rockPile(B, { x: 92, z: 34, w: 18, h: 5.4, d: 12, chunks: 20 });
  rockPile(B, { x: -30, z: 132, w: 22, h: 6.2, d: 13, chunks: 22 });
  scholarStone(B, { x: -30, z: 21, h: 3.4 });
  scholarStone(B, { x: 76, z: 26, h: 2.6 });

  /* -------------------------------------------------------- 藤东水榭（池东） */
  {
    const sx = pE + 3.6, sz = pool.cz;
    B.add('stone', boxM(9.6, 0.5, 7.4, sx, 0.1, sz, 1));
    for (const ox of [-3.6, 3.6]) for (const oz of [-2.6, 2.6]) {
      B.add('timber', box(0.26, 3.0, 0.26, sx + ox, 0.6, sz + oz));
    }
    B.add('timber', boxM(9.2, 0.26, 0.3, sx, 3.6, sz - 2.6, 1));
    B.add('timber', boxM(9.2, 0.26, 0.3, sx, 3.6, sz + 2.6, 1));
    B.add('tile', barrelRoof(10.4, 8.4, 1.0, sx, 3.86, sz, { overhang: 0.7 }));
    balustrade(B, { from: [sx - 4.4, sz - 3.2], to: [sx - 4.4, sz + 3.2], h: 0.8, gap: 1.3 });
    balustrade(B, { from: [sx + 4.4, sz - 3.2], to: [sx + 4.4, sz + 3.2], h: 0.8, gap: 1.3 });
    B.add('wood', boxM(2.6, 0.12, 6.4, sx - 5.4, 0.6, sz, 1));
    lantern(B, { x: sx, y: 3.1, z: sz - 3.0, r: 0.26, color: '#ffab62' });
    anchors.push({ pos: [sx - 1, 0.8, sz - 3.4], color: '#ffab62', width: 2.4, depth: 7, intensity: 0.42 });
  }

  /* -------------------------------------------------------------- 方亭 */
  {
    const tx = -74, tz = 62;
    B.add('stone', boxM(6.2, 0.45, 6.2, tx, 0.02, tz, 1));
    for (const ox of [-2.1, 2.1]) for (const oz of [-2.1, 2.1]) {
      B.add('timber', box(0.22, 2.9, 0.22, tx + ox, 0.47, tz + oz));
    }
    B.add('timber', box(4.9, 0.24, 0.24, tx, 3.1, tz - 2.1));
    B.add('timber', box(4.9, 0.24, 0.24, tx, 3.1, tz + 2.1));
    B.add('timber', box(0.24, 0.24, 4.9, tx - 2.1, 3.1, tz));
    B.add('timber', box(0.24, 0.24, 4.9, tx + 2.1, 3.1, tz));
    B.add('tile', pyramidalRoof(4.4, 2.5, tx, 3.34, tz, { overhang: 0.8, lift: 0.5 }));
    B.add('timber', box(0.12, 0.6, 0.12, tx, 5.84, tz));
    for (const s of [-1, 1]) balustrade(B, { from: [tx - 2.6, tz + s * 2.6], to: [tx + 2.6, tz + s * 2.6], h: 0.66, gap: 1.2 });
    gardenLamp(B, { x: tx - 3.6, z: tz, h: 1.6 });
  }

  /* ------------------------------------------------------------ 紫藤架 */
  pergola(B, { x: -88, z: 26, w: 17, d: 5.4, h: 3.05, baysX: 5, baysZ: 2 });
  pergola(B, { x: 62, z: 148, w: 13, d: 4.6, h: 2.95, baysX: 4, baysZ: 2 });

  /* -------------------------------------------------------------- 杂树 */
  const spots = [
    [-150, 30, 'plane'], [-138, 58, 'fir'], [-120, 96, 'plane'], [-148, 120, 'willow'],
    [-104, 46, 'plane'], [-66, 106, 'plane'], [-112, 150, 'fir'], [-58, 168, 'plane'],
    [-18, 118, 'plane'], [16, 132, 'fir'], [40, 66, 'plane'], [74, 62, 'plane'],
    [112, 46, 'plane'], [148, 34, 'fir'], [160, 74, 'plane'], [132, 96, 'plane'],
    [156, 128, 'plane'], [108, 152, 'willow'], [62, 178, 'plane'], [6, 196, 'plane'],
    [-70, 196, 'fir'], [-128, 186, 'plane'], [150, 176, 'plane'], [30, 156, 'plane'],
  ];
  for (const [x, z, kind] of spots) tree(B, { x, z, h: rr(8.5, 14), kind });
  // 别业前的小乔木列：退到机位之后，不然正好糊在镜头与门廊之间
  for (let i = 0; i < 6; i++) tree(B, { x: 100 + i * 9, z: 104 + (i % 2) * 5, h: rr(7, 9), kind: 'plane' });
  // 北岸外的绿带（对岸的环城林）
  for (let i = 0; i < 30; i++) {
    tree(B, { x: -300 + i * 20 + rr(-5, 5), z: RIVER.northZ - 5 - rr(0, 4), h: rr(8, 12), kind: pick(['plane', 'willow', 'fir']) });
  }

  /* ------------------------------------------------------------ 侧界墙 */
  for (const s of [-1, 1]) {
    ironFence(B, { from: [s * YUAN.halfWidth, zw + 1.6], to: [s * YUAN.halfWidth, zw + 46], wallH: 0.85, barH: 1.05 });
  }
  for (const sx of [-1, 1]) {
    B.add('brick', boxM(0.8, 2.2, 12, sx * (YUAN.halfWidth - 1), 0, zw + 7, 1));
  }

  const meshes = B.flush(group);
  return { group, meshes, anchors };
}
