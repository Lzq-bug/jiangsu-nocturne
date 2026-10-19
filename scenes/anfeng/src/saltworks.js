import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, PAL, glow, rand, rr, boxGeo, mesh, registerOccluder } from './kit.js';
import { WORKS, RIVER, DIKE, STATIONS } from './data.js';
import * as T from './textures.js';

const DECK = RIVER.deckY;

/**
 * 镇东的盐业地带：煎盐灶房一线、卤池、柴草堆、竹篱，再往东是草荡。
 * 两淮行淋卤煎盐（吴嘉纪《煎盐绝句》即安丰场灶户所写），故只作灶与荡，
 * 不作后世那种晒盐滩；灶数、排布与卤池尺度皆为氛围添加。
 */

/* ------------------------------------------------------------------ 灶房 */

function ovenShed({ z = 0, x = 36, w = 8.4, d = 5.2 }) {
  const grp = new THREE.Group();

  // 低草房：土墙 + 茅顶，檐口压得很低
  const walls = [];
  walls.push(boxGeo(w, 2.3, 0.45, 0, 1.15, -d / 2));
  walls.push(boxGeo(w, 2.3, 0.45, 0, 1.15, d / 2));
  walls.push(boxGeo(0.45, 2.3, d, -w / 2, 1.15, 0));
  walls.push(boxGeo(0.45, 2.3, d, w / 2, 1.15, 0));
  const body = mesh(walls, M.thatch);
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);

  const roof = new THREE.Mesh(
    (function () {
      const g = new THREE.BoxGeometry(w + 1.4, 0.5, d + 1.2);
      g.rotateZ(0.1);
      return g;
    })(),
    M.thatch,
  );
  roof.position.set(0, 2.55, 0);
  roof.castShadow = true;
  grp.add(roof);
  // 茅顶上一层束草的横绳
  const ropes = [];
  for (let i = 0; i < 4; i++) ropes.push(boxGeo(w + 1.5, 0.07, 0.1, 0, 2.72 - i * 0.12, -d / 2 + 0.5 + i * ((d + 0.6) / 3.4)));
  grp.add(mesh(ropes, M.beam));

  // 灶口：一面石砌灶台，膛里是火
  const stove = [];
  stove.push(boxGeo(w * 0.86, 1.15, 0.5, 0, 0.58, d / 2 + 0.5));
  stove.push(boxGeo(w * 0.9, 0.24, 0.9, 0, 1.26, d / 2 + 0.45));
  grp.add(mesh(stove, M.stoneDark));
  // 一口煎盐锅（浅盆）
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.95, 0.26, 14), M.ink);
  pan.position.set(0, 1.42, d / 2 + 0.45);
  grp.add(pan);

  // 膛火：一块贴面的火焰 + 一圈光晕
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.6, 0.8),
    new THREE.MeshBasicMaterial({ map: T.flameSprite(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
  );
  mouth.position.set(0, 0.62, d / 2 + 0.78);
  grp.add(mouth);
  const core = new THREE.Mesh(boxGeo(w * 0.5, 0.34, 0.3, 0, 0.34, d / 2 + 0.62), glow(PAL.ember, 2.4));
  grp.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,150,64', 0.14), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.scale.set(4.2, 4.2, 1);
  halo.position.set(0, 0.8, d / 2 + 1.1);
  grp.add(halo);

  grp.position.set(x, DECK, z);
  return { group: grp, mouth, halo, core, mouthWorld: new THREE.Vector3(x, DECK + 0.7, z + d / 2 + 0.9) };
}

/* ------------------------------------------------------------------ 卤池与柴堆 */

function brinePit({ x = 44, z = -14, w = 6, d = 4 }) {
  const grp = new THREE.Group();
  const kerb = [];
  kerb.push(boxGeo(w, 0.42, 0.4, 0, 0.21, -d / 2));
  kerb.push(boxGeo(w, 0.42, 0.4, 0, 0.21, d / 2));
  kerb.push(boxGeo(0.4, 0.42, d, -w / 2, 0.21, 0));
  kerb.push(boxGeo(0.4, 0.42, d, w / 2, 0.21, 0));
  grp.add(mesh(kerb, M.stone));
  const liquid = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), M.brine);
  liquid.rotation.x = -Math.PI / 2;
  liquid.position.y = 0.3;
  grp.add(liquid);
  // 卤水面上反一面天光，是这片地带唯一的冷色
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 1.2, d - 1.6),
    new THREE.MeshBasicMaterial({ color: 0x223744, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.y = 0.32;
  grp.add(sheen);
  grp.position.set(x, DECK, z);
  return grp;
}

function woodpile({ x = 40, z = -50, len = 4.2 }) {
  const parts = [];
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const n = Math.round(len / 0.42) - r;
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(0.16, 0.16, len - r * 0.4, 5);
      g.rotateZ(Math.PI / 2);
      g.translate(-len / 2 + (len - r * 0.4) / 2, 0.18 + r * 0.34, i * 0.42 - (n * 0.42) / 2);
      parts.push(g);
    }
  }
  const m = mesh(parts, M.woodDark);
  m.position.set(x, DECK, z);
  m.rotation.y = rr(-0.4, 0.4);
  m.castShadow = true;
  registerOccluder(m, 3.0, new THREE.Vector3(x, DECK + 0.6, z));
  return m;
}

function bambooFence({ x0 = 30, x1 = 58, z = -4, h = 1.1 }) {
  const parts = [];
  for (let x = x0; x <= x1; x += 0.52) {
    parts.push(boxGeo(0.07, h, 0.07, x, h / 2, z + rr(-0.06, 0.06)));
  }
  parts.push(boxGeo(x1 - x0, 0.07, 0.07, (x0 + x1) / 2, h * 0.78, z));
  parts.push(boxGeo(x1 - x0, 0.07, 0.07, (x0 + x1) / 2, h * 0.36, z));
  return mesh(parts, M.woodDark);
}

/* ------------------------------------------------------------------ 草荡 */

function reedGeo() {
  // 三面交叉的芦束，一根秆带一穗花
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.62, 2.5);
    g.translate(0, 1.25, 0);
    g.rotateY((k / 3) * Math.PI);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/**
 * 草荡：一片带风的芦苇。摆动写在顶点里，用 onBeforeCompile 复用标准材质，
 * 这样夜里月光与灶火仍然打在苇穗上。
 */
function reedField(scene) {
  const geo = reedGeo();
  const mat = new THREE.MeshStandardMaterial({
    map: T.reedPlume(), color: 0xa9a282, roughness: 0.98, side: THREE.DoubleSide,
    transparent: true, alphaTest: 0.34, emissive: new THREE.Color('#2a2a1c'), emissiveIntensity: 0.55,
  });
  const time = { value: 0 };
  const wind = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.53;
       float bend = pow(max(0.0, transformed.y / 2.5), 1.9);
       float sway = sin(uTime * 1.15 + ph) * 0.34 + sin(uTime * 2.6 + ph * 1.7) * 0.12;
       transformed.x += sway * bend * uWind;
       transformed.z += cos(uTime * 0.9 + ph) * 0.2 * bend * uWind;`,
    );
  };
  mat.customProgramCacheKey = () => 'anfeng-reed';

  const N = 5200;
  const inst = new THREE.InstancedMesh(geo, mat, N);
  inst.frustumCulled = false;
  const d = new THREE.Object3D();
  const clear = (x, z) => STATIONS.every((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) > 8.5);
  // 越靠海越密；堤脚与灶区边缘也有零丛；机位脚下留空，别把人埋进苇子里
  for (let k = 0; k < N; k++) {
    const t = Math.pow(rand(), 0.62);
    const x = WORKS.reedX0 + t * (WORKS.reedX1 - WORKS.reedX0);
    const z = rr(WORKS.reedZ0, WORKS.reedZ1);
    if (!clear(x, z)) { inst.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0)); continue; }
    const s = rr(0.5, 0.98);
    d.position.set(x, DECK - 0.1 + rand() * 0.3, z);
    d.rotation.set(0, rand() * 3.1, rr(-0.12, 0.12));
    d.scale.set(s * rr(0.85, 1.2), s, s * rr(0.85, 1.2));
    d.updateMatrix();
    inst.setMatrixAt(k, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);

  // 荡里的零星空灯：刈柴人夜归的火把
  const dots = [];
  for (let k = 0; k < 9; k++) {
    dots.push(WORKS.reedX0 + rand() * (WORKS.reedX1 - WORKS.reedX0) * 0.7, DECK + rr(0.9, 1.8), rr(WORKS.reedZ0, WORKS.reedZ1));
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dots), 3));
  const dm = new THREE.PointsMaterial({
    map: T.softGlow('255,170,96', 0.2), size: 2.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  const pts = new THREE.Points(dg, dm);
  scene.add(pts);

  return {
    mesh: inst,
    lamps: dots,
    setDensity(v) { inst.count = Math.round(N * Math.min(1, Math.max(0.05, v))); },
    update(t) { time.value = t; },
    setWind(v) { wind.value = v; },
  };
}

/* ------------------------------------------------------------------ 装配 */

export function buildWorks(scene) {
  const group = new THREE.Group();
  group.name = 'works';
  scene.add(group);

  const ovens = [];
  const ovenLights = [];
  // 灶房两排，沿河与沿荡各一线
  let z = WORKS.ovenZ0;
  let row = 0;
  while (z <= WORKS.ovenZ1) {
    const x = row % 2 ? WORKS.ovenX1 - 6 : WORKS.ovenX0 + 4;
    const s = ovenShed({ x, z, w: rr(7.6, 9.4), d: rr(4.6, 5.6) });
    group.add(s.group);
    ovens.push(s);
    ovenLights.push(s.mouthWorld);
    row++;
    z += rr(9.5, 12.5);
  }

  // 真正的点光源只给三处，其余靠自发光与晕片
  for (const idx of [0, Math.floor(ovens.length / 2), ovens.length - 1]) {
    if (!ovens[idx]) continue;
    const l = new THREE.PointLight(0xff8a3c, 150, 78, 2);
    l.position.copy(ovens[idx].mouthWorld);
    group.add(l);
    ovens[idx].light = l;
  }

  group.add(brinePit({ x: WORKS.ovenX0 + 8, z: WORKS.ovenZ1 + 6, w: 7, d: 4.4 }));
  group.add(brinePit({ x: WORKS.ovenX1 - 4, z: WORKS.ovenZ0 + 12, w: 5.4, d: 3.6 }));
  for (let k = 0; k < 7; k++) {
    group.add(woodpile({ x: rr(WORKS.ovenX0, WORKS.ovenX1), z: rr(WORKS.ovenZ0, WORKS.ovenZ1 + 8), len: rr(3.2, 5.2) }));
  }
  for (const fz of [WORKS.ovenZ1 + 14, WORKS.ovenZ0 - 8]) {
    group.add(bambooFence({ x0: WORKS.ovenX0 - 2, x1: WORKS.ovenX1 + 6, z: fz }));
  }

  // 往堤那一侧的草堆与晾架
  const nearStation = (x, z) => STATIONS.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < 9);
  for (let k = 0; k < 10; k++) {
    const x = rr(20, 30);
    const zz = rr(-70, 30);
    if (nearStation(x, zz)) continue;
    const stack = new THREE.Mesh(new THREE.ConeGeometry(rr(0.9, 1.5), rr(1.6, 2.6), 7, 1), M.thatch);
    stack.position.set(x, DECK + 0.9, zz);
    stack.castShadow = true;
    group.add(stack);
  }
  for (let k = 0; k < 5; k++) {
    const parts = [];
    const px = rr(22, 30), pz = rr(-60, -20);
    if (nearStation(px, pz)) continue;
    parts.push(boxGeo(0.14, 2.0, 0.14, -1.4, 1.0, 0));
    parts.push(boxGeo(0.14, 2.0, 0.14, 1.4, 1.0, 0));
    parts.push(boxGeo(3.2, 0.1, 0.1, 0, 1.9, 0));
    const rack = mesh(parts, M.woodDark);
    rack.position.set(px, DECK, pz);
    rack.rotation.y = rr(0, 1.4);
    group.add(rack);
  }

  // 盐坨：从仓里搬到码头的一路
  for (let k = 0; k < 16; k++) {
    const heap = new THREE.Mesh(MOUND(), M.salt);
    heap.position.set(rr(24, 34), DECK - 0.05, rr(-46, 10));
    heap.scale.setScalar(rr(0.55, 1.05));
    heap.castShadow = true;
    group.add(heap);
  }

  // 堤与镇之间的场院：几处草棚与一堆夜火，说明"堤东是灶户的地界"
  for (let k = 0; k < 8; k++) {
    const x = rr(DIKE.xSea + 6, DIKE.xSea + 26);
    const zz = rr(-90, 120);
    const hut = new THREE.Mesh(boxGeo(rr(3.4, 5.2), 1.9, rr(2.6, 3.6)), M.thatch);
    hut.position.set(x, DECK + 0.95, zz);
    hut.rotation.y = rr(-0.4, 0.4);
    hut.castShadow = true;
    group.add(hut);
    const glow0 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), glow('#ff9a4e', 2.0));
    glow0.position.set(x + 1.6, DECK + 0.6, zz + 1.2);
    group.add(glow0);
    ovenLights.push(new THREE.Vector3(x + 1.6, DECK + 0.6, zz + 1.2));
  }

  const reeds = reedField(scene);

  // 草荡边的一只小船，刈柴人泊在那里
  const skiff = new THREE.Group();
  const hullParts = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    hullParts.push(boxGeo(0.5, 0.22, 4.6 * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 0.55), 0, 0, -2.3 + t * 4.6));
  }
  hullParts.push(boxGeo(0.9, 0.3, 0.2, 0, 0.28, 2.1));
  skiff.add(mesh(hullParts, M.woodDark));
  skiff.position.set(WORKS.reedX0 + 22, DECK - 0.5, WORKS.reedZ0 + 34);
  skiff.rotation.y = 0.7;
  group.add(skiff);
  const skiffLamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), glow('#ffb066', 2.0));
  skiffLamp.position.set(WORKS.reedX0 + 21.4, DECK - 0.1, WORKS.reedZ0 + 35.6);
  group.add(skiffLamp);

  return {
    group,
    ovens,
    ovenLights,
    reeds,
    skiff: { pos: skiff.position.clone(), lamp: skiffLamp },
  };
}

function MOUND() {
  if (!MOUND._g) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(1.15 * Math.cos(t * Math.PI * 0.5), 0.95 * Math.sin(t * Math.PI * 0.5)));
    }
    MOUND._g = new THREE.LatheGeometry(pts, 14);
  }
  return MOUND._g;
}
