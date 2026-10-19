import * as THREE from 'three';
import { M, glow, figureGeo, rand, rr } from '../kit.js';
import * as T from '../textures.js';
import { WALL, centerZ, topY, GATES, LAKE } from './data.js';
import { dummy, yawAt } from './geo.js';

/**
 * 城上的人、堤上的人、湖里的船。人都是剪影，靠墙顶那圈灯把轮廓勾出来。
 */
export function buildProps(scene, columns) {
  const group = new THREE.Group();
  group.name = 'taicheng-props';

  const MAXC = 190;
  const geo = figureGeo(1);
  const walkers = new THREE.InstancedMesh(geo, M.ink, MAXC);
  walkers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const people = [];
  for (let i = 0; i < MAXC; i++) {
    const onWall = i < 132;
    const scale = rr(0.92, 1.14);
    if (onWall) {
      people.push({
        x: rr(WALL.xFrom + 10, WALL.xTo - 10),
        dz: rr(-WALL.halfTop + 1.1, WALL.halfTop - 1.1),
        y: 0, on: 'wall', v: rr(0.6, 1.5) * (rand() > 0.5 ? 1 : -1), scale,
        phase: rand() * 6.28,
      });
    } else if (i < 168) {
      people.push({
        x: rr(LAKE.causeway.xFrom + 8, LAKE.causeway.xTo - 8),
        dz: rr(-2.4, 2.4), y: 1.55, on: '堤', v: rr(0.5, 1.1) * (rand() > 0.5 ? 1 : -1), scale,
        phase: rand() * 6.28,
      });
    } else {
      people.push({
        x: GATES.jiefang.x + rr(-9, 12),
        dz: WALL.halfBase + rr(2, 12), y: WALL.innerGround, on: 'gate', v: rr(0.4, 0.9) * (rand() > 0.5 ? 1 : -1), scale,
        phase: rand() * 6.28,
      });
    }
  }
  group.add(walkers);

  // 湖上游船： hull + 一盏船灯，灯柱跟着走
  const boats = [];
  const hullGeo = new THREE.BoxGeometry(4.6, 0.7, 1.7);
  const cabinGeo = new THREE.BoxGeometry(2.4, 1.0, 1.4);
  for (let i = 0; i < 9; i++) {
    const z = -32 - rr(6, 250);
    const x = rr(WALL.xFrom + 20, 150);
    const hull = new THREE.Mesh(hullGeo, M.dark);
    const cabin = new THREE.Mesh(cabinGeo, M.dark);
    cabin.position.set(-0.3, 0.75, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), glow('#ffbe72', 2.6));
    lamp.position.set(1.6, 1.0, 0);
    const bg = new THREE.Group();
    bg.add(hull, cabin, lamp);
    bg.position.set(x, 0.15, z);
    bg.rotation.y = yawAt(x) + (rand() > 0.5 ? 0.4 : -0.5);
    group.add(bg);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,196,120', 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.set(6.5, 6.5, 1);
    halo.position.copy(lamp.position);
    bg.add(halo);
    const ci = columns.add(new THREE.Vector3(x, 0, z), 0xffb877, 1.0, 8.5, 0.9);
    boats.push({ bg, x, z, v: rr(1.3, 2.6) * (rand() > 0.5 ? 1 : -1), ci });
  }

  // 登城口一串红灯笼
  for (let i = 0; i < 3; i++) {
    const x = GATES.jiefang.x - 5.5 + i * 5.5;
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      glow('#ff8a4a', 1.2),
    );
    lantern.scale.set(1, 1.25, 1);
    lantern.position.set(x, WALL.innerGround + 5.8, centerZ(x) + WALL.halfBase + 3.2);
    group.add(lantern);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,140,80', 0.14), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.set(2.4, 2.4, 1);
    halo.position.copy(lantern.position);
    group.add(halo);
  }

  scene.add(group);
  const o = dummy();

  return {
    group,
    setLantern(v) {
      for (const b of boats) b.bg.children[2].visible = v > 0.05;
    },
    update(t, dt, crowd, boatSpeed) {
      const show = Math.min(crowd, MAXC);
      for (let i = 0; i < MAXC; i++) {
        const p = people[i];
        if (i >= show) {
          o.scale.set(0, 0, 0);
          o.position.set(0, -50, 0);
          o.rotation.set(0, 0, 0);
          o.updateMatrix();
          walkers.setMatrixAt(i, o.matrix);
          continue;
        }
        p.x += p.v * dt;
        if (p.on === 'wall') {
          if (p.x > WALL.xTo - 8 || p.x < WALL.xFrom + 8) p.v *= -1;
          p.y = topY(p.x) + 0.06;
        } else if (p.on === 'gate') {
          if (p.x > GATES.jiefang.x + 13 || p.x < GATES.jiefang.x - 13) p.v *= -1;
        } else {
          if (p.x > LAKE.causeway.xTo - 6 || p.x < LAKE.causeway.xFrom + 6) p.v *= -1;
        }
        const bob = Math.sin(t * 3.2 + p.phase) * 0.035;
        o.position.set(p.x, p.y + bob, centerZ(p.x) + p.dz);
        o.rotation.set(0, yawAt(p.x) + (p.v > 0 ? 0 : Math.PI), 0);
        o.scale.set(p.scale, p.scale * (1 + bob * 0.4), p.scale);
        o.updateMatrix();
        walkers.setMatrixAt(i, o.matrix);
      }
      walkers.instanceMatrix.needsUpdate = true;

      for (const b of boats) {
        b.x += b.v * dt * boatSpeed;
        if (b.x > 190) { b.x = 190; b.v *= -1; }
        if (b.x < WALL.xFrom + 6) { b.x = WALL.xFrom + 6; b.v *= -1; }
        b.bg.position.set(b.x, 0.15 + Math.sin(t * 1.4 + b.z) * 0.08, b.z);
        b.bg.rotation.z = Math.sin(t * 1.1 + b.z) * 0.03;
        columns.setPos(b.ci, new THREE.Vector3(b.x, 0, b.z));
      }
    },
  };
}
