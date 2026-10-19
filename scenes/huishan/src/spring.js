/**
 * 天下第二泉院：池三、渠二、亭一堂一。
 * 上池八角是泉源（若冰洞伏流），中池方形，下池长方形——北宋明道年间凿作鱼池。
 * 二泉亭坐西朝东、三面敞开，亭内一张听松石床。
 */
import * as THREE from 'three';
import { M, lit, box, mesh, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { wallRun, rockRing, pavilion, bambooClump, lotusLeaves, moonInPool, lanternCluster, groundPad, cypress } from './build.js';
import { SPRING } from './data.js';

const GY = SPRING.groundY;

/** 八角池岸：八条石棱压出一圈清晰的边 */
function octagonRim({ cx, cz, r, y, h = 1.35 }) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const mx = cx + Math.cos((a0 + a1) / 2) * (r + 0.62);
    const mz = cz + Math.sin((a0 + a1) / 2) * (r + 0.5);
    const len = 2 * r * Math.sin(Math.PI / 8) + 1.1;
    const g = box(len, h, 1.0, mx, y + h / 2 - 0.25, mz);
    g.rotateY(-(a0 + a1) / 2);
    parts.push(g);
  }
  return mesh(parts, lit('#c3ccd8', { map: T.lakeStone('#a8b0bd'), rough: 0.88, emissive: '#131b29', ei: 0.45 }));
}

/** 石桌石床一类：听松石床就是一张矮条石 */
function stoneBed({ x, z, len, h, wide }) {
  const grp = new THREE.Group();
  const slab = [box(len, 0.36, wide, 0, h, 0)];
  const legs = [
    box(0.4, h, wide * 0.9, -len / 2 + 0.35, h / 2, 0),
    box(0.4, h, wide * 0.9, len / 2 - 0.35, h / 2, 0),
  ];
  grp.add(mesh(slab, lit('#ccd4df', { map: T.lakeStone('#b0b8c4'), rough: 0.84 })));
  grp.add(mesh(legs, M.stoneDressed));
  grp.position.set(x, GY, z);
  return grp;
}

export function buildSpring(scene, columns, reflections) {
  const root = new THREE.Group();
  root.name = 'spring';
  scene.add(root);

  // 院地坪：三个池子的位置挖洞，不然地面会把水面盖掉
  scene.add(groundPad({
    x0: SPRING.x0, x1: SPRING.x1, z0: SPRING.z0, z1: SPRING.z1, y: GY, mat: M.stone,
  }));

  // 东侧挡土：台地比街面高近七米
  const retainer = [];
  const N = 24;
  for (let k = 0; k <= N; k++) {
    const z = SPRING.z0 + ((SPRING.z1 - SPRING.z0) * k) / N;
    retainer.push(box(0.8, GY - 2.2, (SPRING.z1 - SPRING.z0) / N + 0.1, SPRING.x1, (GY - 2.2) / 2 + 2.2, z));
  }
  root.add(mesh(retainer, M.stoneDark));

  // 四墙：南墙开院门，西墙留月洞门通竹径，北墙一带漏窗
  root.add(wallRun({
    from: [SPRING.x0, SPRING.z0], to: [SPRING.x1, SPRING.z0], groundY: GY,
  }).group);
  root.add(wallRun({
    from: [SPRING.x0, SPRING.z1], to: [SPRING.x1, SPRING.z1], groundY: GY,
    gaps: [[(SPRING.gate.z - SPRING.z0 - 1.6) / (SPRING.z1 - SPRING.z0), (SPRING.gate.z - SPRING.z0 + 1.6) / (SPRING.z1 - SPRING.z0)]],
  }).group);
  root.add(wallRun({
    from: [SPRING.x1, SPRING.z0], to: [SPRING.x1, SPRING.z1], groundY: GY,
    windows: [{ t: 0.28 }, { t: 0.55, y: 2.35 }],
  }).group);
  root.add(wallRun({
    from: [SPRING.x0, SPRING.z1], to: [SPRING.x0, SPRING.z0], groundY: GY,
    gaps: [[0.42, 0.62]],
  }).group);

  // 院门与月洞门的砖檐圈
  const gateRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.18, 6, 20), M.stoneDressed);
  gateRing.rotation.set(0, Math.PI / 2, 0);
  gateRing.position.set(SPRING.x1, GY + 1.7, SPRING.gate.z);
  root.add(gateRing);
  const moonRing = gateRing.clone();
  moonRing.position.set(SPRING.moonGate.x, GY + SPRING.moonGate.r + 0.3, SPRING.moonGate.z);
  moonRing.geometry = new THREE.TorusGeometry(SPRING.moonGate.r, 0.16, 6, 20);
  moonRing.rotation.y = Math.PI / 2;
  root.add(moonRing);

  // 三池的岸
  root.add(octagonRim({ cx: SPRING.upper.cx, cz: SPRING.upper.cz, r: SPRING.upper.octagon, y: SPRING.upper.y }));
  root.add(rockRing({ cx: SPRING.middle.cx, cz: SPRING.middle.cz, hw: SPRING.middle.hw, hd: SPRING.middle.hd, y: SPRING.middle.y, count: 22, scale: 0.8 }));
  root.add(rockRing({ cx: SPRING.lower.cx, cz: SPRING.lower.cz, hw: SPRING.lower.hw, hd: SPRING.lower.hd, y: SPRING.lower.y, count: 44, scale: 1 }));

  // 渠二：上池→中池→下池的两段明槽
  const flumes = [];
  for (const f of SPRING.flumes) {
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const x = f.from[0] + (f.to[0] - f.from[0]) * t;
      const z = f.from[1] + (f.to[1] - f.from[1]) * t;
      flumes.push(box(0.95, 0.3, 0.9, x, SPRING.upper.y + 0.16 - t * 0.1, z));
    }
  }
  root.add(mesh(flumes, M.stoneDressed));

  // 二泉亭：坐西朝东，三面敞开
  const pav = pavilion({
    w: SPRING.pavilion.w, d: SPRING.pavilion.d, h: SPRING.pavilion.h,
    groundY: SPRING.lower.y - 0.3, name: '天下第二泉',
  });
  pav.position.set(SPRING.pavilion.x, SPRING.lower.y - 0.3, SPRING.pavilion.z);
  root.add(pav);

  // 亭内听松石床，"听松"二字传唐李阳冰篆
  root.add(stoneBed(SPRING.pineBed));
  const carved = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({ map: T.carve('听松', { stone: '#8d95a3' }), transparent: true, opacity: 0.95 }),
  );
  carved.material.toneMapped = false;
  carved.position.set(SPRING.pineBed.x, GY + 1.45, SPRING.pineBed.z + SPRING.pineBed.wide / 2 + 0.02);
  carved.rotation.x = -Math.PI / 2 + 0.06;
  root.add(carved);

  // 雍正五年王澍书大字的照壁（位置写意：立在东 Wall 内侧）
  const wallCarve = new THREE.Mesh(
    new THREE.PlaneGeometry(SPRING.wallCarve.w, SPRING.wallCarve.h),
    new THREE.MeshBasicMaterial({ map: T.carve(SPRING.wallCarve.text, { stone: '#a9a291' }), transparent: true }),
  );
  wallCarve.material.toneMapped = false;
  wallCarve.position.set(SPRING.wallCarve.x, GY + SPRING.wallCarve.h / 2 + 0.6, SPRING.wallCarve.z);
  wallCarve.rotation.y = -Math.PI / 2;
  root.add(wallCarve);

  // 西廊半亭 + 一段游廊
  const hp = pavilion({ w: SPRING.halfPavilion.w, d: SPRING.halfPavilion.d, h: 2.9, groundY: GY });
  hp.position.set(SPRING.halfPavilion.x, GY, SPRING.halfPavilion.z);
  root.add(hp);

  // 入院石阶
  const steps = [];
  for (let k = 0; k < 9; k++) {
    steps.push(box(2.8, 0.28, 1.0, SPRING.steps.x + 0.6, GY - 0.14 - k * 0.75, SPRING.steps.z + k * 0.95));
  }
  root.add(mesh(steps, M.stoneDressed));

  // 植物：竹径在月洞门外，柏在亭后
  for (const b of SPRING.bamboo) bambooClump(scene, b, GY - 0.6, 13);
  cypress(scene, [[SPRING.x0 + 5, SPRING.z1 + 6], [SPRING.x1 - 7, SPRING.z0 + 7]], GY);
  // 荷是写意添加：下池旧为鱼池，本不种荷
  lotusLeaves(scene, { ...SPRING.lotus, y: SPRING.lower.y + 0.05 }, 26);

  const lampSpots = [
    [SPRING.pavilion.x + 2.6, GY + 3.6, SPRING.pavilion.z + 2.2],
    [SPRING.halfPavilion.x + 1.8, GY + 2.5, SPRING.halfPavilion.z + 1.6],
    [SPRING.gate.x - 1.6, GY + 2.7, SPRING.gate.z + 1.8],
    [SPRING.upper.cx + 4.6, GY + 2.4, SPRING.upper.cz + 3.6],
  ];
  const lanterns = lanternCluster(scene, lampSpots, { halo: 2.6 });
  for (const [x, y, z] of lampSpots) registerOccluder(lanterns, 2.0, new THREE.Vector3(x, y, z));

  // 水里的光
  columns.add(new THREE.Vector3(SPRING.pavilion.x + 2.6, 0, SPRING.pavilion.z + 2.2), '#ffcf94', 1.5, 4.8, 0.62, SPRING.lower.y);
  columns.add(new THREE.Vector3(SPRING.upper.cx + 4.6, 0, SPRING.upper.cz + 3.6), '#ffd7a0', 1.1, 4.0, 0.5, SPRING.upper.y);
  columns.add(new THREE.Vector3(SPRING.lower.cx + 1.6, 0, SPRING.lower.cz - 1.2), '#cfe0ff', 1.3, 5.6, 0.55, SPRING.lower.y);

  // 月落在下池（旧鱼池）的水面上
  const moons = [
    moonInPool(scene, { x: SPRING.lower.cx + 1.6, z: SPRING.lower.cz - 1.2, y: SPRING.lower.y + 0.03, size: 1.05 }),
    moonInPool(scene, { x: SPRING.upper.cx + 1.2, z: SPRING.upper.cz - 0.8, y: SPRING.upper.y + 0.03, size: 0.72 }),
  ];

  // 泉眼：每个池子一组涟漪，"引泉入池"时依次被敲响
  const pools = [SPRING.upper, SPRING.middle, SPRING.lower];
  const rings = [];
  for (let p = 0; p < 3; p++) {
    const set = [];
    const b = pools[p];
    const rr0 = b.octagon || Math.min(b.hw, b.hd) * 0.7;
    for (let i = 0; i < 3; i++) {
      const g = new THREE.RingGeometry(0.22, 0.32, 18);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: 0x9fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      }));
      m.material.toneMapped = false;
      m.position.set(b.cx + (i - 1) * rr0 * 0.34, b.y + 0.05, b.cz + (i - 1) * rr0 * 0.22);
      scene.add(m);
      set.push(m);
    }
    rings.push(set);
  }
  const pulse = [0, 0, 0];

  reflections.add(root);

  return {
    root,
    lanterns,
    moons,
    /** 敲响某个池子：delay 秒后起涟漪，那一片水的月影同时提亮 */
    fire(i, delay = 0) {
      if (i < 0 || i > 2) return;
      setTimeout(() => { pulse[i] = 1; }, delay * 1000);
    },
    update(t, spring) {
      for (const mp of moons) {
        mp.group.visible = spring > 0.02;
        mp.disc.scale.setScalar(Math.max(0.001, (0.88 + 0.12 * Math.sin(t * 0.9)) * spring));
        mp.halo.scale.setScalar(Math.max(0.001, (0.9 + 0.1 * Math.sin(t * 0.55)) * spring));
      }
      lanterns.visible = spring > 0.02;
      for (let p = 0; p < 3; p++) {
        pulse[p] *= 0.994;
        rings[p].forEach((r, i) => {
          const ph = (t * 0.5 + i / 3) % 1;
          r.scale.setScalar(0.4 + ph * 3.4);
          r.material.opacity = (1 - ph) * 0.4 * (0.2 + pulse[p]) * spring;
        });
      }
    },
  };
}
