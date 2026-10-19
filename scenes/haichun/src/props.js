/**
 * 灯与人：石灯、檐前灯笼、灶火、河灯、人影。
 * 发光面一律 MeshBasicMaterial + 加色 sprite，真实灯全场景只留六盏——
 * SwiftShader 下上百盏 PointLight 会把一张静帧拖到十分钟以外。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, figureGeo, rand, rr } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, RIVER, DIKE_Y, inChannel, WATER_Y, STATIONS } from './data.js';

const LAMP = '#ffbe72';

export function buildProps(scene, anchors, columns) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const stone = lit('#9ba1ad', { map: TX.stone('#868d99'), rough: 0.92 });
  const wood = lit('#6b4630', { map: TX.wood('#54331f', '#2c160f'), rough: 0.85 });
  const haloTex = TX.softGlow('255,190,120', 0.16);

  /** 参与"檐下灯火"滑条的发光材质：记下本色，滑条乘它 */
  const tints = [];
  const tinted = (hex, mul = 1.4) => {
    const base = new THREE.Color(hex).multiplyScalar(mul);
    const m = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false, fog: false });
    tints.push({ m, base });
    return m;
  };

  const lampMat = new THREE.MeshBasicMaterial({ map: TX.lanternPaper('#fff3d0', '#e8734a'), toneMapped: false });
  const lampBase = lampMat.color.clone();
  tints.push({ m: lampMat, base: lampBase });

  const stoneWinMat = tinted('#ffe6bd', 1.5);
  const fireMat = tinted('#ff8a3c', 1.9);
  const floaterMat = tinted(LAMP, 1.8);
  const doorMat = tinted('#ffd79b', 1.2);

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
  for (const [x, z] of anchors.lampPosts) {
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
    g.position.set(x, GROUND_Y, z);
    g.rotation.y = rand() * 3;
    group.add(g);
    addHalo(x, GROUND_Y + 1.66, z, 1.5, 0.6);
  }

  /* ------------------------------------------------------------ 檐前灯笼 */
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

  /* ------------------------------------------------------------ 山门与殿前的门光 */
  for (const [x, y, z] of anchors.doorGlows) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), doorMat);
    m.position.set(x, y, z);
    group.add(m);
    addHalo(x, y, z + 0.2, 2.6, 0.5);
  }

  /* ------------------------------------------------------------ 真实灯 */
  const lights = [];
  const lampDefs = [
    [[-16, GROUND_Y + 3.4, 11.4], 0xffc07a, 34, 24],
    [[9, GROUND_Y + 2.6, 17], 0xffab63, 38, 22],
    [[-13, GROUND_Y + 2.6, 17], 0xffab63, 38, 22],
    [[-25, GROUND_Y + 3.4, 6], 0xffd08c, 34, 20],
    [[45, GROUND_Y + 1.8, -2], 0xff8a44, 55, 24],
    [[31, GROUND_Y + 2.6, 2], 0xffb46a, 78, 34],
  ];
  for (const [p, c, i, d] of lampDefs) {
    const l = new THREE.PointLight(c, i, d, 2);
    l.position.set(...p);
    scene.add(l);
    lights.push({ l, base: i });
  }

  /* ------------------------------------------------------------ 灶火 */
  for (const [x, y, z] of anchors.stoves) {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), fireMat);
    mouth.position.set(x, y, z);
    mouth.rotation.y = -Math.PI / 2;
    group.add(mouth);
    group.add(new THREE.Points(embersGeo(x, y - 0.2, z), new THREE.PointsMaterial({
      map: TX.softGlow('255,150,70', 0.2), size: 1.5, transparent: true, color: 0xffffff,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })));
    addHalo(x - 0.4, y + 0.5, z, 3.2, 0.66);
  }

  /* ------------------------------------------------------------ 河灯（写意添加） */
  const cupGeo = new THREE.CylinderGeometry(0.2, 0.13, 0.16, 8);
  const flameGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const floaters = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cupGeo, floaterMat));
    const flame = new THREE.Mesh(flameGeo, floaterMat);
    flame.position.y = 0.16;
    g.add(flame);
    const x = -70 + i * 15 + rr(-3, 3);
    g.position.set(x, WATER_Y + 0.1, inChannel(RIVER.at + rr(-6, 6)));
    group.add(g);
    const sp = addHalo(g.position.x, g.position.y + 0.12, g.position.z, 1.2, 0.55);
    const col = columns.add(g.position, LAMP, 0.6, 4.6, 0.8);
    floaters.push({ g, sp, col, speed: rr(0.9, 1.7), phase: rand() * 6.28 });
  }

  /* ------------------------------------------------------------ 人影 */
  const s = RIVER.at + RIVER.halfWidth + 1.2;
  const spots = [];
  for (let i = 0; i < 46 && spots.length < 46; i++) {
    // 三分之二在河北岸的街带上，其余在堤顶散步
    const onDike = i % 3 === 0;
    const x = rr(-34, 40);
    const y = onDike ? DIKE_Y : GROUND_Y;
    const z = onDike ? s + rr(5.6, 9.5) : RIVER.at - RIVER.halfWidth - rr(2.5, 7.5);
    // 人影糊在镜头前是最难看的，离机位 6 m 以内不要
    if (!STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 6)) continue;
    spots.push([x, y, z, rr(0, 6.28), rr(0.9, 1.25)]);
  }
  const figures = new THREE.InstancedMesh(figureGeo(1), new THREE.MeshBasicMaterial({ color: 0x0a0d16 }), spots.length);
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
    setCrowd(n) {
      figures.count = THREE.MathUtils.clamp(Math.round(n), 0, spots.length);
    },
    update(t, dt) {
      for (const f of floaters) {
        f.g.position.x += dt * f.speed * 2.1;
        if (f.g.position.x > 92) f.g.position.x = -92;
        const bob = Math.sin(t * 1.6 + f.phase) * 0.05;
        f.g.position.y = WATER_Y + 0.1 + bob;
        f.g.rotation.z = Math.sin(t * 1.2 + f.phase) * 0.12;
        f.sp.position.set(f.g.position.x, f.g.position.y + 0.12, f.g.position.z);
        columns.setPos(f.col, f.g.position);
      }
      const fl = 0.82 + 0.12 * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 7.3);
      fireMat.color.setRGB(0.95, 0.33, 0.15).multiplyScalar(fl * (0.4 + 0.6 * level));
    },
  };
}

function embersGeo(x, y, z) {
  const n = 26;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x - 0.2 + rr(-0.5, 0.5);
    pos[i * 3 + 1] = y + 0.3 + Math.pow(rand(), 1.6) * 2.6;
    pos[i * 3 + 2] = z + rr(-0.5, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}
