/**
 * 引桥、岸与今市。
 * 公路桥 4589 米 = 正桥 1576 + 南北引桥 3013；两引桥如何分工查无明细，
 * 此处南 1450 / 北 1563、排架 26 米一档（写意）。下层铁路另幅偏出桥轴。
 */
import * as THREE from 'three';
import {
  APPROACH, MAIN_END, GIRDER, RIVER, CITY, BUOY,
  groundY, roadY, railY,
} from './data.js';
import { M, box, mesh, cyl, quadGrid, halo, rand, rr, glow, remat } from './kit.js';

const { deckW, railDeckW } = GIRDER;

/** 一段按坡度转好的箱梁：顶面贴在 yFn 上 */
function slopedSlab(z0, z1, width, thick, yFn, xOffset = 0) {
  const a = Math.min(z0, z1), b = Math.max(z0, z1);
  const zm = (a + b) / 2, len = b - a;
  const slope = (yFn(b) - yFn(a)) / (b - a);
  const g = new THREE.BoxGeometry(width, thick, len);
  g.translate(0, -thick / 2, 0);
  g.rotateX(-Math.atan(slope));
  g.translate(xOffset, yFn(zm), zm);
  return g;
}

/** 排架：两根柱 + 一根帽梁，从自然地面顶到梁底 */
function bents(xOffset, yFn, deckThick, colHalf, from, to, step) {
  const parts = [];
  for (let z = from; z <= to + 0.01; z += step) {
    const yBottom = groundY(xOffset, z) - 0.6;
    const yTop = yFn(z) - deckThick;
    const H = Math.max(1.0, yTop - yBottom);
    for (const sx of [-1, 1]) {
      parts.push(box(2.0, H, 2.0, xOffset + sx * colHalf, yBottom, z));
    }
    parts.push(box(colHalf * 2 + 3.2, 1.1, 2.2, xOffset, yTop - 1.1, z));
    if (H > 14) {
      // 高排架加一道横撑
      parts.push(box(colHalf * 2, 0.8, 0.8, xOffset, yBottom + H * 0.55, z));
    }
  }
  return parts;
}

/* ------------------------------------------------------------------ 引桥 */

function roadApproach() {
  const parts = [];
  const b = [];
  const step = APPROACH.bentStep;
  for (const sgn of [1, -1]) {
    const to = sgn > 0 ? APPROACH.southEnd : APPROACH.northEnd;
    const lo = Math.min(MAIN_END, to), hi = Math.max(MAIN_END, to);
    for (let z = lo; z < hi; z += step) {
      const z1 = Math.min(z + step, hi);
      parts.push(slopedSlab(z, z1, deckW, 2.4, roadY));
      // 护栏：与正桥栏板同高，但不再嵌浮雕
      const zm = (z + z1) / 2;
      for (const sx of [-1, 1]) {
        b.push(box(0.22, 1.15, z1 - z, sx * (deckW / 2 - 0.1), roadY(zm) - 0.2, zm));
      }
    }
    b.push(...bents(0, roadY, 2.4, deckW / 2 - 1.6, Math.ceil(lo / step) * step, Math.floor(hi / step) * step, step));
  }
  return { deck: parts, rail: b };
}

function railApproach() {
  const parts = [];
  const step = APPROACH.bentStep;
  const x = APPROACH.railOffset;
  for (const sgn of [1, -1]) {
    const to = sgn * APPROACH.railViaductEnd;
    const lo = Math.min(MAIN_END, to), hi = Math.max(MAIN_END, to);
    for (let z = lo; z < hi; z += step) {
      parts.push(slopedSlab(z, Math.min(z + step, hi), railDeckW + 1.2, 2.0, (zz) => railY(zz), x));
    }
    // 落坡之后转为路基
    if (sgn > 0) parts.push(box(railDeckW + 2.4, 3.0, 240, x, APPROACH.railEndY - 3.0, APPROACH.railViaductEnd + 110));
    else parts.push(box(railDeckW + 2.4, 3.0, 240, x, APPROACH.railEndY - 3.0, -APPROACH.railViaductEnd - 110));
  }
  const cols = [];
  for (let z = -APPROACH.railViaductEnd; z <= APPROACH.railViaductEnd; z += step) {
    const yBottom = groundY(x, z) - 0.6;
    const yTop = railY(z) - 2.0;
    const H = Math.max(0.8, yTop - yBottom);
    if (H < 2.2) continue;
    for (const sx of [-1, 1]) cols.push(box(1.8, H, 1.9, x + sx * (railDeckW / 2 - 0.6), yBottom, z));
    cols.push(box(railDeckW + 2.4, 0.9, 1.8, x, yTop - 0.9, z));
  }
  return { deck: parts, cols };
}

/* ------------------------------------------------------------------ 正桥与引桥的接驳 */

function transitionPiers() {
  // 正桥头的一对墩：把上层的梁落到桥台上
  const parts = [];
  for (const z of [MAIN_END, -MAIN_END]) {
    const yBottom = groundY(0, z) - 1.0;
    const H = Math.max(3, GIRDER.bottomY - yBottom);
    parts.push(box(16, H, 7, 0, yBottom, z));
    parts.push(box(17.6, 1.6, 8.6, 0, GIRDER.bottomY - 1.6, z));
  }
  return parts;
}

/* ------------------------------------------------------------------ 岸与堤 */

function terrain() {
  // 网格要够密：太稀的话滩岸那一段的插值面会高过解析地面，机位会被埋进土里
  const N = 108, M2 = 92;
  return quadGrid((u, v) => {
    const x = -RIVER.xTo + u * 2 * RIVER.xTo;
    const z = -3300 + v * 6600;
    return [x, groundY(x, z), z];
  }, M2, N, { spanU: 2 * RIVER.xTo / 40, spanV: 6600 / 40 });
}

function revetment() {
  // 两岸的砌石护坡与堤顶路（写意）
  const parts = [];
  for (const sgn of [1, -1]) {
    for (let x = -RIVER.xTo; x < RIVER.xTo; x += 40) {
      const z0 = sgn * (RIVER.beachFrom + 20), z1 = sgn * (RIVER.beachTo + 8);
      const y0 = groundY(x, z0), y1 = groundY(x, z1);
      parts.push(box(40, Math.max(1.2, Math.abs(y1 - y0) + 1.4), 3.0, x + 20, Math.min(y0, y1) - 0.6, (z0 + z1) / 2));
    }
    // 堤顶路
    parts.push(box(2 * RIVER.xTo, 0.4, 16, 0, groundY(0, sgn * (RIVER.beachTo + 26)) - 0.4, sgn * (RIVER.beachTo + 26)));
  }
  return parts;
}

/* ------------------------------------------------------------------ 今市 */

function cityBlocks(scene) {
  const items = [];
  for (const band of CITY.blocks) {
    for (let i = 0; i < band.n; i++) {
      const x = rr(band.xFrom, band.xTo);
      const z = rr(band.zFrom, band.zTo);
      const w = rr(14, 34);
      const dp = rr(14, 30);
      const tall = rand() < band.tall;
      const h = tall ? rr(58, 128) : rr(12, 34);
      items.push({ x, z: band.side > 0 ? Math.abs(z) : -Math.abs(z), w, dp, h, tall });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(geo, M.city, items.length);
  im.name = 'city';
  const d = new THREE.Object3D();
  items.forEach((it, i) => {
    d.position.set(it.x, groundY(it.x, it.z), it.z);
    d.scale.set(it.w, it.h, it.dp);
    d.rotation.set(0, rand() * 0.5, 0);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);

  // 楼顶的一盏障碍灯：夜里远处读得出高度
  const spark = new THREE.Group();
  spark.name = 'roof-lights';
  for (const it of items) {
    if (!it.tall) continue;
    const y = groundY(it.x, it.z) + it.h;
    spark.add(mesh(box(1.1, 1.1, 1.1, it.x, y - 0.4, it.z), glow('#ff5040', 1.1)));
  }
  scene.add(spark);
  return { im, spark, items };
}

function quays(scene) {
  const grp = new THREE.Group();
  grp.name = 'quays';
  for (const q of [CITY.quay, CITY.quayN]) {
    const sgn = Math.sign(q.z);
    // 堤上一段平台 + 一座趸船与引桥（码头之名不指实，写意）
    grp.add(mesh(box(q.xTo - q.xFrom, 0.6, 22, (q.xFrom + q.xTo) / 2, q.y - 0.6, q.z), remat(M.plaza, 24, 6)));
    const barge = mesh([
      box(26, 3.0, 11, q.xTo + 20, 0.6, q.z - sgn * 4),
      box(9, 3.4, 8, q.xTo + 26, 3.6, q.z - sgn * 4),
    ], M.ship);
    barge.name = 'barge';
    grp.add(barge);
    grp.add(mesh(box(24, 0.7, 4, q.xTo + 8, q.y - 1.2, q.z - sgn * 2), M.deckPlate));
    for (let i = 0; i < 5; i++) {
      const px = q.xFrom + i * ((q.xTo - q.xFrom) / 4);
      grp.add(mesh(cyl(0.24, 0.2, 5.4, 8, px, q.y - 0.2, q.z + sgn * 8), M.concrete));
      grp.add(mesh(cyl(0.6, 0.5, 0.7, 8, px, q.y + 5.2, q.z + sgn * 8), M.lampGlobe));
      halo(grp, px, q.y + 5.6, q.z + sgn * 8, 5.2, '255,214,158', { opacity: 0.5 });
    }
  }
  scene.add(grp);
  return grp;
}

function buoys(scene) {
  const grp = new THREE.Group();
  grp.name = 'buoys';
  const geo = new THREE.SphereGeometry(0.9, 8, 6);
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const body = new THREE.InstancedMesh(geo, M.ship, 64);
  const light = new THREE.InstancedMesh(lampGeo, M.markRed, 64);
  body.name = 'buoy-body';
  light.name = 'buoy-light';
  const d = new THREE.Object3D();
  let n = 0;
  for (const z of BUOY.rows) {
    for (let x = -RIVER.xTo + 120; x < RIVER.xTo && n < 64; x += BUOY.step) {
      d.position.set(x + (n % 3) * 22, BUOY.y, z);
      d.updateMatrix();
      body.setMatrixAt(n, d.matrix);
      d.position.y = BUOY.y + 1.5;
      d.updateMatrix();
      light.setMatrixAt(n, d.matrix);
      n++;
    }
  }
  body.count = n; light.count = n;
  body.instanceMatrix.needsUpdate = true;
  light.instanceMatrix.needsUpdate = true;
  grp.add(body, light);
  scene.add(grp);
  return { grp, body, light, count: n };
}

/* ------------------------------------------------------------------ 装配 */

export function buildApproach(scene) {
  const root = new THREE.Group();
  root.name = 'approach';

  const road = roadApproach();
  root.add(mesh(road.deck, remat(M.concrete, 5, 7)));
  root.add(mesh(road.rail, M.railing));
  const rail = railApproach();
  root.add(mesh(rail.cols, M.concreteDark));
  root.add(mesh(rail.deck, remat(M.concrete, 4, 7)));
  root.add(mesh(transitionPiers(), M.pier));
  scene.add(root);

  const ground = mesh(terrain(), M.ground);
  ground.name = 'ground';
  scene.add(ground);
  scene.add(mesh(revetment(), M.stone));

  const city = cityBlocks(scene);
  const quay = quays(scene);
  const buoy = buoys(scene);

  return {
    group: root,
    ground, city, quay, buoy,
    roadDeckY: roadY,
    railDeckY: railY,
  };
}
