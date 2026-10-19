import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, glow, rand, rr, box } from './kit.js';
import * as T from './textures.js';
import { terrainHeight, RIDGE_LAMPS, PATHS, LAKE, SITES, CABLE } from './data.js';

/**
 * 灯。这座山里今天确实有电灯（寺观、亭、堤、索道），但"夜游云龙山"没有可考的
 * 常设节目，所以这一整幅夜景是画出来的：发光面一律 MeshBasicMaterial 喂 bloom，
 * 真灯（PointLight）全场景控制在十几盏以内。
 */

export function buildProps(scene, anchors, built, hill, terrain) {
  const group = new THREE.Group();
  group.name = 'props';
  const haloSpots = [];
  const waterLamps = [];

  /* ------------------------------------------------------------ 檐下灯笼 */
  const paper = [], caps = [], cores = [], strings = [];
  for (const e of anchors.eaves) {
    const drop = rr(0.42, 0.72);
    const r = rr(0.22, 0.31);
    const y = e.y - drop;
    strings.push(new THREE.CylinderGeometry(0.018, 0.018, drop, 4).translate(e.x, e.y - drop / 2, e.z));
    paper.push(new THREE.SphereGeometry(0.5, 12, 9).scale(r * 1.7, r * 2.5, r * 1.7).translate(e.x, y - r * 0.6, e.z));
    caps.push(box(r * 0.62, 0.09, r * 0.62, e.x, y - 0.02, e.z));
    caps.push(box(r * 0.5, 0.08, r * 0.5, e.x, y - r * 1.25 - 0.02, e.z));
    cores.push(new THREE.SphereGeometry(r * 0.48, 8, 6).translate(e.x, y - r * 0.6, e.z));
    haloSpots.push([e.x, y - r * 0.6, e.z]);
  }
  group.add(mesh(mergeGeometries(strings), M.dark));
  const lanternPaper = mesh(mergeGeometries(paper), M.lantern);
  lanternPaper.name = 'lantern-paper';
  group.add(lanternPaper);
  group.add(mesh(mergeGeometries(caps), M.timberDark));
  const lanternCores = mesh(mergeGeometries(cores), glow('#ffd8a4', 1.3));
  lanternCores.name = 'lantern-core';
  group.add(lanternCores);

  /* ------------------------------------------------------ 九节山脊灯 */
  // 自北而南一段一段亮：这是"放鹤"那串动作里的第二个动作
  const ridgeGeo = new THREE.PlaneGeometry(1.5, 1.15);
  const ridgeMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,206,150', 0.06), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  ridgeMat.toneMapped = false;
  const ridge = new THREE.InstancedMesh(ridgeGeo, ridgeMat, RIDGE_LAMPS.length * 3);
  ridge.name = 'ridge-lamps';
  ridge.renderOrder = 5;
  ridge.frustumCulled = false;
  const d = new THREE.Object3D();
  const ridgeItems = [];
  RIDGE_LAMPS.forEach((L, i) => {
    for (let k = 0; k < 3; k++) {
      const x = L.x + rr(-7, 7);
      const z = L.z + rr(-16, 16);
      const y = terrainHeight(x, z) + rr(1.6, 4.2);
      ridgeItems.push({ x, y, z, section: i });
    }
  });
  ridgeItems.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(0, rand() * 3.2, 0);
    d.scale.set(0.8, 0.8, 1);
    d.updateMatrix();
    ridge.setMatrixAt(i, d.matrix);
  });
  ridge.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ridgeItems.length * 3).fill(0), 3);
  ridge.count = ridgeItems.length;
  ridge.instanceMatrix.needsUpdate = true;
  group.add(ridge);
  for (const it of ridgeItems) haloSpots.push([it.x, it.y, it.z]);

  /* ------------------------------------------------------------ 堤上灯 */
  const posts = [], tips = [];
  for (const [x, z] of terrain.causewayLamps) {
    const y = 1.72;
    posts.push(new THREE.CylinderGeometry(0.06, 0.075, 2.3, 6).translate(x, y + 1.15, z));
    posts.push(box(0.34, 0.3, 0.34, x, y + 2.3, z));
    tips.push(new THREE.SphereGeometry(0.17, 8, 6).translate(x, y + 2.44, z));
    haloSpots.push([x, y + 2.44, z]);
    waterLamps.push([x, z]);
  }
  group.add(mesh(mergeGeometries(posts), M.steel));
  const tipMesh = mesh(mergeGeometries(tips), glow('#ffcf96', 1.25));
  tipMesh.name = 'causeway-lamp-tips';
  group.add(tipMesh);

  /* ------------------------------------------------------------ 山道石灯 */
  const stone = [], stoneGlow = [];
  const walkPts = sampleAlong(PATHS.west, 9);
  for (const [x, z] of walkPts) {
    const y = terrainHeight(x, z);
    const h = rr(0.9, 1.25);
    stone.push(box(0.46, 0.16, 0.46, x, y, z));
    stone.push(new THREE.CylinderGeometry(0.1, 0.12, h, 7).translate(x, y + h / 2 + 0.16, z));
    stone.push(box(0.5, 0.38, 0.5, x, y + h + 0.16, z));
    stone.push(box(0.66, 0.1, 0.66, x, y + h + 0.54, z));
    stoneGlow.push(box(0.3, 0.24, 0.3, x, y + h + 0.32, z));
    haloSpots.push([x, y + h + 0.4, z]);
  }
  // 书院前与寺前也各摆几盏
  for (const [sx, sz, n] of [[SITES.academy.x, SITES.academy.z + 9, 4], [SITES.temple.x, SITES.temple.z + 20, 4], [SITES.pavilion.x, SITES.pavilion.z + 8, 3]]) {
    for (let i = 0; i < n; i++) {
      const x = sx + (i - (n - 1) / 2) * 5.2 + rr(-0.5, 0.5);
      const z = sz + rr(-1, 1);
      const y = terrainHeight(x, z);
      if (y < 1) continue;
      const h = rr(0.95, 1.2);
      stone.push(box(0.46, 0.16, 0.46, x, y, z));
      stone.push(new THREE.CylinderGeometry(0.1, 0.12, h, 7).translate(x, y + h / 2 + 0.16, z));
      stone.push(box(0.5, 0.38, 0.5, x, y + h + 0.16, z));
      stone.push(box(0.66, 0.1, 0.66, x, y + h + 0.54, z));
      stoneGlow.push(box(0.3, 0.24, 0.3, x, y + h + 0.32, z));
      haloSpots.push([x, y + h + 0.4, z]);
    }
  }
  group.add(mesh(mergeGeometries(stone), M.stone));
  const stoneLampGlow = mesh(mergeGeometries(stoneGlow), glow('#ffcb92', 1.05));
  stoneLampGlow.name = 'stone-lamp-glow';
  group.add(stoneLampGlow);

  /* -------------------------------------------------------- 观景台灯带 */
  const TR = built.terrace;
  const rim = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    rim.push(box(0.5, 0.16, 0.16, TR.x + Math.cos(a) * 9.05, TR.deck + 1.26, TR.z + Math.sin(a) * 9.05));
    haloSpots.push([TR.x + Math.cos(a) * 9.05, TR.deck + 1.4, TR.z + Math.sin(a) * 9.05]);
  }
  const rimMesh = mesh(mergeGeometries(rim), glow('#ffdcab', 1.35));
  rimMesh.name = 'terrace-rim';
  group.add(rimMesh);

  /* ---------------------------------------------------------- 湖上几盏 */
  const cups = [], cupCores = [];
  for (let i = 0; i < 8; i++) {
    const x = rr(-1080, -420);
    const z = LAKE.causeway.z + rr(-260, 260);
    cups.push(new THREE.CylinderGeometry(0.34, 0.24, 0.12, 9).translate(x, 0.2, z));
    cupCores.push(new THREE.SphereGeometry(0.13, 8, 6).translate(x, 0.34, z));
    haloSpots.push([x, 0.36, z]);
    waterLamps.push([x, z]);
  }
  group.add(mesh(mergeGeometries(cups), M.dark));
  const cupGlow = mesh(mergeGeometries(cupCores), glow('#ffcf8a', 1.15));
  cupGlow.name = 'lake-cups';
  group.add(cupGlow);

  /* ------------------------------------------------------------ 光晕点 */
  group.add(haloPoints(haloSpots, '255,198,132'));

  /* -------------------------------------------------------- 十来盏真灯 */
  // r160 的衰减是距离平方，所以这个数得给大
  const N0 = hill.nicheAnchors[0] || [SITES.niches.x, SITES.niches.y + 6, SITES.niches.z];
  const BM = built.buddhaMid;
  const lampLights = [
    { p: [built.hallCenter[0], built.hall.floorY + 4.6, built.hallCenter[1] + 3], c: 0xffb06a, i: 200, d: 22 },   // 殿内
    { p: [BM[0] + 3.6, BM[1] - 4.4, BM[2] + 3.4], c: 0xffb06a, i: 420, d: 24 },   // 佛足前一盏，贴着往上扫
    { p: [BM[0] + 7.5, BM[1] + 0.8, BM[2] + 0.5], c: 0xffc48a, i: 260, d: 22 },    // 胸口那盏
    { p: [SITES.temple.x + 2, built.gate.topY - 1.2, SITES.temple.z + 21], c: 0xffbb7d, i: 140, d: 16 },  // 山门
    { p: [SITES.pavilion.x, built.pavilion.eaveY - 0.7, SITES.pavilion.z], c: 0xffc98f, i: 70, d: 13 },   // 放鹤亭
    { p: [SITES.callpav.x, built.callpav.eaveY - 0.9, SITES.callpav.z], c: 0xffcf9a, i: 80, d: 11 },      // 招鹤亭
    { p: [SITES.spring.x, SITES.spring.y + 2.2, SITES.spring.z], c: 0xdfefff, i: 70, d: 11 },             // 泉上一盏冷光
    { p: [SITES.academy.x, built.academy.courts[0].floorY + 3.2, SITES.academy.z + 4], c: 0xffc48a, i: 200, d: 19 },
    { p: [SITES.academy.x, built.academy.courts[1].floorY + 3.0, SITES.academy.z - 12], c: 0xffbb7d, i: 140, d: 16 },
    { p: [SITES.dashiyan.x, built.dashiHall.floorY + 3.0, SITES.dashiyan.z + 6], c: 0xffc48a, i: 160, d: 16 },
    { p: [TR.x, TR.deck + 3.0, TR.z], c: 0xffe0b4, i: 150, d: 18 },                                       // 观景台
    { p: [N0[0], N0[1] + 3, N0[2]], c: 0xffd9a8, i: 220, d: 24 },                                         // 龛前扫光
    { p: [(CABLE.west.x + CABLE.east.x) / 2 - 120, built.cable.topY - 6, CABLE.west.z], c: 0xffc48a, i: 110, d: 18 },
    { p: [LAKE.causeway.xTo - 6, 3.4, LAKE.causeway.z + 15], c: 0xffc98f, i: 110, d: 13 },               // 堤口亭
    { p: [SITES.bed.x + 2.4, SITES.bed.y + 0.7, SITES.bed.z + 2.6], c: 0xffd9a8, i: 70, d: 9 },          // 石床前那盏贴地的灯
  ];
  const lights = [];
  for (const l of lampLights) {
    const pl = new THREE.PointLight(l.c, l.i, l.d, 2);
    pl.position.set(l.p[0], l.p[1], l.p[2]);
    pl.userData.base = l.i;
    scene.add(pl);
    lights.push(pl);
  }

  scene.add(group);

  let lampBright = 1;
  const sectionState = new Float32Array(RIDGE_LAMPS.length).fill(1);
  const writeRidge = () => {
    const col = new THREE.Color();
    ridgeItems.forEach((it, i) => {
      const on = sectionState[it.section];
      col.setRGB(1.0 * on, 0.6 * on, 0.3 * on);
      ridge.setColorAt(i, col);
    });
    if (ridge.instanceColor) ridge.instanceColor.needsUpdate = true;
  };
  writeRidge();

  return {
    group,
    waterLamps,
    lights,
    /** 九节次第：v 是 0..1 的进度，落到第几节就亮第几节 */
    setRidge(v) {
      const lit = Math.round(v * RIDGE_LAMPS.length);
      for (let i = 0; i < RIDGE_LAMPS.length; i++) sectionState[i] = i < lit ? 1 : 0.04;
      writeRidge();
    },
    setLamp(v) {
      M.lantern.emissiveIntensity = 0.55 * v;
      lanternCores.material = glow('#ffd8a4', 0.4 + 0.95 * v);
      stoneLampGlow.material = glow('#ffcb92', 0.25 + 0.8 * v);
      tipMesh.material = glow('#ffcf96', 0.3 + 0.95 * v);
      cupGlow.material = glow('#ffcf8a', 0.3 + 0.85 * v);
      rimMesh.material = glow('#ffdcab', 0.35 + 1.0 * v);
      ridgeMat.opacity = 0.55 + 0.4 * v;
      lampBright = v;
    },
    update(t, lantern = 1) {
      const flick = 0.93 + 0.07 * Math.sin(t * 5.9) * Math.sin(t * 1.87 + 0.5);
      const k = flick * lantern;
      for (const pl of lights) pl.intensity = (pl.userData.base ?? pl.intensity) * k;
      const hp = group.getObjectByName('lantern-halos');
      if (hp) hp.material.uniforms.uBright.value = lampBright * flick;
    },
  };
}

/* ------------------------------------------------------------------ 小件 */

/** 沿折线等距取样 */
function sampleAlong(points, every) {
  const out = [];
  let acc = every * 0.5;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / every));
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      acc += len / n;
      if (acc < every) continue;
      acc = 0;
      out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  }
  return out;
}

/** 所有火光的晕：一个 draw call 的点云，喂给 bloom */
function haloPoints(list, hue) {
  const n = list.length;
  const pos = new Float32Array(n * 3);
  list.forEach((p, i) => pos.set([p[0], p[1], p[2]], i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: T.softGlow(hue, 0.1) } },
    vertexShader: `uniform float uBright; varying float vB;
      void main(){ vB = uBright; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(260.0 / max(8.0, -mv.z), 4.0, 54.0) * (0.75 + 0.25*vB);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vB;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.78,0.5), t.a*0.22*vB); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.name = 'lantern-halos';
  p.renderOrder = 6;
  return p;
}
