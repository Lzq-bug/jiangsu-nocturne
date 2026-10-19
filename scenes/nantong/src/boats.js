/**
 * 濠河夜游的画舫：两艘在航道里对开，一艘泊在西端的小码头边。
 * 船身是通用的仿古电动游船形制，不指认具体船号；夜游航线本身是真的
 * （入夜发船、全程约一个半小时），码头位置是画面安排。
 */
import * as THREE from 'three';
import { box, boxM, mesh, poly, barrelRoof } from './kit.js';
import { Batch, place, glowKey, lantern } from './parts.js';
import { RIVER } from './data.js';

const HULL = 12.4, BEAM = 3.3;

function boatGeometry(B, { bandColor = '#ff9f57', trim = '#ffd9a6' } = {}) {
  // 船底 + 舷墙
  B.add('timber', boxM(HULL * 0.96, 0.62, BEAM * 0.86, 0, -0.42, 0, 1));
  B.add('wood', boxM(HULL, 0.86, BEAM, 0, 0.16, 0, 1));
  // 艏：一个收尖的楔
  B.add('wood', poly([
    [[HULL / 2, 0.16, -BEAM / 2], [HULL / 2 + 2.1, 0.16, 0], [HULL / 2, 0.16, BEAM / 2]],
    [[HULL / 2, 1.02, -BEAM / 2], [HULL / 2, 1.02, BEAM / 2], [HULL / 2 + 2.1, 0.9, 0]],
    [[HULL / 2, 0.16, BEAM / 2], [HULL / 2 + 2.1, 0.16, 0], [HULL / 2, 1.02, BEAM / 2], [HULL / 2, 1.02, -BEAM / 2]],
    [[HULL / 2 + 2.1, 0.16, 0], [HULL / 2, 0.16, -BEAM / 2], [HULL / 2, 1.02, -BEAM / 2]],
    [[HULL / 2, 0.16, BEAM / 2], [HULL / 2 + 2.1, 0.16, 0], [HULL / 2 + 2.1, 0.9, 0]],
  ]));
  // 艉的平甲板与艏楼
  B.add('wood', boxM(3.4, 0.16, BEAM * 0.92, -HULL / 2 + 1.7, 1.02, 0, 1));
  // 舱：木壁 + 亮窗 + 卷棚顶
  const cab = HULL * 0.52;
  B.add('timber', boxM(cab, 1.75, BEAM * 0.74, -0.6, 1.02, 0, 1));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = -0.6 - cab / 2 + 0.75 + i * (cab - 1.2) / 3;
      B.add('litWindow', box(0.72, 0.86, 0.06, x, 1.55, s * BEAM * 0.37 + s * 0.02));
    }
  }
  B.add('litWindow', box(cab * 0.5, 0.7, 0.06, -0.6, 1.5, 0));
  B.add('tile', barrelRoof(cab + 1.5, BEAM * 0.92, 0.62, -0.6, 2.77, 0, { overhang: 0.3 }));
  // 舷边的灯串与檐口的一条亮带
  for (let i = 0; i < 9; i++) {
    const x = -HULL / 2 + 0.6 + i * (HULL - 1.2) / 8;
    for (const s of [-1, 1]) B.add(glowKey(bandColor, 1.5), place(new THREE.SphereGeometry(0.085, 6, 5), { x, y: 1.12, z: s * BEAM / 2 }));
  }
  B.add(glowKey(trim, 1.25), box(cab + 1.6, 0.07, 0.07, -0.6, 2.86, BEAM * 0.46));
  B.add(glowKey(trim, 1.25), box(cab + 1.6, 0.07, 0.07, -0.6, 2.86, -BEAM * 0.46));
  // 艏桅与一盏灯
  B.add('ironwork', box(0.1, 2.7, 0.1, HULL / 2 + 0.6, 0.9, 0));
  B.add(glowKey('#ffe6bf', 1.9), place(new THREE.SphereGeometry(0.14, 7, 6), { x: HULL / 2 + 0.6, y: 3.6, z: 0 }));
  lantern(B, { x: -HULL / 2 + 0.9, y: 1.9, z: 0, r: 0.2, color: '#ff8f4a' });
  // 尾浪：两条加法面片，名字带 media- 前缀，倒影镜像会跳过它们
  const wake = mesh(poly([
    [[-HULL / 2 - 0.2, 0.02, -BEAM * 0.5], [-HULL / 2 - 9, 0.02, -BEAM * 1.5], [-HULL / 2 - 9, 0.02, BEAM * 1.5], [-HULL / 2 - 0.2, 0.02, BEAM * 0.5]],
  ]), new THREE.MeshBasicMaterial({
    color: new THREE.Color('#9fc4e6').multiplyScalar(0.5), transparent: true, opacity: 0.2,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide,
  }));
  wake.name = 'media-wake';
  return wake;
}

function makeBoat(scene, columns, { x, z, dir, speed, bandColor, trim, phase }) {
  const grp = new THREE.Group();
  grp.rotation.y = dir > 0 ? 0 : Math.PI;
  const B = new Batch();
  const wake = boatGeometry(B, { bandColor, trim });
  B.flush(grp);
  grp.add(wake);
  grp.position.set(x, 0.06, z);
  scene.add(grp);
  const cols = [
    columns.add(new THREE.Vector3(x, 0, z + 1.2), bandColor, 2.2, 11, 0.85),
    columns.add(new THREE.Vector3(x - 3, 0, z - 1.2), trim, 1.6, 8, 0.6),
    columns.add(new THREE.Vector3(x + 5, 0, z), '#ffe6bf', 1.1, 6, 0.8),
  ];
  return { grp, cols, x0: x, z, dir, speed, phase, wake };
}

export function buildBoats(scene, columns) {
  const boats = [
    makeBoat(scene, columns, { x: -120, z: RIVER.channelZ + 12, dir: 1, speed: 3.4, bandColor: '#ff9f57', trim: '#ffd9a6', phase: 0 }),
    makeBoat(scene, columns, { x: 170, z: RIVER.channelZ - 14, dir: -1, speed: 2.8, bandColor: '#7fdcff', trim: '#cfeaff', phase: 2.4 }),
  ];

  /* ---------------------------------------------------- 西端泊船与小码头 */
  const dock = new THREE.Group();
  dock.name = 'dock';
  scene.add(dock);
  const DB = new Batch();
  const mx = -74, mz = -24;
  DB.add('wood', boxM(11, 0.22, 4.2, mx, 0.5, mz, 1));
  for (const ox of [-5, 0, 5]) for (const oz of [-1.6, 1.6]) {
    DB.add('timber', place(new THREE.CylinderGeometry(0.16, 0.18, 2.4, 8, 1), { x: mx + ox, y: -0.9, z: mz + oz }));
  }
  DB.add('stone', boxM(6, 0.4, 3, mx - 8, 0.1, mz, 1));
  DB.add('paving', boxM(9, 0.3, 8, mx - 13, -0.3, mz + 1, 1));
  for (const ox of [-4.6, 4.6]) {
    DB.add(glowKey('#ffcf94', 1.7), place(new THREE.SphereGeometry(0.16, 7, 6), { x: mx + ox, y: 1.5, z: mz }));
    DB.add('ironwork', box(0.09, 1.0, 0.09, mx + ox, 0.6, mz));
  }
  lantern(DB, { x: mx - 8, y: 1.5, z: mz - 1.2, r: 0.22, color: '#ff9f57' });
  DB.flush(dock);
  const moored = makeBoat(scene, columns, { x: mx + 0.4, z: mz + 5.4, dir: 1, speed: 0, bandColor: '#ff9f57', trim: '#ffd9a6', phase: 4.1 });
  moored.grp.rotation.z = 0.012;
  const moorCols = [
    columns.add(new THREE.Vector3(mx, 0, mz + 3), '#ffcf94', 2.6, 9, 0.6),
    columns.add(new THREE.Vector3(mx - 8, 0, mz + 1), '#ff9f57', 1.6, 6, 0.55),
  ];
  moored.grp.children.forEach((c) => { if (c.name === 'media-wake') c.visible = false; });
  moored.wake.visible = false;

  const anchors = [
    { pos: [mx, 1.4, mz + 1], color: '#ffcf94', width: 3, depth: 9, intensity: 0.5 },
    { pos: [mx - 8, 1.4, mz + 1], color: '#ff9f57', width: 2, depth: 7, intensity: 0.5 },
  ];

  const range = RIVER.halfWidth + 60;
  return {
    group: dock,
    boats,
    moored,
    anchors,
    update(t, dt, k = 1) {
      for (const b of boats) {
        const x = b.x0 + b.dir * b.speed * k * t;
        const wrapped = ((x + range) % (range * 2) + range * 2) % (range * 2) - range;
        b.grp.position.x = wrapped;
        b.grp.position.y = 0.06 + Math.sin(t * 1.1 + b.phase) * 0.05;
        b.grp.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.011;
        // 船在动，它自己那几条光柱要跟着走
        columns.setPos(b.cols[0], new THREE.Vector3(wrapped + 4, 0, b.z + 1.1));
        columns.setPos(b.cols[1], new THREE.Vector3(wrapped - 3, 0, b.z - 1.1));
        columns.setPos(b.cols[2], new THREE.Vector3(wrapped + HULL / 2 + 0.6, 0, b.z));
        const near = Math.abs(wrapped) < range * 0.98;
        for (const ci of b.cols) columns.setOn(ci, near && k > 0.05);
        b.wake.visible = k > 0.05 && near;
        b.wake.material.opacity = 0.14 + 0.1 * k;
      }
      moored.grp.position.y = 0.06 + Math.sin(t * 0.7 + 4.1) * 0.035;
      for (const ci of moorCols) columns.setOn(ci, k > 0.05);
    },
  };
}

export { HULL, BEAM };
