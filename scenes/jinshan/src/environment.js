import * as THREE from 'three';
import { lit, rand, rr, glow } from './kit.js';
import * as T from './textures.js';
import { HILL, PADS, NORTH_SHORE_Z, SOUTH_SHORE_Z, WEST_SHORE_X, TOWER, POOL, AXIS, FAR, CAVES, PIER } from './layout.js';

/* ============================================================ 地形
 * 金山是嵌在镇江城内的一方独立小山丘，海拔 43.7 m，楼殿把它整个包住。
 * 北与西原是大江（金山旧在江心，清代涨沙才连南岸），南面如今是金山湖。
 * 台基（PADS）把殿宇落点抹平，所以山上看到的是一级一级人工的坪，而不是软坡。
 */

const smooth01 = (t) => t * t * (3 - 2 * t);
const exp2 = (v, k) => Math.exp(-v * v * k);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** 江面与湖面都定在 y=0 */
export const WATER_Y = 0;
export const POOL_Y = POOL.y;

function knob(x, z) {
  const d = Math.hypot((x - HILL.x) / HILL.rx, (z - HILL.z) / HILL.rz);
  // 顶部留一段坪，坡面在中段最陡，到山脚又放平入水
  let h = HILL.top * (1 - smooth01(clamp01((d - 0.34) / 0.78)));
  // 西北峰：慈寿塔立的那一处肩
  h += 5.4 * exp2((d - 0.52) * 1.5, 1) * (z < -8 ? 1 : 0.25);
  // 东南延脉：往西津渡与云台山方向去的那条脊
  h += 13 * exp2((x - 46) / 30, 1) * exp2((z - 26) / 34, 1);
  h += 9 * exp2((x - 66) / 26, 1) * exp2((z - 40) / 40, 1);
  return h;
}

/** 台基抹平：越靠近某个坪，越听人工高程的 */
function padBlend(x, z, h) {
  let acc = 0, w = 0;
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    if (d > 2.2) continue;
    const k = exp2(Math.max(0, d - 0.52) * 1.35, 1.15);
    acc += p.y * k; w += k;
  }
  if (w <= 0.02) return h;
  const s = 1 - Math.exp(-w * 1.5);
  return h * (1 - s) + (acc / w) * s;
}

export function terrainH(x, z) {
  let h = padBlend(x, z, knob(x, z));
  // 崖面与蹬道的碎坡：振幅压小，寺裹山读的是体量不是褶皱
  h += Math.sin(z * 0.086 + x * 0.052) * 0.85 + Math.sin(x * 0.13 - z * 0.06) * 0.5;
  h += Math.sin(z * 0.021 - 1.2) * Math.cos(x * 0.017) * 1.6;
  // 塔影潭：崖脚下一方小水
  const pd = Math.pow((x - POOL.x) / POOL.rx, 2) + Math.pow((z - POOL.z) / POOL.rz, 2);
  if (pd < 3.2) h -= 6.4 * Math.exp(-pd * 1.35);
  // 法海洞凹进的崖龛
  const cd = Math.hypot(x - CAVES.fahai.x, z - CAVES.fahai.z);
  if (cd < 9) h -= 3.4 * exp2((cd - 2) / 5, 1);
  // 江北与湖南的水下滩地：让岸线有个缓入水
  if (z < NORTH_SHORE_Z) h -= (NORTH_SHORE_Z - z) * 0.34;
  if (z > SOUTH_SHORE_Z) h -= (z - SOUTH_SHORE_Z) * 0.30;
  if (x < WEST_SHORE_X) h -= (WEST_SHORE_X - x) * 0.28;
  return h;
}

export function slopeAt(x, z) {
  const e = 1.6;
  return new THREE.Vector2((terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e));
}

/** 这一处落在哪个坪上——architecture.js 用它决定台基高度 */
export function padAt(x, z) {
  let best = null, bd = 1e9;
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.05 && d < bd) { bd = d; best = p; }
  }
  return best;
}

/* ============================================================ 星空 */

/** 月出大江：低、偏北，江面上留一条月光 lane */
export const MOON_DIR = new THREE.Vector3(0.46, 0.21, -0.86).normalize();

const SKY_FS = `
  uniform float uTime; uniform float uFrost; uniform float uMoonPhase; uniform vec3 uMoon;
  varying vec3 vDir;
  float hash(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p,p.yzx+19.19); return fract(p.x*p.y*p.z); }
  void main(){
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.25, 1.0);
    vec3 col = mix(vec3(0.030,0.046,0.082), vec3(0.004,0.008,0.022), smoothstep(-0.05,0.75,up));
    // 地平一线：江北冷、东南的城暖
    float low = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0),3.0);
    col += vec3(0.026,0.030,0.040) * low;
    float north = smoothstep(0.2,-0.9, d.z);
    float town  = smoothstep(-0.2,0.9, d.x) * smoothstep(-0.2,0.8, d.z);
    col += vec3(0.030,0.044,0.062) * low * north;
    col += vec3(0.062,0.036,0.016) * low * town;

    // 银河斜过天顶
    float axis = dot(normalize(vec3(-0.52,0.44,-0.73)), d);
    float band = exp(-pow(axis/0.19, 2.0));
    // 两档连续噪声，别用方格 hash：方格在掠射角上会铺成棋盘
    vec2 guv = vec2(atan(d.z, d.x)*2.6, asin(clamp(d.y,-1.0,1.0))*3.4);
    float grain = 0.5 + 0.3*sin(guv.x*3.1 + guv.y*1.7)*sin(guv.y*4.3 - guv.x*0.9)
                      + 0.2*sin(guv.x*9.7 - guv.y*2.1);
    vec2 buv = vec2(atan(d.z, d.x)*4.0, asin(clamp(d.y,-1.0,1.0))*5.0);
    float dust = 0.55 + 0.45*sin(buv.x*1.7)*sin(buv.y*2.3+1.1);
    col += vec3(0.050,0.058,0.088) * band * (0.30+0.80*grain) * dust * smoothstep(-0.02,0.55,up);
    col += vec3(0.022,0.018,0.032) * band * band;

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
    col = mix(col, vec3(0.044,0.054,0.074) + vec3(0.018,0.012,0.006), uFrost*haze*0.85);
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
  mesh.customProgramCacheKey = () => 'jinshan-sky';
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
 * 一张按 terrainH 抬起来的大网格：山皮随高程与坪面换色，水下留一段滩。
 * 殿宇、台基、蹬道、林木都坐在这张面上，所以它必须真的存在。
 */
function buildTerrain(scene) {
  const x0 = -150, x1 = 172, z0 = -132, z1 = 150, step = 1.7;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const pos = [], uv = [], col = [], idx = [];
  const cMoss = new THREE.Color('#243024'), cRock = new THREE.Color('#3a3d44'),
    cSilt = new THREE.Color('#171f2a'), cSand = new THREE.Color('#413b2f'), cPave = new THREE.Color('#4a4f59');
  const tmp = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const h = terrainH(x, z);
      pos.push(x, h, z);
      uv.push(x / 9, z / 9);
      const pad = padAt(x, z);
      const onPad = pad && Math.abs(h - pad.y) < 1.6;
      if (h < 0.5) tmp.copy(cSilt);
      else if (h < 2.6) tmp.copy(cSand);
      else if (onPad) tmp.copy(cPave);
      else if (h > 30) tmp.copy(cRock);
      else tmp.copy(cMoss).lerp(cRock, clamp01((h - 12) / 26) * 0.5);
      // 同一级高程上留一点斑驳，别像一块纯色塑料
      const n = 0.8 + 0.34 * Math.abs(Math.sin(x * 0.33) * Math.cos(z * 0.27));
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
    color: 0xffffff, vertexColors: true, roughness: 0.97, metalness: 0,
    map: T.hillSkin(), emissive: new THREE.Color('#080c0b'), emissiveIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

/* ============================================================ 远山与江北岸
 * 大江在北、在西抱山而过；北岸是扬州与瓜洲，江心有焦山，西面远处是润扬大桥。
 */
function ridges(scene) {
  const grp = new THREE.Group();
  for (const L of [
    { d: 430, h: 44, y: 2, c: '#091320', n: 46 },
    { d: 590, h: 74, y: -2, c: '#050b14', n: 34 },
  ]) {
    const top = [];
    for (let i = 0; i <= L.n; i++) {
      // 只在江北与东南留山影，南面要让金山湖的水天接上
      const a = -Math.PI * 0.72 + (i / L.n) * Math.PI * 1.18;
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

/** 江心的焦山：一座低岛，岛顶几点灯 */
function island(scene) {
  const { x, z, r, h } = FAR.island;
  const seg = 22, rings = 5;
  const pos = [], idx = [];
  for (let ring = 0; ring <= rings; ring++) {
    const f = ring / rings;
    const rr2 = r * (1 - f * 0.92);
    const yy = -3 + h * Math.pow(f, 1.35);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 6.283;
      const wob = 1 + 0.12 * Math.sin(a * 3 + ring);
      pos.push(x + Math.cos(a) * rr2 * wob, yy, z + Math.sin(a) * rr2 * wob * 0.8);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let i = 0; i < seg; i++) {
      const a = ring * seg + i, b = ring * seg + (i + 1) % seg;
      const c = (ring + 1) * seg + i, d = (ring + 1) * seg + (i + 1) % seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, lit('#0a1522', { rough: 1, emissive: '#050a12', ei: 0.5 }));
  scene.add(m);
  const lamps = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 5), glow('#ffd9a0', 1.5));
    s.position.set(x + rr(-r * 0.5, r * 0.5), rr(2, h * 0.7), z + rr(-r * 0.4, r * 0.4));
    lamps.add(s);
  }
  scene.add(lamps);
  return m;
}

/** 北岸：扬州与瓜洲的一线城市灯，压成一条很长的灯带 */
function northBank(scene) {
  const { x, z, w, h } = FAR.northBank;
  const pos = [], idx = [];
  const seg = 90;
  for (let i = 0; i <= seg; i++) {
    const px = x - w / 2 + (w * i) / seg;
    const hh = h * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.7 + 1.3)) + 0.3 * Math.sin(i * 0.21));
    pos.push(px, hh, z);
  }
  for (let i = 0; i <= seg; i++) pos.push(pos[i * 3], -20, pos[i * 3 + 2]);
  for (let i = 0; i < seg; i++) {
    idx.push(i, i + 1, seg + 1 + i, i + 1, seg + 2 + i, seg + 1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, lit('#060d18', { rough: 1, emissive: '#050a12', ei: 0.5 })));

  // 窗灯：贴在这条岸线上的一层点，密而不齐
  const N = 1500;
  const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N);
  const warm = new THREE.Color('#ffbe78'), cold = new THREE.Color('#a8d8ff'), white = new THREE.Color('#fff2d8');
  for (let i = 0; i < N; i++) {
    const f = rand();
    const px = x - w / 2 + w * f;
    const k = Math.min(seg - 1, Math.floor(f * seg));
    const top = h * (0.4 + 0.6 * Math.abs(Math.sin(k * 0.7 + 1.3)) + 0.3 * Math.sin(k * 0.21));
    p[i * 3] = px + rr(-4, 4);
    p[i * 3 + 1] = rr(-1, Math.max(1.5, top * rr(0.55, 1.0)));
    p[i * 3 + 2] = z + rr(-16, 26);
    const t = rand();
    const col = t < 0.62 ? warm : t < 0.86 ? cold : white;
    const j = rr(0.5, 1.5);
    c[i * 3] = col.r * j; c[i * 3 + 1] = col.g * j; c[i * 3 + 2] = col.b * j;
    s[i] = rr(1.1, 3.4);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  bg.setAttribute('color', new THREE.BufferAttribute(c, 3));
  bg.setAttribute('size', new THREE.BufferAttribute(s, 1));
  const bm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: T.softGlow('255,236,206', 0.05) } },
    vertexShader: `
      attribute float size; attribute vec3 color; uniform float uTime;
      varying vec3 vC; varying float vA;
      void main(){
        vC = color;
        vA = 0.75 + 0.25*sin(uTime*0.8 + position.x*0.4 + position.y*1.3);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(size * (900.0 / -mv.z), 0.8, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec3 vC; varying float vA;
      void main(){ vec4 m = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vC, m.a*vA*0.85); }`,
  });
  const pts = new THREE.Points(bg, bm);
  pts.frustumCulled = false;
  scene.add(pts);
  return { mesh: g, pts, uni: bm.uniforms };
}

/** 润扬长江大桥（西向远景）：主跨 1490 m、桥塔 210 m，这里按约 1:3 压进画面 */
function suspensionBridge(scene) {
  const { x, z, span, tower } = FAR.bridge;
  const grp = new THREE.Group();
  const deckY = 9;
  const steel = lit('#20283a', { rough: 0.72, metal: 0.4, emissive: '#0a1120', ei: 0.6 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 2.9, 1.5, 5), steel);
  deck.position.set(x + span * 0.35, deckY, z);
  grp.add(deck);
  const towers = [];
  for (const s of [-1, 1]) {
    const tx = x + s * span;
    for (const off of [-2.4, 2.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3.4, tower, 3.4), steel);
      leg.position.set(tx, deckY + tower / 2, z + off);
      grp.add(leg);
    }
    for (const hy of [tower * 0.34, tower * 0.72, tower * 1.0]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 7.6), steel);
      beam.position.set(tx, deckY + hy, z);
      grp.add(beam);
    }
    towers.push({ tx, top: deckY + tower });
    // 主缆 + 吊索
    const cable = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const px = tx + (s < 0 ? f * span : -f * span);
      const sag = deckY + tower - (tower - deckY - 6) * Math.pow(1 - 2 * Math.abs(f - 0.5), 2) * 0.94;
      cable.push(px, sag, z);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
    grp.add(new THREE.Line(cg, new THREE.LineBasicMaterial({ color: new THREE.Color('#4a5a72'), fog: false })));
    const hang = [];
    for (let i = 2; i < n - 1; i += 2) {
      const f = i / n;
      const px = tx + (s < 0 ? f * span : -f * span);
      const sag = deckY + tower - (tower - deckY - 6) * Math.pow(1 - 2 * Math.abs(f - 0.5), 2) * 0.94;
      hang.push(px, sag, z, px, deckY + 0.7, z);
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hang, 3));
    grp.add(new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: new THREE.Color('#33405a'), fog: false })));
  }
  // 桥身灯：塔顶的航空障碍灯是红的，桥面是一条白亮线
  for (const t of towers) {
    for (const off of [-2.4, 2.4]) {
      const bea = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), glow('#ff4a3c', 2.6));
      bea.position.set(t.tx, t.top + 2, z + off);
      grp.add(bea);
    }
  }
  const edge = [];
  for (let i = 0; i <= 120; i++) {
    const px = x - span * 1.9 + (span * 4.4 * i) / 120;
    edge.push(px, deckY + 1.6, z);
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  grp.add(new THREE.Line(eg, new THREE.LineBasicMaterial({ color: new THREE.Color('#8ea8c8').multiplyScalar(1.6), fog: false })));
  scene.add(grp);
  return grp;
}

/** 东南：西津渡与滨水古城——一线街灯、屋脊剪影，加一座过街的昭关石塔 */
function oldTown(scene) {
  const { x, z, r } = FAR.town;
  const grp = new THREE.Group();
  const roofMat = lit('#0b1522', { rough: 1, emissive: '#060c16', ei: 0.5 });
  for (let i = 0; i < 46; i++) {
    const a = rr(-2.5, -0.35);
    const d = r * rr(0.55, 1.15);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d * 0.6;
    const w = rr(9, 22), h = rr(5, 13);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.6), roofMat);
    b.position.set(px, terrainH(px, pz) * 0.2 + h / 2 - 2, pz);
    b.rotation.y = rr(0, 3.14);
    grp.add(b);
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 0.5, 4), roofMat);
    ridge.position.set(px, b.position.y + h * 0.74, pz);
    ridge.rotation.y = b.rotation.y + Math.PI / 4;
    grp.add(ridge);
  }
  // 街灯：沿云台山麓排一串暖点
  const lampGeo = new THREE.SphereGeometry(1.5, 6, 5);
  const lamps = new THREE.InstancedMesh(lampGeo, glow('#ffb063', 1.9), 90);
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const a = -2.2 + t * 1.7;
    const rr2 = r * (0.72 + 0.3 * Math.sin(t * 7));
    d.position.set(x + Math.cos(a) * rr2, rr(1.5, 12), z + Math.sin(a) * rr2 * 0.6);
    d.scale.setScalar(rr(0.7, 1.5));
    d.updateMatrix(); lamps.setMatrixAt(k++, d.matrix);
  }
  lamps.count = k;
  grp.add(lamps);
  // 昭关石塔（元代过街塔）：覆钵 + 塔刹，下面是供人穿过的券洞
  const tx = x - r * 0.52, tz = z - r * 0.16;
  const stoneMat = lit('#7f8794', { map: T.stone('#6d7480'), rough: 0.92 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(9, 5.4, 7), stoneMat);
  base.position.set(tx, 2.2, tz);
  grp.add(base);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7.2, 12, 1, false, 0, Math.PI), stoneMat);
  arch.rotateX(Math.PI / 2);
  arch.rotateZ(Math.PI);
  arch.position.set(tx, 2.4, tz);
  grp.add(arch);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.1, 14, 10), stoneMat);
  dome.scale.set(1, 0.82, 1);
  dome.position.set(tx, 7.2, tz);
  grp.add(dome);
  const harmika = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), stoneMat);
  harmika.position.set(tx, 9.6, tz);
  grp.add(harmika);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.6, 9), stoneMat);
  spire.position.set(tx, 11.8, tz);
  grp.add(spire);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), glow('#ffd9a0', 2.2));
  halo.position.set(tx, 6.4, tz + 3.4);
  grp.add(halo);
  scene.add(grp);
  return grp;
}

/* ============================================================ 林木
 * 寺裹山：树只在殿宇的缝隙、崖背与湖岸生长，夜里只读剪影。
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
  const needle = sway(lit('#182a21', { rough: 0.98, emissive: '#060f09', ei: 0.45, side: THREE.DoubleSide }), 0.013);
  const broad = sway(lit('#213628', { rough: 0.97, emissive: '#08120b', ei: 0.4, side: THREE.DoubleSide }), 0.019);
  const old = sway(lit('#2b3a2f', { rough: 0.96, emissive: '#0b1410', ei: 0.42, side: THREE.DoubleSide }), 0.012);
  const trunkMat = sway(lit('#2c211a', { map: T.wood('#1f1710', '#0e0a06'), rough: 0.95 }), 0.006);

  const cone = new THREE.ConeGeometry(3.0, 9.0, 8); cone.translate(0, 12.0, 0);
  const coneT = new THREE.CylinderGeometry(0.16, 0.36, 9, 6); coneT.translate(0, 4.5, 0);
  const ball = new THREE.SphereGeometry(4.0, 9, 7); ball.scale(1.1, 0.78, 1.1); ball.translate(0, 7.0, 0);
  const ballT = new THREE.CylinderGeometry(0.2, 0.42, 5.2, 6); ballT.translate(0, 2.6, 0);
  const bigBall = new THREE.SphereGeometry(5.6, 10, 8); bigBall.scale(1.15, 0.72, 1.15); bigBall.translate(0, 8.6, 0);
  const bigT = new THREE.CylinderGeometry(0.4, 0.7, 6.4, 7); bigT.translate(0, 3.2, 0);
  const d = new THREE.Object3D();

  const near = (x, z, list, pad) => list.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + pad);
  // 殿宇、坪台、塔、码头都不能长树
  const keepOut = [
    [TOWER.x, TOWER.z, 15],
    [AXIS.gate.x, AXIS.gate.z, 16],
    [AXIS.hall1.x, AXIS.hall1.z, 14], [AXIS.hall2.x, AXIS.hall2.z, 15],
    [AXIS.sutra.x, AXIS.sutra.z, 12], [AXIS.pavilion.x, AXIS.pavilion.z, 11],
    [AXIS.west.x, AXIS.west.z, 11], [AXIS.south.x, AXIS.south.z, 11],
    [POOL.x, POOL.z, Math.max(POOL.rx, POOL.rz) + 2],
    [PIER.x, PIER.z, 20],
  ];
  const onPad = (x, z) => PADS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.92);

  const forest = [];
  for (let i = 0; i < 900; i++) {
    const x = rr(-96, 116), z = rr(-52, 96);
    if (near(x, z, keepOut, 3) || onPad(x, z)) continue;
    const h = terrainH(x, z);
    if (h < 1.2) continue;                                   // 水里与滩上不种
    if (h > 34 && rand() < 0.55) continue;                   // 山顶坪台与崖顶留白
    forest.push([x, z, rr(0.6, 1.15), rand()]);
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
    if (r < 0.5) { imC.setMatrixAt(ci, d.matrix); imCT.setMatrixAt(ci, d.matrix); ci++; }
    else { imB.setMatrixAt(bi, d.matrix); imBT.setMatrixAt(bi, d.matrix); bi++; }
  }
  imC.count = imCT.count = ci; imB.count = imBT.count = bi;
  grp.add(imC, imCT, imB, imBT);

  // 塔院与崖畔的古木：冠大、干粗，夜里压出最深的剪影
  const elders = [];
  const spots = [
    [TOWER.x - 13, TOWER.z + 6], [TOWER.x + 12, TOWER.z + 10], [CAVES.fahai.x - 6, CAVES.fahai.z + 4],
    [AXIS.pavilion.x + 7, AXIS.pavilion.z - 6], [-26, 16], [-8, 26], [26, 8], [34, -12], [-40, -6],
  ];
  for (const [sx, sz] of spots) {
    for (let i = 0; i < 4; i++) {
      const x = sx + rr(-7, 7), z = sz + rr(-7, 7);
      if (terrainH(x, z) < 2 || onPad(x, z)) continue;
      elders.push([x, z, rr(0.8, 1.2)]);
    }
  }
  const imE = new THREE.InstancedMesh(bigBall, old, elders.length);
  const imET = new THREE.InstancedMesh(bigT, trunkMat, elders.length);
  elders.forEach(([x, z, s], i) => {
    d.position.set(x, terrainH(x, z) - 0.4, z);
    d.rotation.set(0, rr(0, 6.28), 0); d.scale.setScalar(s);
    d.updateMatrix(); imE.setMatrixAt(i, d.matrix); imET.setMatrixAt(i, d.matrix);
  });
  grp.add(imE, imET);

  // 湖岸与江滩的疏林
  const edge = [];
  for (let i = 0; i < 70; i++) {
    const x = rr(-60, 88), z = rr(60, 104);
    if (terrainH(x, z) > 4.5 || near(x, z, keepOut, 2)) continue;
    edge.push([x, z, rr(0.7, 1.2)]);
  }
  for (let i = 0; i < 46; i++) {
    const x = rr(-92, 60), z = rr(-92, -66);
    if (terrainH(x, z) > 4) continue;
    edge.push([x, z, rr(0.66, 1.1)]);
  }
  const imS = new THREE.InstancedMesh(ball, broad, edge.length);
  const imST = new THREE.InstancedMesh(ballT, trunkMat, edge.length);
  edge.forEach(([x, z, s], i) => {
    d.position.set(x, terrainH(x, z) - 0.3, z);
    d.rotation.set(0, rr(0, 6.28), 0); d.scale.setScalar(s);
    d.updateMatrix(); imS.setMatrixAt(i, d.matrix); imST.setMatrixAt(i, d.matrix);
  });
  grp.add(imS, imST);

  scene.add(grp);
  const roosts = [];
  for (let i = 0; i < 28; i++) {
    const a = rr(0, 6.28), d0 = rr(56, 96);
    const x = Math.cos(a) * d0, z = Math.sin(a) * d0 * 0.7 - 20;
    roosts.push(new THREE.Vector3(x, Math.max(6, terrainH(x, z)) + rr(6, 16), z));
  }
  const mats = [needle, broad, old, trunkMat];
  return {
    group: grp, roosts, elders: elders.length,
    update(t) {
      for (const m of mats) if (m.userData.shader) m.userData.shader.uniforms.uTime.value = t;
    },
  };
}

/* ============================================================ 雾 / 萤火 / 江鸥 */

function groundMist(scene) {
  const grp = new THREE.Group();
  const mk = () => {
    const m = new THREE.MeshBasicMaterial({
      map: T.mistStreaks(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, color: 0x9fb8cc,
    });
    m.toneMapped = false;
    return m;
  };
  // flat：贴水的水平雾（江面与湖面）；card：竖着的雾片，人走在蹬道上才穿得进去
  const bands = [
    { n: 20, x0: -260, x1: 220, y: 3.2, w: 340, h: 130, o: [0.04, 0.12], z0: -250, z1: -74, flat: true },
    { n: 14, x0: -120, x1: 150, y: 2.6, w: 260, h: 110, o: [0.03, 0.09], z0: 66, z1: 210, flat: true },
    { n: 26, x0: -62, x1: 42, y: 3.0, w: 26, h: 11, o: [0.05, 0.14], z0: -58, z1: 44 },
    { n: 12, x0: POOL.x - 14, x1: POOL.x + 14, y: 1.2, w: 20, h: 6, o: [0.07, 0.17], z0: POOL.z - 10, z1: POOL.z + 10 },
    { n: 10, x0: -48, x1: -8, y: 1.6, w: 30, h: 9, o: [0.06, 0.15], z0: -46, z1: -26 },
  ];
  for (const B of bands) {
    for (let i = 0; i < B.n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), mk());
      m.material.opacity = rr(B.o[0], B.o[1]);
      const x = rr(B.x0, B.x1), z = rr(B.z0, B.z1);
      const ground = terrainH(x, z);
      m.position.set(x, (ground > 2 ? ground : 0) + (B.flat ? B.y : B.h * 0.5), z);
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
        // 江雾顺流西去，比湖雾走得快一档
        m.material.map.offset.x = (t * 0.0052 + m.userData.phase * 0.1) % 1;
        m.position.y += Math.sin(t * 0.24 + m.userData.phase) * 0.0014;
      }
    },
  };
}

function fireflies(scene) {
  const N = 260;
  const pos = new Float32Array(N * 3); const ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = rr(-52, 76), z = rr(-46, 76);
    const g = terrainH(x, z);
    if (g < 2) { pos[i * 3] = x; pos[i * 3 + 1] = -20; pos[i * 3 + 2] = z; ph[i] = 0; continue; }
    pos[i * 3] = x; pos[i * 3 + 1] = g + rr(0.5, 3.4); pos[i * 3 + 2] = z;
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

/** 江鸥：绕着崖背与塔顶盘旋，铃一响就散开 */
function gulls(scene, trees) {
  const N = 40;
  const body = new THREE.ConeGeometry(0.4, 2.0, 5); body.rotateX(Math.PI / 2);
  const wing = new THREE.PlaneGeometry(2.9, 0.66); wing.rotateY(Math.PI / 2);
  const mat = lit('#0a1019', { rough: 1, side: THREE.DoubleSide, emissive: '#04070d', ei: 0.6 });
  const grp = new THREE.Group();
  const mk = new THREE.InstancedMesh(body, mat, N);
  const mw = new THREE.InstancedMesh(wing, mat, N * 2);
  grp.add(mk, mw);
  scene.add(grp);
  const d = new THREE.Object3D();
  const flock = trees.roosts.concat(trees.roosts).slice(0, N).map((r, i) => ({
    a: rand() * 6.28, r: rr(8, 34), y: r.y + rr(2, 22) + (i % 2) * 4,
    home: r.clone(), sp: rr(0.18, 0.36), startle: 0,
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
        const y = b.y + Math.sin(t * 0.6 + b.a * 2) * 2.2 + b.startle * 12 * Math.abs(Math.sin(t * 0.5 + i));
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
  scene.fog = new THREE.FogExp2(0x091120, 0.0021);
  const sky = buildSky(scene);
  buildTerrain(scene);
  const far = {
    ridges: ridges(scene),
    island: island(scene),
    bank: northBank(scene),
    bridge: suspensionBridge(scene),
    town: oldTown(scene),
  };
  const trees = buildTrees(scene);
  const mist = groundMist(scene);
  const flies = fireflies(scene);
  const flock = gulls(scene, trees);

  const hemi = new THREE.HemisphereLight(0x38506f, 0x0d1512, 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc8dcff, 1.4);
  moon.position.copy(MOON_DIR).multiplyScalar(300);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 40, far: 640 });
  moon.shadow.bias = -0.0007;
  moon.shadow.normalBias = 0.6;
  moon.target.position.set(4, 20, -2);
  scene.add(moon, moon.target);

  // 跟着机位走的暖光在 main.js 的 followLights 里，这里先布在山门、塔、湖三处
  const fill = [
    new THREE.PointLight(0xff8a4a, 44, 150, 2),
    new THREE.PointLight(0xffd27a, 36, 130, 2),
    new THREE.PointLight(0x9fc0ff, 30, 160, 2),
    new THREE.PointLight(0xffb060, 26, 100, 2),
  ];
  fill[0].position.set(-40, 24, 10);
  fill[1].position.set(0, 52, -22);
  fill[2].position.set(20, 18, 90);
  fill[3].position.set(-16, 30, -30);
  for (const f of fill) scene.add(f);

  return {
    uni: sky.uni,
    sky, trees, mist, flies, birds: flock, far,
    lights: [moon, ...fill],
    hemi,
    setMist(on) { mist.set(on); sky.uni.uFrost.value = on ? 1 : 0; },
    setBirds(on) { flock.set(on); flies.set(on); },
    startle(x, z) { flock.startle(x, z); flies.uni.uBurst.value = 1; },
    update(t, dt) {
      sky.uni.uTime.value = t;
      sky.stars.material.uniforms.uTime.value = t;
      far.bank.pts.material.uniforms.uTime.value = t;
      flies.uni.uTime.value = t;
      flies.uni.uBurst.value = Math.max(0, flies.uni.uBurst.value - dt * 0.55);
      mist.update(t);
      flock.update(t, dt);
      trees.update(t);
    },
  };
}
