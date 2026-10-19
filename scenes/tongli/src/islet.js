import * as THREE from 'three';
import { mergeAll,  mesh, lit, rand, rr, meterBox } from './kit.js';
import * as T from './textures.js';
import { ISLET, BANK } from './data.js';
import { polyToShape, offsetPoly } from './land.js';
import { hallOf, pavilionOf, towerOf } from './garden.js';
import { lampBatch } from './lamps.js';

/**
 * 罗星洲。
 *
 * 可核的只有四件事：在同里湖中、明嘉靖四十二年（1563）筑圩、清道光三年（1823）
 * 因淘河堆土而成洲、四面环水无桥可通须渡船乃登；面积今约 4500 平米与"原 17000
 * 平米"两数并存；洲上庙宇多毁于抗战兵火，2005 年整治、2011 年起收回集体。
 * 殿阁的名目与形制查不到可核来源，所以这里不题一匾一字，只按"湖心一块地、
 * 岸边一处渡口、往里几进屋宇"摆——写意补配，不作史料。
 */

const EARTH = lit('#37422f', { map: T.paving({ meters: 2.6, base: '#2f3a2c' }), rough: 0.96 });
const STONE = lit('#7f8790', { map: T.paving({ meters: 1.3, base: '#767e86' }), rough: 0.9, side: THREE.DoubleSide });
const PLASTER = lit('#c1c9c6', { map: T.plaster({ meters: 2.6, base: '#c7cfcb' }), rough: 0.94, side: THREE.DoubleSide });
const TILE = lit('#3f4d5c', { map: T.tiles({ meters: 1.1, base: '#333f4c' }), rough: 0.72, side: THREE.DoubleSide, emissive: '#18232f', ei: 0.3 });

/** 洲形：一个抖动的圆，北半略宽 */
function isletPoly() {
  const n = 34, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rand() - 0.5) * 0.3 + 0.1 * Math.cos(a * 2 + 1.1);
    out.push([ISLET.x + Math.cos(a) * ISLET.r * k, ISLET.z + Math.sin(a) * ISLET.r * k * 0.86]);
  }
  return out;
}

export function buildIslet(scene) {
  const poly = isletPoly();
  const group = new THREE.Group();
  group.name = 'luoxing-islet';

  /* ---- 洲体：从水下垒到洲顶 */
  const solid = new THREE.ExtrudeGeometry(polyToShape(poly), {
    depth: ISLET.y + 2.4, bevelEnabled: false, curveSegments: 8, steps: 1 });
  solid.rotateX(-Math.PI / 2);
  solid.translate(0, -2.4, 0);
  const body = new THREE.Mesh(solid, EARTH);
  body.name = 'islet-body';
  body.receiveShadow = true;
  group.add(body);

  /* ---- 渡口：一段石堤、三级石阶、一座待渡亭 */
  const W = ISLET.wharf;
  const stone = [];
  stone.push(meterBox(9, 0.5, 4.6, W.x, ISLET.y - 0.3, W.z));
  for (let k = 0; k < 3; k++) {
    stone.push(meterBox(2.4, 0.4, 0.7, W.x - 5.2 - k * 0.7, ISLET.y - 0.3 - 0.42 - k * 0.44, W.z));
  }
  // 系船石与一道矮护栏
  for (const dz of [-1.6, 1.6]) {
    const p = new THREE.CylinderGeometry(0.2, 0.24, 0.7, 7);
    p.translate(W.x - 4.2, ISLET.y + 0.1, W.z + dz);
    stone.push(p);
  }
  group.add(mesh(mergeAll(stone), STONE));

  /* ---- 屋宇：门一间、殿两进、后阁一层，全不题名 */
  const toN = (d) => [ISLET.x + d * 0.18, W.z - d];   // 从渡口往里（向北）
  group.add(pavilionOf({
    id: 'islet-pavilion', x: W.x + 3.6, z: W.z - 2.2, rot: -Math.PI / 2, half: 2.2, plaqueText: null }));
  group.add(hallOf({
    id: 'islet-hall1', x: ISLET.x + 2, z: ISLET.z - 4, rot: Math.PI,
    w: 10.5, d: 6.4, h: 4.2, bays: 3, rise: 1.9, openMiddle: false, plaqueText: null }));
  group.add(hallOf({
    id: 'islet-hall2', x: ISLET.x + 1, z: ISLET.z + 14, rot: Math.PI,
    w: 8.6, d: 5.6, h: 3.9, bays: 3, rise: 1.7, openMiddle: false, plaqueText: null }));
  group.add(towerOf({
    id: 'islet-tower', x: ISLET.x - 12, z: ISLET.z + 4, rot: Math.PI / 2, w: 5, d: 4.4, plaqueText: null }));
  void toN;

  /* ---- 洲岸的一圈石驳与一条环洲的小路 */
  const rimParts = [];
  const outer = offsetPoly(poly, -0.2), inner = offsetPoly(poly, 2.4);
  {
    const n = Math.min(outer.length, inner.length);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < n; i++) {
      pos.push(outer[i][0], ISLET.y + 0.3, outer[i][1], inner[i][0], ISLET.y + 0.12, inner[i][1]);
      uv.push(outer[i][0] / 1.4, outer[i][1] / 1.4, inner[i][0] / 1.4, inner[i][1] / 1.4);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    rimParts.push(g);
  }
  group.add(mesh(mergeAll(rimParts), STONE));

  /* ---- 灯：渡口一对、殿前一对、阁上一只 */
  const spots = [
    [W.x - 5.4, ISLET.y + 2.2, W.z - 1.8, 0.26],
    [W.x - 5.4, ISLET.y + 2.2, W.z + 1.8, 0.26],
    [ISLET.x - 3.4, ISLET.y + 3.3, ISLET.z - 7.6, 0.28],
    [ISLET.x + 7.4, ISLET.y + 3.3, ISLET.z - 7.6, 0.28],
    [ISLET.x - 12, ISLET.y + 5.6, ISLET.z + 1.4, 0.24],
  ];
  const { shells, halos } = lampBatch(spots, { tint: '#ffcf98', bright: 1.2 });
  halos.name = 'islet-halos';
  group.add(shells);
  group.add(halos);

  // 洲上不能黑成一块：给一点月光之外的暖洗，让轮廓从湖面里读出来
  scene.add(group);
  return {
    group, poly,
    realLights: [
      { x: W.x - 4, y: ISLET.y + 2.4, z: W.z, i: 260, d: 26, c: '#ffcaa0' },
      { x: ISLET.x + 2, y: ISLET.y + 4.4, z: ISLET.z - 4, i: 220, d: 30, c: '#ffd8ae' },
    ],
    waterLamps: spots.map(([x, , z]) => [x, z]) };
}
