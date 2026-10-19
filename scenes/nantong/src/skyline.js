/**
 * 河对岸与两侧的城市：环城林带、濠北路灯、老城多层与远处高层，
 * 外加一座跨河的公路桥。楼群不指认真实地块，只承担"护城河把城围在
 * 里面"这件事的背景与光害。
 */
import * as THREE from 'three';
import { box, boxM, rand, rr } from './kit.js';
import { Batch, place, lampPost, balustrade, glowKey } from './parts.js';
import { RIVER } from './data.js';

const northBank = RIVER.northZ;

export function buildSkyline(scene) {
  const group = new THREE.Group();
  group.name = 'skyline';
  scene.add(group);
  const towers = new THREE.Group();
  towers.name = 'towers';
  group.add(towers);
  const anchors = [];

  const B = new Batch();
  const BT = new Batch();   // 楼群单独一组，方便整组进倒影镜像

  /* ---------------------------------------------------------- 北岸堤线与路 */
  B.add('stone', boxM(900, 0.36, 1.2, 0, 0.14, northBank - 0.8, 1));
  B.add('stoneDark', boxM(900, 1.6, 0.9, 0, -1.7, northBank - 1.4, 1));
  balustrade(B, { from: [-450, northBank - 1.4], to: [450, northBank - 1.4], h: 0.9, gap: 1.7 });
  B.add('paving', boxM(900, 0.5, 12, 0, -0.5, northBank - 8, 1));
  for (let i = 0; i < 30; i++) {
    const x = -430 + i * 30;
    lampPost(B, { x, z: northBank - 3.2, h: 5.2, arms: 2 });
    anchors.push({ pos: [x, 1.3, northBank - 3.2], color: '#ffbe82', width: 2.4, depth: 9, intensity: 0.4 });
  }

  /* -------------------------------------------------------------- 楼群 */
  /** 一排楼：沿 X 摆，深度方向随机错位，高度由 hBase + 长尾随机 */
  function row({ z0, dz, x0, x1, hBase, hVar, step, key }) {
    for (let x = x0; x < x1; x += step) {
      const w = rr(step * 0.55, step * 0.92);
      const d = rr(dz * 0.55, dz * 0.95);
      const h = hBase + Math.pow(rand(), 1.6) * hVar;
      const z = z0 + rr(-dz * 0.25, dz * 0.25);
      const cx = x + rr(-step * 0.12, step * 0.12);
      BT.add(key, boxM(w, h, d, cx, 0, z, 1));
      // 屋顶设备与女儿墙：远处只剩一条参差的边
      BT.add('silhouette', boxM(w * 0.9, 0.6, d * 0.9, cx, h, z, 1));
      if (rand() > 0.55) BT.add('silhouette', box(w * 0.22, rr(1.4, 3.4), d * 0.22, cx + rr(-w * 0.2, w * 0.2), h + 0.6, z));
      if (rand() > 0.8) BT.add(glowKey('#ff6a5a', 1.6), place(new THREE.SphereGeometry(0.35, 6, 5), { x: cx, y: h + rr(3, 6), z }));
    }
  }

  // 紧贴对岸的老城：六到十一层的砖混，灯窗密而小
  row({ z0: northBank - 34, dz: 16, x0: -430, x1: 430, hBase: 14, hVar: 20, step: 26, key: 'city', floors: 6 });
  row({ z0: northBank - 62, dz: 18, x0: -420, x1: 420, hBase: 18, hVar: 26, step: 30, key: 'cityCool' });
  // 更外的新城：少量高层，夜里是光害的来源
  row({ z0: northBank - 118, dz: 30, x0: -380, x1: 380, hBase: 42, hVar: 52, step: 52, key: 'city' });
  row({ z0: northBank - 178, dz: 34, x0: -340, x1: 340, hBase: 56, hVar: 66, step: 64, key: 'cityCool' });

  // 东西两侧收口：河在东南转角处拐弯，两边的楼把画面夹住
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const z = northBank - 6 + i * 26 + rr(-6, 6);
      const w = rr(14, 24), d = rr(14, 22);
      const h = 16 + Math.pow(rand(), 1.5) * 34;
      BT.add(i % 2 ? 'city' : 'cityCool', boxM(w, h, d, sx * (RIVER.halfWidth + 34 + rr(0, 26)), 0, z, 1));
      BT.add('silhouette', boxM(w * 0.9, 0.5, d * 0.9, sx * (RIVER.halfWidth + 34), h, z, 1));
    }
  }

  /* -------------------------------------------------------- 跨河公路桥（写意） */
  {
    const bx = 268, deck = 5.6, z0 = RIVER.northZ - 26, z1 = RIVER.southZ + 16, len = z1 - z0, cz = (z0 + z1) / 2;
    // 桥面沿 Z 跨过河（河是东西向的一条带）
    BT.add('stone', boxM(12.5, 0.8, len, bx, deck - 0.8, cz, 1));
    for (const s of [-1, 1]) BT.add('silhouette', boxM(1.1, 1.2, len, bx + s * 5.7, deck, cz, 1));
    for (const pz of [z0 + 30, cz, z1 - 30]) {
      BT.add('silhouette', boxM(10, 9, 3.6, bx, -4, pz, 1));
    }
    for (let i = 0; i < 15; i++) {
      const z = z0 + 8 + (i / 14) * (len - 16);
      for (const s of [-1, 1]) {
        BT.add('ironwork', box(0.14, 2.6, 0.14, bx + s * 5.7, deck, z));
        BT.add(glowKey('#ffce8f', 2.0), place(new THREE.SphereGeometry(0.2, 6, 5), { x: bx + s * 5.7, y: deck + 2.7, z }));
        anchors.push({ pos: [bx + s * 5.7, deck, z], color: '#ffce8f', width: 1.8, depth: 7, intensity: 0.3 });
      }
    }
  }

  B.flush(group);
  const meshes = BT.flush(towers);

  return { group, towers, meshes, anchors };
}
