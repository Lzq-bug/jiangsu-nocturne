/**
 * 室内：一层楼里的灯与柱、头船的船舱。
 * 都只做到"从门口看进去像有内容"，夜里镜头停在门口，不必测绘。
 */
import * as THREE from 'three';
import { M, glow, box, mesh, pillarGeo } from './kit.js';
import { LAYOUT } from './architecture.js';

/* ------------------------------------------------------------------ 楼内一层 */
function towerInterior(scene, tl) {
  const g = new THREE.Group();
  const y = tl.floorY;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(tl.halfD * 2 - 0.6, tl.halfW * 2 - 0.6), M.woodDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(tl.cx, y + 0.04, 0);
  floor.receiveShadow = true;
  g.add(floor);
  // 金柱四根与天花
  for (const dx of [-tl.halfD + 1.8, tl.halfD - 1.8]) {
    for (const dz of [-tl.halfW + 2.2, tl.halfW - 2.2]) {
      const c = new THREE.Mesh(pillarGeo(4.0, 0.3), M.pillar);
      c.position.set(tl.cx + dx, y, dz);
      g.add(c);
    }
  }
  g.add(mesh(box(tl.halfD * 2 - 0.4, 0.4, tl.halfW * 2 - 0.4, tl.cx, y + 4.1, 0), M.beam));

  // 一张值夜的桌、一盏灯：司更的人整夜坐在明间
  const table = mesh([
    box(1.3, 0.16, 2.6, tl.cx - 1.0, y + 0.86, 2.4),
    box(0.14, 0.86, 0.14, tl.cx - 1.0, y + 0.43, 1.3),
    box(0.14, 0.86, 0.14, tl.cx - 1.0, y + 0.43, 3.5),
  ], M.woodDark);
  table.castShadow = true;
  g.add(table);
  const flameMat = glow('#ffcf8a', 2.4);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.13, 8), M.gilt);
  cup.position.set(tl.cx - 1.0, y + 1.0, 2.9);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 6), flameMat);
  flame.position.set(tl.cx - 1.0, y + 1.12, 2.9);
  flame.scale.set(0.7, 1.5, 0.7);
  g.add(cup, flame);
  const lampLight = new THREE.PointLight(0xffb066, 22, 13, 2);
  lampLight.position.set(tl.cx - 1.0, y + 1.5, 2.9);
  g.add(lampLight);

  // 二层梯口：一道黑洞口与几级梯，把"上楼"这件事交代在屋里
  const stairs = [];
  for (let k = 0; k < 8; k++) stairs.push(box(1.6, 0.2, 0.34, tl.cx + 1.4, y + 0.3 + k * 0.42, -3.2 + k * 0.36));
  g.add(mesh(stairs, M.woodDark));
  scene.add(g);
  return {
    group: g,
    flame,
    update(t) {
      flame.scale.set(0.7 + 0.06 * Math.sin(t * 6.2), 1.5 + 0.16 * Math.sin(t * 4.6), 0.7 + 0.05 * Math.cos(t * 5.4));
      lampLight.intensity = 20 + 2.8 * Math.sin(t * 5.1) + 1.4 * Math.sin(t * 11.3);
    },
  };
}

/* ------------------------------------------------------------------ 船舱 */
function cabinInterior(scene, boat) {
  const g = new THREE.Group();
  const b = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z);
    boat.worldToLocal(v);
    return v;
  };
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 3.6), M.woodDark);
  deck.rotation.x = -Math.PI / 2;
  deck.position.copy(b(0, 0.74, 0.3));
  g.add(deck);
  const tray = mesh([box(0.44, 0.06, 0.3, 0, 0.3, 0), box(0.06, 0.3, 0.26, 0, 0.15, 0)], M.beam);
  tray.position.copy(b(0, 0.78, -0.8));
  g.add(tray);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 6), M.stele);
  bowl.scale.set(1, 0.55, 1);
  bowl.position.copy(b(0, 1.1, -0.8));
  g.add(bowl);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 6), glow('#ffd79b', 1.9));
  cup.position.copy(b(0.26, 0.92, -2.0));
  g.add(cup);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 8), M.thatch);
  roll.rotation.z = Math.PI / 2;
  roll.position.copy(b(-0.34, 0.9, 1.4));
  g.add(roll);
  scene.add(g);
  return { group: g, cup };
}

export function buildInteriors(scene, boat) {
  const tower = towerInterior(scene, LAYOUT.tower);
  const cabin = cabinInterior(scene, boat);
  return {
    update(t) { tower.update(t); },
    tower,
    cabin,
  };
}
