/**
 * 塔基探方与地宫。
 *
 * 可考：2008 年南京市博物馆在塔基之下发掘出地宫，深 6.74 米；出土器物六十六件（套），
 * 外有北宋《金陵长干寺真身塔藏舍利石函记》石函，函内真身铁函，铁函内置鎏金七宝阿育王塔
 * （通高 1.1 米、重约五十公斤，四面开龛），塔中藏金棺银椁，舍利含佛顶骨舍利与感应舍利十五枚。
 * 这座地宫属北宋长干寺真身塔，不是明塔所埋——明塔是叠在宋塔故址上建的。
 *
 * 写意：探方剖在塔基以南（实地宫在塔身正中之下），坑壁坡度、支撑与标尺、函与塔的相对位置
 * 皆按展示常例排布；阿育王塔龛内纹饰、铁函铭文内容一概不摹。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, box, plaqueMesh } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, PIT } from './data.js';
import * as T from './textures.js';

const FLOOR = GROUND_Y - PIT.depth;   // -5.74

/** 一层台阶式坑壁：四面各三退（退得浅，好让机位站得进坑底） */
function trenchWalls(M) {
  const parts = [];
  const steps = 3;
  for (let s = 0; s < steps; s++) {
    const inset = s * 0.9;
    const x0 = PIT.x0 + inset, x1 = PIT.x1 - inset;
    const z0 = PIT.z0 + inset, z1 = PIT.z1 - inset;
    const h = PIT.depth / steps;
    const y = GROUND_Y - s * h;
    parts.push(box(x1 - x0, h, 0.5, (x0 + x1) / 2, y - h / 2, z0));
    parts.push(box(x1 - x0, h, 0.5, (x0 + x1) / 2, y - h / 2, z1));
    parts.push(box(0.5, h, z1 - z0, x0, y - h / 2, (z0 + z1) / 2));
    parts.push(box(0.5, h, z1 - z0, x1, y - h / 2, (z0 + z1) / 2));
  }
  return mergeGeometries(parts);
}

/** 券顶砖室：南面开敞，探方里的机位才看得见内函 */
function chamber(M) {
  const g = new THREE.Group();
  const w = 8.2, d = 5.6, wallH = 1.9;
  const x = 0, z = (PIT.z0 + PIT.z1) / 2;
  const shell = mergeGeometries([
    box(w, wallH, 0.6, x, FLOOR + wallH / 2, z - d / 2),
    box(0.6, wallH, d, x - w / 2, FLOOR + wallH / 2, z),
    box(0.6, wallH, d, x + w / 2, FLOOR + wallH / 2, z),
  ]);
  const walls = new THREE.Mesh(shell, M.brick);
  walls.receiveShadow = true;
  g.add(walls);
  // 券顶：半圆筒横架，轴向沿面阔（X），长度即室宽
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(wallH * 0.95, wallH * 0.95, w, 14, 1, true, 0, Math.PI),
    M.brickIn,
  );
  vault.rotation.z = Math.PI / 2;
  vault.position.set(x, FLOOR + wallH, z);
  g.add(vault);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), M.brickFloor);
  floor.geometry.rotateX(-Math.PI / 2);
  floor.position.set(x, FLOOR + 0.02, z);
  floor.receiveShadow = true;
  g.add(floor);
  return { group: g, x, z, w, d };
}

/** 七宝阿育王塔：四面开龛的鎏金方塔，通高 1.1 米（可考） */
function asokaTower(M) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 8), M.gilt);
  base.position.y = 0.08;
  const body = new THREE.Mesh(box(0.5, 0.52, 0.5), M.gilt);
  body.position.y = 0.42;
  const bandGeo = box(0.56, 0.07, 0.56);
  for (const y of [0.24, 0.66]) {
    const b = new THREE.Mesh(bandGeo, M.giltDim);
    b.position.y = y;
    g.add(b);
  }
  // 四面龛：深色凹口 + 一点金
  const niche = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), M.recess);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const n = niche.clone();
    n.position.set(Math.sin(a) * 0.26, 0.44, Math.cos(a) * 0.26);
    n.rotation.y = a;
    g.add(n);
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), M.giltHot);
    bud.position.set(Math.sin(a) * 0.24, 0.44, Math.cos(a) * 0.24);
    g.add(bud);
  }
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.2, 8), M.gilt);
  shoulder.position.y = 0.8;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 9, 7), M.giltHot);
  finial.position.y = 0.98;
  const sheng = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), M.gilt);
  sheng.position.y = 1.1;
  g.add(base, body, shoulder, finial, sheng);
  return g;   // 通高约 1.1 m，与记载一致
}

export function buildPalace(scene) {
  // 地面砖要比墙密：songBrick 是共享贴图，改之前先 clone
  const songFloor = T.songBrick().clone();
  songFloor.needsUpdate = true;
  songFloor.repeat.set(6, 4);
  const M = {
    brick: lit('#7a6c56', { map: T.songBrick(), rough: 0.95, emissive: '#151209', ei: 0.35 }),
    brickIn: lit('#665a46', { map: T.songBrick(), rough: 0.96, side: THREE.DoubleSide, emissive: '#100d08', ei: 0.3 }),
    brickFloor: lit('#5f5645', { map: songFloor, rough: 0.97 }),
    strata: lit('#6b5a44', { map: T.strata(), rough: 0.98, side: THREE.DoubleSide }),
    stone: lit('#9b9c94', { map: TX.stone('#87887f'), rough: 0.92 }),
    iron: lit('#3a3f47', { map: T.ironCase(), rough: 0.62, metal: 0.7, emissive: '#0c0e12', ei: 0.4 }),
    gilt: lit('#d8ab63', { rough: 0.3, metal: 0.9, emissive: '#4a3210', ei: 0.85 }),
    giltDim: lit('#a8814a', { rough: 0.4, metal: 0.85, emissive: '#2c1d09', ei: 0.6 }),
    silver: lit('#b8bec8', { rough: 0.34, metal: 0.86, emissive: '#1c2028', ei: 0.5 }),
    recess: new THREE.MeshBasicMaterial({ color: 0x0a0a10, fog: false }),
    giltHot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe1a8').multiplyScalar(1.5), toneMapped: false, fog: false }),
    relic: new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3d0').multiplyScalar(2.6), toneMapped: false, fog: false }),
  };

  const group = new THREE.Group();
  group.name = 'palace';
  scene.add(group);

  /* ------------------------------------------------------------ 坑壁与底 */
  group.add(new THREE.Mesh(trenchWalls(M), M.strata));
  const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(PIT.x1 - PIT.x0, PIT.z1 - PIT.z0), M.brickFloor);
  pitFloor.geometry.rotateX(-Math.PI / 2);
  pitFloor.position.set(0, FLOOR - 0.02, (PIT.z0 + PIT.z1) / 2);
  pitFloor.receiveShadow = true;
  group.add(pitFloor);

  /* ------------------------------------------------------------ 盖板（开宫时渐隐的就是它） */
  const lidMat = lit('#8f8874', { map: T.paving(), rough: 0.96, emissive: '#0d0f12', ei: 0.3 });
  lidMat.transparent = true;
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(PIT.x1 - PIT.x0 + 0.2, PIT.z1 - PIT.z0 + 0.2), lidMat);
  lid.geometry.rotateX(-Math.PI / 2);
  lid.position.set(0, GROUND_Y + 0.02, (PIT.z0 + PIT.z1) / 2);
  lid.receiveShadow = true;
  group.add(lid);

  /* ------------------------------------------------------------ 券室与层层相套 */
  const ch = chamber(M);
  group.add(ch.group);

  // 石函：外，盖已斜启
  const stoneCase = new THREE.Group();
  const sBody = new THREE.Mesh(box(1.5, 0.6, 0.9), M.stone);
  sBody.position.y = 0.3;
  const sLid = new THREE.Mesh(box(1.56, 0.16, 0.96), M.stone);
  sLid.position.set(0, 0.66, -0.1);
  sLid.rotation.x = -0.22;
  stoneCase.add(sBody, sLid);
  stoneCase.position.set(ch.x - 2.9, FLOOR + 0.03, ch.z);
  group.add(stoneCase);

  // 铁函：石函之内，函盖已开
  const ironCase = new THREE.Group();
  const iBody = new THREE.Mesh(box(1.15, 0.72, 0.78), M.iron);
  iBody.position.y = 0.36;
  const iLid = new THREE.Mesh(box(1.2, 0.14, 0.82), M.iron);
  iLid.position.set(0, 0.86, 0.34);
  iLid.rotation.x = 0.9;
  ironCase.add(iBody, iLid);
  ironCase.position.set(ch.x - 1.2, FLOOR + 0.03, ch.z);
  group.add(ironCase);

  // 七宝阿育王塔：出自铁函，此处置之于函前的低座上，好叫它在画面里看得见
  const stand = new THREE.Mesh(box(0.8, 0.22, 0.8, ch.x + 0.9, FLOOR + 0.11, ch.z), M.stone);
  group.add(stand);
  const tower = asokaTower(M);
  tower.position.set(ch.x + 0.9, FLOOR + 0.22, ch.z);
  group.add(tower);

  // 金棺银椁：塔中藏之，另列于后
  const coffin = new THREE.Group();
  const outer = new THREE.Mesh(box(0.62, 0.24, 0.3), M.silver);
  outer.position.y = 0.12;
  const inner = new THREE.Mesh(box(0.44, 0.18, 0.22), M.gilt);
  inner.position.set(0.05, 0.33, 0);
  coffin.add(outer, inner);
  coffin.position.set(ch.x + 2.9, FLOOR + 0.03, ch.z - 0.9);
  coffin.rotation.y = -0.35;
  group.add(coffin);

  /* ------------------------------------------------------------ 舍利的一点光 */
  const relicMat = M.relic;
  const relic = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), relicMat);
  relic.position.set(ch.x + 2.95, FLOOR + 0.5, ch.z - 0.9);
  group.add(relic);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,236,196', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(2.6, 2.6, 1);
  halo.position.copy(relic.position);
  group.add(halo);
  // 感应舍利十五枚：一圈针光
  const pts = [];
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2;
    pts.push(ch.x + 2.95 + Math.cos(a) * 0.5, FLOOR + 0.2, ch.z - 0.9 + Math.sin(a) * 0.32);
  }
  const beadGeo = new THREE.BufferGeometry();
  beadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  const beads = new THREE.Points(beadGeo, new THREE.PointsMaterial({
    map: TX.softGlow('255,228,178', 0.2), size: 0.3, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  group.add(beads);

  /* ------------------------------------------------------------ 探方里的说明与刻度 */
  const depthPlate = plaqueMesh('深六米七四', 2.6, 0.52, { bg: '#101a26', fg: '#e8dcc0', border: '#6c7482' });
  depthPlate.position.set(PIT.x1 - 1.4, FLOOR + 1.35, ch.z - 2.6);
  depthPlate.rotation.y = -Math.PI / 2;
  group.add(depthPlate);
  const labelPlaque = plaqueMesh('北宋长干寺真身塔地宫', 3.4, 0.5, { bg: '#101a26', fg: '#e8dcc0', border: '#6c7482' });
  labelPlaque.position.set(0, FLOOR + 2.5, PIT.z1 - 0.3);
  labelPlaque.rotation.y = Math.PI;
  group.add(labelPlaque);

  // 深度刻度：坑壁西面每二米一道横线，加地面一线
  const tickMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfd8e4').multiplyScalar(0.7), toneMapped: false, fog: true });
  const ticks = [];
  for (const dv of [0, 2, 4, 6, PIT.depth]) {
    const y = GROUND_Y - dv;
    ticks.push(box(PIT.x1 - PIT.x0 - 0.4, 0.045, 0.06, 0, y - 0.02, PIT.z0 + 0.24));
  }
  group.add(new THREE.Mesh(mergeGeometries(ticks), tickMat));
  const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.08, PIT.depth, 0.08), M.silver);
  ruler.position.set(PIT.x1 - 0.6, GROUND_Y - PIT.depth / 2, PIT.z0 + 0.6);
  group.add(ruler);

  // 坑口的护栏（发掘现场常例，属示意）
  const railMat = lit('#5f6672', { rough: 0.6, metal: 0.4 });
  const rails = [
    box(PIT.x1 - PIT.x0, 0.08, 0.08, 0, GROUND_Y + 0.62, PIT.z0 - 0.5),
    box(PIT.x1 - PIT.x0, 0.08, 0.08, 0, GROUND_Y + 0.62, PIT.z1 + 0.5),
    box(0.08, 0.08, PIT.z1 - PIT.z0, PIT.x0 - 0.5, GROUND_Y + 0.62, (PIT.z0 + PIT.z1) / 2),
  ];
  group.add(new THREE.Mesh(mergeGeometries(rails), railMat));

  // 一盏地下光：只在开宫时亮，把函与塔照出来；另一盏冷光管坑壁的文化层
  const pitLight = new THREE.PointLight(0xffd2a0, 0, 15, 2);
  pitLight.position.set(0, FLOOR + 2.1, 27.4);
  group.add(pitLight);
  const trenchLight = new THREE.PointLight(0xc8dcff, 0, 30, 2);
  trenchLight.position.set(0, GROUND_Y + 1.2, ch.z);
  group.add(trenchLight);

  let open = 0, goal = 0;
  const api = {
    group, FLOOR,
    anchors: {
      chamber: new THREE.Vector3(ch.x, FLOOR, ch.z),
      tower: new THREE.Vector3(tower.position.x, FLOOR + 0.6, tower.position.z),
      relic: relic.position.clone(),
      pitLight: pitLight.position.clone(),
    },
    open(on, snap = false) {
      goal = on ? 1 : 0;
      if (snap) { open = 1; apply(); }
    },
    update(t, dt) {
      if (open !== goal) {
        open += (goal - open) * Math.min(1, dt * 2.0);
        if (Math.abs(open - goal) < 0.004) open = goal;
        apply();
      }
      const pulse = 1 + 0.12 * Math.sin(t * 1.9) + 0.05 * Math.sin(t * 4.7);
      relicMat.color.setRGB(1, 0.94, 0.82).multiplyScalar(2.2 * pulse);
      halo.material.opacity = (0.4 + 0.12 * Math.sin(t * 1.5)) * (0.25 + 0.75 * open);
      beads.material.opacity = 0.55 + 0.2 * Math.sin(t * 2.3);
      return { open };
    },
  };
  function apply() {
    const op = 1 - open;
    lidMat.opacity = Math.max(0, op);
    lidMat.depthWrite = op > 0.55;
    lid.visible = op > 0.02;
    pitLight.intensity = 34 * open;
    trenchLight.intensity = 70 * open;
    M.brick.emissiveIntensity = 0.35 + 0.75 * open;
    M.brickIn.emissiveIntensity = 0.3 + 0.7 * open;
    M.gilt.emissiveIntensity = 0.85 + 1.6 * open;
    M.iron.emissiveIntensity = 0.4 + 0.9 * open;
  }
  apply();
  return api;
}
