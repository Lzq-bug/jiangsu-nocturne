import * as THREE from 'three';
import { lit, rand, rr, M } from './kit.js';
import * as T from './textures.js';
import { FIELD, PEAKS, SHORE_X, SWAN, PEAR, TRAIL, MIRROR, LAKE, BOARDWALK } from './layout.js';

/* ============================================================ 地形
 * 东麓余脉：三峰排开，坡地缓降到镜湖。衲田铺在坡面上，
 * 所以地形必须是连续的软坡——田块是拼布，不是梯田埂。
 */

const smooth01 = (t) => t * t * (3 - 2 * t);
const exp2 = (v, k) => Math.exp(-v * v * k);

/** 镜湖与骆马湖的水面高程 */
export const WATER_Y = 0;
/** 天鹅湖在坡地上，自成一方水面 */
export const SWAN_Y = SWAN.y;

function hills(x, z) {
  let h = 0;
  for (const p of PEAKS) {
    const d = Math.hypot((x - p.x) / p.r, (z - p.z) / (p.r * 1.3));
    h += p.a / (1 + Math.pow(Math.max(0, d - 0.42) * 2.6, 3));
  }
  // 峰后向北延续的余脉
  h += 16 * exp2((x + 96) / 40, 1) * exp2((z - 40) / 90, 1);
  h += 12 * exp2((x + 90) / 34, 1) * exp2((z + 96) / 60, 1);
  return h;
}

/** 坡面：西头 34 m，缓降到 x=66 处入水 */
function slope(x) {
  const u = Math.min(1, Math.max(0, (66 - x) / 112));
  return -2 + 36 * smooth01(u);
}

export function terrainH(x, z) {
  let h = slope(x) + hills(x, z) * Math.min(1, Math.max(0, (SHORE_X - 6 - x) / 60));
  // 坡面上的软垄
  h += Math.sin(z * 0.052 + x * 0.026) * 1.5 + Math.sin(z * 0.118 - x * 0.05) * 0.75;
  h += Math.sin(x * 0.07 + z * 0.031) * 0.9;
  // 天鹅湖：切进坡里的一只碗
  const sd = Math.pow((x - SWAN.x) / SWAN.rx, 2) + Math.pow((z - SWAN.z) / SWAN.rz, 2);
  if (sd < 2.6) h -= 5.2 * Math.exp(-sd * 1.5);
  // 梨园洼地
  const pd = Math.pow((x - PEAR.x) / PEAR.rx, 2) + Math.pow((z - PEAR.z) / PEAR.rz, 2);
  if (pd < 2.2) h -= 2.2 * Math.exp(-pd * 1.3);
  // 镜湖向西探出的湖湾，把西岸留出缓滩
  const md = Math.pow((x - MIRROR.x) / MIRROR.halfW, 2) + Math.pow((z - MIRROR.z) / MIRROR.halfD, 2);
  if (md < 1.6) h -= 6 * Math.exp(-md * 1.1);
  return h;
}

export function slopeAt(x, z) {
  const e = 1.6;
  return new THREE.Vector2((terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e));
}
export const zoneAt = (z) => (z >= 42 ? 'yellow' : z >= -30 ? 'red' : 'violet');

/* ============================================================ 星空 */

export const MOON_DIR = new THREE.Vector3(-0.34, 0.22, 0.91).normalize();

const SKY_FS = `
  uniform float uTime; uniform float uFrost; uniform float uMoonPhase; uniform vec3 uMoon;
  varying vec3 vDir;
  float hash(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p,p.yzx+19.19); return fract(p.x*p.y*p.z); }
  void main(){
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.25, 1.0);
    vec3 col = mix(vec3(0.034,0.050,0.086), vec3(0.005,0.009,0.024), smoothstep(-0.05,0.75,up));
    // 地平一线：湖气冷、远处村镇的灯暖
    float low = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0),3.0);
    col += vec3(0.030,0.026,0.020) * low;
    col += vec3(0.050,0.030,0.014) * low * smoothstep(-0.1,0.8, d.x) * 0.8;

    // 银河斜过天顶
    float axis = dot(normalize(vec3(0.58,0.40,-0.71)), d);
    float band = exp(-pow(axis/0.19, 2.0));
    // 两档连续噪声，别用方格 hash：方格在掠射角上会铺成棋盘
    vec2 guv = vec2(atan(d.z, d.x)*2.6, asin(clamp(d.y,-1.0,1.0))*3.4);
    float grain = 0.5 + 0.3*sin(guv.x*3.1 + guv.y*1.7)*sin(guv.y*4.3 - guv.x*0.9)
                      + 0.2*sin(guv.x*9.7 - guv.y*2.1);
    vec2 buv = vec2(atan(d.z, d.x)*4.0, asin(clamp(d.y,-1.0,1.0))*5.0);
    float dust = 0.55 + 0.45*sin(buv.x*1.7)*sin(buv.y*2.3+1.1);
    col += vec3(0.055,0.062,0.092) * band * (0.30+0.80*grain) * dust * smoothstep(-0.02,0.55,up);
    col += vec3(0.026,0.020,0.036) * band * band;

    // 星点三档，亮星闪
    vec3 sp = floor(d*420.0);
    float s = hash(sp);
    float star = 0.0;
    if (s > 0.9958) star = pow((s-0.9958)/0.0042, 3.0) * (0.5+0.5*sin(uTime*2.3+s*44.0));
    vec3 sp2 = floor(d*250.0);
    float s2 = hash(sp2+7.3);
    if (s2 > 0.986) star += pow((s2-0.986)/0.014, 2.0)*0.30;
    col += star * mix(vec3(0.62,0.70,0.95), vec3(1.0,0.84,0.66), hash(sp+3.1)) * 2.4;

    // 月：低、小、有一层薄晕
    float md = max(0.0, dot(d, normalize(uMoon)));
    col += vec3(0.92,0.94,1.0) * pow(md, 1100.0) * 5.5 * uMoonPhase;
    col += vec3(0.22,0.28,0.42) * pow(md, 30.0) * 0.55 * uMoonPhase;
    col += vec3(0.10,0.13,0.20) * pow(md, 5.0) * 0.30 * uMoonPhase;

    float haze = pow(clamp(1.0-abs(d.y)*1.8,0.0,1.0), 2.7);
    col = mix(col, vec3(0.048,0.058,0.080) + vec3(0.016,0.012,0.006), uFrost*haze*0.8);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
  }`;

function buildSky(scene) {
  const uni = {
    uTime: { value: 0 }, uFrost: { value: 1 }, uMoonPhase: { value: 1 }, uMoon: { value: MOON_DIR.clone() },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(780, 42, 26),
    new THREE.ShaderMaterial({
      uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: SKY_FS,
    }),
  );
  mesh.customProgramCacheKey = () => 'santai-sky';
  mesh.renderOrder = -2;
  scene.add(mesh);

  // 实体亮星交给辉光通道吃，穹顶 shader 里的星点太小
  const N = 300;
  const pos = new Float32Array(N * 3); const siz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2;
    const y = Math.pow(Math.max(0.05, (u + 1) / 2), 1.45) * 0.97;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos[i * 3] = Math.cos(a) * r * 720; pos[i * 3 + 1] = y * 720; pos[i * 3 + 2] = Math.sin(a) * r * 720;
    siz[i] = rr(0.9, 3.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: T.softGlow('206,226,255', 0.04) } },
    vertexShader: `
      attribute float size; uniform float uTime; varying float vTw;
      void main(){
        vTw = 0.6+0.4*sin(uTime*1.6+position.x*0.03+position.z*0.05);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(size * (260.0/-mv.z), 0.6, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying float vTw;
      void main(){ vec4 m = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.78,0.85,1.0)*(0.55+vTw*0.4), m.a*vTw*0.7); }`,
  });
  const stars = new THREE.Points(g, mat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);
  return { mesh, stars, uni };
}

/* ============================================================ 地面
 * 一张按 terrainH 抬起来的大网格：坡色随高程与色带走，水下留一段泥滩。
 * 花田的田块、树、栈道都坐在这张面上，所以它必须真的存在。
 */
function buildTerrain(scene) {
  const x0 = -136, x1 = 132, z0 = -206, z1 = 226, step = 1.9;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const pos = [], uv = [], col = [], idx = [];
  const cGrass = new THREE.Color('#26351f'), cSoil = new THREE.Color('#3a3223'),
    cSilt = new THREE.Color('#1d2530'), cSand = new THREE.Color('#4b4436'), cRock = new THREE.Color('#2c2f36');
  const zoneTint = { yellow: new THREE.Color('#5a4a1e'), red: new THREE.Color('#5a2a22'), violet: new THREE.Color('#3a2c52') };
  const tmp = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const h = terrainH(x, z);
      pos.push(x, h, z);
      uv.push(x / 9, z / 9);
      const inField = x > FIELD.x0 - 4 && x < FIELD.x1 + 2 && z > FIELD.z0 - 4 && z < FIELD.z1 + 4;
      if (h < 0.4) tmp.copy(cSilt);
      else if (h < 2.4) tmp.copy(cSand);
      else if (inField) tmp.copy(cSoil).lerp(zoneTint[zoneAt(z)], 0.34);
      else if (h > 40) tmp.copy(cRock);
      else tmp.copy(cGrass);
      // 同一级高程上留一点斑驳，别像一块纯色塑料
      const n = 0.82 + 0.3 * Math.abs(Math.sin(x * 0.37) * Math.cos(z * 0.29));
      tmp.multiplyScalar(n);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.98, metalness: 0,
    map: T.grassNight(), emissive: new THREE.Color('#070c0a'), emissiveIntensity: 0.5,
  });
  m.map.repeat.set(1, 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

/* ============================================================ 远山 */
function ridges(scene) {
  const grp = new THREE.Group();
  for (const L of [
    { d: 430, h: 54, y: 2, c: '#0a1322', n: 44 },
    { d: 580, h: 82, y: -2, c: '#060c17', n: 34 },
  ]) {
    const top = [];
    for (let i = 0; i <= L.n; i++) {
      const a = -Math.PI * 0.68 + (i / L.n) * Math.PI * 1.36;
      const r = L.d * (1 + 0.07 * Math.sin(i * 2.6 + L.d));
      const hh = L.h * (0.38 + 0.5 * Math.abs(Math.sin(i * 1.37 + L.d * 0.01)) + 0.22 * Math.sin(i * 0.63));
      top.push([Math.sin(a) * r, L.y + hh, Math.cos(a) * r]);
    }
    const pos = [];
    for (const t of top) pos.push(t[0], t[1], t[2]);
    for (let i = top.length - 1; i >= 0; i--) pos.push(top[i][0], L.y - 46, top[i][2]);
    const idx = [];
    for (let i = 0; i < top.length - 1; i++) {
      idx.push(i, i + 1, top.length + i, i + 1, top.length + i + 1, top.length + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, lit(L.c, { rough: 1, emissive: '#040912', ei: 0.5 }));
    m.frustumCulled = false;
    grp.add(m);
  }
  scene.add(grp);
  return grp;
}

/* ============================================================ 林木
 * 园子前身是 1958 年的嶂山林场，森林覆盖率 98%。树种口径不写死，
 * 夜里只读剪影：针叶一团、阔叶一团、梨园一片白。
 */
function buildTrees(scene) {
  const grp = new THREE.Group();
  const sway = (mat, amp) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      mat.userData.shader = sh;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float ph = instanceMatrix[3][0]*0.7 + instanceMatrix[3][2]*0.5;
        transformed.x += sin(uTime*0.85 + ph) * ${amp.toFixed(4)} * max(0.0, transformed.y);
        transformed.z += cos(uTime*0.66 + ph*1.3) * ${(amp * 0.8).toFixed(4)} * max(0.0, transformed.y);`);
    };
    mat.customProgramCacheKey = () => `sway-${amp}`;
    return mat;
  };
  const needle = sway(lit('#1c3026', { rough: 0.98, emissive: '#06100a', ei: 0.45, side: THREE.DoubleSide }), 0.014);
  const broad = sway(lit('#243b2c', { rough: 0.97, emissive: '#08130c', ei: 0.4, side: THREE.DoubleSide }), 0.02);
  const pear = sway(lit('#6b757c', { map: T.blossomPuff(), rough: 0.98, emissive: '#2b3238', ei: 0.5, side: THREE.DoubleSide }), 0.02);
  const trunkMat = sway(lit('#33261d', { map: T.wood('#241a13', '#120c08'), rough: 0.95 }), 0.006);

  const cone = new THREE.ConeGeometry(3.2, 9.2, 8); cone.translate(0, 12.2, 0);
  const coneT = new THREE.CylinderGeometry(0.16, 0.36, 9, 6); coneT.translate(0, 4.5, 0);
  const ball = new THREE.SphereGeometry(4.2, 9, 7); ball.scale(1.1, 0.78, 1.1); ball.translate(0, 7.2, 0);
  const ballT = new THREE.CylinderGeometry(0.2, 0.42, 5.4, 6); ballT.translate(0, 2.7, 0);
  const d = new THREE.Object3D();

  const near = (x, z, list, pad) => list.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + pad);
  const keepOut = [
    [SWAN.x, SWAN.z, Math.max(SWAN.rx, SWAN.rz) * 0.9],
    [MIRROR.x, MIRROR.z, 60], [LAKE.x, LAKE.z, 200],
  ];

  // —— 林场：峰体与坡面
  const forest = [];
  for (let i = 0; i < 1100; i++) {
    const x = rr(-104, 52), z = rr(-126, 132);
    if (near(x, z, keepOut, 4)) continue;
    if (x > -46 && x < 44 && z > FIELD.z0 && z < FIELD.z1) continue;      // 衲田留白
    if (Math.abs(x - TRAIL.x) < TRAIL.half + 2 && z > TRAIL.z1) continue; // 步道留白
    if (x > SHORE_X - 8) continue;
    if (hills(x, z) + 0 < 6 && x > -30 && rand() < 0.6) continue;
    forest.push([x, z, rr(0.62, 1.2), rand()]);
  }
  const imC = new THREE.InstancedMesh(cone, needle, forest.length);
  const imCT = new THREE.InstancedMesh(coneT, trunkMat, forest.length);
  const imB = new THREE.InstancedMesh(ball, broad, forest.length);
  const imBT = new THREE.InstancedMesh(ballT, trunkMat, forest.length);
  let ci = 0, bi = 0;
  for (const [x, z, s, r] of forest) {
    d.position.set(x, terrainH(x, z) - 0.5, z);
    d.rotation.set(0, rr(0, 6.28), 0);
    d.scale.set(s * rr(0.85, 1.15), s * rr(0.8, 1.3), s * rr(0.85, 1.15));
    d.updateMatrix();
    if (r < 0.62) { imC.setMatrixAt(ci, d.matrix); imCT.setMatrixAt(ci, d.matrix); ci++; }
    else { imB.setMatrixAt(bi, d.matrix); imBT.setMatrixAt(bi, d.matrix); bi++; }
  }
  imC.count = imCT.count = ci; imB.count = imBT.count = bi;
  grp.add(imC, imCT, imB, imBT);

  // —— 梨园：梨兰会那 500 余亩，压着一层二月兰
  const pears = [];
  for (let i = 0; i < 150; i++) {
    const a = rand() * 6.28, rr2 = Math.sqrt(rand());
    const x = PEAR.x + Math.cos(a) * PEAR.rx * rr2;
    const z = PEAR.z + Math.sin(a) * PEAR.rz * rr2;
    if (x > SHORE_X - 10) continue;
    pears.push([x, z, rr(0.7, 1.05)]);
  }
  const pGeo = new THREE.SphereGeometry(3.6, 9, 7); pGeo.scale(1.15, 0.8, 1.15); pGeo.translate(0, 6.2, 0);
  const pT = new THREE.CylinderGeometry(0.18, 0.34, 4.6, 6); pT.translate(0, 2.3, 0);
  const imP = new THREE.InstancedMesh(pGeo, pear, pears.length);
  const imPT = new THREE.InstancedMesh(pT, trunkMat, pears.length);
  pears.forEach(([x, z, s], i) => {
    d.position.set(x, terrainH(x, z) - 0.3, z);
    d.rotation.set(0, rr(0, 6.28), 0); d.scale.setScalar(s);
    d.updateMatrix(); imP.setMatrixAt(i, d.matrix); imPT.setMatrixAt(i, d.matrix);
  });
  grp.add(imP, imPT);

  // —— 湖岸与栈道边的疏林
  const edge = [];
  // 湖岸留空：夜里这条步道要看水，树要退到坡后
  for (let i = 0; i < 40; i++) {
    const x = SHORE_X - 22 - rand() * 12;
    const z = rr(-110, 120);
    edge.push([x, z, rr(0.8, 1.25)]);
  }
  for (const [bx, bz] of BOARDWALK) {
    for (let k = 0; k < 6; k++) edge.push([bx + rr(-11, -3), bz + rr(-9, 9), rr(0.8, 1.2)]);
  }
  const imE = new THREE.InstancedMesh(ball, broad, edge.length);
  const imET = new THREE.InstancedMesh(ballT, trunkMat, edge.length);
  edge.forEach(([x, z, s], i) => {
    d.position.set(x, terrainH(x, z) - 0.4, z);
    d.rotation.set(0, rr(0, 6.28), 0); d.scale.setScalar(s);
    d.updateMatrix(); imE.setMatrixAt(i, d.matrix); imET.setMatrixAt(i, d.matrix);
  });
  grp.add(imE, imET);

  scene.add(grp);
  const roosts = [];
  for (let i = 0; i < 30; i++) {
    const x = rr(-96, -40), z = rr(-100, 100);
    roosts.push(new THREE.Vector3(x, terrainH(x, z) + rr(8, 16), z));
  }
  const mats = [needle, broad, pear, trunkMat];
  return {
    group: grp, roosts, pears: pears.length,
    update(t) {
      for (const m of mats) if (m.userData.shader) m.userData.shader.uniforms.uTime.value = t;
    },
  };
}

/* ============================================================ 雾 / 萤火 / 归鸟 */

function groundMist(scene) {
  const grp = new THREE.Group();
  const mk = () => {
    const m = new THREE.MeshBasicMaterial({
      map: T.mistStreaks(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, color: 0x9db6cc,
    });
    m.toneMapped = false;
    return m;
  };
  // flat：贴地的水平雾（湖面）；card：竖着的雾片，人走在栈道上才穿得进去
  const bands = [
    { n: 14, x0: SHORE_X - 16, x1: 250, y: 2.6, w: 300, h: 120, o: [0.04, 0.11], z0: -190, z1: 210, flat: true },
    { n: 34, x0: FIELD.x0 - 6, x1: FIELD.x1, y: 3.4, w: 44, h: 9, o: [0.03, 0.09], z0: FIELD.z0, z1: FIELD.z1 },
    { n: 20, x0: -54, x1: -26, y: 3.0, w: 22, h: 8, o: [0.09, 0.2], z0: -70, z1: 84 },
    { n: 9, x0: SWAN.x - 15, x1: SWAN.x + 15, y: 1.4, w: 24, h: 6, o: [0.08, 0.18], z0: SWAN.z - 13, z1: SWAN.z + 13 },
  ];
  for (const B of bands) {
    for (let i = 0; i < B.n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), mk());
      m.material.opacity = rr(B.o[0], B.o[1]);
      const x = rr(B.x0, B.x1), z = rr(B.z0, B.z1);
      m.position.set(x, B.flat ? terrainH(x, z) + B.y : terrainH(x, z) + B.h * 0.5, z);
      if (B.flat) m.rotation.set(-Math.PI / 2, 0, rr(0, 6.28));
      else m.rotation.set(0, rr(0, 6.28), 0);
      m.renderOrder = 6;
      m.userData.phase = rr(0, 6.28);
      grp.add(m);
    }
  }
  scene.add(grp);
  return {
    group: grp,
    set(on) { grp.visible = on; },
    update(t) {
      for (const m of grp.children) {
        m.material.map.offset.x = (t * 0.0035 + m.userData.phase * 0.1) % 1;
        m.position.y += Math.sin(t * 0.24 + m.userData.phase) * 0.0012;
      }
    },
  };
}

function fireflies(scene) {
  const N = 300;
  const pos = new Float32Array(N * 3); const ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = rr(FIELD.x0, FIELD.x1 + 6), z = rr(FIELD.z0, FIELD.z1);
    pos[i * 3] = x; pos[i * 3 + 1] = terrainH(x, z) + rr(0.5, 3.2); pos[i * 3 + 2] = z;
    ph[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const uni = { uTime: { value: 0 }, uBurst: { value: 0 }, uMap: { value: T.softGlow('255,236,150', 0.02) } };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute float phase; uniform float uTime; uniform float uBurst; varying float vB;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*0.65+phase)*1.9; p.z += cos(uTime*0.5+phase*1.7)*1.9;
        p.y += sin(uTime*1.05+phase*2.3)*0.9 + uBurst*sin(phase*3.1+uTime*3.4)*2.6;
        vB = 0.24+0.76*pow(max(0.0,sin(uTime*1.8+phase*4.0)),3.0);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = clamp((2.4 + 2.2*vB) * (60.0 / -mv.z), 1.0, 20.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying float vB;
      void main(){ vec4 m = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.93,0.58)*(0.5+0.3*vB), m.a*vB*0.45); }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { mesh: pts, uni, set(on) { pts.visible = on; } };
}

function birds(scene, trees) {
  const N = 36;
  const body = new THREE.ConeGeometry(0.36, 1.8, 5); body.rotateX(Math.PI / 2);
  const wing = new THREE.PlaneGeometry(2.6, 0.62); wing.rotateY(Math.PI / 2);
  const mat = lit('#0b1019', { rough: 1, side: THREE.DoubleSide, emissive: '#04070d', ei: 0.6 });
  const grp = new THREE.Group();
  const mk = new THREE.InstancedMesh(body, mat, N);
  const mw = new THREE.InstancedMesh(wing, mat, N * 2);
  grp.add(mk, mw);
  scene.add(grp);
  const d = new THREE.Object3D();
  const flock = trees.roosts.concat(trees.roosts).map((r, i) => ({
    a: rand() * 6.28, r: rr(5, 24), y: r.y + rr(-2, 9) + (i % 2) * 3,
    home: r.clone(), sp: rr(0.22, 0.4), startle: 0,
  }));
  return {
    group: grp,
    set(on) { grp.visible = on; },
    startle(x, z) {
      for (const b of flock) b.startle = Math.max(b.startle, 1 / (1 + Math.hypot(b.home.x - x, b.home.z - z) / 90));
    },
    update(t, dt) {
      let wi = 0;
      for (let i = 0; i < flock.length; i++) {
        const b = flock[i];
        b.startle = Math.max(0, b.startle - dt * 0.22);
        b.a += dt * b.sp * (1 + b.startle * 2.4);
        const rad = b.r * (1 - b.startle * 0.2);
        const x = b.home.x + Math.cos(b.a) * rad;
        const z = b.home.z + Math.sin(b.a) * rad * 1.3;
        const y = b.y + Math.sin(t * 0.6 + b.a * 2) * 1.7 + b.startle * 10 * Math.abs(Math.sin(t * 0.5 + i));
        d.position.set(x, y, z);
        d.rotation.set(0, -b.a + Math.PI / 2, Math.sin(t * 8 + i) * 0.1);
        d.scale.setScalar(1 + b.startle * 0.3);
        d.updateMatrix(); mk.setMatrixAt(i, d.matrix);
        for (const s of [-1, 1]) {
          d.rotation.set(0, -b.a + Math.PI / 2, s * (0.45 + 0.6 * Math.sin(t * 9.5 + i * 1.7)));
          d.updateMatrix(); mw.setMatrixAt(wi++, d.matrix);
        }
      }
      mk.instanceMatrix.needsUpdate = true;
      mw.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ============================================================ 装配 */

export function buildEnvironment(scene) {
  scene.fog = new THREE.FogExp2(0x0a1120, 0.0021);
  const sky = buildSky(scene);
  buildTerrain(scene);
  ridges(scene);
  const trees = buildTrees(scene);
  const mist = groundMist(scene);
  const flies = fireflies(scene);
  const flock = birds(scene, trees);

  const hemi = new THREE.HemisphereLight(0x3a5378, 0x0e1614, 0.95);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc6daff, 1.45);
  moon.position.copy(MOON_DIR).multiplyScalar(300);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -175, right: 175, top: 175, bottom: -175, near: 40, far: 640 });
  moon.shadow.bias = -0.0007;
  moon.shadow.normalBias = 0.6;
  scene.add(moon, moon.target);

  // 四盏跟着机位走的暖光，见 main.js 的 followLights
  const fill = [
    new THREE.PointLight(0xff8a4a, 46, 140, 2),
    new THREE.PointLight(0xffd27a, 34, 120, 2),
    new THREE.PointLight(0x8fa8ff, 28, 150, 2),
    new THREE.PointLight(0xffb060, 26, 96, 2),
  ];
  fill[0].position.set(2, 26, 40);
  fill[1].position.set(-56, 46, 6);
  fill[2].position.set(70, 14, 20);
  fill[3].position.set(18, 12, -70);
  for (const f of fill) scene.add(f);

  return {
    uni: sky.uni,
    sky, trees, mist, flies, birds: flock,
    lights: [moon, ...fill],
    hemi,
    setMist(on) { mist.set(on); sky.uni.uFrost.value = on ? 1 : 0; },
    setBirds(on) { flock.set(on); flies.set(on); },
    startle(x, z) { flock.startle(x, z); flies.uni.uBurst.value = 1; },
    update(t, dt) {
      sky.uni.uTime.value = t;
      sky.stars.material.uniforms.uTime.value = t;
      flies.uni.uTime.value = t;
      flies.uni.uBurst.value = Math.max(0, flies.uni.uBurst.value - dt * 0.55);
      mist.update(t);
      flock.update(t, dt);
      trees.update(t);
    },
  };
}
