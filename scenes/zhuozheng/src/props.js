import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PONDS, SITE, pondOutline, pointInPond, pointInIsland } from './data.js';
import { LAYOUT } from './architecture.js';
import { M, PAL, rand, rr, rgb } from './kit.js';
import { WATER_Y } from './water.js';
import * as T from './textures.js';

/**
 * 园中的"活物"：一池荷、沿岸灯、流萤、留听阁前的残荷。
 * 数量都按实例化画，滑杆只改 count，不重建几何。
 */

/* ------------------------------------------------------------------ helpers */

function scatterInPond(def, { shrink = 0.86, margin = 1.6 } = {}) {
  const pts = pondOutline(def);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return function pick() {
    for (let tries = 0; tries < 24; tries++) {
      const x = rr(minX, maxX), z = rr(minZ, maxZ) - margin * rand();
      if (!pointInPond(x, z, shrink)) continue;
      if (pointInIsland(x, z)) continue;   // 岛上不长荷
      return [x, z];
    }
    return null;
  };
}

/* ------------------------------------------------------------------ lotus */

const LEAF_MAX = 2400;
const BLOOM_MAX = 260;
const POD_MAX = 150;

function instancedField(geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = count;
  m.frustumCulled = false;
  return m;
}

/** 给实例化的叶面加一段风里的摆动 */
function windShader(mat, { amp = 0.16, time = { value: 0 }, wind = { value: 1 } }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uWind = wind;
    shader.vertexShader = `uniform float uTime; uniform float uWind;\nattribute float aPhase;\n`
      + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float w = uWind * (0.6 + 0.4 * sin(uTime * 0.7 + aPhase * 6.28));
        transformed.x += sin(uTime * 1.3 + aPhase * 6.28 + transformed.y * 0.8) * ${amp.toFixed(3)} * w;
        transformed.z += cos(uTime * 1.1 + aPhase * 6.28 - transformed.y * 0.6) * ${(amp * 0.8).toFixed(3)} * w;
        transformed.y += sin(uTime * 1.9 + aPhase * 6.28) * ${(amp * 0.35).toFixed(3)} * w;
      `);
  };
  mat.customProgramCacheKey = () => `zhuozheng-wind-${amp}`;
  return mat;
}

function buildLotus(scene) {
  const leafGeo = new THREE.CircleGeometry(1, 13);
  leafGeo.rotateX(-Math.PI / 2);
  const map = T.lotusLeaf();
  const leafMat = new THREE.MeshStandardMaterial({
    map, alphaMap: map, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
    color: rgb('#cfd8c8'), roughness: 0.72, emissive: rgb('#0e1a12'), emissiveIntensity: 0.55,
  });
  const time = { value: 0 };
  const wind = { value: 1 };
  windShader(leafMat, { amp: 0.2, time, wind });
  const leaves = instancedField(leafGeo, leafMat, LEAF_MAX);
  leaves.name = 'lotus-leaf';

  const phase = new Float32Array(LEAF_MAX);
  const dummy = new THREE.Object3D();
  let i = 0;
  const rows = [];
  for (const def of PONDS) {
    if (def.id === 'lane') continue;
    const pick = scatterInPond(def, { shrink: 0.8, margin: 2.2 });
    const target = def.id === 'mid' ? 1500 : def.id === 'east' ? 260 : 420;
    for (let k = 0; k < target && i < LEAF_MAX; k++) {
      const p = pick();
      if (!p) continue;
      const [x, z] = p;
      const near = Math.hypot(x - (def._center[0]), z - (def._center[1]));
      const s = rr(0.5, 1.5) * (def.id === 'east' ? 0.78 : 1);
      const lifted = rand() < 0.3;
      dummy.position.set(x, WATER_Y + (lifted ? rr(0.45, 0.95) : rr(0.05, 0.3)), z);
      dummy.rotation.set(rr(-0.16, 0.16), rand() * Math.PI * 2, rr(-0.16, 0.16));
      dummy.scale.set(s, 1, s * rr(0.85, 1.1));
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      phase[i] = rand();
      rows.push({ x, z, r: near });
      i++;
    }
  }
  leaves.count = i;
  leafGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  scene.add(leaves);

  // 花与莲蓬：连茎一起实例化，否则夜里看着像漂在水上的气球
  const budTop = new THREE.SphereGeometry(0.13, 8, 6);
  budTop.scale(1, 1.35, 1);
  budTop.translate(0, 0.66, 0);
  const budStem = new THREE.CylinderGeometry(0.024, 0.032, 1.32, 5);
  budStem.translate(0, 0.66, 0);
  const budGeo = mergeGeometries([budTop, budStem]);
  const budMat = new THREE.MeshStandardMaterial({
    color: rgb('#b9808c'), roughness: 0.72, emissive: rgb('#1c080d'), emissiveIntensity: 0.25,
  });
  windShader(budMat, { amp: 0.1, time, wind });
  const buds = instancedField(budGeo, budMat, BLOOM_MAX);
  let b = 0;
  for (const def of PONDS) {
    if (def.id === 'lane') continue;
    const pick = scatterInPond(def, { shrink: 0.72, margin: 3 });
    const target = def.id === 'mid' ? 90 : 22;
    for (let k = 0; k < target && b < BLOOM_MAX; k++) {
      const p = pick();
      if (!p) continue;
      dummy.position.set(p[0], WATER_Y, p[1]);
      dummy.rotation.set(rr(-0.12, 0.12), rand() * 3, rr(-0.12, 0.12));
      dummy.scale.setScalar(rr(0.75, 1.2));
      dummy.updateMatrix();
      buds.setMatrixAt(b++, dummy.matrix);
    }
  }
  buds.count = b;
  budGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: BLOOM_MAX }, () => rand()), 1));
  scene.add(buds);

  const podGeo = new THREE.CylinderGeometry(0.3, 0.16, 0.16, 9);
  const podMat = new THREE.MeshStandardMaterial({
    color: rgb(PAL.lotusSeed), roughness: 0.85, emissive: rgb('#1b2016'), emissiveIntensity: 0.5,
  });
  windShader(podMat, { amp: 0.09, time, wind });
  const pods = instancedField(podGeo, podMat, POD_MAX);
  let q = 0;
  for (const def of PONDS) {
    if (def.id !== 'mid' && def.id !== 'west') continue;
    const pick = scatterInPond(def, { shrink: 0.7, margin: 3.4 });
    for (let k = 0; k < (def.id === 'mid' ? 100 : 45) && q < POD_MAX; k++) {
      const p = pick();
      if (!p) continue;
      dummy.position.set(p[0], WATER_Y + rr(0.9, 1.5), p[1]);
      dummy.rotation.set(rr(-0.3, 0.3), rand() * 3, rr(-0.3, 0.3));
      dummy.scale.setScalar(rr(0.7, 1.2));
      dummy.updateMatrix();
      pods.setMatrixAt(q++, dummy.matrix);
    }
  }
  pods.count = q;
  podGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: POD_MAX }, () => rand()), 1));
  scene.add(pods);

  // 留听阁前的残荷：枯梗折而不倒，叶缘卷成焦色
  const stemGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.2, 5);
  const stemMat = new THREE.MeshStandardMaterial({ color: rgb('#6b5a34'), roughness: 0.95 });
  const dead = instancedField(stemGeo, stemMat, 320);
  const west = PONDS.find((p) => p.id === 'west');
  const pickDead = scatterInPond(west, { shrink: 0.9, margin: 1.4 });
  let d = 0;
  for (let k = 0; k < 320 && d < 320; k++) {
    const p = pickDead();
    if (!p) continue;
    // 集中在留听阁一侧（南岸）
    if (p[1] < 6) continue;
    dummy.position.set(p[0], WATER_Y + rr(0.2, 0.7), p[1]);
    dummy.rotation.set(rr(-0.55, 0.55), rand() * 3, rr(-0.55, 0.55));
    dummy.scale.setScalar(rr(0.7, 1.4));
    dummy.updateMatrix();
    dead.setMatrixAt(d++, dummy.matrix);
  }
  dead.count = d;
  scene.add(dead);

  const max = { leaves: i, buds: b, pods: q };
  return {
    leaves, buds, pods, dead, time, wind, max,
    setDensity(k) {
      const f = Math.max(0, Math.min(1.6, k));
      leaves.count = Math.round(max.leaves * Math.min(1, f));
      buds.count = Math.round(max.buds * Math.min(1, f));
      pods.count = Math.round(max.pods * Math.min(1, f));
      dead.count = Math.round(d * Math.min(1, f));
    },
    update(t) { time.value = t; },
  };
}

/* ------------------------------------------------------------------ lamps */

const lampBodyGeo = new THREE.SphereGeometry(0.42, 12, 9);
const lampCapGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.12, 8);
const lampHaloGeo = new THREE.SphereGeometry(1.0, 10, 8);
const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6);

function lampMaterials(color) {
  const paper = T.lanternPaper('#fff2d4', color === PAL.lanternWarm ? '#e8734a' : '#5f8f7a');
  return {
    body: new THREE.MeshBasicMaterial({ map: paper, toneMapped: false, fog: false }),
    cap: M.gilt,
    halo: new THREE.MeshBasicMaterial({
      map: T.softGlow('255,196,124', 0.14), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    }),
  };
}

/**
 * 一盏灯的四种用法：挂檐下(hang)、立路旁(stand)、水中灯柱(float)、手提(carry)。
 * 返回的对象带 setColor(k)，光影秀与提灯引路都靠它。
 */
function makeLamp(kind, mats, { size = 1 } = {}) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(lampBodyGeo, mats.body);
  body.scale.setScalar(size);
  body.scale.y = size * 1.2;
  const halo = new THREE.Mesh(lampHaloGeo, mats.halo);
  halo.scale.setScalar(size * 1.7);
  grp.add(body, halo);
  if (kind === 'hang') {
    const cap = new THREE.Mesh(lampCapGeo, mats.cap);
    cap.position.y = size * 0.56;
    cap.scale.setScalar(size);
    grp.add(cap);
  } else if (kind === 'stand') {
    const pole = new THREE.Mesh(poleGeo, M.pillarDark);
    pole.position.y = -size * 0.9;
    grp.add(pole);
    const cap = new THREE.Mesh(lampCapGeo, mats.cap);
    cap.position.y = size * 0.6;
    grp.add(cap);
  } else if (kind === 'float') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 8), M.stoneDark);
    base.position.y = -size * 0.7;
    grp.add(base);
  }
  grp.userData.lamp = { body, halo, kind, size, lit: 1 };
  return grp;
}

export function buildProps(scene, columns) {
  const field = buildLotus(scene);
  const warm = lampMaterials(PAL.lanternWarm);
  const jade = lampMaterials(PAL.lanternJade);
  const lamps = [];
  const addLamp = (kind, x, y, z, opts = {}) => {
    const m = makeLamp(kind, opts.tint === 'jade' ? jade : warm, opts);
    m.position.set(x, y, z);
    scene.add(m);
    const rec = { obj: m, pos: new THREE.Vector3(x, y, z), lit: 1, target: 1, kind, near: opts.near || 0 };
    lamps.push(rec);
    if (opts.column && columns) {
      rec.column = columns.add(new THREE.Vector3(x, WATER_Y, z), opts.columnColor || PAL.lanternWarm,
        opts.columnWidth || 0.85, opts.columnDepth || 5.5, opts.columnIntensity || 0.9);
    }
    return rec;
  };

  /* 檐下灯：各厅堂正面一对，轩亭各一 */
  const eaveLamps = [
    [76.8, 47.9, 80], [83.2, 47.9, 80],
    [60.4, 30.9, 64], [67.6, 30.9, 64],
    [10.6, 26.2, 16], [21.4, 26.2, 16],
    [21.2, 38.4, 24], [26.8, 38.4, 24],
    [-74.8, -17.8, -68], [-61.2, -17.8, -68],
    [-48.6, 13.4, -46], [-48.6, 10.6, -46],
    [-78.6, 27.2, -74], [-69.4, 27.2, -74],
  ];
  for (const [x, y, z] of eaveLamps) addLamp('hang', x, y, z, { size: 0.62 });

  /* 廊下灯串：沿光影长廊与复廊，一节节是提灯引路的路径 */
  const langLamps = [];
  for (let i = 0; i < LAYOUT.corridor.length; i++) {
    const [x, z] = LAYOUT.corridor[i];
    const l = addLamp('hang', x, SITE.groundY + 2.5, z, { size: 0.5 });
    langLamps.push(l);
    if (i < LAYOUT.corridor.length - 1) {
      const [x1, z1] = LAYOUT.corridor[i + 1];
      langLamps.push(addLamp('hang', (x + x1) / 2, SITE.groundY + 2.5, (z + z1) / 2, { size: 0.5 }));
    }
  }
  const relayLamps = [];
  for (const [x, z] of LAYOUT.relay) {
    for (const dx of [-1.5, 1.5]) relayLamps.push(addLamp('hang', x + dx, SITE.groundY + 2.4, z, { size: 0.46 }));
  }

  /* 立灯：桥头、亭角、渡口与路转 */
  const standing = [
    [26.6, 17.8], [31.4, 17.8],          // 小飞虹两端
    [22.4, 25.4], [8.4, 22.6],           // 远香堂前的堤
    [-19.4, -20.4], [-15.2, -18.2],      // 舫埠
    [35.6, 3.4], [32.4, -3.2],           // 梧竹幽居
    [-41.2, 15.2], [-42.4, 9.4],         // 与谁同坐轩
    [-62.6, 26.4], [-72.4, 26.8],        // 西园水岸
    [56.4, 40.2], [50.2, 43.4], [44, 42.4],  // 东园路
    [84.4, 55.2], [75.6, 55.6],          // 宅院庭前
    [-4.4, 6.4], [-8.4, -8.4],           // 荷风亭四面
    [-52.6, 24.4], [-86.4, 8.4],         // 西部桥口
  ];
  for (const [x, z] of standing) {
    addLamp('stand', x, SITE.groundY + 1.75, z, {
      size: 0.52,
      column: Math.abs(x) < 40 && Math.abs(z) < 30 ? true : false,
      columnWidth: 0.7, columnDepth: 4.4, columnIntensity: 0.75,
    });
  }

  /* 水灯：漂在三口气口的水面上，是夜里最亮的一串 */
  const floats = [
    [4, 14], [-14, 12], [-24, 2], [12, 4], [-2, -12], [18, 12],
    [-58, 12], [-78, 10], [-66, 18], [48, 28], [52, 31],
  ];
  for (const [x, z] of floats) {
    if (!pointInPond(x, z, 0.92)) continue;
    addLamp('float', x, WATER_Y + 0.3, z, {
      size: 0.34, tint: 'jade', column: true,
      columnColor: PAL.lanternJade, columnWidth: 0.5, columnDepth: 3.6, columnIntensity: 0.7,
    });
  }

  /* 手提灯：几个游人剪影手里的光，慢慢沿路挪 */
  const carriers = [];
  const walkRoutes = [
    LAYOUT.corridor,
    [[22, 25.4], [12, 23.4], [2, 20.4], [-8, 16.4]],
    [[-58, 15], [-62, 19], [-68, 22], [-74, 22]],
  ];
  for (const route of walkRoutes) {
    const n = 2;
    for (let k = 0; k < n; k++) {
      const l = addLamp('carry', route[0][0], SITE.groundY + 1.35, route[0][1], { size: 0.42 });
      l.route = route;
      l.phase = k / n + rand() * 0.1;
      l.speed = rr(0.012, 0.02);
      carriers.push(l);
    }
  }
  // 提灯人：一个黑色剪影撑住那盏灯
  const figure = new THREE.ConeGeometry(0.28, 1.35, 7);
  for (const c of carriers) {
    const body = new THREE.Mesh(figure, M.ink);
    body.position.y = -0.75;
    c.obj.add(body);
  }

  return {
    field, lamps, langLamps, relayLamps, carriers,
    /** 园灯疏密：k=1 全亮，超过 1 只把亮度推高 */
    setDensity(k) {
      const f = Math.max(0, Math.min(1, k / 1.05));
      const lit = Math.round(lamps.length * f);
      lamps.forEach((l, i) => { l.target = i < lit ? Math.max(0.6, Math.min(1.6, k)) : 0; });
    },
    setLampOn(rec, on) { rec.target = on ? 1 : 0; },
    update(t, dt) {
      field.update(t);
      for (const l of lamps) {
        const u = l.obj.userData.lamp;
        u.lit += (l.target - u.lit) * Math.min(1, dt * 3.2);
        const flick = 0.86 + 0.14 * Math.sin(t * 3.1 + l.pos.x * 0.7 + l.pos.z * 0.9);
        const v = u.lit * flick;
        u.body.visible = v > 0.02;
        u.halo.visible = v > 0.02;
        u.body.scale.setScalar(u.size * (0.94 + 0.06 * v));
        u.body.scale.y = u.size * 1.2 * (0.94 + 0.06 * v);
        u.halo.scale.setScalar(u.size * (1.2 + 0.9 * v));
        u.halo.material.opacity = 0.28 * v;
        if (l.column !== undefined && columns) columns.setOn(l.column, v > 0.15);
      }
      for (const c of carriers) {
        c.phase = (c.phase + dt * c.speed) % 1;
        const total = c.route.length - 1;
        const f = c.phase * total;
        const i = Math.min(total - 1, Math.floor(f));
        const k = f - i;
        const [x0, z0] = c.route[i], [x1, z1] = c.route[i + 1];
        const x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        c.obj.position.set(x, SITE.groundY + 1.35 + Math.sin(t * 2.2 + c.phase * 20) * 0.05, z);
        c.pos.set(x, c.obj.position.y, z);
      }
    },
    /** 光影秀用的公共灯亮度抬升 */
    boost(k) {
      for (const l of lamps) l.target = Math.max(l.target, k);
    },
  };
}

/* ------------------------------------------------------------------ fireflies */

export function buildFireflies(scene) {
  const MAX = 900;
  const pos = new Float32Array(MAX * 3);
  const seed = new Float32Array(MAX * 3);
  let n = 0;
  const zones = [
    { cx: 8, cz: 18, r: 26, y: [0.5, 3.4] },
    { cx: -18, cz: -6, r: 20, y: [0.4, 3.0] },
    { cx: 50, cz: 30, r: 13, y: [0.5, 2.6] },
    { cx: -68, cz: 10, r: 22, y: [0.5, 3.2] },
    { cx: 30, cz: 2, r: 10, y: [0.6, 2.8] },
  ];
  for (const zone of zones) {
    const per = Math.floor(MAX / zones.length);
    for (let i = 0; i < per && n < MAX; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * zone.r;
      const x = zone.cx + Math.cos(a) * d, z = zone.cz + Math.sin(a) * d;
      pos.set([x, rr(zone.y[0], zone.y[1]), z], n * 3);
      seed.set([rand(), rand(), rand()], n * 3);
      n++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setDrawRange(0, n);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uLevel: { value: 1 } },
    vertexShader: `
      attribute vec3 aSeed; uniform float uTime; uniform float uPR; uniform float uLevel;
      varying float vA;
      void main(){
        vec3 p = position;
        float s = aSeed.x * 6.28;
        p.x += sin(uTime * (0.18 + aSeed.y * 0.22) + s) * (1.4 + aSeed.z * 2.2);
        p.y += sin(uTime * (0.3 + aSeed.x * 0.4) + s * 2.0) * 0.6;
        p.z += cos(uTime * (0.16 + aSeed.z * 0.26) + s) * (1.6 + aSeed.y * 2.0);
        // 明灭：长暗短亮，像真的对不上节奏
        float blink = smoothstep(0.55, 1.0, sin(uTime * (0.5 + aSeed.x * 1.4) + s * 3.0));
        vA = blink * uLevel;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + aSeed.y * 1.8) * uPR * (18.0 / max(8.0, -mv.z));
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float m = smoothstep(0.5, 0.02, length(d));
        gl_FragColor = vec4(vec3(0.72, 0.94, 0.62) * m * vA * 2.2, m * vA);
      }`,
  });
  mat.toneMapped = false;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  scene.add(pts);
  return {
    pts, mat, max: n,
    setDensity(k) {
      const f = Math.max(0, Math.min(1.4, k));
      geo.setDrawRange(0, Math.round(n * Math.min(1, f)));
      mat.uniforms.uLevel.value = f;
    },
    setQuality(pr) { mat.uniforms.uPR.value = pr; },
    update(t) { mat.uniforms.uTime.value = t; },
  };
}
