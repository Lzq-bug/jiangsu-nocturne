import * as THREE from 'three';
import { M, glow, mesh, box, rand, rr } from '../kit.js';
import { S, hall, finial } from './parts.js';
import { groundY } from './lake.js';
import { LAKE } from './data.js';

/**
 * 白塔：须弥座—覆钵—十三天—华盖—宝顶。
 * 高度按常见记载收到约 27.5 m（自岸顶起算），塔身线型是拉出来的写意，不是实测断面。
 */
export function buildPagoda(scene, columns) {
  const anchors = { eaves: [], lampPosts: [], windowGlow: [], archLamps: [] };
  const grp = new THREE.Group();
  const gy = groundY(LAKE.tower.x, LAKE.tower.z);
  grp.position.set(LAKE.tower.x, gy, LAKE.tower.z);

  // 须弥座
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.5, 1.5, 8), M.stoneDressed);
  lower.position.y = 0.75;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.5, 1.7, 8), M.stoneDressed);
  upper.position.y = 2.35;
  const band = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.22, 6, 8 * 6), M.stone);
  band.rotateX(Math.PI / 2);
  band.position.y = 3.2;
  for (const m of [lower, upper]) { m.castShadow = true; m.receiveShadow = true; }
  grp.add(lower, upper, band);

  // 覆钵
  const prof = [
    [3.6, 3.2], [4.0, 4.0], [4.25, 5.8], [4.2, 8.2], [3.75, 10.6],
    [3.0, 12.6], [2.15, 14.0], [1.5, 14.9], [1.22, 15.4],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 26), S.whitePlaster);
  bell.castShadow = true;
  bell.receiveShadow = true;
  grp.add(bell);

  // 塔脖子十三天
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.15, 6.2, 14), S.whitePlaster);
  neck.position.y = 18.5;
  neck.castShadow = true;
  grp.add(neck);
  const rings = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const y = 15.7 + t * 5.6;
    const r = 1.05 - t * 0.55;
    const ring = new THREE.TorusGeometry(r, 0.075, 5, 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, y, 0);
    rings.push(ring);
  }
  grp.add(mesh(rings, S.gilt));

  // 华盖 + 垂铃
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 2.6, 1.25, 20, 1, true), S.bronze);
  canopy.position.y = 22.3;
  canopy.castShadow = true;
  grp.add(canopy);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.1, 6, 28), S.bronze);
  rim.rotateX(Math.PI / 2);
  rim.position.y = 21.68;
  grp.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const chime = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), glow('#ffd9a0', 1.2));
    chime.position.set(Math.cos(a) * 2.45, 21.3, Math.sin(a) * 2.45);
    grp.add(chime);
    anchors.eaves.push(chime.position.clone().add(grp.position));
  }
  const top = new THREE.Mesh(finial(3.1, 0.6), S.gilt);
  top.position.y = 23.1;
  grp.add(top);

  // 眼光门：南面一枚小龛，夜里从里面透出灯
  const niche = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), glow('#ffb35f', 0.9));
  niche.position.set(0, 6.6, 4.05);
  grp.add(niche);
  const nicheFrame = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.09, 6, 18, Math.PI), M.stone);
  nicheFrame.position.set(0, 6.1, 4.08);
  grp.add(nicheFrame);

  // 塔下四盏长明灯 + 一道落水光：白塔的倒影是本景最亮的一块
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = new THREE.Vector3(Math.cos(a) * 6.1, 1.3, Math.sin(a) * 6.1);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), glow('#ffcf8c', 1.9));
    lamp.position.copy(p);
    grp.add(lamp);
    anchors.lampPosts.push(p.clone().add(grp.position));
  }
  const uplight = new THREE.PointLight(0xffd2a0, 130, 46, 2);
  uplight.position.set(0, 5.4, 3.2);
  grp.add(uplight);
  columns.add(new THREE.Vector3(LAKE.tower.x, 0.12, LAKE.tower.z + 2), '#ffe0b8', 2.3, 17, 1.05);
  columns.add(new THREE.Vector3(LAKE.tower.x - 3, 0.12, LAKE.tower.z), '#ffd7a0', 1.2, 9, 0.7);

  scene.add(grp);

  /* 莲性寺：塔后两进殿，只给剪影与窗灯 */
  const temple = new THREE.Group();
  const h1 = hall({ width: 11, depth: 7.6, height: 4.0, bays: 3, sign: '莲性寺', wallMat: S.screen });
  h1.position.set(LAKE.tower.x - 7.5, groundY(LAKE.tower.x - 7.5, LAKE.tower.z + 11), LAKE.tower.z + 11);
  h1.rotation.y = Math.PI;
  const h2 = hall({ width: 8.4, depth: 6, height: 3.5, bays: 2, wallMat: M.wall, roofMat: M.roofGreen });
  h2.position.set(LAKE.tower.x - 4, groundY(LAKE.tower.x - 4, LAKE.tower.z - 13), LAKE.tower.z - 13);
  for (const h of [h1, h2]) {
    temple.add(h);
    temple.updateMatrixWorld(true);
    h.userData.lamps.forEach((p) => anchors.eaves.push(h.localToWorld(p.clone())));
    h.userData.windowGlow.forEach((p) => anchors.windowGlow.push(h.localToWorld(p.clone())));
  }
  // 一串经幢与 oldTown 之间的杂屋，把塔的基座接进街巷
  const shedRoof = new THREE.ConeGeometry(1, 0.66, 4, 1);
  const shedBody = new THREE.BoxGeometry(1, 1, 1);
  const dark = new THREE.MeshBasicMaterial({ color: 0x0d1220, fog: true });
  dark.toneMapped = false;
  const sheds = new THREE.InstancedMesh(shedBody, dark, 90);
  const roofs = new THREE.InstancedMesh(shedRoof, dark, 90);
  const d2 = new THREE.Object3D();
  for (let i = 0; i < 90; i++) {
    const x = LAKE.tower.x - 34 + rr(-16, 22);
    const z = LAKE.tower.z + rr(-26, 34);
    const gy = groundY(x, z);
    // 只落在岸上，否则民房会插进水里
    if (gy < 1.4) { sheds.count = i; continue; }
    const hh = 3.2 + rand() * 5;
    const w = 5 + rand() * 6;
    d2.position.set(x, groundY(x, z) + hh / 2, z);
    d2.rotation.set(0, rand() * Math.PI, 0);
    d2.scale.set(w, hh, w * 0.75);
    d2.updateMatrix();
    sheds.setMatrixAt(i, d2.matrix);
    d2.position.y += hh * 0.55;
    d2.scale.set(w * 0.85, 2.6 + rand() * 1.4, w * 0.7);
    d2.updateMatrix();
    roofs.setMatrixAt(i, d2.matrix);
  }
  sheds.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
  temple.add(sheds, roofs);
  scene.add(temple);

  return { group: grp, anchors, height: 27.5 };
}
