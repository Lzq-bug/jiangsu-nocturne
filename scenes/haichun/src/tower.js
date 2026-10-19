/**
 * 海春轩塔本体。八角七层密檐式纯砖塔，通高 20.80 m，塔门朝西北，
 * 二层以上每面一圭形龛（6×8 = 48），内空筒不可登，筒里再立一座唐塔——
 * 即"内唐外宋 / 塔抱塔"。层径与层高按照片比例推定（见 data.js 注释）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { TOWER, GROUND_Y } from './data.js';
import * as T from './textures.js';

const SIDES = TOWER.sides;
const STEP = (Math.PI * 2) / SIDES;
const INR = Math.cos(Math.PI / SIDES);   // 外接圆半径 → 面心距（边心距）

const faceAz = (k) => (k + 0.5) * STEP;
const DOOR_FACE = 4;                      // 局部第 4 面在世界落在 225°，即西北

/** 圭首形：下矩上收尖 */
function guiShape(w, h, tip = 0.3) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * (1 - tip));
  s.lineTo(0, h);
  s.lineTo(-w / 2, h * (1 - tip));
  s.closePath();
  return s;
}

/** 龛口边框：圭首里挖一个圭首洞，光从洞里出来 */
function guiFrame(w, h, border) {
  const outer = guiShape(w, h);
  const inner = guiShape(w - border * 2, h - border * 1.6, 0.3);
  outer.holes.push(new THREE.Path(inner.getPoints(12).reverse()));
  const geo = new THREE.ShapeGeometry(outer);
  geo.translate(0, -h / 2, 0);
  return geo;
}

function guiPlate(w, h) {
  const geo = new THREE.ShapeGeometry(guiShape(w, h));
  geo.translate(0, -h / 2, 0);
  return geo;
}

/** 券拱：矩形 + 半圆顶 */
function archPlate(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** 券门口的砖券圈：中间空出来才看得见筒内的门灯 */
function archRing(w, h, border) {
  const outer = new THREE.Shape();
  const R = w / 2;
  outer.moveTo(-R, 0);
  outer.lineTo(-R, h - R);
  outer.absarc(0, h - R, R, Math.PI, 0, true);
  outer.lineTo(R, 0);
  outer.closePath();
  const iw = w - border * 2, ih = h - border * 1.5, r = iw / 2;
  const inner = new THREE.Shape();
  inner.moveTo(-r, border * 0.6);
  inner.lineTo(-r, ih - r);
  inner.absarc(0, ih - r, r, Math.PI, 0, true);
  inner.lineTo(r, border * 0.6);
  inner.closePath();
  outer.holes.push(new THREE.Path(inner.getPoints(14).reverse()));
  return new THREE.ShapeGeometry(outer);
}

function octPrism(rBottom, rTop, h, mat, openEnded = false) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, SIDES, 1, openEnded);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

/** 叠涩檐：砖自下而上逐层内退，退不下去的那一截就是挑出的檐口 */
function corbelEave(r, proj, thick, courses) {
  const parts = [];
  const ch = thick / courses;
  for (let j = 0; j < courses; j++) {
    const pLo = proj * (1 - j / courses);
    const pHi = proj * (1 - (j + 1) / courses);
    const g = new THREE.CylinderGeometry(r + pHi, r + pLo, ch, SIDES, 1, false);
    g.translate(0, j * ch + ch / 2, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export function buildTower(scene) {
  const group = new THREE.Group();
  group.name = 'tower';
  group.position.set(0, GROUND_Y, 0);
  group.rotation.y = TOWER.rot;
  scene.add(group);

  const brickMap = T.bricks();
  const tangMap = T.tangBricks();
  const outerMats = [];       // 剖视时这些材质一起渐隐

  const brickMatFor = (circ, h) => {
    const map = brickMap.clone();
    map.needsUpdate = true;
    // 砖的物理尺寸各层一致，否则底层像细砌、上层像大块垒
    map.repeat.set(Math.max(2, circ / 2.2), Math.max(1, h / 1.15));
    const m = lit('#dcd2c2', { map, rough: 0.93, emissive: '#2a2118', ei: 0.9 });
    outerMats.push(m);
    return m;
  };
  const eaveMap = brickMap.clone();
  eaveMap.needsUpdate = true;
  eaveMap.repeat.set(5, 3);
  const eaveMat = lit('#d0c6b6', { map: eaveMap, rough: 0.95, emissive: '#171310', ei: 0.5 });
  outerMats.push(eaveMat);
  const tileMat = lit('#c9d2e2', {
    map: T.tileBand(), rough: 0.76, side: THREE.DoubleSide, emissive: '#141a26', ei: 0.4,
  });
  outerMats.push(tileMat);

  /* ------------------------------------------------------------ 七层塔身与密檐 */
  let y = 0;
  const tierY = [];
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h, R] = TOWER.body[i];
    const nextR = TOWER.body[i + 1] ? TOWER.body[i + 1][1] : R * 0.9;
    const taper = (R - nextR) * 0.5;
    tierY.push(y);
    const body = octPrism(R, R - taper, h, brickMatFor(2 * Math.PI * R * 0.86, h));
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    y += h;
    const proj = 0.46 - i * 0.036;
    const eave = new THREE.Mesh(corbelEave(R - taper, proj, TOWER.eaveThk, i === 0 ? 5 : 3), eaveMat);
    eave.position.y = y;
    eave.castShadow = true;
    group.add(eave);
    const cap = new THREE.Mesh(new THREE.RingGeometry(R - taper + proj * 0.3, R - taper + proj, SIDES), tileMat);
    cap.geometry.rotateX(-Math.PI / 2);
    cap.position.y = y + TOWER.eaveThk - 0.012;
    group.add(cap);
    y += TOWER.eaveThk;
  }
  const bodyTop = y;

  /* ------------------------------------------------------------ 48 圭形龛 */
  const slots = [];
  for (const i of TOWER.nicheTiers) {
    const [h, R] = TOWER.body[i];
    const nextR = TOWER.body[i + 1] ? TOWER.body[i + 1][1] : R * 0.9;
    const midR = R - (R - nextR) * 0.5 * 0.52;
    const inr = midR * INR;
    const nh = Math.min(1.15, h * 0.74);
    for (let k = 0; k < SIDES; k++) {
      // 自下而上；每层自西北门所在面起顺时针绕
      slots.push({ tier: i, az: faceAz(k), order: (k - DOOR_FACE + SIDES) % SIDES, y: tierY[i] + h * 0.54, inr, w: nh * 0.46, h: nh });
    }
  }
  slots.sort((a, b) => a.tier - b.tier || a.order - b.order);

  const frameMat = lit('#b0b6c4', { map: brickMap.clone(), rough: 0.9, emissive: '#0d1017', ei: 0.3 });
  frameMat.map.needsUpdate = true;
  frameMat.map.repeat.set(1, 1);
  // 龛口框不进渐隐名单：外皮化成玻璃壳时，檐与龛的轮廓要留下来

  const dummy = new THREE.Object3D();
  const frames = new THREE.InstancedMesh(guiFrame(1, 1, 0.1), frameMat, slots.length);
  frames.name = 'nicheFrame';
  const nicheGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const glows = new THREE.InstancedMesh(guiPlate(0.76, 0.84), nicheGlowMat, slots.length);
  glows.name = 'nicheGlow';
  glows.frustumCulled = false;

  const warm = new THREE.Color('#ffbe72');
  const cTmp = new THREE.Color();
  slots.forEach((s, idx) => {
    dummy.rotation.set(0, s.az, 0);
    dummy.scale.set(s.w, s.h, 1);
    dummy.position.set(Math.sin(s.az) * (s.inr - 0.02), s.y, Math.cos(s.az) * (s.inr - 0.02));
    dummy.updateMatrix();
    frames.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(Math.sin(s.az) * (s.inr - 0.19), s.y, Math.cos(s.az) * (s.inr - 0.19));
    dummy.updateMatrix();
    glows.setMatrixAt(idx, dummy.matrix);
    glows.setColorAt(idx, cTmp.setRGB(0, 0, 0));
  });
  frames.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  group.add(frames, glows);

  let nicheK = 0;
  let nicheTarget = 0;
  let nicheBright = 1;
  let mirrorGlows = null;
  function paintNiches() {
    for (let i = 0; i < slots.length; i++) {
      const t = THREE.MathUtils.clamp(nicheK - i, 0, 1);
      cTmp.copy(warm).multiplyScalar(t * t * (3 - 2 * t));
      glows.setColorAt(i, cTmp);
    }
    glows.instanceColor.needsUpdate = true;
    // 镜像里的 instanceColor 不跟着源走，每次落色抄一份过去，水里的龛灯才跟着次第亮
    if (mirrorGlows && mirrorGlows.instanceColor) {
      mirrorGlows.instanceColor.array.set(glows.instanceColor.array);
      mirrorGlows.instanceColor.needsUpdate = true;
    }
  }
  paintNiches();

  /* ------------------------------------------------------------ 西北券门与空筒 */
  const [h1, R1] = TOWER.body[0];
  const doorAz = faceAz(DOOR_FACE);
  const doorIn = R1 * INR;
  const doorW = 1.16, doorH = 2.3;
  const sx = Math.sin(doorAz), sz = Math.cos(doorAz);
  const tubeR = R1 - TOWER.wall + 0.06;

  const tubeMat = lit('#3a3227', { map: tangMap, rough: 0.96, side: THREE.DoubleSide, emissive: '#040403', ei: 0.15 });
  outerMats.push(tubeMat);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, h1 - 0.1, SIDES, 1, true), tubeMat);
  tube.position.y = (h1 - 0.1) / 2;
  group.add(tube);

  // 门洞三层：砖券圈（外）→ 暖亮的内塔门（中）→ 发黑的筒底（后）
  const mouth = new THREE.Mesh(archPlate(doorW, doorH), new THREE.MeshBasicMaterial({ color: 0x0a0810, fog: false }));
  mouth.position.set(sx * (doorIn - 0.07), 0.06, sz * (doorIn - 0.07));
  mouth.rotation.y = doorAz;
  group.add(mouth);

  const innerDoorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const innerDoor = new THREE.Mesh(archPlate(doorW * 0.62, doorH * 0.62), innerDoorMat);
  innerDoor.position.set(sx * (doorIn - 0.02), 0.24, sz * (doorIn - 0.02));
  innerDoor.rotation.y = doorAz;
  group.add(innerDoor);

  const frameM = lit('#a89e90', { map: brickMap.clone(), rough: 0.92, emissive: '#141110', ei: 0.4 });
  frameM.map.needsUpdate = true;
  outerMats.push(frameM);
  const doorFrame = new THREE.Mesh(archRing(doorW + 0.44, doorH + 0.34, 0.18), frameM);
  doorFrame.position.set(sx * (doorIn + 0.05), -0.04, sz * (doorIn + 0.05));
  doorFrame.rotation.y = doorAz;
  group.add(doorFrame);

  /* ------------------------------------------------------------ 内唐塔 */
  const inner = new THREE.Group();
  inner.name = 'innerTower';
  group.add(inner);
  const tangMat = lit('#a89478', { map: tangMap, rough: 0.96, emissive: '#3a3020', ei: 0.5 });
  const innerBase = tubeR - 0.2;
  const innerH = bodyTop - TOWER.eaveThk - 1.6;
  const innerTiers = 5;
  let iy = 0;
  for (let i = 0; i < innerTiers; i++) {
    const f0 = i / innerTiers, f1 = (i + 1) / innerTiers;
    const h = innerH * (f1 - f0);
    const rB = innerBase * (1 - f0 * 0.4);
    const rT = innerBase * (1 - f1 * 0.4);
    const m = octPrism(rB, rT, h, tangMat);
    m.position.y = iy;
    inner.add(m);
    iy += h;
    const e = new THREE.Mesh(corbelEave(rT, 0.28, 0.2, 2), tangMat);
    e.position.y = iy - 0.02;
    inner.add(e);
    iy += 0.15;
  }
  const innerGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  for (let i = 0; i < 4; i++) {
    const r = innerBase * (1 - (i / 4) * 0.4) * INR;
    for (let k = 0; k < SIDES; k += 2) {
      const a = faceAz(k);
      const p = new THREE.Mesh(guiPlate(0.4, 0.62), innerGlowMat);
      p.position.set(Math.sin(a) * (r + 0.01), 0.85 + (i * innerH) / 4, Math.cos(a) * (r + 0.01));
      p.rotation.y = a;
      inner.add(p);
    }
  }

  /* ------------------------------------------------------------ 塔刹 */
  const spire = new THREE.Group();
  spire.position.y = bodyTop;
  group.add(spire);
  const iron = lit('#6d7280', { rough: 0.5, metal: 0.75, emissive: '#0b0d12', ei: 0.5 });
  const copper = lit('#e7b478', { rough: 0.34, metal: 0.9, emissive: '#5a3208', ei: 0.9 });

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.5, 0.22, SIDES), iron);
  basin.position.y = 0.11;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), iron);
  dome.position.y = 0.2;
  dome.scale.y = 0.42;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.24, 8), copper);
  shaft.position.y = 0.95;
  spire.add(basin, dome, shaft);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42 - i * 0.062, 0.048, 6, 14), iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.44 + i * 0.17;
    spire.add(ring);
  }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, SIDES, 1, true), iron);
  canopy.position.y = 1.5;
  const gourd = new THREE.Group();
  gourd.position.y = 1.86;
  const bulbLo = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), copper);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8), copper);
  neck.position.y = 0.13;
  const bulbHi = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), copper);
  bulbHi.position.y = 0.26;
  gourd.add(bulbLo, neck, bulbHi);
  const spireHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,214,150', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  spireHalo.scale.set(2.5, 2.5, 1);
  spireHalo.position.y = 1.9;
  spire.add(canopy, gourd, spireHalo);

  // 门口这盏只照券周砖，别把筒壁照亮点，否则门洞看不出是开口
  const doorLight = new THREE.PointLight(0xffb469, 18, 12, 2);
  doorLight.position.set(sx * (doorIn + 2.2), 2.4, sz * (doorIn + 2.2));
  group.add(doorLight);
  // 门前一盏自下而上的暖光：夜景灯色的写意，替月亮补出塔身的体积
  const upLight = new THREE.PointLight(0xffa860, 42, 30, 2);
  upLight.position.set(sx * 5.4, 0.9, sz * 5.4);
  group.add(upLight);

  /* ------------------------------------------------------------ 剖视与龛火 */
  for (const m of outerMats) m.transparent = true;
  let reveal = 0;
  let revealTarget = 0;
  let lastReveal = -1;

  const rot = new THREE.Vector3(0, 1, 0);
  const api = {
    group, inner, spire, slots: slots.length,
    anchors: {
      door: new THREE.Vector3(sx * doorIn, 1.5, sz * doorIn).applyAxisAngle(rot, TOWER.rot).setY(GROUND_Y + 1.5),
      spireTop: new THREE.Vector3(0, GROUND_Y + bodyTop + 2.05, 0),
      body: new THREE.Vector3(0, GROUND_Y + tierY[3] + 1, 0),
    },
    release(on, snap = false) {
      nicheTarget = on ? slots.length : 0;
      if (snap) { nicheK = nicheTarget; paintNiches(); }
    },
    setNicheBright(v) { nicheBright = v; },
    reveal(on, snap = false) { revealTarget = on ? 1 : 0; if (snap) reveal = 1; },
    /** 水面镜像里的 instanceColor 不会自动跟着源走，抄一份过去 */
    bindMirror(root) {
      root.traverse((o) => { if (o.isInstancedMesh && o.name === 'nicheGlow') mirrorGlows = o; });
      paintNiches();
    },
    update(t, dt) {
      if (nicheK !== nicheTarget) {
        const up = nicheTarget > nicheK;
        nicheK = THREE.MathUtils.clamp(nicheK + (up ? 1 : -1) * dt * (up ? 6.4 : 16), 0, slots.length);
        if (Math.abs(nicheK - nicheTarget) < 0.01) nicheK = nicheTarget;
        paintNiches();
      }
      nicheGlowMat.color.setScalar((0.86 + 0.09 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.7 + 1.3)) * nicheBright);
      innerDoorMat.color.setRGB(1.0, 0.72, 0.42).multiplyScalar((0.85 + 0.5 * reveal) * (0.92 + 0.08 * Math.sin(t * 1.7)) * nicheBright);
      spireHalo.material.opacity = 0.32 + 0.1 * Math.sin(t * 1.4);

      reveal += (revealTarget - reveal) * Math.min(1, dt * 2.2);
      if (Math.abs(reveal - revealTarget) < 0.004) reveal = revealTarget;
      if (Math.abs(reveal - lastReveal) > 0.002) {
        const op = 1 - 0.62 * reveal;
        for (const m of outerMats) {
          m.opacity = op;
          m.depthWrite = op > 0.6;
        }
        innerGlowMat.color.setRGB(1.0, 0.74, 0.44).multiplyScalar(0.14 + 1.15 * reveal);
        tangMat.emissiveIntensity = 0.5 + 2.6 * reveal;
        lastReveal = reveal;
      }
      return { reveal, niche: nicheK / slots.length };
    },
  };
  return api;
}
