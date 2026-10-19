import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, glow, lit, rand, rr, box, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { GARDEN, GROUND } from './data.js';

/**
 * 灯. There is no electric light in a Song garden, so every lamp here is a flame
 * behind paper: 檐下灯 hanging from the eaves, 漏窗 throwing pattern onto the
 * paving, 石灯 at the corners of the walks, and one 渔火 on the river outside.
 */

/** is this spot over standing water? the light columns are only worth drawing there */
export function overWater(x, z) {
  const R = GARDEN.river, E = GARDEN.eastArm, P = GARDEN.pool;
  if (z > R.zC - R.halfW && z < R.zC + R.halfW && x > R.xFrom && x < R.xTo) return true;
  if (x > E.xC - E.halfW && x < E.xC + E.halfW && z > E.zFrom && z < E.zTo) return true;
  return Math.abs(x - P.xC) < P.hx - 0.5 && Math.abs(z - P.zC) < P.hz - 0.5;
}

export function buildProps(scene, anchors, sheets) {
  const group = new THREE.Group();
  group.name = 'props';
  const haloSpots = [];
  const waterLamps = [];

  /* ------------------------------------------------------------ 檐下灯笼 */
  const bodies = [];
  const caps = [];
  const strings = [];
  const glowCores = [];
  const eaves = anchors.eaves || [];
  for (const e of eaves) {
    const drop = rr(0.45, 0.8);
    const r = rr(0.22, 0.33);
    const y = e.y - drop;
    strings.push(new THREE.CylinderGeometry(0.018, 0.018, drop, 4).translate(e.x, e.y - drop / 2, e.z));
    // 冬瓜灯: a paper body with a cap above and below, and the flame inside
    bodies.push(ellipsoid(r * 0.86, r * 1.25, r * 0.86).translate(e.x, y - r * 0.62, e.z));
    caps.push(box(r * 0.62, 0.09, r * 0.62, e.x, y - 0.02, e.z));
    caps.push(box(r * 0.5, 0.08, r * 0.5, e.x, y - r * 1.2 - 0.04, e.z));
    glowCores.push(new THREE.SphereGeometry(r * 0.5, 8, 6).translate(e.x, y - r * 0.62, e.z));
    haloSpots.push([e.x, y - r * 0.62, e.z]);
  }
  group.add(mesh(mergeGeometries(strings), M.dark));
  const paperMesh = mesh(mergeGeometries(bodies), M.lantern);
  paperMesh.name = 'lantern-paper';
  group.add(paperMesh);
  group.add(mesh(mergeGeometries(caps), M.timberDark));
  const cores = mesh(mergeGeometries(glowCores), glow('#ffd8a4', 1.25));
  cores.name = 'lantern-core';
  group.add(cores);

  /* ------------------------------------------------------------ 漏窗 光斑 */
  // a soft patch of light on either side of every window, flat on the paving
  const patchGeo = new THREE.PlaneGeometry(1.5, 1.15);
  patchGeo.rotateX(-Math.PI / 2);
  const spillMat = lampSpill();
  const patches = new THREE.InstancedMesh(patchGeo, spillMat, Math.max(1, anchors.rails.length * 2));
  const d = new THREE.Object3D();
  let pi = 0;
  for (const [lx, lz] of anchors.rails) {
    for (const s of [-1, 1]) {
      if (pi >= patches.count) break;
      d.position.set(lx + s * 0.42, GROUND + 0.06, lz + s * 0.02);
      d.rotation.set(0, s > 0 ? 0 : Math.PI, 0);
      d.scale.set(1.15, 1, 0.9);
      d.updateMatrix();
      patches.setMatrixAt(pi++, d.matrix);
    }
  }
  patches.count = pi;
  patches.instanceMatrix.needsUpdate = true;
  patches.frustumCulled = false;
  patches.renderOrder = 2;
  patches.name = 'lattice-spill';
  group.add(patches);

  /* ------------------------------------------------------------ 石灯 */
  const stoneLamps = [];
  const stoneGlow = [];
  const spots = [
    [-6, -17.5], [-13, -12], [2, -12.6], [16, -13.6], [30, -10.6], [43, -6.6],
    [-2, 12], [-16, 20], [-40, 24], [-12, 34], [18, 10], [18, 24],
    [-46, -2], [-30, 6], [8, 30], [46, 30],
  ];
  for (const [x, z] of spots) {
    const h = rr(1.05, 1.5);
    const y = GROUND;
    stoneLamps.push(box(0.5, 0.16, 0.5, x, y, z));
    stoneLamps.push(new THREE.CylinderGeometry(0.11, 0.13, h, 8).translate(x, y + h / 2 + 0.16, z));
    stoneLamps.push(box(0.56, 0.42, 0.56, x, y + h + 0.16, z));
    stoneLamps.push(box(0.74, 0.1, 0.74, x, y + h + 0.58, z));
    stoneGlow.push(box(0.34, 0.26, 0.34, x, y + h + 0.24, z));
    haloSpots.push([x, y + h + 0.37, z]);
  }
  // 河岸石灯: the quay lamps are the only ones whose light the river can take
  const RZ = GARDEN.wall.zN - 1.4;
  for (let i = 0; i < 6; i++) {
    const x = -34 + i * 15;
    const h = 1.35;
    stoneLamps.push(box(0.5, 0.16, 0.5, x, GROUND, RZ));
    stoneLamps.push(new THREE.CylinderGeometry(0.11, 0.13, h, 8).translate(x, GROUND + h / 2 + 0.16, RZ));
    stoneLamps.push(box(0.56, 0.42, 0.56, x, GROUND + h + 0.16, RZ));
    stoneLamps.push(box(0.74, 0.1, 0.74, x, GROUND + h + 0.58, RZ));
    stoneGlow.push(box(0.34, 0.26, 0.34, x, GROUND + h + 0.24, RZ));
    haloSpots.push([x, GROUND + h + 0.37, RZ]);
    waterLamps.push([x, RZ - 2.2]);
  }
  group.add(mesh(mergeGeometries(stoneLamps), M.stone));
  const sg = mesh(stoneGlow, glow('#ffcf96', 1.05));
  sg.name = 'stone-lamp-glow';
  group.add(sg);
  /* 河灯: a few paper cups let down on the river outside the wall */
  const cups = [], cupCores = [];
  for (let i = 0; i < 9; i++) {
    const x = rr(-46, 44), z = GARDEN.river.zC + rr(-5, 5);
    cups.push(new THREE.CylinderGeometry(0.24, 0.17, 0.09, 9).translate(x, 0.17, z));
    cupCores.push(new THREE.SphereGeometry(0.1, 8, 6).translate(x, 0.25, z));
    haloSpots.push([x, 0.3, z]);
    waterLamps.push([x, z]);
  }
  group.add(mesh(mergeGeometries(cups), M.dark));
  const cupsGlow = mesh(cupCores, glow('#ffcf8a', 1.1));
  cupsGlow.name = 'river-lanterns';
  group.add(cupsGlow);
  group.add(haloPoints(haloSpots, '255,196,130', 1));

  /* ------------------------------------------------------------ 水上 渔火 */
  for (const [x, , z] of haloSpots) if (overWater(x, z)) waterLamps.push([x, z]);
  const boat = sampan({ x: 14, z: GARDEN.river.zC + 1.4, rot: 0.34 });
  boat.name = 'sampan';
  group.add(boat);
  const boat2 = sampan({ x: -44, z: GARDEN.river.zC - 2.2, rot: -0.5, small: true });
  group.add(boat2);
  waterLamps.push([14, GARDEN.river.zC + 1.4 + 2.1], [-44, GARDEN.river.zC - 2.2 + 1.4]);

  /* ------------------------------------------------------------ 萤火 */
  group.add(fireflies());

  scene.add(group);

  /* --------------------------------------------------------- a few real lights */
  // r160 attenuation falls off with distance squared, so the numbers are large
  const lights = [];
  const lampLights = [
    { p: [4, GROUND + 3.5, 20.2], c: 0xffbb7d, i: 150, d: 22 },     // 明道堂 檐前
    { p: [-8.4, 11.5, 8.6], c: 0xffc48a, i: 150, d: 20 },      // 亭 下
    { p: [-4, GROUND + 3.0, -18.4], c: 0xffbd7f, i: 150, d: 18 },    // 门 洞
    { p: [-6, 6.2, -31], c: 0xffc894, i: 130, d: 20 },               // 桥 顶
    { p: [30, GROUND + 2.8, -13], c: 0xffbb7d, i: 145, d: 19 },      // 复廊 东段
    { p: [-24, GROUND + 2.8, -13.6], c: 0xffbb7d, i: 145, d: 19 },   // 复廊 西段
    { p: [24.5, GROUND + 2.2, 12.5], c: 0xffd0a0, i: 70, d: 15 },     // 观鱼处
    { p: [-32.4, GROUND + 2.5, 26], c: 0xa8e0c0, i: 90, d: 15 },     // 竹院 一盏冷灯
    { p: [-12, GROUND + 2.7, 34.6], c: 0xffc48a, i: 120, d: 17 },    // 碑廊 低灯
    { p: [-6, 5.0, -43.5], c: 0xffd9ae, i: 70, d: 13 },      // 石坊 下
    { p: [-44.5, GROUND + 6.4, 2], c: 0xffbb7d, i: 105, d: 15 },     // 看山楼
  ];
  for (const l of lampLights) {
    const pl = new THREE.PointLight(l.c, l.i, l.d, 2);
    pl.position.set(...l.p);
    pl.userData.base = l.i;
    scene.add(pl);
    lights.push(pl);
  }

  const latticeMats = sheets.map((s) => s.mesh.material);
  return {
    group,
    waterLamps,
    setLantern(v) {
      M.lantern.emissiveIntensity = 0.55 * v;
      cores.material = glow('#ffd8a4', 0.5 + 0.85 * v);
      sg.material = glow('#ffcf96', 0.3 + 0.75 * v);
      spillMat.opacity = 0.2 * Math.min(1.4, v);
      lanternBright = v;
    },
    setLattice(v) {
      for (const m of latticeMats) m.emissiveIntensity = 0.55 * v;
    },
    update(t, lantern = 1) {
      // flames breathe: two incommensurable sines so the loop never becomes obvious
      const flick = 0.92 + 0.08 * Math.sin(t * 6.7) * Math.sin(t * 2.13 + 0.4);
      const k = flick * lantern;
      for (const pl of lights) pl.intensity = (pl.userData.base ?? pl.intensity) * k;
      const ff = group.getObjectByName('fireflies');
      if (ff) ff.material.uniforms.uTime.value = t;
      const hp = group.getObjectByName('lantern-halos');
      if (hp) hp.material.uniforms.uBright.value = lanternBright * flick;
    },
  };
}

let lanternBright = 1;

/* ------------------------------------------------------------------ pieces */

function ellipsoid(rx, ry, rz) {
  const g = new THREE.SphereGeometry(0.5, 12, 9);
  g.scale(rx * 2, ry * 2, rz * 2);
  return g;
}

/** additive glow sprites for every flame, in one draw call */
function haloPoints(list, hue, bright) {
  const n = list.length;
  const pos = new Float32Array(n * 3);
  list.forEach((p, i) => pos.set([p[0], p[1], p[2]], i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uBright: { value: bright }, uTex: { value: T.softGlow(hue, 0.1) } },
    vertexShader: `uniform float uBright; varying float vB;
      void main(){ vB = uBright; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(300.0 / max(6.0, -mv.z), 5.0, 64.0) * (0.72 + 0.28*vB);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vB;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.76,0.48), t.a*0.24*vB); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.name = 'lantern-halos';
  p.renderOrder = 6;
  return p;
}

const spills = [];
function lampSpill() {
  if (!spills.length) {
    const m = new THREE.MeshBasicMaterial({
      map: T.softGlow('255,205,150', 0.18), color: new THREE.Color('#ffc48c'),
      transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.toneMapped = false;
    m.fog = false;
    spills.push(m);
  }
  return spills[0];
}

function sampan({ x, z, rot = 0, small = false }) {
  const grp = new THREE.Group();
  const L = small ? 3.4 : 5.2, W = small ? 1.1 : 1.5;
  const hull = [
    box(W, 0.28, L, 0, 0.14, 0),
    box(W * 0.7, 0.3, L * 0.34, 0, 0.1, -L * 0.36),
  ];
  // taper the ends so it reads as a boat and not a raft
  const g = mergeGeometries(hull);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const zz = p.getZ(i);
    const k = 1 - 0.55 * Math.pow(Math.abs(zz) / (L / 2), 2.2);
    p.setX(i, p.getX(i) * Math.max(0.25, k));
    if (zz < -L * 0.3) p.setY(i, p.getY(i) + 0.22);
  }
  g.computeVertexNormals();
  const bm = mesh(g, lit('#231c16', { rough: 0.85 }));
  bm.position.set(x, 0.02, z);
  bm.rotation.y = rot;
  grp.add(bm);
  if (!small) {
    const cabin = [];
    for (let k = 0; k < 4; k++) {
      const a = (Math.PI / 2) * k;
      cabin.push(box(0.08, 1.0, 1.6, Math.cos(a) * 0.55, 0.42, Math.sin(a) * 0.2 - 0.3));
    }
    cabin.push(box(1.3, 0.1, 2.0, 0, 1.44, -0.3));
    const cm = mesh(cabin, M.silhouette);
    cm.position.set(x, 0, z);
    cm.rotation.y = rot;
    grp.add(cm);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow('#ffcf8a', 1.3));
    lantern.position.set(x + Math.cos(rot) * 0.1, 1.1, z - L * 0.42);
    grp.add(lantern);
  }
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#ffd6a0', 1.2));
  bow.position.set(x, 0.62, z + L * 0.4);
  grp.add(bow);
  registerOccluder(grp, 1.2, new THREE.Vector3(x, 0.4, z));
  return grp;
}

/** 萤火: points drifting on their own phase, only near the water and the bamboo */
function fireflies() {
  const N = 110;
  const pos = new Float32Array(N * 3), phase = new Float32Array(N);
  const P = GARDEN.pool;
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (i % 3 === 0) {                        // over the pool
      x = P.xC + rr(-P.hx, P.hx); z = P.zC + rr(-P.hz, P.hz); y = rr(0.3, 2.2);
    } else if (i % 3 === 1) {                 // in the bamboo grove
      x = -34 + rr(-14, 14); z = 29 + rr(-12, 12); y = rr(0.5, 3.4);
    } else {                                  // along the river bank
      x = rr(-50, 40); z = GARDEN.river.zC + GARDEN.river.halfW + rr(-1, 3); y = rr(0.4, 2.4);
    }
    pos.set([x, y, z], i * 3);
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('220,255,190', 0.05) } },
    vertexShader: `attribute float aPhase; uniform float uTime; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*0.5 + aPhase)*0.9; p.y += sin(uTime*0.7 + aPhase*1.7)*0.5;
        p.z += cos(uTime*0.42 + aPhase*0.6)*0.9;
        float blink = pow(max(0.0, sin(uTime*1.5 + aPhase*3.1)), 8.0);
        vA = blink;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = min(26.0, (2.0 + 5.0*vA) * (60.0 / max(4.0, -mv.z)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.78,1.0,0.62), t.a*vA*0.8); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  pts.renderOrder = 7;
  return pts;
}
