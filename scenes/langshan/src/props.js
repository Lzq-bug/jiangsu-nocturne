import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, glow, rand, rr, box, cyl, quadGrid, blobGeometry } from './kit.js';
import * as T from './textures.js';
import { heightAt, steepness, roadAt, GROUND, RIVER, WATER_Y, TOMB, TEMPLE, PADS } from './data.js';

/**
 * 灯与那道光。
 *
 * "真实灯光"只有十二盏：r160 里 PointLight 的 intensity 是坎德拉、按距离平方衰减，
 * 所以数字看着大。亮的一律是 MeshBasicMaterial（toneMapped=false）加加法混合的
 * 灯晕点云，照的才用真灯，且全场景控制在十二盏以内。
 *
 * 招牌交互"以袈裟遮山"：光幕自塔刹下降覆山，高处先亮、低处后亮——
 * 传说里僧伽以一袭袈裟遮遍全山降伏白狼，这里把它画成一道走过的光。
 */

const FRONT_TOP = 146;
const FRONT_BOTTOM = 2;

/** 某个高度在 robe 走到几时被打亮 */
const pAt = (y) => Math.min(1, Math.max(0, (FRONT_TOP - y) / (FRONT_TOP - FRONT_BOTTOM)));

export function buildProps(scene, temple, columns) {
  const group = new THREE.Group();
  group.name = 'props';

  /* ------------------------------------------------------------ 灯的位置表 */
  const lamps = [];
  const push = (x, y, z, { size = 1, color = '#ffbb76', kind = 'lantern' } = {}) => {
    lamps.push({ x, y, z, size, color, kind, thr: pAt(y) });
  };

  // 殿宇檐下（塔的金铎角也在 temple.eaveLamps 里）
  for (const e of temple.eaveLamps) {
    push(e.x, e.y, e.z, { size: e.kind === 'duo' ? 0.55 : 1.1, color: e.kind === 'duo' ? '#ffd6a0' : '#ffbb76' });
  }
  // 盘山石蹬：夹道一灯，左右交替，密到能从江上读出这条线
  const roadLamps = [];
  for (let i = 0; i < 30; i++) {
    const t = 0.015 + (i / 29) * 0.965;
    const p = roadAt(t);
    const len = Math.hypot(p.dx, p.dz) || 1;
    const nx = -p.dz / len, nz = p.dx / len;
    const side = i % 2 ? 1 : -1;
    const x = p.x + nx * side * 2.3, z = p.z + nz * side * 2.3;
    const y = heightAt(x, z);
    roadLamps.push({ x, y, z, p: pAt(y) });
    push(x, y + 1.5, z, { size: 0.85, color: '#ffc07e' });
  }
  // 台地四角与院门
  for (const key of Object.keys(PADS)) {
    const p = PADS[key];
    for (const [cx, cz] of [[p.x0 + 1.5, p.z0 + 1.5], [p.x1 - 1.5, p.z0 + 1.5], [p.x1 - 1.5, p.z1 - 1.5], [p.x0 + 1.5, p.z1 - 1.5]]) {
      push(cx, heightAt(cx, cz) + 1.35, cz, { size: 0.8, color: '#ffb46a' });
    }
  }
  // 墓：坊下两盏、墓前一盏
  {
    const y = heightAt(TOMB.x, TOMB.z);
    push(TOMB.x - 8, y + 2.6, TOMB.z - 1.6, { size: 0.9, color: '#ffa85e' });
    push(TOMB.x - 8, y + 2.6, TOMB.z + 1.6, { size: 0.9, color: '#ffa85e' });
    push(TOMB.x + 4.2, y + 1.5, TOMB.z, { size: 0.7, color: '#c8dcf0', kind: 'cold' });
  }
  // 摩崖：壁根两盏斜着扫上去
  for (const l of temple.inscription.lamps) {
    push(l.x, l.y + 0.9, l.z, { size: 1.15, color: '#ffe0b0' });
  }
  // 江堤与泊位
  for (let i = 0; i < 7; i++) {
    const z = -120 + i * 42;
    push(-186, GROUND + 1.5, z, { size: 1.0, color: '#ffb070' });
  }

  /* ------------------------------------------------------------ 灯体几何 */

  const shells = [], posts = [], caps = [];
  for (const l of lamps) {
    if (l.kind === 'cold') {
      // 墓前那盏是石灯幢：一个小小的硬山顶
      posts.push(cyl(0.2, 0.2, 1.2, 8, l.x, l.y - 1.5, l.z));
      caps.push(box(1.5, 0.18, 1.1, l.x, l.y - 0.25, l.z));
      continue;
    }
    const s = l.size;
    const g = new THREE.SphereGeometry(0.34 * s, 10, 8);
    g.scale(1, 1.25, 1);
    g.translate(l.x, l.y, l.z);
    shells.push(g);
    if (s > 0.9 && l.kind === 'lantern') {
      posts.push(cyl(0.07, 0.07, 0.5, 6, l.x, l.y + 0.44 * s, l.z));
      caps.push(box(0.6 * s, 0.1, 0.6 * s, l.x, l.y + 0.7 * s, l.z));
    }
  }
  const shellMesh = mesh(mergeGeometries(shells), M.lantern);
  shellMesh.name = 'lantern-shells';
  const postMesh = mesh(mergeGeometries(posts), M.stone);
  const capMesh = mesh(mergeGeometries(caps), M.wallCap);
  group.add(shellMesh, postMesh, capMesh);

  // 亮面：一整张 additive 点云， robe 与闪烁都在 shader 里判
  const N = lamps.length;
  const pos = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  const thr = new Float32Array(N);
  const col = new Float32Array(N * 3);
  lamps.forEach((l, i) => {
    pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z;
    siz[i] = 1.1 + l.size * 1.5;
    thr[i] = l.thr;
    const c = new THREE.Color(l.color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  });
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  haloGeo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  haloGeo.setAttribute('aThr', new THREE.BufferAttribute(thr, 1));
  haloGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTex: { value: T.softGlow('255,196,128', 0.08) },
      uTime: { value: 0 }, uRobe: { value: 1 }, uLantern: { value: 1 },
    },
    vertexShader: `
      attribute float aSize; attribute float aThr; attribute vec3 aColor;
      uniform float uTime; uniform float uRobe; uniform float uLantern;
      varying vec3 vC; varying float vA;
      void main(){
        float on = smoothstep(aThr - 0.015, aThr + 0.02, uRobe);
        float flick = 0.86 + 0.14 * sin(uTime * 5.7 + position.x * 0.7) * sin(uTime * 2.1 + position.z * 0.5);
        vC = aColor;
        vA = on * flick * uLantern;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (150.0 + 90.0 * flick) / max(4.0, -mv.z), 2.0, 190.0) * (0.35 + 0.65 * on);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vC * 1.5, t.a * vA * 0.62);
      }`,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.name = 'lantern-halos';
  halos.frustumCulled = false;
  halos.renderOrder = 6;
  group.add(halos);

  /* ------------------------------------------------------------ 石灯幢 */

  const lanternHeads = [];
  const heads = [];
  for (let i = 0; i < roadLamps.length; i += 3) {
    const l = roadLamps[i];
    lanternHeads.push({ x: l.x, y: l.y, z: l.z });
    heads.push(mergeGeometries([
      box(0.62, 0.16, 0.62).translate(0, 1.02, 0),
      new THREE.ConeGeometry(0.55, 0.42, 4).translate(0, 1.3, 0).rotateY(Math.PI / 4),
      cyl(0.22, 0.24, 1.0, 8, 0, 0.5, 0),
      box(0.9, 0.22, 0.9).translate(0, 0.11, 0),
    ]).clone().translate(l.x, l.y - 0.1, l.z));
  }
  if (heads.length) {
    const m = new THREE.Mesh(mergeGeometries(heads), M.stone);
    m.name = 'stone-lanterns';
    group.add(m);
  }

  /* ------------------------------------------------------------ 船与泊位 */

  const boats = [];
  const boatSpec = [
    { x: -300, z: 40, len: 16, drift: 9 },
    { x: -520, z: -180, len: 21, drift: 6 },
    { x: -232, z: -96, len: 12, drift: 0 },
    { x: -238, z: 118, len: 13, drift: 0 },
    { x: -760, z: 300, len: 24, drift: 4 },
  ];
  for (const b of boatSpec) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(mergeGeometries([
      box(b.len, 1.5, b.len * 0.26).translate(0, 0.4, 0),
      box(b.len * 0.9, 1.2, b.len * 0.2).translate(0, -0.35, 0),
      box(b.len * 0.34, 1.5, b.len * 0.22).translate(-b.len * 0.2, 1.4, 0),
    ]), M.timberDark);
    hull.name = 'boat-hull';
    g.add(hull);
    const mast = new THREE.Mesh(cyl(0.12, 0.1, b.len * 0.5, 6, b.len * 0.12, 0.8, 0), M.timber);
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(b.len * 0.42, b.len * 0.46), M.plaster);
    sail.position.set(b.len * 0.12, 0.9 + b.len * 0.24, 0.3);
    sail.rotation.y = Math.PI / 2;
    g.add(sail);
    const lampPos = new THREE.Vector3(-b.len * 0.42, 2.4, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glow('#ffcf94', 1.6));
    lamp.position.copy(lampPos);
    g.add(lamp);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,190,120', 0.06), color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    spr.scale.set(16, 16, 1);
    spr.position.copy(lampPos);
    spr.name = 'beam-boat';
    g.add(spr);
    g.position.set(b.x, WATER_Y, b.z);
    g.rotation.y = b.drift > 0 ? 0.2 : 1.1;
    g.name = 'boat';
    group.add(g);
    const colIdx = columns.add(new THREE.Vector3(b.x, 0, b.z), '#ffc48c', 2.2, 26, 0.9);
    boats.push({ grp: g, spec: b, lamp, colIdx, spr });
  }

  // 航标桩：一明一暗的那种冷白
  const marks = [];
  for (let i = 0; i < 8; i++) {
    const x = RIVER.shoreX - 60 - i * 95;
    const z = -300 + i * 105;
    const post = new THREE.Mesh(cyl(0.3, 0.2, 6, 6, x, 0, z), M.dark);
    group.add(post);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('180,225,255', 0.04), color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    light.scale.set(13, 13, 1);
    light.position.set(x, 6.4, z);
    light.name = 'beam-mark';
    group.add(light);
    marks.push({ sprite: light, phase: i * 0.8, col: columns.add(new THREE.Vector3(x, 0, z), '#9fd0f0', 1.4, 14, 0.5) });
  }

  /* ------------------------------------------------------------ 袈裟光幕 */

  const robeGeo = quadGrid((u, v) => {
    const x = -90 + u * 260;
    const z = -90 + v * 260;
    const y = heightAt(x, z);
    const s = steepness(x, z);
    return [x, y + 0.5 + s * 0.5, z];
  }, 116, 116, { spanU: 260, spanV: 260 });
  const robeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, fog: false,
    uniforms: {
      uRobe: { value: 1 }, uTime: { value: 0 },
      uFront: { value: FRONT_BOTTOM }, uK: { value: 1 },
    },
    vertexShader: `
      varying vec3 vW; varying vec2 vUv;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uRobe; uniform float uTime; uniform float uFront; uniform float uK;
      varying vec3 vW; varying vec2 vUv;
      void main(){
        // 光幕从塔刹一路铺到山脚：已经盖到的地方留着，正在盖的那条边最亮
        float cov = 1.0 - smoothstep(uFront - 16.0, uFront + 4.0, vW.y);
        float band = exp(-pow((vW.y - uFront) / 9.0, 2.0));
        // 福田相：袈裟是一块块拼起来的，明暗也一块块分
        float q = step(0.5, fract(vW.x * 0.055 + 0.13)) * step(0.5, fract(vW.z * 0.055));
        float patch = 0.68 + 0.32 * q;
        float rip = 1.0 + 0.12 * sin(vW.x * 0.09 + uTime * 0.7) * sin(vW.z * 0.11 - uTime * 0.5);
        float done = 1.0 - smoothstep(0.84, 1.0, uRobe);
        float a = (cov * 0.2 + band * 0.55) * patch * done * uK;
        vec3 col = mix(vec3(1.0, 0.62, 0.26), vec3(1.0, 0.88, 0.62), band * 0.8);
        gl_FragColor = vec4(col * rip * (1.1 + band * 1.8), a);
      }`,
  });
  const robe = new THREE.Mesh(robeGeo, robeMat);
  robe.name = 'beam-robe';
  robe.renderOrder = 7;
  group.add(robe);

  // 光幕走到哪一档，塔就亮到哪一层：由 main 每帧喂进来
  const towerMats = temple.tower.mats;

  /* ------------------------------------------------------------ 真灯十二盏 */

  const real = [];
  const putLight = (x, y, z, color, I, dist) => {
    const l = new THREE.PointLight(new THREE.Color(color), I, dist, 2);
    l.position.set(x, y, z);
    l.userData = { base: I, thr: pAt(y), x, y, z };
    scene.add(l);
    real.push(l);
    return l;
  };
  const padHall = PADS.hall.y, padTower = PADS.tower.y;
  putLight(88, padHall + 6, 14, 0xffb877, 620, 62);      // 圆通宝殿前
  putLight(88, padHall + 5, 26, 0xffb070, 300, 40);      // 大圣殿前
  putLight(66, padHall + 4, -6, 0xffc48a, 240, 34);      // 法乳堂与十八格壁
  putLight(26, padTower + 5, 12, 0xffd0a0, 340, 44);     // 塔院
  putLight(26, padTower + 22, -14, 0xffb06a, 520, 70);   // 塔身中段侧打
  putLight(TEMPLE.gate.x, heightAt(TEMPLE.gate.x, TEMPLE.gate.z) + 4.5, TEMPLE.gate.z, 0xffb877, 210, 32); // 山门
  putLight(TEMPLE.sanxian.x, heightAt(TEMPLE.sanxian.x, TEMPLE.sanxian.z) + 3.6, TEMPLE.sanxian.z, 0xffc084, 130, 22);
  putLight(-18, PADS.cliff.y + 4.5, 10, 0xffd2a2, 260, 40);  // 崖顶亭与台
  putLight(-38, temple.inscription.baseY + 2.2, -52, 0xffe2b8, 300, 46); // 摩崖
  putLight(176, heightAt(176, 104) + 2.4, 104, 0xffa85e, 150, 26);       // 墓区
  putLight(150, heightAt(150, 66) + 3.2, 66, 0xffb877, 190, 34);         // 盘山中段
  putLight(-186, GROUND + 3.2, 24, 0xffb070, 220, 40);                   // 江堤

  for (const [x, z] of [[26, 0], [-18, 14], [88, 10]]) {
    columns.add(new THREE.Vector3(x, 0, z), '#ffbb7c', 1.6, 22, 0.5);
  }

  /* ------------------------------------------------------------ 状态 */

  let robeValue = 1, lanternValue = 1;
  const api = {
    group, lamps, boats, marks, halos, robe, real,
    setRobe(v) {
      robeValue = Math.min(1, Math.max(0, v));
      const front = FRONT_TOP - (FRONT_TOP - FRONT_BOTTOM) * robeValue;
      robeMat.uniforms.uRobe.value = robeValue;
      robeMat.uniforms.uFront.value = front;
      // 五层自上而下依次接管：光走到哪一层，那层的窗就亮
      towerMats.forEach((m, i) => {
        const on = robeValue >= m.p ? 1 : 0;
        m.mat.color.copy(m.tint).multiplyScalar(m.base * (0.06 + 0.94 * on));
      });
      for (const l of real) {
        const k = robeValue >= l.userData.thr ? 1 : 0.04;
        l.intensity = l.userData.base * k * (0.55 + 0.45 * lanternValue);
      }
    },
    setLantern(v) {
      lanternValue = Math.min(1.6, Math.max(0, v));
      haloMat.uniforms.uLantern.value = lanternValue;
      shellMesh.material.emissiveIntensity = 0.62 * lanternValue;
      api.setRobe(robeValue);
    },
    update(t, ripple) {
      haloMat.uniforms.uTime.value = t;
      robeMat.uniforms.uTime.value = t;
      for (const b of boats) {
        if (b.spec.drift > 0) {
          b.grp.position.z += Math.sin(t * 0.04 + b.spec.x) * 0.02;
          b.grp.position.x -= 0.006 * b.spec.drift;
          if (b.grp.position.x < RIVER.xTo + 120) b.grp.position.x = RIVER.shoreX - 40;
          columns.items[b.colIdx].pos.set(b.grp.position.x, 0, b.grp.position.z);
          columns.matrixDirty = true;
        }
        b.grp.position.y = WATER_Y + Math.sin(t * 0.9 + b.spec.z) * 0.18;
        b.grp.rotation.z = Math.sin(t * 0.6 + b.spec.x) * 0.02;
      }
      for (const m of marks) {
        const blink = Math.max(0, Math.sin(t * 1.1 + m.phase));
        m.sprite.material.opacity = 0.25 + blink * 0.75;
        columns.setOn(m.col, blink > 0.35);
      }
    },
    /** 供深链与面板读取 */
    get robe() { return robeValue; },
  };

  // 塔的五个窗光各归一个高度阈值： robe 走到那一层就点亮
  temple.tower.levelYs.forEach((y, i) => {
    const m = temple.tower.mats[i];
    m.p = pAt(y + 1.5);
    m.tint = new THREE.Color('#ffbe7c');
  });

  scene.add(group);
  api.setRobe(1);
  api.setLantern(1);
  return api;
}
