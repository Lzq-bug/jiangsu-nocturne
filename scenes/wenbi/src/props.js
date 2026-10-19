/**
 * 灯与人：压顶上的石灯、廊与阁前的灯笼、门光、池里的荷灯、游人身影。
 * 发光面一律 MeshBasicMaterial + 加色 sprite，真实 PointLight 全场景只留八盏——
 * SwiftShader 下把每扇窗配一盏灯，一张静帧就跑到十分钟以外。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, figureGeo, rand, rr } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, HILL_Y, WATER_Y, PONDS, PARK, clampToPond, STATIONS } from './data.js';

const LAMP = '#ffbe72';

export function buildProps(scene, anchors, columns) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const stone = lit('#9ba1ad', { map: TX.stone('#868d99'), rough: 0.92 });
  const wood = lit('#6b4630', { map: TX.wood('#54331f', '#2c160f'), rough: 0.85 });
  const haloTex = TX.softGlow('255,190,120', 0.16);

  const tints = [];
  const tinted = (hex, mul = 1.4) => {
    const base = new THREE.Color(hex).multiplyScalar(mul);
    const m = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false, fog: false });
    tints.push({ m, base });
    return m;
  };

  const lampMat = new THREE.MeshBasicMaterial({ map: TX.lanternPaper('#fff3d0', '#e8734a'), toneMapped: false });
  tints.push({ m: lampMat, base: lampMat.color.clone() });
  const stoneWinMat = tinted('#ffe6bd', 1.5);
  const doorMat = tinted('#ffd79b', 1.2);
  const floaterMat = tinted(LAMP, 1.7);

  const sprites = [];
  const addHalo = (x, y, z, s, o = 0.9) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color: 0xffffff, transparent: true, opacity: o,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.scale.set(s, s, 1);
    sp.position.set(x, y, z);
    sp.userData.base = o;
    group.add(sp);
    sprites.push(sp);
    return sp;
  };

  /* ------------------------------------------------------------ 石灯 */
  const lampWinGeo = new THREE.PlaneGeometry(0.36, 0.36);
  const lampSpots = [...anchors.lampPosts, ...extraPondLamps(), ...hillSlopeLamps()];
  for (const [x, z] of lampSpots) {
    if (tooClose(x, z, 2.4)) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(0.34, 0.4, 0.22, 8).translate(0, 0.11, 0),
      new THREE.CylinderGeometry(0.13, 0.15, 1.05, 8).translate(0, 0.75, 0),
      new THREE.CylinderGeometry(0.42, 0.34, 0.14, 8).translate(0, 1.34, 0),
      new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 1.66, 0),
      new THREE.ConeGeometry(0.52, 0.3, 6).translate(0, 2.05, 0),
      new THREE.SphereGeometry(0.09, 6, 5).translate(0, 2.24, 0),
    ]), stone);
    body.castShadow = true;
    g.add(body);
    for (const s of [1, -1]) {
      const win = new THREE.Mesh(lampWinGeo, stoneWinMat);
      win.position.set(0, 1.66, s * 0.26);
      win.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(win);
    }
    g.position.set(x, groundAt(x, z), z);
    g.rotation.y = rand() * 3;
    group.add(g);
    addHalo(x, groundAt(x, z) + 1.66, z, 2.3, 0.75);
    const inWater = clampToPond(x + (x > 0 ? -4 : 4), z + (z > 0 ? -4 : 4));
    if (inWater) columns.add(new THREE.Vector3(inWater[0], WATER_Y, inWater[1]), LAMP, 0.85, 6.5, 0.7);
  }

  /* ------------------------------------------------------------ 廊与阁前的灯笼 */
  const lanternGeo = new THREE.SphereGeometry(0.28, 10, 8);
  lanternGeo.scale(1, 1.28, 1);
  const capsGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.14, 0.09, 8).translate(0, 0.38, 0),
    new THREE.CylinderGeometry(0.14, 0.11, 0.09, 8).translate(0, -0.38, 0),
  ]);
  for (const [x, y, z] of anchors.shopLamps) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), wood);
    arm.position.set(x, y + 0.28, z - 0.3);
    arm.rotation.y = Math.PI / 2;
    group.add(arm);
    const body = new THREE.Mesh(lanternGeo, lampMat);
    body.position.set(x, y - 0.25, z);
    const caps = new THREE.Mesh(capsGeo, wood);
    caps.position.copy(body.position);
    group.add(body, caps);
    addHalo(x, y - 0.25, z, 1.9, 0.78);
  }

  /* ------------------------------------------------------------ 门光 */
  for (const [x, y, z] of anchors.doorGlows) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), doorMat);
    m.position.set(x, y, z);
    group.add(m);
    addHalo(x, y, z + 0.2, 2.6, 0.5);
  }

  /* ------------------------------------------------------------ 真实灯（八盏） */
  const lampDefs = [
    // [x, y, z, 色, 坎德拉, 距离]——近处两百多 cd 够，照远处立面要上千
    [[6, 3.4, 40], 0xffab63, 380, 40],
    [[6, 3.4, 72], 0xffa860, 620, 52],
    [[-34, 3.4, 2], 0xffc07a, 300, 34],
    [[34, 3.4, 34], 0xffb46a, 300, 36],
    [[-52, 3.6, -30], 0xffd08c, 260, 30],
    [[-66, 4.2, 6], 0xffab63, 1400, 58],
    [[38, 4.2, 44], 0xff9f5c, 1200, 56],
    [[-6, HILL_Y + 2.2, -70], 0xbfd4ff, 90, 40],
  ];
  const lights = lampDefs.map(([p, c, i, d]) => {
    const l = new THREE.PointLight(c, i, d, 2);
    l.position.set(p[0], GROUND_Y + p[1], p[2]);
    scene.add(l);
    return { l, base: i };
  });

  /* ------------------------------------------------------------ 池里荷灯（写意添加） */
  const cupGeo = new THREE.CylinderGeometry(0.2, 0.13, 0.16, 8);
  const flameGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const floaters = [];
  for (let i = 0; i < 14; i++) {
    const p = PONDS[i % 2];
    const raw = new THREE.Vector3(
      rr(p.x0 + 3, p.x1 - 3),
      WATER_Y,
      rr(p.z0 + 3, p.z1 - 3),
    );
    const c = clampToPond(raw.x, raw.z);
    if (!c) continue;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cupGeo, floaterMat));
    const flame = new THREE.Mesh(flameGeo, floaterMat);
    flame.position.y = 0.16;
    g.add(flame);
    g.position.set(c[0], WATER_Y + 0.1, c[1]);
    group.add(g);
    const sp = addHalo(g.position.x, g.position.y + 0.12, g.position.z, 1.2, 0.5);
    const col = columns.add(g.position, LAMP, 0.55, 4.2, 0.75);
    floaters.push({
      g, sp, col, pond: p, speed: rr(0.5, 1.1), phase: rand() * 6.28,
      dir: rand() > 0.5 ? 1 : -1,
    });
  }

  /* ------------------------------------------------------------ 游人身影 */
  const spots = [];
  let guard = 0;
  while (spots.length < 34 && guard++ < 400) {
    let x, z, y = GROUND_Y;
    const pick = rand();
    if (pick < 0.4) {                       // 环塔埕地一圈
      const a = rand() * Math.PI * 2, r = rr(20, 27);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } else if (pick < 0.66) {               // 南门甬道
      x = rr(3, 11); z = rr(16, 96);
    } else if (pick < 0.82) {               // 砚池南岸与东岸
      x = rr(14, 58); z = rr(44, 50);
    } else if (pick < 0.93) {               // 塔影池北岸
      x = rr(-56, -18); z = rr(-52, -46);
    } else {                                // 笔架山顶观景台
      const a = rand() * Math.PI * 2, r = rr(2, 5.6);
      x = -6 + Math.cos(a) * r; z = -72 + Math.sin(a) * r; y = HILL_Y;
    }
    if (clampToPond(x, z) || tooClose(x, z, 11)) continue;
    spots.push([x, y, z, rr(0, 6.28), rr(0.68, 0.82)]);
  }
  const figures = new THREE.InstancedMesh(
    figureGeo(1), new THREE.MeshBasicMaterial({ color: 0x121722 }), spots.length,
  );
  const d = new THREE.Object3D();
  spots.forEach((s, i) => {
    d.position.set(s[0], s[1], s[2]);
    d.rotation.set(0, s[3], 0);
    d.scale.setScalar(s[4]);
    d.updateMatrix();
    figures.setMatrixAt(i, d.matrix);
  });
  figures.instanceMatrix.needsUpdate = true;
  group.add(figures);

  let level = 1;
  return {
    group,
    setLantern(v) {
      level = v;
      const k = 0.3 + 0.7 * Math.min(1.4, v);
      for (const { m, base } of tints) m.color.copy(base).multiplyScalar(k);
      for (const s of sprites) s.material.opacity = s.userData.base * Math.min(1.15, 0.25 + 0.85 * v);
      for (const l of lights) l.l.intensity = l.base * Math.min(1.25, v);
    },
    setCrowd(n) { figures.count = THREE.MathUtils.clamp(Math.round(n), 0, spots.length); },
    update(t, dt) {
      for (const f of floaters) {
        f.g.position.x += dt * f.speed * f.dir * 0.6;
        if (f.g.position.x > f.pond.x1 - 2 || f.g.position.x < f.pond.x0 + 2) f.dir *= -1;
        const bob = Math.sin(t * 1.6 + f.phase) * 0.045;
        f.g.position.y = WATER_Y + 0.1 + bob;
        f.g.rotation.z = Math.sin(t * 1.2 + f.phase) * 0.1;
        f.sp.position.set(f.g.position.x, f.g.position.y + 0.12, f.g.position.z);
        columns.setPos(f.col, f.g.position);
      }
    },
  };

  /** 石灯离机位太近、或站在视线上就免了；笔架山上的石灯落在山头高度 */
  function tooClose(x, z, min) {
    return STATIONS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < min)
      || STATIONS.some((s) => {
        const dx = s.look[0] - s.pos[0], dz = s.look[2] - s.pos[2];
        const len2 = dx * dx + dz * dz || 1;
        const tt = THREE.MathUtils.clamp(((x - s.pos[0]) * dx + (z - s.pos[2]) * dz) / len2, 0, 1);
        return Math.hypot(x - (s.pos[0] + dx * tt), z - (s.pos[2] + dz * tt)) < 2.2 && tt < 0.96;
      });
  }
  /** 坡上的石灯要落在土山上，别插进坡里、也别浮在半空 */
  function groundAt(x, z) {
    let y = GROUND_Y;
    for (const p of PARK.hill.peaks) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 0.92) y = Math.max(y, GROUND_Y + p.h * Math.sqrt(1 - (d / p.r) ** 2));
    }
    return y;
  }
}

/** 沿两方池子的压顶再补一排石灯位（驳岸顶，间距约 11 米） */
function extraPondLamps() {
  const out = [];
  for (const p of PONDS) {
    for (let x = p.x0 + 5; x <= p.x1 - 5; x += 11) {
      out.push([x, p.z0 - 2.2], [x, p.z1 + 2.2]);
    }
    for (let z = p.z0 + 6; z <= p.z1 - 6; z += 11) {
      out.push([p.x0 - 2.2, z], [p.x1 + 2.2, z]);
    }
  }
  return out;
}
