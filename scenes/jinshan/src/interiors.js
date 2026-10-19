import * as THREE from 'three';
import { lit, glow, mesh, box, lanternGeo, M } from './kit.js';
import * as T from './textures.js';
import { LAYOUT } from './architecture.js';
import { AXIS } from './layout.js';

/**
 * 三处进得去的空间：慈寿塔底层的塔室（旋式木梯从这里起）、大雄宝殿的殿内，
 * 和停在码头边的那艘画舫。塔室与殿内跟着场景静止，船舱直接挂成船的子系统。
 *
 * 外壁是单面几何，从里面看会穿帮——所以每一处都要再套一层 BackSide 的内壳。
 */
export function buildInteriors(scene, quarter, boat) {
  const stone = lit('#8f95a1', { map: T.stone('#7c828e'), rough: 0.92 });
  const brickIn = lit('#b9ad95', { map: T.brickWall('#6d6455', '#3b3630', '#968b74'), rough: 0.95, side: THREE.BackSide });
  const wallIn = lit('#d8c8a2', { map: T.plaster('#bda87f'), rough: 0.95, side: THREE.BackSide });

  /* ------------------------------------------------------------ 塔室 */
  const tower = new THREE.Group();
  tower.position.copy(LAYOUT.tower.pos);
  const tw = 13.0, th = 5.2;
  const room = new THREE.Mesh(new THREE.CylinderGeometry(tw / 2, tw / 2, th, 8, 1, true), brickIn);
  room.position.y = th / 2 + 0.2;
  tower.add(room);
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(tw / 2 + 0.2, tw / 2 + 0.2, 0.3, 8).translate(0, th + 0.35, 0), stone));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(tw / 2 - 0.1, tw / 2 - 0.1, 0.24, 8).translate(0, 0.12, 0),
    lit('#c8ced8', { map: T.paving(), rough: 0.9 })));

  // 旋式木梯：绕着塔心一路盘上去
  const stairGeo = box(1.8, 0.16, 0.66, 0, 0, 0);
  const steps = new THREE.InstancedMesh(stairGeo, lit('#6b4a30', { map: T.wood('#4e3421', '#221408'), rough: 0.86 }), 68);
  const d = new THREE.Object3D();
  const turns = 4.2;
  for (let i = 0; i < 68; i++) {
    const a = (i / 68) * Math.PI * 2 * turns;
    const r = 3.5;
    d.position.set(Math.cos(a) * r, 0.5 + (i / 68) * (th - 0.4), Math.sin(a) * r);
    d.rotation.set(0, -a, 0);
    d.scale.setScalar(1);
    d.updateMatrix(); steps.setMatrixAt(i, d.matrix);
  }
  d.rotation.set(0, 0, 0);
  tower.add(steps);
  const newel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, th, 10), lit('#4e3421', { map: T.wood('#3a2716', '#1a0f06'), rough: 0.85 }));
  newel.position.y = th / 2;
  tower.add(newel);

  // 长明的一排灯与一张经案
  const table = new THREE.Mesh(box(4.2, 0.6, 1.3, 0, 0.8, -tw / 2 + 1.6), lit('#5f4227', { map: T.wood('#4a3220', '#1f1208'), rough: 0.82 }));
  tower.add(table);
  const candleGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.32, 8);
  const candles = new THREE.InstancedMesh(candleGeo, lit('#e8dcc0', { rough: 0.7, emissive: '#c99a52', ei: 1.4 }), 6);
  const flames = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), glow('#ffcf8a', 3.4), 6);
  for (let i = 0; i < 6; i++) {
    const x = -1.7 + i * 0.68;
    d.position.set(x, 1.28, -tw / 2 + 1.6); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix();
    candles.setMatrixAt(i, d.matrix);
    d.position.y = 1.52; d.updateMatrix(); flames.setMatrixAt(i, d.matrix);
  }
  tower.add(candles, flames);
  const towerLight = new THREE.PointLight(0xffbe78, 24, 24, 2);
  towerLight.position.set(0, 3.4, 1.2);
  tower.add(towerLight);
  scene.add(tower);

  /* ------------------------------------------------------------ 殿内 */
  const hall = new THREE.Group();
  const hs = AXIS.hall2;
  hall.position.copy(LAYOUT.hall.pos);
  hall.rotation.y = -Math.PI / 2;                 // 与大殿同向：正面朝西
  const ih = quarter.hall.bodyH - 0.5, iw = hs.w - 0.9, id = hs.d - 0.9;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(iw, ih, id), wallIn);
  shell.position.y = ih / 2;
  hall.add(shell);
  hall.add(new THREE.Mesh(box(iw - 0.2, 0.1, id - 0.2, 0, 0.05, 0), lit('#c4cad4', { map: T.paving(), rough: 0.9 })));
  // 金柱一圈
  const colGeo = new THREE.CylinderGeometry(0.34, 0.36, ih, 10);
  const cols = new THREE.InstancedMesh(colGeo, M.vermilion, 10);
  let ci = 0;
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    d.position.set(sx * (iw / 2 - 1.4), ih / 2, -id / 2 + 1.6 + i * (id - 3.2) / 3);
    d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); cols.setMatrixAt(ci++, d.matrix);
  }
  for (const sx of [-0.28, 0.28]) for (let i = 0; i < 2; i++) {
    d.position.set(sx * iw, ih / 2, -id / 2 + 2.4 + i * (id - 4.8));
    d.updateMatrix(); cols.setMatrixAt(ci++, d.matrix);
  }
  cols.count = ci;
  hall.add(cols);
  // 后门那面的经柜与一间佛龛：龛前只留背光那道弧，不塑像
  const shelf = new THREE.Mesh(new THREE.PlaneGeometry(iw - 1.2, ih * 0.62),
    new THREE.MeshBasicMaterial({ map: T.sutraWall(), toneMapped: false }));
  shelf.position.set(0, ih * 0.42, -id / 2 + 0.5);
  hall.add(shelf);
  const shrine = mesh([
    new THREE.TorusGeometry(1.5, 0.12, 8, 20, Math.PI).translate(0, 2.3, 0),
    box(3.2, 0.5, 1.4, 0, 1.1, 0),
  ], M.gilt);
  shrine.position.set(0, 0, -id / 2 + 2.4);
  hall.add(shrine);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), glow('#ffd7a0', 1.5));
  halo.scale.set(1, 1.3, 0.35);
  halo.position.set(0, 2.6, -id / 2 + 2.7);
  hall.add(halo);
  const altar = new THREE.Mesh(box(3.6, 1.0, 1.5, 0, 0.5, -id / 2 + 4.2), lit('#5f4227', { map: T.wood('#4a3220', '#1f1208'), rough: 0.82 }));
  hall.add(altar);
  for (const s of [-1, 1]) {
    const lam = new THREE.Mesh(lanternGeo(0.3, 0.42), glow('#ffbe72', 2.2));
    lam.position.set(s * 2.4, 2.9, 0.6);
    hall.add(lam);
  }
  const hallLight = new THREE.PointLight(0xffb060, 30, 30, 2);
  hallLight.position.set(0, ih * 0.8, 0);
  hall.add(hallLight);
  scene.add(hall);

  /* ------------------------------------------------------------ 船舱 */
  const cabin = new THREE.Group();
  const liner = new THREE.Mesh(box(3.0, 2.0, 6.4, 0, 1.4, 0), lit('#3a2f26', { rough: 0.9, side: THREE.BackSide }));
  cabin.add(liner);
  const winGeo = new THREE.PlaneGeometry(1.2, 0.9);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const lat = new THREE.Mesh(winGeo, M.lattice);
    lat.position.set(s * 1.5, 1.6, -2.0 + i * 2.0);
    lat.rotation.y = s * Math.PI / 2;
    cabin.add(lat);
  }
  const seatGeo = box(0.9, 0.45, 1.5, 0, 0.7, 0);
  const seats = new THREE.InstancedMesh(seatGeo, lit('#4a2c26', { map: T.wood('#3c241d', '#1c0f0a'), rough: 0.85 }), 6);
  for (let i = 0; i < 6; i++) {
    d.position.set(i % 2 ? 0.62 : -0.62, 0, -1.9 + Math.floor(i / 2) * 1.6);
    d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix();
    seats.setMatrixAt(i, d.matrix);
  }
  cabin.add(seats);
  const roofLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow('#ffe3b0', 2.6));
  roofLamp.position.set(0, 2.2, 0);
  cabin.add(roofLamp);
  const boatLight = new THREE.PointLight(0xffd6a0, 12, 11, 2);
  boatLight.position.set(0, 2.1, 0);
  cabin.add(boatLight);
  boat.add(cabin);

  return {
    tower: { group: tower, light: towerLight, flames: candles },
    hall: { group: hall, light: hallLight, halo },
    cabin: { group: cabin, light: boatLight },
    update(t) {
      const f = 0.86 + 0.14 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
      flames.material.color.setRGB(1, 0.78 * f, 0.42 * f);
      towerLight.intensity = 24 * (0.9 + 0.1 * Math.sin(t * 4.7));
      hallLight.intensity = 30 * (0.92 + 0.08 * Math.sin(t * 2.9));
      boatLight.intensity = 12 * (0.94 + 0.06 * Math.sin(t * 2.3));
    },
  };
}
