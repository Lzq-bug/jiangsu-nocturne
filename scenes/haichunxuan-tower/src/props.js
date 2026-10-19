/**
 * 灯火与人事：街灯与塔影下的灯、河上漂的河灯、沿河挂的灯串、
 * 夜航认塔的盐船（船头灯与塔灯同频），以及顺时针绕塔的香客。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, PAL, glow, rand, rr, loftHull, stringPath, figureGeo, registerOccluder, mesh, box,
} from './kit.js';
import { SITE, CANAL } from './data.js';
import * as T from './textures.js';

const Q = SITE.yardY;
const HW = CANAL.halfWidth;
const HALF = CANAL.length / 2;

/* ------------------------------------------------------------------ 灯笼 */

function lanternGeo(s = 1) {
  const body = new THREE.SphereGeometry(0.34 * s, 10, 8);
  body.scale(1, 1.22, 1);
  const cap = new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 0.1 * s, 8);
  cap.translate(0, 0.42 * s, 0);
  const foot = new THREE.CylinderGeometry(0.16 * s, 0.1 * s, 0.08 * s, 8);
  foot.translate(0, -0.42 * s, 0);
  const tassel = new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.3 * s, 5);
  tassel.translate(0, -0.6 * s, 0);
  return mergeGeometries([body, cap, foot, tassel]);
}

/**
 * 灯群：街上、院里、门前与船埠的灯笼按密度点亮，
 * 每一盏都往水里要一根光柱，密度滑杆动的就是这两件事。
 */
function lanternField(scene, columns, anchors) {
  const spots = [];
  const push = (p, s = 1, kind = 'street') => spots.push({ pos: new THREE.Vector3(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z), s, kind });
  anchors.street.forEach((v) => push([v.x, v.y, v.z], rr(0.85, 1.15)));
  anchors.gateLamps.forEach((v) => push([v.x, v.y, v.z], 1.25, 'gate'));
  anchors.yard.forEach((v) => push([v.x, v.y + rr(0.2, 1.6), v.z], rr(0.7, 0.95), 'yard'));
  anchors.creekFront.forEach((v) => push([v.x, Q + 0.9, v.z + 1.6], 0.8, 'creek'));
  // 埠头与仓前各两盏，夜里卸盐要用
  anchors.wharves.forEach((w) => { push([w.x + w.face * 1.4, Q + 1.5, w.z - 2.2], 1.0, 'wharf'); push([w.x + w.face * 1.4, Q + 1.5, w.z + 2.2], 1.0, 'wharf'); });

  const skin = new THREE.InstancedMesh(lanternGeo(1), M.silk, spots.length);
  const core = new THREE.InstancedMesh(lanternGeo(0.82), glow('#ffb46b', 1.5), spots.length);
  const aura = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({
    map: T.softGlow('255,178,96', 0.18), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }), spots.length);
  aura.material.toneMapped = false;
  core.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3).fill(1), 3);
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  spots.forEach((sp, i) => {
    o.position.copy(sp.pos);
    o.rotation.set(0, rand() * 6.28, rr(-0.06, 0.06));
    o.scale.setScalar(sp.s);
    o.updateMatrix();
    skin.setMatrixAt(i, o.matrix);
    o.scale.setScalar(sp.s * 0.98);
    o.updateMatrix();
    core.setMatrixAt(i, o.matrix);
    o.scale.setScalar(sp.s * 1.5);
    o.updateMatrix();
    aura.setMatrixAt(i, o.matrix);
    sp.base = o.matrix.clone();
    sp.col = columns.add(sp.pos.clone(), PAL.lanternWarm, sp.s * 0.9, 7 + sp.s * 4, sp.kind === 'gate' ? 0.9 : 0.62);
  });
  [skin, core, aura].forEach((m) => { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; scene.add(m); });
  core.renderOrder = 4;
  aura.renderOrder = 4;
  let density = 1;
  const idx = spots.map((_, i) => i);
  return {
    count: spots.length,
    /** 密度只改可见数量与光柱开关，不动颜色——亮暗由 update 的气抖负责 */
    setDensity(v) {
      density = Math.max(0, Math.min(1.6, v));
      const n = Math.round(spots.length * Math.min(1, density));
      for (let i = 0; i < spots.length; i++) {
        const on = i < n;
        const mx = on ? spots[i].base : ZERO;
        skin.setMatrixAt(i, mx);
        core.setMatrixAt(i, mx);
        aura.setMatrixAt(i, mx);
        columns.setOn(spots[i].col, on);
      }
      [skin, core, aura].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    },
    update(t) {
      const k = Math.min(1, density);
      for (let i = 0; i < idx.length; i++) {
        const f = 0.78 + 0.22 * Math.sin(t * 2.1 + i * 1.31) + 0.06 * Math.sin(t * 6.4 + i);
        col.setRGB(1.5 * f * k, 1.02 * f * k, 0.6 * f * k);
        core.setColorAt(i, col);
      }
      core.instanceColor.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 灯串 */

/** 两界之间的灯串：一根吊链上挂盏数，整串按辉光一起亮暗 */
function lanternStrings(scene, anchors) {
  const pairs = [
    [[SITE.granary.x - 3, Q + 4.2, SITE.granary.z + 3.4], [SITE.courtGate.x - 0.6, Q + 5.2, SITE.courtGate.z + 3.0]],
    [[SITE.limuRow.x0 + 2, Q + 4.0, SITE.limuRow.z - 2.6], [SITE.limuRow.x1 - 2, Q + 4.4, SITE.limuRow.z - 2.8]],
    [[HW + 2.2, Q + 4.6, -30], [HW + 12, Q + 3.6, -22]],
    [[HW + 2.2, Q + 4.6, 30], [HW + 14, Q + 3.6, 40]],
  ];
  const ropes = [];
  const lampGeo = lanternGeo(0.5);
  const mats = [];
  const lampPos = [];
  for (const [a, b] of pairs) {
    const pts = stringPath(new THREE.Vector3(...a), new THREE.Vector3(...b), 1.0, 26);
    const curve = new THREE.CatmullRomCurve3(pts);
    ropes.push(new THREE.TubeGeometry(curve, 26, 0.035, 4, false).toNonIndexed());
    const n = Math.max(4, Math.round(curve.getLength() / 3.4));
    for (let i = 1; i < n; i++) lampPos.push(curve.getPoint(i / n).add(new THREE.Vector3(0, -0.34, 0)));
  }
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x1a1c24 });
  const rope = new THREE.Mesh(mergeGeometries(ropes), ropeMat);
  scene.add(rope);
  const uni = { uTime: { value: 0 }, uOn: { value: 1 } };
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96 });
  lampMat.toneMapped = false;
  lampMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.uniforms.uOn = uni.uOn;
    sh.vertexShader = `uniform float uTime;\n` + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float ph = instanceMatrix[3][0]*0.7 + instanceMatrix[3][2]*0.5;
      transformed.y += sin(uTime*1.6 + ph)*0.03;`);
    sh.fragmentShader = `uniform float uTime; uniform float uOn;\n` + sh.fragmentShader.replace('#include <dithering_fragment>', `
      float ph = gl_FragCoord.x*0.013 + gl_FragCoord.y*0.011;
      float fl = 0.72 + 0.28*sin(uTime*2.3 + ph*3.1);
      gl_FragColor.rgb *= uOn * fl * 1.7;
      gl_FragColor.a *= 0.35 + 0.65*uOn;`);
  };
  lampMat.customProgramCacheKey = () => 'xixi-string-lamp';
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPos.length);
  const o = new THREE.Object3D();
  lampPos.forEach((p, i) => {
    o.position.copy(p);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(1);
    o.updateMatrix();
    lamps.setMatrixAt(i, o.matrix);
  });
  lamps.instanceMatrix.needsUpdate = true;
  lamps.frustumCulled = false;
  lamps.renderOrder = 4;
  scene.add(lamps);
  mats.push(lampMat);
  return { uni, set(v) { uni.uOn.value = v; } };
}

/* ------------------------------------------------------------------ 河灯 */

/** 漂在河上的小河灯：随波上下，顺流而下，到下游收掉再回到上游 */
function driftLamps(scene) {
  const N = 90;
  const geo = new THREE.SphereGeometry(0.16, 8, 6);
  geo.scale(1, 0.7, 1);
  const mat = glow('#ff9d55', 1.7);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({
    map: T.softGlow('255,160,90', 0.14), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }), N);
  halo.material.toneMapped = false;
  const items = [];
  for (let i = 0; i < N; i++) {
    items.push({
      x: rr(-HW + 1.4, HW - 1.4), z: -HALF + rand() * CANAL.length,
      sp: rr(0.6, 1.5), ph: rand() * 6.28, s: rr(0.7, 1.15),
    });
  }
  const o = new THREE.Object3D();
  mesh.frustumCulled = halo.frustumCulled = false;
  mesh.renderOrder = halo.renderOrder = 4;
  scene.add(mesh, halo);
  let density = 1;
  return {
    setDensity(v) { density = Math.max(0, Math.min(1, v)); },
    update(t, dt) {
      const n = Math.round(N * density);
      for (let i = 0; i < N; i++) {
        const it = items[i];
        if (i >= n) {
          o.position.set(0, -50, 0); o.scale.setScalar(0.0001); o.rotation.set(0, 0, 0);
          o.updateMatrix();
          mesh.setMatrixAt(i, o.matrix); halo.setMatrixAt(i, o.matrix);
          continue;
        }
        it.z += dt * it.sp * 1.5;
        if (it.z > HALF) it.z = -HALF;
        const y = 0.06 + Math.sin(t * 1.5 + it.ph) * 0.07 + Math.sin(t * 0.7 + it.x) * 0.05;
        o.position.set(it.x + Math.sin(t * 0.6 + it.ph) * 0.5, y, it.z);
        o.rotation.set(-Math.PI / 2, 0, 0);
        o.scale.setScalar(it.s);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        o.scale.setScalar(it.s * (1.6 + 0.25 * Math.sin(t * 2.4 + it.ph)));
        o.updateMatrix();
        halo.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 盐船 */

function hullGeo() {
  const profile = (z) => {
    const t = THREE.MathUtils.clamp((z + 6.2) / 12.4, 0, 1);
    const beam = 1.42 * Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0.02, 0.98)), 0.62);
    const sheer = 0.9 + 0.34 * Math.sin(Math.PI * t);
    return [
      [-beam, -0.5], [-beam * 0.94, 0.16], [-beam * 0.7, sheer * 0.62],
      [0, sheer], [beam * 0.7, sheer * 0.62], [beam * 0.94, 0.16], [beam, -0.5],
    ];
  };
  const stations = [];
  for (let i = 0; i <= 18; i++) stations.push(-6.2 + (12.4 * i) / 18);
  return loftHull(profile, stations, true);
}

function buildBoat(scene, columns, seedPos, { sail = false, salt = true } = {}) {
  const grp = new THREE.Group();
  grp.position.set(seedPos[0], 0, seedPos[1]);
  const hull = new THREE.Mesh(hullGeo(), M.wupeng);
  hull.castShadow = true;
  grp.add(hull);
  // 半圆篷：竹篾棚，中舱一段
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 3.4, 12, 1, false, 0, Math.PI), M.wupeng);
  hood.rotation.z = Math.PI / 2;
  hood.rotation.y = Math.PI / 2;
  hood.position.set(0, 0.55, -0.6);
  grp.add(hood);
  const deck = mesh([box(1.5, 0.1, 2.6, 0, 0.72, 3.3), box(1.5, 0.1, 1.8, 0, 0.72, -4.0)], M.woodDark);
  grp.add(deck);
  // 船尾的橹与梢
  const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 6), M.beam);
  oar.rotation.set(0.2, 0, 1.1);
  oar.position.set(0.7, 0.7, -4.4);
  grp.add(oar);
  // 盐包
  const sacks = [];
  if (salt) {
    for (let i = 0; i < 4; i++) {
      sacks.push(box(0.72, 0.42, 0.94, rr(-0.42, 0.42), 0.94 + (i > 1 ? 0.4 : 0), 2.2 + (i % 2) * 0.9 + rr(-0.2, 0.2)));
    }
    grp.add(mesh(sacks, M.salt));
  }
  // 桅与斜帆
  let sailMesh = null;
  if (sail) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 7), M.beam);
    mast.position.set(0, 2.2, 1.6);
    mast.rotation.x = -0.1;
    grp.add(mast);
    sailMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.0, 4, 4), M.thatch);
    sailMesh.position.set(0, 2.6, 1.35);
    sailMesh.rotation.x = -0.12;
    grp.add(sailMesh);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 6), M.beam);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, 4.05, 1.3);
    grp.add(yard);
  }
  // 船头灯与船尾渔火：一明一暗，同频
  const bowMat = glow('#ffcf8a', 2.1);
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 9, 7), bowMat);
  bow.position.set(0, 1.05, 5.6);
  grp.add(bow);
  const stern = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), glow('#ff8b45', 1.6));
  stern.position.set(0, 0.95, -4.6);
  grp.add(stern);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,190,120', 0.16), transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.material.toneMapped = false;
  halo.scale.setScalar(2.2);
  halo.position.copy(bow.position);
  grp.add(halo);
  const lampLight = new THREE.PointLight(0xffb066, 12, 13, 2);
  lampLight.position.set(0, 1.3, 2.2);
  grp.add(lampLight);
  const column = columns.add(new THREE.Vector3(seedPos[0], 0, seedPos[1]), PAL.fisherFire, 0.9, 8, 0.85);
  registerOccluder(grp, 3.0, new THREE.Vector3(seedPos[0], 1, seedPos[1]));
  scene.add(grp);
  return { grp, bow, stern, halo, column, sailMesh, lampLight, mooredAt: seedPos };
}

/**
 * 船队：泊在埠头的三条 + 河上夜航的四条。
 * 夜航船按塔灯的亮度决定出船数量，靠塔灯定港，船头灯与龛灯同频应答。
 */
function fleet(scene, columns, tower) {
  const moored = [
    buildBoat(scene, columns, [CANAL.halfWidth + 3.4, -8.2], { sail: false }),
    buildBoat(scene, columns, [CANAL.halfWidth + 3.8, -18.0], { sail: false }),
    buildBoat(scene, columns, [-CANAL.halfWidth - 3.6, -2.5], { sail: false }),
  ];
  moored.forEach((b, i) => { b.grp.rotation.y = i === 2 ? Math.PI * 0.92 : Math.PI * 0.06; });
  const sailing = [];
  for (let i = 0; i < 4; i++) {
    const b = buildBoat(scene, columns, [rr(-4, 4), -HALF + 30 + i * 62], { sail: true });
    b.state = 'sail';
    b.phase = rand() * 6.28;
    b.dir = i % 2 === 0 ? 1 : -1;
    b.lane = (i % 2 === 0 ? -1 : 1) * rr(2.5, 6.5);
    b.entered = false;
    sailing.push(b);
  }
  const all = [...moored, ...sailing];
  const sway = (b, t, k) => {
    b.grp.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.022 * k;
    b.grp.rotation.x = Math.sin(t * 0.7 + b.phase * 1.3) * 0.014 * k;
    b.grp.position.y = Math.sin(t * 1.1 + b.phase) * 0.07 * k;
  };
  let flare = 0;
  return {
    boats: all,
    moored: (i) => moored[i]?.grp || moored[0].grp,
    /** 钟声压火：一响之下所有船头灯矮一口 */
    flare(k = 1) { flare = Math.min(1.6, flare + k); },
    update(t, dt, speed, glowLevel, voyage = true) {
      // 该出几条船：全塔点亮时四条，灭灯或关掉夜航时一条不出
      const want = voyage ? Math.max(0, Math.round((0.25 + glowLevel * 0.95) * sailing.length)) : 0;
      flare = Math.max(0, flare - dt * 1.6);
      const dim = 1 - Math.min(0.72, flare * 0.5);
      for (const b of moored) {
        sway(b, t, 0.8);
        b.bow.material.color.setRGB(2.1 * dim, 1.45 * dim, 0.72 * dim);
        b.stern.material.color.setRGB(1.6 * dim, 0.86 * dim, 0.36 * dim);
        b.halo.material.opacity = 0.8 * dim;
        b.lampLight.intensity = 12 * dim;
      }
      for (let i = 0; i < sailing.length; i++) {
        const b = sailing[i];
        const on = i < want;
        b.grp.visible = on;
        if (!on) continue;
        if (b.state === 'sail') {
          b.grp.position.z += b.dir * dt * 2.6 * speed;
          b.grp.position.x += (b.lane - b.grp.position.x) * dt * 0.5;
          if (b.grp.position.z > HALF - 14 || b.grp.position.z < -HALF + 14) { b.dir *= -1; b.state = 'port'; }
          b.grp.rotation.y = b.dir > 0 ? 0.02 : Math.PI - 0.02;
        } else if (b.state === 'port') {
          // 循塔灯转向：船头朝着塔的方位
          const tx = tower.group.position.x - b.grp.position.x;
          const tz = tower.group.position.z - b.grp.position.z;
          const yaw = Math.atan2(tx, tz);
          b.grp.rotation.y += (yaw - b.grp.rotation.y) * dt * 0.8;
          b.grp.position.x += Math.sin(yaw) * dt * 2.0 * speed;
          b.grp.position.z += Math.cos(yaw) * dt * 2.0 * speed;
          if (Math.hypot(tx, tz) < 26) b.state = 'berth';
        } else {
          b.grp.position.x += (SITE.eastWharf.x + 3.6 - b.grp.position.x) * dt * 0.6;
          b.grp.position.z += ((i % 2 ? -26 : -21) - b.grp.position.z) * dt * 0.6;
          b.grp.rotation.y += (Math.PI * 0.06 - b.grp.rotation.y) * dt * 0.7;
        }
        sway(b, t, 1);
        // 应答：塔灯亮到几层，船头灯就在几拍上跳
        const beat = 0.55 + 0.45 * Math.sin(t * (1.6 + glowLevel * 2.2) + i * 1.1);
        const k = dim * (0.5 + 0.5 * glowLevel) * (0.7 + 0.3 * beat);
        b.bow.material.color.setRGB(2.1 * k, 1.45 * k, 0.72 * k);
        b.halo.material.opacity = 0.35 + 0.6 * k;
        b.halo.scale.setScalar(1.6 + 2.2 * k);
        b.lampLight.intensity = 16 * k;
        columns.setPos(b.column, b.grp.position);
      }
    },
    flushColumns() { columns.flush(); },
  };
}

/* ------------------------------------------------------------------ 人群 */

/**
 * 香客与船工：一部分绕塔（顺时针），一部分在街上与埠头走动。
 * 位置按实例矩阵写回，靠近镜头的几个会缩掉免得糊住画面。
 */
function crowd(scene, anchors, towerPos) {
  const N = 240;
  const geo = figureGeo(1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f3c, roughness: 0.92, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const o = new THREE.Object3D();
  const people = [];
  const street = anchors.street;
  for (let i = 0; i < N; i++) {
    const kind = i < 54 ? 'circum' : (i < 120 ? 'street' : (i < 180 ? 'wharf' : 'yard'));
    const p = { kind, ph: rand() * 6.28, sp: rr(0.5, 1.25), s: rr(0.9, 1.1) };
    if (kind === 'circum') {
      p.theta = rand() * Math.PI * 2;
      p.r = rr(5.6, 8.6);
      p.dir = 1;                    // theta 递减即顺时针（俯视）
      p.y = Q + 0.05;
    } else if (kind === 'street') {
      const a = street[(rand() * street.length) | 0];
      p.ax = a.x; p.az = a.z;
      p.span = rr(4, 12);
      p.alongZ = Math.abs(a.x) > 12 && a.x > 0;   // 东岸沿河走，犁木街沿 X 走
      p.y = Q + 0.05;
    } else if (kind === 'wharf') {
      const w = anchors.wharves[(rand() * anchors.wharves.length) | 0];
      p.ax = w.x + w.face * 2.2; p.az = w.z + rr(-2.4, 2.4);
      p.span = rr(2.4, 5.0);
      p.alongZ = Math.abs(w.face) === 1 && w.z > 0;
      p.y = Q - rr(0.1, 0.9);
    } else {
      p.ax = towerPos.x + rr(-8, 8);
      p.az = towerPos.z + rr(-8, 8);
      p.span = rr(2.5, 6.5);
      p.alongZ = rand() > 0.5;
      p.y = Q + 0.05;
    }
    people.push(p);
  }
  return {
    update(t, dt, target, camPos) {
      const n = Math.max(0, Math.min(N, Math.round(target)));
      for (let i = 0; i < N; i++) {
        const p = people[i];
        if (i >= n) { o.scale.setScalar(0.0001); o.position.set(0, -40, 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); continue; }
        if (p.kind === 'circum') {
          p.theta -= dt * p.sp * 0.16;
          o.position.set(towerPos.x + Math.sin(p.theta) * p.r, p.y, towerPos.z + Math.cos(p.theta) * p.r);
          o.rotation.set(0, p.theta - Math.PI / 2, 0);
        } else {
          const w = Math.sin(t * p.sp * 0.55 + p.ph) * p.span;
          o.position.set(p.alongZ ? p.ax : p.ax + w, p.y + Math.abs(Math.sin(t * p.sp * 3.2 + p.ph)) * 0.03, p.alongZ ? p.az + w : p.az);
          o.rotation.set(0, p.alongZ ? (Math.cos(t * p.sp * 0.55 + p.ph) > 0 ? 0 : Math.PI) : (Math.cos(t * p.sp * 0.55 + p.ph) > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        }
        const near = camPos && Math.hypot(o.position.x - camPos.x, o.position.z - camPos.z) < 2.2 && camPos.y < 9;
        o.scale.setScalar(near ? 0.0001 : p.s);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 组装 */

export function buildProps(scene, columns, anchors, tower) {
  const field = lanternField(scene, columns, anchors);
  const strings = lanternStrings(scene, anchors);
  const drift = driftLamps(scene);
  const fleetObj = fleet(scene, columns, tower);
  const crowdObj = crowd(scene, anchors, new THREE.Vector3(SITE.pagoda.x, 0, SITE.pagoda.z));
  field.setDensity(1);
  fleetObj.flushColumns();
  return { field, strings, drift, fleet: fleetObj, crowd: crowdObj };
}
