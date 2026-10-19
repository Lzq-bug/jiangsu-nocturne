import * as THREE from 'three';
import { M, rand, rr, glow } from './kit.js';
import * as T from './textures.js';
import { DECK, POND } from './data.js';
import { pondPoints } from './architecture.js';

const D = DECK;

/** 低月挂在东南：从池南压过来，北岸的屋脊、粉墙和一整条水面都吃到侧光 */
export const MOON_DIR = new THREE.Vector3(0.34, 0.24, 0.91).normalize();

/* ------------------------------------------------------------------ 天与月 */
function skyDome() {
  const uni = {
    uTime: { value: 0 },
    uMoon: { value: MOON_DIR.clone() },
    uGlow: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uMoon; uniform float uGlow;
      varying vec3 vDir;
      void main(){
        float up = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.014,0.020,0.038), vec3(0.030,0.040,0.072), smoothstep(0.42,0.95,up));
        // 城里的气体在东南一线，园墙拦不住它
        float haze = pow(clamp(1.0-abs(vDir.y)*2.2,0.0,1.0), 2.6);
        col += vec3(0.070,0.046,0.028) * haze * uGlow;
        // 月晕：低月的光在薄云里散开一圈
        float md = max(0.0, dot(normalize(vDir), uMoon));
        col += vec3(0.17,0.20,0.29) * pow(md, 70.0) * 0.5;
        col += vec3(0.05,0.06,0.10) * pow(md, 9.0) * 0.34;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), mat);
  mesh.name = 'sky';
  return { mesh, uni };
}

function stars() {
  const N = 620;
  const pos = new Float32Array(N * 3), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2, e = Math.acos(rr(0.06, 0.98));
    const r = 380;
    pos[i * 3] = Math.sin(e) * Math.cos(a) * r;
    pos[i * 3 + 1] = Math.cos(e) * r * 0.9 + 20;
    pos[i * 3 + 2] = Math.sin(e) * Math.sin(a) * r;
    sz[i] = rr(1.2, 3.4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const uni = { uTime: { value: 0 }, uBright: { value: 1 }, uMap: { value: T.softGlow('210,226,255', 0.05) } };
  const m = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float size; uniform float uTime; uniform float uBright; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vA = uBright * (0.55 + 0.45*sin(uTime*1.6 + position.x*0.07 + position.z*0.05));
        gl_PointSize = size * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying float vA;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.82,0.87,1.0) * vA, t.a * vA);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni };
}

function moon() {
  const g = new THREE.Group();
  const at = MOON_DIR.clone().multiplyScalar(300);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(6.2, 24, 18), glow('#f6f2e2', 2.4));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('236,240,255', 0.16), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  halo.scale.set(66, 66, 1);
  g.add(disc, halo);
  g.position.copy(at);
  return g;
}

function clouds() {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    map: T.cloudPuff(), transparent: true, depthWrite: false, opacity: 0.3, fog: false, color: 0x6f86ad,
  });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(mat);
    const a = rr(0, Math.PI * 2), e = rr(0.18, 0.62);
    s.position.set(Math.cos(a) * rr(120, 300), 60 + e * 190, Math.sin(a) * rr(120, 300));
    s.scale.set(rr(150, 300), rr(48, 90), 1);
    s.userData.drift = rr(0.6, 2.0);
    g.add(s);
  }
  g.name = 'clouds';
  return g;
}

/* ------------------------------------------------------------------ 花木 */
/** 一株树：干 + 若干冠片。kind 决定颜色与形制，全部用插片，夜里只看剪影 */
function tree({ x, z, h = 5.2, r = 2.4, kind = 'gui', lean = 0 }) {
  const g = new THREE.Group();
  const palette = {
    gui: ['#3f5340', '#4d6247'],           // 桂：圆厚深绿
    bai: ['#37504a', '#2b403a'],           // 桧柏：青黑塔形
    song: ['#4a6350', '#5d7461'],          // 白皮松：灰绿
    mei: ['#5b4a44', '#6d5b52'],           // 梅：虬枝疏影
    yulan: ['#4a5a4c', '#5c6b57'],         // 玉兰：高枝杯形
    zhu: ['#3c5747', '#4d6a58'],           // 竹：一丛瘦片
    chan: ['#46583f', '#57694a'],
  };
  const [c0, c1] = palette[kind] || palette.gui;
  const trunkMat = kind === 'song' ? M.stele : M.woodDark;
  const trunkH = h * (kind === 'zhu' ? 0.5 : 0.62);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * (kind === 'bai' ? 2.4 : 1), 0.22 * (kind === 'bai' ? 2.2 : 1.2), trunkH, 7),
    trunkMat,
  );
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);

  const mats = [
    new THREE.MeshBasicMaterial({ map: T.leafBlob(c0), transparent: true, alphaTest: 0.42, side: THREE.DoubleSide, color: 0xdfe6f2 }),
    new THREE.MeshBasicMaterial({ map: T.leafBlob(c1), transparent: true, alphaTest: 0.42, side: THREE.DoubleSide, color: 0xcfd8e8 }),
  ];
  for (const m of mats) m.toneMapped = false;
  const cards = [];
  const blobs = kind === 'bai' ? 9 : kind === 'zhu' ? 7 : 6;
  for (let i = 0; i < blobs; i++) {
    const pl = new THREE.PlaneGeometry(r * rr(1.1, 1.7), r * rr(0.8, 1.2));
    const a = (i / blobs) * Math.PI * 2 + rr(-0.4, 0.4);
    const rad = r * rr(0.15, 0.62);
    const y = trunkH * rr(0.72, 1.05) + (kind === 'bai' ? i * h * 0.055 : rr(-0.4, 0.5));
    const m = new THREE.Mesh(pl, mats[i % 2]);
    m.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    m.rotation.set(rr(-0.35, 0.35), a + Math.PI / 2, rr(-0.25, 0.25));
    m.castShadow = true;
    cards.push(m);
  }
  g.add(...cards);
  // 塔形的桧柏再加一层轮廓，古柏要的就是这一柱黑
  if (kind === 'bai') {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, h * 1.05, 8, 1, true), mats[0]);
    sp.position.y = h * 0.5;
    g.add(sp);
  }
  // 花：梅花与玉兰在夜里靠灯照出白点，桂与芍药另有其时
  if (kind === 'mei' || kind === 'yulan') {
    const fm = new THREE.SpriteMaterial({
      map: T.blossom(kind === 'mei' ? '#f7eef2' : '#fbf6ea'), transparent: true, depthWrite: false, fog: true,
    });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(fm);
      s.position.set(rr(-r, r) * 0.8, trunkH + rr(-0.6, r * 0.9), rr(-r, r) * 0.8);
      s.scale.setScalar(rr(0.5, 1.25));
      g.add(s);
    }
  }
  g.position.set(x, D, z);
  g.userData.canvases = cards;
  return g;
}

/** 芍药圃与花畦：低矮的叶丛加一层花头 */
function flowerBed([cx, cz], { w = 4.2, d = 3.0, count = 34, color = '#d8688a' } = {}) {
  const g = new THREE.Group();
  const leaf = new THREE.MeshBasicMaterial({
    map: T.leafBlob('#35543c'), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xd6e0d8,
  });
  leaf.toneMapped = false;
  const tufts = [];
  for (let i = 0; i < count; i++) {
    const s = rr(0.5, 0.95);
    const pl = new THREE.PlaneGeometry(s, s * 0.8);
    const m = new THREE.Mesh(pl, leaf);
    m.position.set(cx + rr(-w / 2, w / 2), D + 0.28 + s * 0.3, cz + rr(-d / 2, d / 2));
    m.rotation.y = rr(0, Math.PI);
    tufts.push(m);
  }
  g.add(...tufts);
  const fm = new THREE.SpriteMaterial({ map: T.blossom(color), transparent: true, depthWrite: false });
  const heads = [];
  for (let i = 0; i < Math.round(count * 0.55); i++) {
    const s = new THREE.Sprite(fm);
    s.position.set(cx + rr(-w / 2, w / 2), D + rr(0.45, 0.85), cz + rr(-d / 2, d / 2));
    s.scale.setScalar(rr(0.34, 0.72));
    heads.push(s);
  }
  g.add(...heads);
  g.name = 'flowerbed';
  return g;
}

/** 残荷：池里几片贴水的叶与一两支枯蓬 */
function lotus() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: T.leafBlob('#2f4038'), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0x7d9184 });
  mat.toneMapped = false;
  const pts = pondPoints(0.82);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, k = Math.sqrt(rand());
    const x = Math.cos(a) * POND.rx * 0.86 * k, z = Math.sin(a) * POND.rz * 0.86 * k;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.1)) continue;
    const s = rr(0.45, 1.05);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(s, 9), mat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rr(0, Math.PI);
    pad.position.set(x, 0.05 + rr(0, 0.05), z);
    g.add(pad);
  }
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * POND.rx * rr(0.45, 0.8), z = Math.sin(a) * POND.rz * rr(0.45, 0.8);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, rr(0.5, 1.1), 5), M.woodDark);
    stalk.position.set(x, 0.5, z);
    stalk.rotation.z = rr(-0.2, 0.2);
    g.add(stalk);
  }
  g.name = 'lotus';
  return g;
}

/* ------------------------------------------------------------------ 夜气 */
/** 贴池的一层薄雾：只在水面上三五寸，越往岸边越化开 */
function nightMist(scene) {
  const uni = { uTime: { value: 0 }, uOpacity: { value: 0.5 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vW;
      void main(){
        float a = sin(vW.x*0.5 - uTime*0.06) * 0.5 + 0.5;
        float b = sin(vW.z*0.42 + uTime*0.05) * 0.5 + 0.5;
        float edge = smoothstep(0.0,0.3,vUv.y) * smoothstep(1.0,0.65,vUv.y);
        // 池心才起雾，靠岸就散
        float shore = 1.0 - smoothstep(0.45, 1.0, length(vec2(vW.x/14.4, vW.z/10.2)));
        float v = uOpacity * edge * shore * (0.05 + 0.11*a*b);
        gl_FragColor = vec4(vec3(0.60,0.70,0.84), v);
      }`,
  });
  const grp = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(26 + i * 3, 18 + i * 2.4), mat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(rr(-2, 2), 0.18 + i * 0.24, rr(-1, 2));
    p.rotation.z = rr(0, Math.PI);
    grp.add(p);
  }
  scene.add(grp);
  return { grp, uni };
}

/* ------------------------------------------------------------------ 组装 */
export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), clouds());

  // 花木按点位配：古柏与白皮松在看松读画轩前，桂在小山丛桂轩，梅竹在竹外一枝轩，
  // 玉兰在集虚斋与濯缨水阁东侧，芍药在殿春簃小院
  const trees = new THREE.Group();
  trees.name = 'trees';
  const spec = [
    // 看松读画轩前西北角的古桧与白皮松，是北岸最老的两株
    [-12.8, -12.4, 10.6, 2.6, 'bai'], [-12.2, -8.2, 8.2, 2.1, 'song'],
    // 桂：小山丛桂轩前
    [-16.2, 16.0, 6.6, 2.0, 'gui'], [-16.6, 20.2, 5.8, 1.8, 'gui'], [-5.6, 20.6, 6.0, 1.8, 'gui'],
    // 玉兰：集虚斋东北、濯缨水阁东侧
    [12.6, -12.4, 7.4, 2.0, 'yulan'], [13.4, -15.2, 6.2, 1.7, 'yulan'], [8.2, 15.6, 6.6, 1.8, 'yulan'],
    // 梅：池西北与半亭旁
    [-10.4, 9.2, 5.6, 1.7, 'mei'], [-21.4, -8.0, 5.0, 1.5, 'mei'], [-23.2, -10.8, 4.6, 1.4, 'mei'],
    // 竹：三处弄口与墙脚
    [-24.6, 6.0, 5.4, 1.6, 'zhu'], [-16.4, -4.6, 5.0, 1.5, 'zhu'], [12.4, 18.6, 5.6, 1.6, 'zhu'],
    // 边角杂树与宅院
    [-22.4, 12.6, 6.0, 1.8, 'chan'], [14.2, 12.2, 5.4, 1.6, 'chan'],
    [25.0, 29.6, 6.0, 1.8, 'gui'], [17.4, 44.4, 6.2, 1.8, 'gui'], [-2.0, 20.6, 5.6, 1.7, 'chan'],
  ];
  for (const [x, z, h, r, kind] of spec) trees.add(tree({ x, z, h, r, kind }));
  scene.add(trees);

  scene.add(flowerBed([-14.6, -8.6], { w: 4.0, d: 2.8, count: 30, color: '#e07a9c' }));
  scene.add(flowerBed([-19.0, -6.2], { w: 2.6, d: 1.8, count: 16, color: '#f2b8cc' }));
  scene.add(lotus());

  const mist = nightMist(scene);

  const hemi = new THREE.HemisphereLight(0x4d6fa0, 0x1c2318, 1.55);
  const moonLight = new THREE.DirectionalLight(0xcfe0ff, 2.9);
  moonLight.position.copy(MOON_DIR).multiplyScalar(170);
  moonLight.target.position.set(0, 0, 14);
  scene.add(moonLight.target);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -52; sc.right = 52; sc.top = 62; sc.bottom = -46; sc.near = 90; sc.far = 340;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.35;
  // 城里反弹过来的暖光：只负责把粉墙从黑的里拎出来
  const townBounce = new THREE.DirectionalLight(0xffc98c, 0.55);
  townBounce.position.set(70, 50, 120);
  const ambient = new THREE.AmbientLight(0x2b3752, 0.34);
  scene.add(hemi, moonLight, townBounce, ambient);

  // 园中固定暖光：门厅、大厅、北岸三厅、水阁、殿春簃
  const fixedSpots = [
    [[21, D + 3.4, 45.8], 0xffc07a, 54, 30],
    [[21, D + 3.6, 34.4], 0xffca8a, 77, 34],
    [[21, D + 4.2, 23.4], 0xffb877, 54, 30],
    [[21, D + 4.0, 13.8], 0xffc48a, 50, 28],
    [[6.5, D + 3.6, -11.6], 0xffd2a0, 68, 32],
    [[-3.5, D + 4.0, -12.0], 0xffc98c, 72, 34],
    [[2.0, D + 3.2, 10.6], 0xffbb7a, 81, 34],
    [[-19.4, D + 3.0, -12.0], 0xffd9ab, 59, 26],
    [[-9.0, D + 3.4, 13.8], 0xffcb92, 63, 30],
    [[12.4, D + 2.4, 8.6], 0xffa862, 32, 16],
  ];
  const lights = fixedSpots.map(([p, color, intensity, dist]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  // 开戏时跟着点位走的追光（写意：只用一盏暖点光，不做真追光设备）
  const stage = new THREE.PointLight(0xffe0a8, 0, 26, 2);
  stage.position.set(2, D + 3, 12);
  scene.add(stage);

  scene.fog = new THREE.FogExp2(0x0d1725, 0.0092);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    trees,
    lights,
    stageLight: stage,
    setStarBright(v) { star.uni.uBright.value = v; },
    setMist(v) { mist.grp.visible = v; },
    setGlow(v) { sky.uni.uGlow.value = v; },
    declutter(camPos) {
      for (const t of trees.children) {
        const far = t.position.distanceTo(camPos) > 3.4;
        for (const c of t.userData.canvases || []) c.visible = far;
      }
    },
    update(t, dt) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      mist.uni.uTime.value = t;
    },
  };
}
