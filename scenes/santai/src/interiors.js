import * as THREE from 'three';
import { lit, glow, mesh, box, rand, rr } from './kit.js';
import * as T from './textures.js';
import { LAYOUT } from './architecture.js';
import { terrainH } from './environment.js';
import { TOWER } from './layout.js';

/**
 * 两处进得去的空间：天和塔下的碑室（花信碑在此），和夜里停在站台的那节车。
 * 塔室跟着场景静止；车厢会动，所以车厢内部直接挂成car的子节点。
 */
export function buildInteriors(scene, car) {
  const stone = lit('#8f95a1', { map: T.stone('#7c828e'), rough: 0.92 });
  const wallMat = lit('#c9bda4', { map: T.plaster('#b6a88c'), rough: 0.95 });

  /* ------------------------------------------------------------ 塔下碑室 */
  const tower = new THREE.Group();
  const gy = terrainH(TOWER.x, TOWER.z);
  tower.position.set(TOWER.x, gy, TOWER.z);
  const w = 8.2, h = 5.4, dep = 8.2;
  const shell = [];
  shell.push(box(w, 0.3, dep, 0, 0.15, 0));                       // 室底
  shell.push(box(w + 1, 0.4, dep + 1, 0, h + 0.2, 0));            // 顶
  shell.push(box(w, h, 0.4, 0, h / 2, -dep / 2));                 // 三面墙
  shell.push(box(0.4, h, dep, -w / 2, h / 2, 0));
  shell.push(box(0.4, h, dep, w / 2, h / 2, 0));
  const room = new THREE.Mesh(mergeAll(shell), wallMat);
  room.material.side = THREE.BackSide;
  tower.add(room);
  tower.add(new THREE.Mesh(box(w - 0.2, 0.06, dep - 0.2, 0, 0.32, 0), stone));

  // 花信碑：廿四候的名字全刻在这面上
  const stele = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 5.4),
    new THREE.MeshBasicMaterial({ map: T.huaxinStone(), toneMapped: false }),
  );
  stele.position.set(0, 2.9, -dep / 2 + 0.24);
  tower.add(stele);
  const steleFrame = new THREE.Mesh(box(3.9, 5.9, 0.3, 0, 2.9, -dep / 2 + 0.06), lit('#6f7684', { map: T.stone('#5f6674'), rough: 0.9 }));
  tower.add(steleFrame);

  // 灯：长明的一排，碑前最亮
  const candleGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.34, 8);
  const candles = new THREE.InstancedMesh(candleGeo, lit('#e8dcc0', { rough: 0.7, emissive: '#c99a52', ei: 1.4 }), 7);
  const flames = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), glow('#ffcf8a', 3.2), 7);
  const d = new THREE.Object3D();
  for (let i = 0; i < 7; i++) {
    const x = -2.4 + i * 0.8;
    d.position.set(x, 0.95, -2.2 + (i % 2) * 0.4); d.updateMatrix(); candles.setMatrixAt(i, d.matrix);
    d.position.y = 1.2; d.updateMatrix(); flames.setMatrixAt(i, d.matrix);
  }
  tower.add(candles, flames);
  const table = new THREE.Mesh(box(6, 0.7, 1.4, 0, 0.6, -2.1), lit('#6a4a30', { map: T.wood('#543822', '#26160b'), rough: 0.8 }));
  tower.add(table);

  const towerLight = new THREE.PointLight(0xffbe78, 26, 26, 2);
  towerLight.position.set(0, 3.6, -1.2);
  tower.add(towerLight);

  // 盘旋上铃架的梯
  const stairGeo = box(1.7, 0.16, 0.62, 0, 0, 0);
  const steps = new THREE.InstancedMesh(stairGeo, lit('#7c8290', { map: T.stone('#6c7280'), rough: 0.9 }), 34);
  const n = LAYOUT.tower.top - gy - 2.2;
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 3.2;
    const r = 2.6;
    d.position.set(TOWER.x + Math.cos(a) * r - TOWER.x, 0.6 + (i / 34) * n, TOWER.z + Math.sin(a) * r - TOWER.z);
    d.rotation.set(0, -a, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix(); steps.setMatrixAt(i, d.matrix);
  }
  d.rotation.set(0, 0, 0);
  const stairWrap = new THREE.Group();
  stairWrap.position.set(0, 0, 0);
  stairWrap.add(steps);
  tower.add(stairWrap);
  scene.add(tower);

  /* ------------------------------------------------------------ 车厢内部 */
  const cabin = new THREE.Group();
  const liner = new THREE.Mesh(box(2.2, 1.45, 4.3, 0, 1.35, 0), lit('#2c333b', { rough: 0.9 }));
  liner.material = liner.material.clone();
  liner.material.side = THREE.BackSide;
  cabin.add(liner);
  const seatGeo = box(0.9, 0.5, 1.6, 0, 0.72, 0);
  const seats = new THREE.InstancedMesh(seatGeo, lit('#4a2c26', { map: T.wood('#3c241d', '#1c0f0a'), rough: 0.85 }), 8);
  for (let i = 0; i < 8; i++) {
    d.position.set(i % 2 ? 0.55 : -0.55, 0, -1.7 + Math.floor(i / 2) * 1.15);
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix();
    seats.setMatrixAt(i, d.matrix);
  }
  cabin.add(seats);
  const roofLamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), glow('#ffe3b0', 2.8));
  roofLamp.position.set(0, 2.0, 0);
  cabin.add(roofLamp);
  const carLight = new THREE.PointLight(0xffd6a0, 12, 9, 2);
  carLight.position.set(0, 1.9, 0);
  cabin.add(carLight);
  car.add(cabin);

  return {
    tower: { group: tower, light: towerLight, stele },
    cabin: { group: cabin, light: carLight },
    update(t) {
      const f = 0.86 + 0.14 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
      flames.material.color.setRGB(1, 0.78 * f, 0.42 * f);
      towerLight.intensity = 26 * (0.9 + 0.1 * Math.sin(t * 4.7));
      carLight.intensity = 12 * (0.94 + 0.06 * Math.sin(t * 2.3));
    },
  };
}

function mergeAll(list) {
  const pos = [], uv = [], idx = [];
  let vo = 0;
  for (const g of list) {
    const p = g.attributes.position.array, u = g.attributes.uv.array, ix = g.index.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + vo);
    vo += p.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
