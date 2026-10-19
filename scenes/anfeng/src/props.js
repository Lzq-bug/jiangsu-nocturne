import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, PAL, glow, rand, rr, boxGeo, mesh, figureGeo, porterGeo, stringPath, registerOccluder, loftHull } from './kit.js';
import { RIVER, TOWN, WORKS, DIKE, BERTHS } from './data.js';
import * as T from './textures.js';

const DECK = RIVER.deckY;
const HW = RIVER.halfWidth;

/* ------------------------------------------------------------------ 盐船 */

/**
 * 苏北内河驳船：平底、方头、短桅、篾篷。装的是包盐与草柴。
 * 形制按通式补写，不指认某一种船。
 */
function saltBoat({ len = 11, beam = 3.0, name = 'berth' }) {
  const grp = new THREE.Group();
  const stations = [];
  for (let i = 0; i <= 10; i++) stations.push(-len / 2 + (len * i) / 10);
  const profile = (z) => {
    const t = (z + len / 2) / len;                      // 0 尾 → 1 首
    const full = Math.sin(Math.PI * Math.pow(t, 0.62));
    const bw = beam * 0.5 * (0.34 + 0.66 * Math.min(1, full * 1.25));
    const flat = -0.34 * Math.min(1, full * 1.6);
    return [
      [-bw, flat], [-bw * 0.92, -0.02], [-bw * 0.5, 0.16], [0, 0.2],
      [bw * 0.5, 0.16], [bw * 0.92, -0.02], [bw, flat],
    ];
  };
  const hull = new THREE.Mesh(loftHull(profile, stations), M.woodDark);
  hull.castShadow = true;
  grp.add(hull);

  // 舷墙与甲板
  const deckParts = [];
  deckParts.push(boxGeo(len * 0.86, 0.12, beam * 0.62, -len * 0.02, 0.24, 0));
  for (const s of [-1, 1]) deckParts.push(boxGeo(len * 0.9, 0.34, 0.14, 0, 0.4, s * beam * 0.44));
  grp.add(mesh(deckParts, M.beam));

  // 篾篷：两到三段圆弧篷
  const canopy = [];
  for (let i = 0; i < 3; i++) {
    const zc = -len * 0.24 + i * len * 0.24;
    const g = new THREE.CylinderGeometry(beam * 0.42, beam * 0.42, len * 0.2, 10, 1, false, 0, Math.PI);
    g.rotateX(Math.PI / 2);
    g.rotateY(Math.PI);
    g.translate(0, 0.42, zc);
    canopy.push(g);
  }
  const cm = new THREE.Mesh(mergeGeometries(canopy), M.mat);
  cm.castShadow = true;
  grp.add(cm);

  // 短桅与卷起的席帆
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 7), M.beam);
  mast.position.set(len * 0.1, 2.6, 0);
  mast.castShadow = true;
  grp.add(mast);
  const sail = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, beam * 0.9, 8), M.sail);
  sail.rotation.z = Math.PI / 2;
  sail.position.set(len * 0.1, 1.5, 0.32);
  grp.add(sail);
  const yard = new THREE.Mesh(boxGeo(beam * 1.2, 0.08, 0.08, 0, 0, 0), M.beam);
  yard.position.set(len * 0.1, 1.86, 0);
  grp.add(yard);

  // 船灯：船头一盏，舱口一盏
  const bowLamp = new THREE.Group();
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 9, 7),
    new THREE.MeshStandardMaterial({ map: T.lanternPaper(), color: 0xffe0b4, roughness: 0.6, emissive: new THREE.Color(PAL.lanternWarm), emissiveIntensity: 1.6 }),
  );
  shade.scale.set(1, 1.2, 1);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), glow('#fff1cf', 2.5));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,186,116', 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(4.4, 4.4, 1);
  halo.material.toneMapped = false;
  bowLamp.add(shade, core, halo);
  bowLamp.position.set(len * 0.42, 0.9, 0);
  grp.add(bowLamp);

  const sternLamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), glow('#ffb066', 2.0));
  sternLamp.position.set(-len * 0.44, 0.8, 0);
  grp.add(sternLamp);

  // 盐包
  const cargo = [];
  for (let i = 0; i < 6; i++) {
    cargo.push(boxGeo(rr(0.7, 1.0), rr(0.4, 0.6), rr(0.55, 0.8), rr(-len * 0.3, len * 0.3), 0.52, rr(-0.6, 0.6)));
  }
  grp.add(mesh(cargo, M.sail));

  // 跳板到岸
  const plank = new THREE.Mesh(boxGeo(0.7, 0.1, 3.4), M.beam);
  plank.position.set(len * 0.3, 0.35, beam * 0.9);
  plank.rotation.x = 0.5;
  grp.add(plank);

  grp.userData.lamps = [bowLamp, sternLamp];
  grp.userData.halo = halo;
  grp.name = name;
  return grp;
}

function buildFleet(scene, columns) {
  const boats = [];
  const cols = [];
  BERTHS.forEach(([x, z], i) => {
    const b = saltBoat({ len: [12, 9.5, 11][i % 3], beam: [3.1, 2.6, 2.9][i % 3], name: `berth-${i}` });
    b.position.set(x, WATER_SURFACE, z);
    b.rotation.y = x > 0 ? Math.PI * 0.06 : Math.PI * 0.94;
    b.userData.base = b.position.clone();
    b.userData.phase = rand() * 6.28;
    b.userData.roll = rr(0.018, 0.035);
    scene.add(b);
    boats.push(b);
    cols.push(columns.add(new THREE.Vector3(x + 2.6 * Math.sign(x || 1), 0, z), PAL.lanternWarm, 1.3, 12, 1.15));
  });

  // 两只夜行的船：一只沿河北去，一只从桥洞下来
  const moving = [];
  for (let i = 0; i < 2; i++) {
    const b = saltBoat({ len: 10.5, beam: 2.8, name: `run-${i}` });
    b.position.set(i ? -HW * 0.36 : HW * 0.42, WATER_SURFACE, i ? -150 : 150);
    b.rotation.y = i ? Math.PI : 0;
    b.userData.z0 = b.position.z;
    b.userData.dir = i ? 1 : -1;
    b.userData.speed = 3.4 + i * 1.1;
    b.userData.phase = rand() * 6.28;
    scene.add(b);
    b.userData.col = columns.add(b.position, PAL.lanternWarm, 1.1, 10, 0.95);
    moving.push(b);
  }

  return {
    boats,
    moving,
    moored: (i) => boats[Math.max(0, Math.min(boats.length - 1, i))],
    update(t, dt, speed) {
      for (const b of boats) {
        const u = b.userData;
        b.position.y = u.base.y + Math.sin(t * 0.9 + u.phase) * 0.05;
        b.rotation.z = Math.sin(t * 0.75 + u.phase) * u.roll;
        b.rotation.x = Math.sin(t * 0.55 + u.phase * 1.3) * 0.012;
      }
      for (const b of moving) {
        const u = b.userData;
        u.z0 += dt * u.speed * u.dir * speed;
        if (u.z0 > 190) { u.z0 = -190; }
        if (u.z0 < -190) { u.z0 = 190; }
        b.position.z = u.z0;
        b.position.y = WATER_SURFACE + Math.sin(t * 1.3 + u.phase) * 0.08;
        b.rotation.z = Math.sin(t * 1.1) * 0.03;
        b.rotation.y = u.dir > 0 ? Math.PI : 0;
        columns.setPos(u.col, b.position);
      }
    },
  };
}

const WATER_SURFACE = 0;

/* ------------------------------------------------------------------ 灶户与脚夫 */

function crowdField(scene) {
  const silhouette = new THREE.MeshStandardMaterial({
    color: 0x121620, roughness: 0.95, emissive: new THREE.Color('#1a1410'), emissiveIntensity: 0.5,
  });
  const CAP = 220;
  const walkers = new THREE.InstancedMesh(porterGeo(0.94), silhouette, CAP);
  const standers = new THREE.InstancedMesh(figureGeo(0.94), silhouette, CAP);
  walkers.frustumCulled = false; standers.frustumCulled = false;
  walkers.castShadow = true;
  scene.add(walkers, standers);

  const zones = [
    // [中心x, 中心z, 半长, 半宽, 人数比重]
    [WORKS.ovenX0 + 8, (WORKS.ovenZ0 + WORKS.ovenZ1) / 2, 12, 8, 0.17],
    [HW + 8, -20, 6, 22, 0.15],
    [TOWN.mainStreetX + 4, 20, 4, 34, 0.28],
    [DIKE.xCrestE + 6, 30, 4, 40, 0.1],
    [WORKS.reedX0 + 8, WORKS.reedZ0 + 30, 12, 24, 0.06],
  ];
  const people = [];
  let left = CAP;
  zones.forEach(([cx, cz, hx, hz, share], zi) => {
    const n = zi === zones.length - 1 ? left : Math.round(CAP * share);
    for (let k = 0; k < n; k++) {
      const along = rand() * 2 - 1;
      people.push({
        x: cx + rr(-hx, hx), z: cz + along * hz, y: DECK,
        home: { x: cx, z: cz }, hx, hz,
        v: rr(0.5, 1.35) * (rr(0, 1) > 0.5 ? 1 : -1),
        phase: rand() * 6.28,
        standing: rr(0, 1) < 0.32,
        s: rr(0.82, 1.06),
        active: false,
      });
    }
    left -= n;
    if (left <= 0) return;
  });

  const d = new THREE.Object3D();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let shownWalk = 0, shownStand = 0;

  return {
    update(t, dt, target, camPos) {
      shownWalk = 0; shownStand = 0;
      // 远处的人不摆，省下实例数；按离机位的距离收
      const sorted = people;
      for (const p of sorted) {
        if (shownWalk + shownStand >= target) break;
        const dist = Math.hypot(p.x - camPos.x, p.z - camPos.z);
        if (dist > 120 || dist < 4.2) continue;
        if (!p.standing) {
          p.z += dt * p.v * 1.15;
          if (Math.abs(p.z - p.home.z) > p.hz) { p.v *= -1; p.z = p.home.z + Math.sign(p.v) * p.hz; }
          d.position.set(p.home.x + (p.x - p.home.x) * Math.cos(t * 0.2 + p.phase), DECK, p.z);
          d.rotation.set(0, p.v > 0 ? 0 : Math.PI, 0);
          d.scale.set(p.s, p.s * (1 + 0.02 * Math.sin(t * 7 + p.phase)), p.s);
          d.updateMatrix();
          walkers.setMatrixAt(shownWalk++, d.matrix);
        } else {
          d.position.set(p.x, DECK + Math.sin(t * 1.6 + p.phase) * 0.02, p.z);
          d.rotation.set(0, p.phase, 0);
          d.scale.setScalar(p.s);
          d.updateMatrix();
          standers.setMatrixAt(shownStand++, d.matrix);
        }
      }
      for (let i = shownWalk; i < walkers.count; i++) walkers.setMatrixAt(i, ZERO);
      for (let i = shownStand; i < standers.count; i++) standers.setMatrixAt(i, ZERO);
      walkers.count = CAP; standers.count = CAP;
      walkers.instanceMatrix.needsUpdate = true;
      standers.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 灯串 */

/** 街与埠头上的灯笼串：同一条绳上挂灯，密度由"堤灯灶火"控制 */
function lanternStrings(scene, anchors) {
  const group = new THREE.Group();
  group.name = 'strings';
  scene.add(group);
  const mats = [];

  const addRun = (a, b, { count = 6, sag = 0.9, r = 0.2, y = DECK + 3.0 } = {}) => {
    const from = new THREE.Vector3(a[0], y, a[1]);
    const to = new THREE.Vector3(b[0], y, b[1]);
    const pts = stringPath(from, to, sag, count * 3);
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), count * 4, 0.03, 4, false),
      M.beam,
    );
    group.add(line);
    for (let i = 0; i < count; i++) {
      const p = pts[Math.round((i + 0.5) / count * (pts.length - 1))];
      const mat = new THREE.MeshStandardMaterial({
        map: T.lanternPaper(), color: 0xffe4bb, roughness: 0.6,
        emissive: new THREE.Color(PAL.lanternWarm), emissiveIntensity: 1.5,
      });
      mats.push(mat);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat);
      shell.scale.set(1, 1.22, 1);
      shell.position.copy(p).setY(p.y - 0.36);
      group.add(shell);
      const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 6, 5), glow('#fff1cf', 1.5));
      core.position.copy(shell.position);
      group.add(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,196,120', 0.1), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      }));
      halo.scale.set(0.3 + r * 1.0, 0.3 + r * 1.0, 1);
      halo.material.opacity = 0.55;
      halo.material.toneMapped = false;
      halo.position.copy(shell.position);
      const bead = new THREE.Group();
      bead.position.copy(shell.position);
      shell.position.set(0, 0, 0); core.position.set(0, 0, 0); halo.position.set(0, 0, 0);
      bead.add(shell, core, halo);
      group.add(bead);
      registerOccluder(bead, 2.4);
    }
  };

  // 主街上空横着拉三跑，河街上一跑，埠头上两跑
  for (const z of [-20, 24, 70]) {
    addRun([TOWN.mainStreetX - 6.4, z], [TOWN.mainStreetX + 6.4, z], { count: 6, r: 0.22, y: DECK + 3.9, sag: 0.7 });
  }
  addRun([TOWN.riverRowX + 7, -34], [TOWN.riverRowX + 7, 34], { count: 12, sag: 1.6, r: 0.18, y: DECK + 3.1 });
  addRun([HW + 5.4, -50], [HW + 5.4, 10], { count: 9, sag: 0.5, r: 0.2, y: DECK + 2.9 });
  addRun([-HW - 8.6, 2], [-HW - 8.6, 66], { count: 10, sag: 0.5, r: 0.2, y: DECK + 2.8 });
  // 堤顶一串，长堤才连得起来
  addRun([DIKE.xCrestE + 2, -60], [DIKE.xCrestE + 2, 120], { count: 16, sag: 0.4, r: 0.17, y: DIKE.crestY + 2.6 });

  return {
    group,
    setOn(v) {
      const k = Math.max(0, Math.min(1.6, v));
      for (const m of mats) m.emissiveIntensity = 1.5 * k;
      group.visible = k > 0.02;
    },
  };
}

/* ------------------------------------------------------------------ 火与烟 */

function fireAndSmoke(scene, works) {
  const smokeTex = T.smokePuff();
  const flames = [];
  const plumes = [];

  for (const oven of works.ovens) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,150,64', 0.1), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    halo.material.toneMapped = false;
    halo.scale.set(11, 11, 1);
    halo.position.copy(oven.mouthWorld).setY(oven.mouthWorld.y + 0.5);
    scene.add(halo);
    flames.push({ halo, oven, phase: rand() * 6.28 });

    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, transparent: true, opacity: 0.16, depthWrite: false, fog: true,
      }));
      s.material.toneMapped = false;
      s.userData.k = { t0: rand() * 9, x: oven.mouthWorld.x + rr(-0.6, 0.6), z: oven.mouthWorld.z + rr(-1.4, -0.4), s: rr(0.8, 1.5) };
      scene.add(s);
      plumes.push(s);
    }
  }
  // 堤外场院的零星夜火也冒烟
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, transparent: true, opacity: 0.13, depthWrite: false, fog: true,
    }));
    s.material.toneMapped = false;
    s.userData.k = { t0: rand() * 9, x: rr(20, 30), z: rr(-60, 60), s: rr(0.9, 1.8) };
    scene.add(s);
    plumes.push(s);
  }

  return {
    group: null,
    setSmoke(v) { for (const s of plumes) s.visible = !!v; },
    update(t, dt, amp) {
      for (const f of flames) {
        const k = 0.78 + 0.22 * Math.sin(t * 5.2 + f.phase) + 0.08 * Math.sin(t * 13 + f.phase * 2);
        f.halo.scale.setScalar(4.6 * (0.86 + 0.16 * k) * (0.5 + amp));
        f.halo.material.opacity = 0.5 + 0.28 * k;
        if (f.oven.light) f.oven.light.intensity = 150 * (0.7 + 0.45 * k) * amp;
        f.oven.mouth.material.opacity = 0.55 + 0.45 * k;
        f.oven.mouth.scale.set(1, 0.86 + 0.26 * k, 1);
      }
      for (const s of plumes) {
        const k = s.userData.k;
        const life = ((t + k.t0) % 9) / 9;
        const y = DECK + 3.0 + life * 17;
        s.position.set(k.x + life * life * 5.2, y, k.z + Math.sin(life * 4 + k.t0) * 1.4);
        const sc = (1.6 + life * 12) * k.s;
        s.scale.set(sc, sc * 1.1, 1);
        s.material.opacity = (0.2 - 0.2 * life) * (1 - life * 0.35);
      }
    },
  };
}

/* ------------------------------------------------------------------ 装配 */

export function buildProps(scene, columns, anchors, works) {
  const fleet = buildFleet(scene, columns);
  const crowd = crowdField(scene);
  const strings = lanternStrings(scene, anchors);
  const fires = fireAndSmoke(scene, works);

  // 街口的石缸与木车：近机位的遮挡物要能撤掉
  for (const [x, z] of [[TOWN.mainStreetX + 3, -6], [TOWN.mainStreetX - 3, 44], [TOWN.riverRowX + 8, 12]]) {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.6, 0.8, 12), M.stoneDressed);
    tub.position.set(x, DECK + 0.4, z);
    tub.castShadow = true;
    scene.add(tub);
    registerOccluder(tub, 2.4);
  }
  for (const [x, z] of [[HW + 8, -8], [TOWN.mainStreetX, 30]]) {
    const cart = new THREE.Group();
    const bed = new THREE.Mesh(boxGeo(2.4, 0.4, 1.2), M.woodDark);
    bed.position.y = 0.72;
    const wheels = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 6, 14), M.beam);
      w.position.set(s * 0.7, 0.52, 0);
      wheels.push(w);
    }
    cart.add(bed, ...wheels);
    cart.position.set(x, DECK, z);
    cart.rotation.y = rr(0, 3);
    cart.castShadow = true;
    scene.add(cart);
    registerOccluder(cart, 2.8);
  }

  return { fleet, crowd, strings, fires };
}
