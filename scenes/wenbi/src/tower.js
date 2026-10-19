/**
 * 文笔塔本体：八角七层砖身木檐楼阁式塔，通高 48.38 m（含塔刹）。
 * 可考的只有总高、底层外径 9.58 m、须弥座每边 4.1 m、"周绕回廊"、
 * 第六层 16 m 通天刹柱、塔基为宋代遗物；层净高、收分、出檐、平座出跳、
 * 门向（取南面为主）均按总高与照片观感反推——写意，见 data.js 注释。
 * 两个动作：release() 让七层 56 盏平座灯自下而上次第亮（燃笔），
 * reveal() 让砖身腰檐渐隐，露出宋基、楼板、旋梯与那根通天刹柱（剖视）。
 */
import * as THREE from 'three';
import { lit, bracketGeo, railingGeo } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { TOWER, GROUND_Y } from './data.js';
import * as T from './textures.js';

const SIDES = TOWER.sides;
const STEP = (Math.PI * 2) / SIDES;
const INR = Math.cos(Math.PI / SIDES);      // 外接圆半径 → 面心距
const faceAz = (k) => (k + 0.5) * STEP;      // 局部面心方位角（group 已转 −22.5°，偶数面落在正方向）
const DOOR_FACES = TOWER.doorFaces;

/** 券拱轮廓：矩形 + 半圆顶 */
function archShape(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

/** 门券圈：中间空出来才看得见门洞里那盏灯 */
function archRing(w, h, border) {
  const outer = archShape(w, h);
  const iw = w - border * 2, ih = h - border * 1.4, r = iw / 2;
  const inner = new THREE.Shape();
  inner.moveTo(-r, border * 0.5);
  inner.lineTo(-r, ih - r);
  inner.absarc(0, ih - r, r, Math.PI, 0, true);
  inner.lineTo(r, border * 0.5);
  inner.closePath();
  outer.holes.push(new THREE.Path(inner.getPoints(14).reverse()));
  return new THREE.ShapeGeometry(outer);
}

/** 圭首形：下矩上收尖，做盲窗与门洞灯面 */
function guiPlate(w, h, tip = 0.26) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * (1 - tip));
  s.lineTo(0, h);
  s.lineTo(-w / 2, h * (1 - tip));
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.translate(0, -h / 2, 0);
  return g;
}

function octPrism(rBottom, rTop, h, mat) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, SIDES, 1, false);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

/** 八角须弥座：圭角 + 束腰（八面壶门） + 上枋 + 涩砖线道 */
function podium(M) {
  const g = new THREE.Group();
  const { R, h } = TOWER.podium;
  const lower = h * 0.34, waist = h * 0.34, upper = h * 0.32;
  const parts = [
    [new THREE.CylinderGeometry(R, R * 1.02, lower, SIDES), M.stone, lower / 2],
    [new THREE.CylinderGeometry(R * 0.93, R * 0.93, waist, SIDES), M.stoneDark, lower + waist / 2],
    [new THREE.CylinderGeometry(R * 1.01, R * 0.96, upper, SIDES), M.stone, lower + waist + upper / 2],
    [new THREE.CylinderGeometry(R * 1.05, R * 1.03, 0.1, SIDES), M.stone, lower + waist],
  ];
  for (const [geo, mat, y] of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const inR = R * 0.93 * INR;
  for (let k = 0; k < SIDES; k++) {
    const az = faceAz(k);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), M.waistGlow);
    light.position.set(Math.sin(az) * (inR + 0.03), lower + waist * 0.5, Math.cos(az) * (inR + 0.03));
    light.rotation.y = az;
    g.add(light);
  }
  return g;
}

/** 一层腰檐：八角坡瓦 + 檐口压边 + 八只角翘 + 檐下椽条与天花 + 斗拱带 */
function eaveBand(rTop, rBottom, proj, M) {
  const g = new THREE.Group();
  const rOut = rBottom + proj;
  const h = TOWER.eaveH;
  const slope = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop + 0.15, rOut, h, SIDES, 1, true),
    M.tile,
  );
  slope.position.y = h / 2;
  slope.castShadow = true;
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(rOut + 0.07, rOut + 0.02, 0.16, SIDES), M.wood);
  lip.position.y = 0.08;
  g.add(slope, lip);
  // 檐下天花：从塔下往上看，缺这一圈腰檐就是一片悬空的黑
  const soffit = new THREE.Mesh(
    new THREE.RingGeometry(rBottom * INR * 0.98, rOut - 0.05, SIDES, 1),
    M.woodDark,
  );
  soffit.geometry.rotateX(Math.PI / 2);
  soffit.position.y = 0.02;
  g.add(soffit);
  // 椽条：一圈放射短木，挑檐的力道从这里读出来
  const rafters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.13, proj * 0.92), M.wood, SIDES * 5);
  const rd = new THREE.Object3D();
  let rn = 0;
  for (let k = 0; k < SIDES * 5; k++) {
    const az = (k / (SIDES * 5)) * Math.PI * 2;
    const rr0 = rBottom * INR * 1.02 + proj * 0.46;
    rd.position.set(Math.sin(az) * rr0, -0.09, Math.cos(az) * rr0);
    rd.rotation.set(0, az, 0);
    rd.scale.set(1, 1, 1);
    rd.updateMatrix();
    rafters.setMatrixAt(rn++, rd.matrix);
  }
  rafters.count = rn;
  rafters.instanceMatrix.needsUpdate = true;
  g.add(rafters);
  for (let k = 0; k < SIDES; k++) {
    const az = k * STEP;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), M.wood);
    tip.position.set(Math.sin(az) * (rOut + 0.1), 0.3, Math.cos(az) * (rOut + 0.1));
    tip.rotation.set(-0.5, az, 0.42);
    g.add(tip);
  }
  const brackets = new THREE.InstancedMesh(bracketGeo(0.62), M.wood, SIDES * 3);
  const d = new THREE.Object3D();
  let n = 0;
  for (let k = 0; k < SIDES; k++) {
    const az0 = faceAz(k);
    const rr = rBottom * INR + proj * 0.2;
    for (let j = -1; j <= 1; j++) {
      const az = az0 + j * 0.2;
      d.position.set(Math.sin(az) * rr, -0.3, Math.cos(az) * rr);
      d.rotation.set(0, az, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      brackets.setMatrixAt(n++, d.matrix);
    }
  }
  brackets.count = n;
  brackets.instanceMatrix.needsUpdate = true;
  g.add(brackets);
  return g;
}

/** 平座回廊：出跳台板 + 八角栏板 + 檐柱一圈 */
function gallery(rBody, M) {
  const g = new THREE.Group();
  const rOut = rBody + TOWER.galleryProj;
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(rOut, rOut * 0.99, 0.22, SIDES), M.stone);
  slab.position.y = 0.11;
  slab.receiveShadow = true;
  g.add(slab);
  const side = 2 * rOut * Math.sin(Math.PI / SIDES);
  for (let k = 0; k < SIDES; k++) {
    const az = faceAz(k);
    const rail = new THREE.Mesh(railingGeo(side * 0.9, { height: TOWER.railH, spacing: 0.66 }), M.stone);
    rail.position.set(Math.sin(az) * rOut * INR, 0.22, Math.cos(az) * rOut * INR);
    rail.rotation.y = az;
    g.add(rail);
  }
  const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.14, 2.0, 6), M.wood, SIDES * 2);
  const d = new THREE.Object3D();
  let n = 0;
  for (let k = 0; k < SIDES; k++) {
    for (const off of [-0.33, 0.33]) {
      const az = faceAz(k) + off;
      d.position.set(Math.sin(az) * rOut * 0.95, 1.2, Math.cos(az) * rOut * 0.95);
      d.rotation.set(0, az, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      pillars.setMatrixAt(n++, d.matrix);
    }
  }
  pillars.count = n;
  pillars.instanceMatrix.needsUpdate = true;
  g.add(pillars);
  return g;
}

export function buildTower(scene) {
  const group = new THREE.Group();
  group.name = 'tower';
  group.position.set(0, GROUND_Y, 0);
  group.rotation.y = TOWER.rot;
  scene.add(group);

  const brickMap = T.bricks();
  const outerMats = [];   // 剖视时这些材质一起渐隐

  const M = {
    stone: lit('#b5bac4', { map: TX.stone('#9aa1ad'), rough: 0.92, emissive: '#12141a', ei: 0.3 }),
    stoneDark: lit('#989ea9', { map: TX.stone('#7e8593'), rough: 0.94, emissive: '#0d0f14', ei: 0.26 }),
    wood: lit('#6b4230', { map: TX.wood('#54331f', '#2c160f'), rough: 0.86, emissive: '#150c06', ei: 0.32 }),
    woodDark: lit('#4a2c1d', { map: TX.wood('#3a2015', '#1d0f08'), rough: 0.9, emissive: '#0c0704', ei: 0.25 }),
    ink: lit('#242833', { rough: 0.9 }),
    recess: lit('#2b2822', { rough: 0.95, emissive: '#05050a', ei: 0.2 }),
    lattice: lit('#d8cbb2', {
      map: TX.lattice(4, 3, '#4a2417', '#ffd79a'), rough: 0.9,
      emissive: '#e09a44', ei: 0.75, side: THREE.DoubleSide,
    }),
    tile: lit('#c6d0e2', { map: T.tileBand(), rough: 0.78, side: THREE.DoubleSide, emissive: '#141a26', ei: 0.45 }),
  };
  const brickMatFor = (circ, h) => {
    const map = brickMap.clone();
    map.needsUpdate = true;
    // 砖的物理尺寸各层一致，否则底层像细砌、上层像大块垒
    map.repeat.set(Math.max(3, circ / 3.4), Math.max(1, h / 1.7));
    const m = lit('#cfc5b4', { map, rough: 0.94, emissive: '#221d15', ei: 0.55 });
    outerMats.push(m);
    return m;
  };
  const eaveMap = T.tileBand().clone();
  eaveMap.needsUpdate = true;
  eaveMap.repeat.set(26, 1);
  M.tile = lit('#c6d0e2', {
    map: eaveMap, rough: 0.78, side: THREE.DoubleSide, emissive: '#141a26', ei: 0.45,
  });
  for (const k of ['stone', 'stoneDark', 'wood', 'ink', 'recess', 'tile']) outerMats.push(M[k]);

  const waistGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbe72'), toneMapped: false, fog: false });
  M.waistGlow = waistGlow;

  /* ------------------------------------------------------------ 须弥座与埕地 */
  group.add(podium(M));
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.14, SIDES), M.stone);
  apron.position.y = 0.07;
  apron.receiveShadow = true;
  group.add(apron);

  /* ------------------------------------------------------------ 七层：塔身 / 平座 / 腰檐 */
  const yPodium = TOWER.podium.h;
  let y = yPodium;
  const tierY = [];
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h, R] = TOWER.body[i];
    const nextR = TOWER.body[i + 1] ? TOWER.body[i + 1][1] : R * 0.9;
    const taper = (R - nextR) * 0.55;
    tierY.push(y);

    if (i > 0) {
      const gal = gallery(R * 0.995, M);
      gal.position.y = y;
      group.add(gal);
    }

    const body = octPrism(R, R - taper, h, brickMatFor(2 * Math.PI * R * 0.86, h));
    body.position.y = y;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    // 四向辟券门、余四面开盲窗：门向与孔数无志书可据，写意
    const dw = Math.min(1.45, R * 0.3), dh = Math.min(2.7, h * 0.46);
    const frameMat = lit('#c6bda9', { map: brickMap.clone(), rough: 0.9, emissive: '#15120e', ei: 0.35 });
    frameMat.map.needsUpdate = true;
    frameMat.map.repeat.set(1, 2);
    outerMats.push(frameMat);
    for (let k = 0; k < SIDES; k++) {
      const az = faceAz(k);
      if (DOOR_FACES.includes(k)) {
        const inR = (R - taper * 0.14) * INR;
        const frame = new THREE.Mesh(archRing(dw + 0.52, dh + 0.42, 0.2), frameMat);
        frame.position.set(Math.sin(az) * (inR + 0.06), y + 0.16, Math.cos(az) * (inR + 0.06));
        frame.rotation.y = az;
        group.add(frame);
        const mouth = new THREE.Mesh(new THREE.ShapeGeometry(archShape(dw, dh)), M.recess);
        mouth.position.set(Math.sin(az) * (inR - 0.06), y + 0.2, Math.cos(az) * (inR - 0.06));
        mouth.rotation.y = az;
        group.add(mouth);
      } else {
        // 窗在墙面中段，塔身有收分，半径要按窗的高度取
        const inR = (R - taper * 0.55) * INR;
        const frame = new THREE.Mesh(guiPlate(dw * 0.86, dh * 0.56), M.recess);
        frame.position.set(Math.sin(az) * (inR + 0.02), y + h * 0.56, Math.cos(az) * (inR + 0.02));
        frame.rotation.y = az;
        group.add(frame);
        const pan = new THREE.Mesh(guiPlate(dw * 0.76, dh * 0.5), M.lattice);
        pan.position.set(Math.sin(az) * (inR + 0.08), y + h * 0.56, Math.cos(az) * (inR + 0.08));
        pan.rotation.y = az;
        group.add(pan);
      }
    }

    y += h;
    const eave = eaveBand(R - taper, R - taper, TOWER.eaveProj[i], M);
    eave.position.y = y;
    group.add(eave);
    y += TOWER.eaveH;
  }
  const bodyTop = y;

  /* ------------------------------------------------------------ 56 盏平座灯 */
  const slots = [];
  for (const i of TOWER.lampTiers) {
    const [h, R] = TOWER.body[i];
    const rOut = (i === 0 ? R + 0.35 : R * 0.995 + TOWER.galleryProj) * INR + 0.12;
    const ly = i === 0 ? yPodium + h * 0.66 : tierY[i] + 1.55;
    for (let k = 0; k < SIDES; k++) {
      slots.push({
        tier: i, order: k, az: faceAz(k), y: ly, r: rOut,
        w: Math.max(0.3, 0.44 - i * 0.02), hgt: Math.max(0.44, 0.66 - i * 0.03),
      });
    }
  }
  slots.sort((a, b) => a.tier - b.tier || a.order - b.order);

  const lanternMat = new THREE.MeshBasicMaterial({
    map: TX.lanternPaper('#fff3d0', '#e8734a'), toneMapped: false, fog: false,
  });
  const lanternGeo = new THREE.SphereGeometry(0.5, 8, 6);
  lanternGeo.scale(1, 1.3, 1);
  const lanterns = new THREE.InstancedMesh(lanternGeo, lanternMat, slots.length);
  lanterns.name = 'tierLamp';
  lanterns.frustumCulled = false;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const glows = new THREE.InstancedMesh(guiPlate(1, 1), glowMat, slots.length);
  glows.name = 'lampGlow';
  glows.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const warm = new THREE.Color('#ffbe72');
  const doorGlowBase = new THREE.Color('#ffb266');
  const cTmp = new THREE.Color();
  slots.forEach((s, idx) => {
    dummy.position.set(Math.sin(s.az) * s.r, s.y, Math.cos(s.az) * s.r);
    dummy.rotation.set(0, s.az, 0);
    dummy.scale.set(s.w, s.hgt, s.w);
    dummy.updateMatrix();
    lanterns.setMatrixAt(idx, dummy.matrix);
    lanterns.setColorAt(idx, cTmp.setRGB(0, 0, 0));
    dummy.scale.set(s.w * 2.7, s.hgt * 2.5, 1);
    dummy.position.set(Math.sin(s.az) * (s.r + 0.14), s.y, Math.cos(s.az) * (s.r + 0.14));
    dummy.updateMatrix();
    glows.setMatrixAt(idx, dummy.matrix);
    glows.setColorAt(idx, cTmp.setRGB(0, 0, 0));
  });
  lanterns.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  group.add(lanterns, glows);

  // 每层一团加色光晕，替八盏灯笼做"亮"（sprite 便宜，真实灯要省着用）
  const tierHalos = [];
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h] = TOWER.body[i];
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.softGlow('255,196,130', 0.1), color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0,
    }));
    sp.scale.setScalar(7.5 + (TOWER.tiers - i) * 1.1);
    sp.position.set(0, i === 0 ? yPodium + h * 0.66 : tierY[i] + 1.6, 0);
    group.add(sp);
    tierHalos.push(sp);
  }

  /* ------------------------------------------------------------ 塔刹（1982 年补作） */
  const spire = new THREE.Group();
  spire.position.y = bodyTop;
  group.add(spire);
  const SH = TOWER.spire;
  const copper = lit('#e7b878', { rough: 0.32, metal: 0.9, emissive: '#6a3d0c', ei: 1.5 });
  const iron = lit('#7d8492', { rough: 0.5, metal: 0.72, emissive: '#12151d', ei: 0.7 });
  const sBase = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.35, 0.5, SIDES), M.stone);
  sBase.position.y = 0.25;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), iron);
  bowl.scale.y = 0.4;
  bowl.position.y = 0.5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, SH - 1.0, 8), copper);
  shaft.position.y = 0.6 + (SH - 1.0) / 2;
  spire.add(sBase, bowl, shaft);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0 - i * 0.13, 0.085, 6, 16), iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.95 + i * 0.32;
    spire.add(ring);
  }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.5, SIDES, 1, true), iron);
  canopy.position.y = 2.85;
  const gourd = new THREE.Group();
  gourd.position.y = 3.5;
  const bulbLo = new THREE.Mesh(new THREE.SphereGeometry(0.56, 12, 9), copper);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.2, 8), copper);
  neck.position.y = 0.36;
  const bulbHi = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 9), copper);
  bulbHi.position.y = 0.72;
  const bead = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), copper);
  bead.position.y = 1.18;
  gourd.add(bulbLo, neck, bulbHi, bead);
  const spireHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,214,150', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.26,
  }));
  spireHalo.scale.set(7.5, 7.5, 1);
  spireHalo.position.y = 3.9;
  spire.add(canopy, gourd, spireHalo);

  /* ------------------------------------------------------------ 剖视里的塔心 */
  const core = new THREE.Group();
  core.name = 'core';
  group.add(core);
  const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a30'), roughness: 0.9, side: THREE.DoubleSide });
  const columnMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a5334'), roughness: 0.85 });
  const stairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5d4c3c'), roughness: 0.9 });
  const tubeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3d3428'), roughness: 0.96, side: THREE.DoubleSide,
  });
  for (let i = 0; i < TOWER.tiers; i++) {
    const R = TOWER.body[i][1] - 1.2;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.18, SIDES), floorMat);
    disc.position.y = tierY[i] + 0.09;
    core.add(disc);
  }
  // 第六层起 16 m 通天刹柱直顶塔刹（可考）；其下还有一根长柱落到第一层
  const colTop = bodyTop + SH * 0.8;
  const upper = colTop - tierY[5];
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, upper, 10), columnMat);
  column.position.y = tierY[5] + upper / 2;
  const lower = tierY[5] - yPodium;
  const lowerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, lower, 10), columnMat);
  lowerCol.position.y = yPodium + lower / 2;
  core.add(column, lowerCol);
  // 旋梯：沿内壁每层盘一圈（"内置旋梯环绕而上"，一处来源）
  const stairPts = [];
  const NST = 300;
  for (let i = 0; i <= NST; i++) {
    const f = i / NST;
    const level = f * TOWER.tiers;
    const ti = Math.min(TOWER.tiers - 1, Math.floor(level));
    const frac = level - ti;
    const [h, R] = TOWER.body[ti];
    const r = R - 1.0;
    const az = frac * Math.PI * 2 + ti * 0.42;
    stairPts.push(new THREE.Vector3(
      Math.sin(az) * r,
      tierY[ti] + 0.25 + frac * (h + TOWER.eaveH),
      Math.cos(az) * r,
    ));
  }
  const stair = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stairPts), 240, 0.18, 5, false),
    stairMat,
  );
  core.add(stair);
  const tubeR = TOWER.body[0][1] - 1.5;
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(tubeR * 0.72, tubeR, bodyTop - yPodium, SIDES, 1, true),
    tubeMat,
  );
  tube.position.y = yPodium + (bodyTop - yPodium) / 2;
  core.add(tube);

  // 门洞里的灯：每层一份材质，燃笔时才看得出是逐层在上行
  const doorMats = TOWER.body.map(() => new THREE.MeshBasicMaterial({
    color: doorGlowBase.clone(), toneMapped: false, fog: false,
  }));
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h, R] = TOWER.body[i];
    const inR = R * INR;
    for (const k of DOOR_FACES) {
      const az = faceAz(k);
      const p = new THREE.Mesh(guiPlate(Math.min(0.8, R * 0.2), Math.min(1.6, h * 0.42)), doorMats[i]);
      p.position.set(Math.sin(az) * (inR - 0.4), tierY[i] + h * 0.34, Math.cos(az) * (inR - 0.4));
      p.rotation.y = az;
      group.add(p);
    }
  }

  /* ------------------------------------------------------------ 真实灯（五盏，别再多） */
  const lampDefs = [
    [0, 3.2, TOWER.podium.R + 5.2, 0xffb469, 170, 30],
    [0, 13.5, TOWER.body[0][1] + 6.5, 0xffa860, 480, 48],
    [0, 29, TOWER.body[3][1] + 5.5, 0xffc17e, 780, 58],
    [-8, 43, -7, 0xffd2a0, 620, 52],
    [11, 20, -13, 0xbfd4ff, 260, 66],
  ];
  const lights = lampDefs.map(([x, dy, z, c, i, d]) => {
    const l = new THREE.PointLight(c, i, d, 2);
    l.position.set(x, GROUND_Y + dy, z);
    group.add(l);
    return { l, base: i };
  });
  const coolFill = lights[4].l;

  /* ------------------------------------------------------------ 次第亮与渐隐 */
  for (const m of outerMats) m.transparent = true;
  let lampK = 0, lampTarget = 0, lampBright = 1, flicker = 1;
  let reveal = 0, revealTarget = 0, lastReveal = -1;
  let mirrorLanterns = null, mirrorGlows = null;

  function paintLamps() {
    for (let i = 0; i < slots.length; i++) {
      const t = THREE.MathUtils.clamp(lampK - i, 0, 1);
      const e = t * t * (3 - 2 * t);
      cTmp.copy(warm).multiplyScalar(e * e * 1.4 * lampBright);
      lanterns.setColorAt(i, cTmp);
      cTmp.copy(warm).multiplyScalar(e * 1.1 * lampBright);
      glows.setColorAt(i, cTmp);
    }
    lanterns.instanceColor.needsUpdate = true;
    glows.instanceColor.needsUpdate = true;
    for (let i = 0; i < TOWER.tiers; i++) {
      const t = THREE.MathUtils.clamp(lampK - i * SIDES, 0, 1);
      tierHalos[i].material.opacity = 0.06 + 0.4 * t * Math.min(1.2, lampBright);
    }
    for (let i = 0; i < TOWER.tiers; i++) {
      const t = THREE.MathUtils.clamp(lampK - i * SIDES, 0, 1);
      doorMats[i].color.copy(doorGlowBase).multiplyScalar((0.18 + t) * flicker * lampBright);
    }
    // 镜像里的 instanceColor 不会自动跟源走，抄一份过去，水里的灯才跟着次第亮
    if (mirrorLanterns && mirrorLanterns.instanceColor) {
      mirrorLanterns.instanceColor.array.set(lanterns.instanceColor.array);
      mirrorLanterns.instanceColor.needsUpdate = true;
      mirrorGlows.instanceColor.array.set(glows.instanceColor.array);
      mirrorGlows.instanceColor.needsUpdate = true;
    }
  }
  paintLamps();

  return {
    group, core, spire, slots: slots.length, M,
    anchors: {
      door: new THREE.Vector3(0, GROUND_Y + 2.6, TOWER.podium.R + 1.4),
      podium: new THREE.Vector3(0, GROUND_Y + 1.1, TOWER.podium.R + 0.8),
      gallery: new THREE.Vector3(0, GROUND_Y + tierY[2] + 2.0, 0),
      spireTop: new THREE.Vector3(0, GROUND_Y + bodyTop + SH * 0.9, 0),
    },
    release(on, snap = false) {
      lampTarget = on ? slots.length : 0;
      if (snap) { lampK = lampTarget; paintLamps(); }
    },
    setLampBright(v) { lampBright = v; paintLamps(); },
    reveal(on, snap = false) { revealTarget = on ? 1 : 0; if (snap) reveal = 1; },
    bindMirror(root) {
      root.traverse((o) => {
        if (!o.isInstancedMesh) return;
        if (o.name === 'tierLamp') mirrorLanterns = o;
        if (o.name === 'lampGlow') mirrorGlows = o;
      });
      paintLamps();
    },
    update(t, dt) {
      if (lampK !== lampTarget) {
        const up = lampTarget > lampK;
        lampK = THREE.MathUtils.clamp(lampK + (up ? 1 : -1) * dt * (up ? 24 : 60), 0, slots.length);
        if (Math.abs(lampK - lampTarget) < 0.01) lampK = lampTarget;
      }
      const fl = 0.9 + 0.07 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 5.9 + 1.3);
      flicker = fl;
      paintLamps();
      glowMat.color.setScalar(fl * lampBright);
      waistGlow.color.copy(warm).multiplyScalar((0.4 + 0.6 * Math.min(1, lampK / SIDES)) * fl * lampBright);
      spireHalo.material.opacity = 0.22 + 0.07 * Math.sin(t * 1.4) + 0.45 * Math.min(1, lampK / slots.length);
      lanternMat.color.setScalar(fl * Math.min(1.15, 0.35 + 0.8 * lampBright));

      reveal += (revealTarget - reveal) * Math.min(1, dt * 2.4);
      if (Math.abs(reveal - revealTarget) < 0.004) reveal = revealTarget;
      if (Math.abs(reveal - lastReveal) > 0.002) {
        const op = 1 - 0.78 * reveal;
        for (const m of outerMats) {
          m.opacity = op;
          m.depthWrite = op > 0.55;
        }
        floorMat.emissive.setRGB(0.4 * reveal, 0.25 * reveal, 0.11 * reveal);
        columnMat.emissive.setRGB(0.5 * reveal, 0.31 * reveal, 0.13 * reveal);
        stairMat.emissive.setRGB(0.34 * reveal, 0.22 * reveal, 0.1 * reveal);
        tubeMat.emissive.setRGB(0.12 * reveal, 0.08 * reveal, 0.04 * reveal);
        lastReveal = reveal;
      }
      coolFill.intensity = lights[4].base * (0.5 + 0.5 * reveal);
      return { reveal, lamp: lampK / slots.length };
    },
  };
}
