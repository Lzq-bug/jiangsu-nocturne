import * as THREE from 'three';
import * as T from './textures.js';
import { PAL, rgb, rand, rr, registerOccluder } from './kit.js';
import {
  COAST, BEACH, HEADS, RIDGE, FAR_RANGE, BASIN, MAINLAND_LAND, SEA,
  TREES, SHEEP, BOARDWALK, CHANNEL, QUAY,
} from './layout.js';

/* ============================================================ 通用软函数
 * 全场最重要的函数 terrainH 全靠这几个软函数拼出来：必须连续、可导，
 * props / architecture / portals / hotspots 的机位都靠它抬到脚下。
 */

const smooth01 = (t) => t * t * (3 - 2 * t);
const cl01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** 平滑过渡：x 从 a 走到 b，值从 0 走到 1（a>b 时反向） */
const sstep = (a, b, x) => smooth01(cl01((x - a) / (b - a)));
/** 高斯衰减，k 越大收得越快 */
const exp2 = (d, k = 1) => Math.exp(-d * d * k);
/** 点到折线的最短距离（米） */
function distToPoly(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? cl01(((px - ax) * dx + (pz - az) * dz) / l2) : 0;
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/* ============================================================ 岸线
 * COAST 折线用单调三次插值（Fritsch–Carlson）：不产生新极值、导数有界。
 * shoreZat 反解水线靠的就是 terrainH 沿 +z 单调下降这一点。
 */
const CX = COAST.map((p) => p[0]);
const CZ = COAST.map((p) => p[1]);

function monoInterp(xs, ys) {
  const n = xs.length;
  const h = [], delta = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    delta.push((ys[i + 1] - ys[i]) / h[i]);
  }
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) m[i] = 0;
    else m[i] = (delta[i - 1] + delta[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const s = Math.hypot(Math.abs(m[i]), Math.abs(m[i + 1]));
    if (s > 3 * Math.abs(delta[i])) {
      m[i] = (3 * delta[i] * Math.abs(m[i])) / s;
      m[i + 1] = (3 * delta[i] * Math.abs(m[i + 1])) / s;
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const shoreEval = monoInterp(CX, CZ);

/** 平均潮位处的岸线 z：对 COAST 折线的平滑插值（契约导出） */
export function shoreAt(x) { return shoreEval(x); }

/* ============================================================ 地形
 * terrainH 的分段构成（全部软函数叠加，保证 C1）：
 *  1. beachH   —— 南岸剖面：岸线以南按 BEACH.slope 沉到海床（浪冲带先陡
 *                 后缓），以北按 BEACH.back 抬到 BEACH.rim 台地（指数渐近）；
 *  2. 岛脊     —— RIDGE 五个鼓包 + 一条沿脊线的山脊骨，只加在陆侧，
 *                 北端到 z≈-350 收进海峡；
 *  3. 岬角     —— HEADS 局部抬升（+h）：向海落成崖脚、向陆退成岩脊，
 *                 栈道与刻石亭站在岩脊上；羊窝头 SHEEP 是岩丘，取最大值；
 *  4. 鹰游海峡 —— 岛脊以北向 -12 m 海峡底沉降；
 *  5. 港池     —— BASIN 四个圆把洼地覆盖成 -cut（是替换不是相减——
 *                 港池底下压着岛脊也要成洼地）；
 *  6. 口门航道 —— CHANNEL 西段沿折线切出 -5 m 的槽，低潮也连通外海；
 *                 QUAY 岸线前保留一段码头浅棚；
 *  7. 大陆     —— MAINLAND_LAND 抬起墟沟一侧陆地。
 */

/** 1. 南坡剖面 */
function beachH(x, z) {
  const d = z - shoreEval(x);
  const land = BEACH.rim * (1 - Math.exp((d * BEACH.back) / BEACH.rim));
  if (d <= 0) return land;
  const sea = -BEACH.slope * d;
  // 浪冲带：先陡后缓地并入线性海床，滩脚因此是圆的
  const k = 1 - sstep(0, 22, d);
  return sea + (land - sea) * k * k;
}

/** 2a. 岛脊：五个鼓包与脊骨取软最大值（不是求和——机位要站在山上，不能埋进叠起来的山体） */
const softMax = (a, b, k = 5) => {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi - lo >= k) return hi;
  const t = 1 - (hi - lo) / k;
  return hi + t * t * k * 0.25;
};
function ridgeSoft(x, z) {
  let m = spineLift(x, z);
  for (const p of RIDGE) {
    m = softMax(m, p.a * exp2(Math.hypot(x - p.x, z - p.z) / p.r, 1.1));
  }
  return m;
}

/** 2b. 山脊骨：把五个鼓包串成一道连续的脊 */
const SPINE = RIDGE.map((p) => [p.x, p.z]);
const spineLift = (x, z) => 20 * exp2(distToPoly(x, z, SPINE) / 150, 1);

/** 2c. 岛体范围：鼓包与脊骨只加在陆侧，北端收进海峡 */
const isleMask = (z) => sstep(40, 3, z) * sstep(-415, -335, z);

/** 3a. 湾间基岩岬：横向半宽、纵向从海蚀崖脚抬到岩脊顶台 */
const HEAD_P = HEADS.map((p) => {
  const s = shoreEval(p.x);
  return { ...p, zSea: s + p.halfW * 0.5, zLand: s - 6 - 1.1 * p.h };
});
function headLift(x, z) {
  let h = 0;
  for (const p of HEAD_P) {
    const e = Math.abs(x - p.x) / p.halfW;
    const w = exp2(Math.max(0, e - 0.85) / 1.05, 1);
    if (w < 0.003) continue;
    // 向海：崖脚落在平均岸线之外；向陆：岩台退到 -h 带以下，把高程交给岛脊
    const v = (1 - sstep(p.zLand, p.zSea, z)) * sstep(p.zLand - 155, p.zLand - 45, z);
    if (v <= 0) continue;
    h += p.h * 0.8 * w * v;
  }
  return h;
}

/** 3b. 口门沙嘴（江家嘴一类的尾闾岩脊）：灯塔机位要踩着实地，航道口仍留在水中 */
function mouthRidge(x, z) {
  return 10 * exp2(Math.hypot(x + 352, (z - 16) * 1.2) / 40, 1);
}

/** 3c. 羊窝头：岛最东端的礁盘岩丘（顶略低于 SHEEP.top，让人站得住） */
function sheepLift(x, z) {
  const d = Math.hypot(x - SHEEP.x, (z - 30) * 1.3) / SHEEP.r;
  return SHEEP.top * 0.92 * exp2(d, 1.0) * sstep(148, 112, z);
}

/** 4. 鹰游海峡：岛脊以北沉到底，连岛与云台山之间是水不是陆 */
const straitSink = (z) => 12.0 * sstep(-330, -470, z);

/** 5. 港池洼地：四圆权重取加权深度，按覆盖式混合（不是相减） */
function basinMix(x, z) {
  let wsum = 0, dsum = 0;
  for (const b of BASIN) {
    const w = Math.exp(-Math.pow(Math.hypot(x - b.x, z - b.z) / b.r, 4));
    wsum += w; dsum += w * b.cut;
  }
  if (wsum <= 0.012) return null;
  return { m: smooth01(cl01((wsum - 0.18) / 0.57)), floor: -(dsum / wsum) };
}

/** 6a. 口门航道：堤内侧沿 CHANNEL 西段切槽，退潮时港池仍通外海。
 *  槽只开到 x≈-220 为止——出了岸线以南本来就是水，浴场不该被切一道沟。 */
const CH_PTS = CHANNEL.slice(2, 7);
function channelSink(x, z) {
  const d = distToPoly(x, z, CH_PTS);
  return 5.0 * sstep(26, 10, d) * sstep(152, 96, z) * sstep(-196, -256, x);
}

/** 6b. 码头岸线前的浅棚：0~-2 m 一段短平台，再折向港底（壁面由 architecture 建） */
const QD = QUAY.pts;
function quayShelf(x, z) {
  const d = distToPoly(x, z, QD);
  return 2.6 * sstep(58, 34, d) * sstep(84, 46, z);
}

/** 7. 墟沟一侧的陆地：台地状穹顶，边缘收干净，不许往湾里拖长尾 */
function mainlandLift(x, z) {
  const M0 = MAINLAND_LAND;
  const d = Math.hypot((x - M0.x) / M0.rx, (z - M0.z) / M0.rz);
  return M0.rise * exp2(d, 0.8) * sstep(1.42, 1.05, d);
}

/** 全场高程（契约导出） */
export function terrainH(x, z) {
  let h = beachH(x, z);
  const im = isleMask(z);
  if (im > 0) h += ridgeSoft(x, z) * im * sstep(16, 4, z);
  h += headLift(x, z);
  const bm = basinMix(x, z);
  if (bm) h = h * (1 - bm.m) + bm.floor * bm.m;
  h += mouthRidge(x, z);
  const s0 = sheepLift(x, z);
  if (s0 > 0.2 && s0 > h) h = s0;   // 只在岩丘footprint内抬升，无限小的高斯尾巴不许钳住海床
  h -= straitSink(z) + channelSink(x, z);
  // 码头浅棚只能把已经出露的地面抬平，不能把港底垫成干滩（q=0 也不许钳住海床）
  const qs = quayShelf(x, z);
  if (qs > 0 && h > -1 && qs > h) h = qs;
  // 岛体两端收进海：西接港池与大堤，东止于羊窝头以外
  const xf = sstep(830, 750, x) * sstep(-870, -780, x);
  if (h > 0) h *= xf;
  h += mainlandLift(x, z);
  return h;
}

/** 水线反解：terrainH 沿 +z 单调下降，二分必收敛且数值稳定（契约导出） */
export function shoreZat(x, level) {
  const s = shoreAt(x);
  let zlo = s - 40;
  if (terrainH(x, zlo) <= level) return zlo;   // 高潮漫过滩顶：水线停在台地内缘
  let zhi = s + (BEACH.rim + Math.max(0, level)) / BEACH.slope + 80;
  for (let i = 0; i < 52; i++) {
    const mid = 0.5 * (zlo + zhi);
    if (terrainH(x, mid) > level) zlo = mid; else zhi = mid;
  }
  return 0.5 * (zlo + zhi);
}

export function slopeAt(x, z) {
  const e = 2.0;
  return new THREE.Vector2(
    (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e),
    (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e),
  );
}

/** 分区标签：给 props / water 判断脚下是什么（契约导出） */
export function zoneAt(x, z) {
  const h = terrainH(x, z);
  if (h < -0.2) return 'sea';
  const s = shoreAt(x);
  const inland = z < s - 4;
  // 基岩优先：岬角岩脊与羊窝头礁盘读作 rock，不许被 hill/sand 抢走
  for (const p of HEAD_P) {
    if (inland && Math.abs(x - p.x) < p.halfW * 1.8 && z < p.zSea && z > p.zLand - 60) return 'rock';
  }
  if (inland && x > 590 && z < 130) return 'rock';          // 羊窝头礁盘
  if (inland && h > BEACH.rim + 2.5) return 'hill';
  if (z > s - 26) return 'sand';
  return 'platform';
}

/** 给水的色与夜色基调（契约导出）：青黑、月光冷蓝、港内橘金 */
export const GEO = {
  deep: SEA.deep, mid: SEA.mid, shelf: SEA.shelf,
  fog: rgb('#081019'),
  bg: rgb('#050a12'),
  sand: rgb(PAL.sand), wet: rgb(PAL.wetSand), rock: rgb(PAL.rock),
  reef: rgb(PAL.reef), grass: rgb('#141b16'), silt: rgb('#101720'), mud: rgb('#0a1118'),
};

/** 月光方向：一更时西南低空，与水面反光、月 disk 一致（契约导出） */
export const MOON_DIR = new THREE.Vector3(-0.617, 0.38, -0.688).normalize();

/* ============================================================ 天光曲线
 * dayness(hour)：19.4 一更黄昏西天余晖 → 22 全黑 → 凌晨 4.8 前后东天
 * 先亮一线 → 5.6 开渔前的灰蓝 → 6.6 天光真正起来。hour 可 >24，按 24 取模。
 */
function dayness(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 3.6) return 0;
  if (h < 4.8) return 0.08 * sstep(3.6, 4.8, h);          // 东天先亮一线
  if (h < 5.6) return 0.08 + 0.24 * sstep(4.8, 5.6, h);   // 灰蓝铺满东天
  if (h < 6.6) return 0.32 + 0.68 * sstep(5.6, 6.6, h);   // 开渔后天光起来
  if (h < 18.9) return 1;
  if (h < 19.4) return 1 - sstep(18.9, 19.4, h);          // 日落即暗
  if (h < 22) return 0.34 * (1 - sstep(19.4, 22, h));     // 黄昏余晖退场
  return 0;
}

/** 月与金星的抬升：入夜偏西南低空，后半夜西沉，凌晨东天换亮 */
function moonAltitude(hour) {
  const tt = cl01((((hour - 19.4) % 24) + 24) % 24 / 9.6);
  return new THREE.Vector3(
    -0.62 + 0.95 * tt,
    Math.max(0.08, 0.38 + 0.3 * Math.sin(Math.PI * tt)),
    -0.55 - 0.35 * tt,
  ).normalize();
}

/* ============================================================ 天空穹顶 */

const SKY_FS = `
  uniform float uTime; uniform float uDay; uniform vec3 uMoon;
  varying vec3 vDir;
  float hash(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p,p.yzx+19.19); return fract(p.x*p.y*p.z); }
  void main(){
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.25, 1.0);
    // 海州湾的夜：青黑到底，天顶更黑
    vec3 col = mix(vec3(0.030,0.047,0.070), vec3(0.004,0.008,0.018), smoothstep(-0.05, 0.75, up));
    // 低空一层冷青（海上气），西北陆地那侧压一层暖雾（港灯与墟沟）
    float low = pow(clamp(1.0 - abs(d.y)*2.6, 0.0, 1.0), 3.0);
    col += vec3(0.014, 0.030, 0.040) * low;
    col += vec3(0.040, 0.024, 0.012) * low * smoothstep(0.0, -0.85, d.x) * smoothstep(-0.5, 0.1, -d.z);
    // 银河斜过东南天
    float axis = dot(normalize(vec3(0.22, 0.52, -0.82)), d);
    float band = exp(-pow(axis/0.19, 2.0));
    vec2 guv = vec2(atan(d.z, d.x)*2.6, asin(clamp(d.y,-1.0,1.0))*3.4);
    float grain = 0.5 + 0.3*sin(guv.x*3.1 + guv.y*1.7)*sin(guv.y*4.3 - guv.x*0.9) + 0.2*sin(guv.x*9.7 - guv.y*2.1);
    vec2 buv = vec2(atan(d.z, d.x)*4.0, asin(clamp(d.y,-1.0,1.0))*5.0);
    float dust = 0.55 + 0.45*sin(buv.x*1.7)*sin(buv.y*2.3+1.1);
    col += vec3(0.050, 0.058, 0.088) * band * (0.30+0.80*grain) * dust * smoothstep(-0.02, 0.55, up);
    col += vec3(0.022, 0.018, 0.032) * band * band;
    // 星点三档、亮星闪；夜气重，只留中天以上
    vec3 sp = floor(d*420.0);
    float s = hash(sp);
    float star = 0.0;
    if (s > 0.9958) star = pow((s-0.9958)/0.0042, 3.0) * (0.5+0.5*sin(uTime*2.3+s*44.0));
    vec3 sp2 = floor(d*250.0);
    float s2 = hash(sp2+7.3);
    if (s2 > 0.986) star += pow((s2-0.986)/0.014, 2.0)*0.30;
    col += star * mix(vec3(0.62,0.70,0.95), vec3(1.0,0.84,0.66), hash(sp+3.1)) * 2.4 * (1.0-uDay*0.8);
    // 月：低、冷、一层过弯的晕（位置每帧随 uMoon 走）
    float md = max(0.0, dot(d, normalize(uMoon)));
    col += vec3(0.92,0.94,1.0) * pow(md, 1100.0) * 5.5 * (1.0-uDay*0.35);
    col += vec3(0.20,0.26,0.40) * pow(md, 30.0) * 0.55 * (1.0-uDay*0.3);
    col += vec3(0.09,0.12,0.18) * pow(md, 5.0) * 0.30 * (1.0-uDay*0.3);
    // 黄昏：西天（+z）余晖一线
    float west = smoothstep(0.05, 0.85, d.z) * smoothstep(0.34, -0.02, abs(d.y-0.03));
    col = mix(col, col + vec3(0.30,0.155,0.075) * west, min(1.0, uDay*3.2));
    // 凌晨：东天（+x）先亮一线，然后灰蓝整片铺开
    float east = smoothstep(0.05, 0.9, d.x) * smoothstep(0.42, -0.02, abs(d.y-0.05));
    col = mix(col, col + vec3(0.26,0.30,0.42) * east, sstep(0.07, 0.3, uDay));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
  }`;

function buildSky(scene) {
  const uni = { uTime: { value: 0 }, uDay: { value: 1 }, uMoon: { value: MOON_DIR.clone() } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 42, 26),
    new THREE.ShaderMaterial({
      uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: SKY_FS,
    }),
  );
  mesh.customProgramCacheKey = () => 'ld-sky';
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // 实体亮星走辉光通道：穹顶 shader 里的星点太小，吃不到 bloom
  const N = 320;
  const pos = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.06 + Math.pow(rand(), 1.35) * 0.92;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos[i * 3] = Math.cos(a) * r * 1880;
    pos[i * 3 + 1] = y * 1880;
    pos[i * 3 + 2] = Math.sin(a) * r * 1880;
    siz[i] = rr(0.9, 3.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const sm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 }, uMap: { value: T.starField() } },
    vertexShader: `
      attribute float size; uniform float uTime; varying float vTw;
      void main(){
        vTw = 0.6+0.4*sin(uTime*1.6+position.x*0.03+position.z*0.05);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(size * (260.0/-mv.z), 0.6, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uDay; varying float vTw;
      void main(){ vec4 m = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.78,0.85,1.0)*(0.55+vTw*0.4), m.a*vTw*0.7*(1.0-uDay)); }`,
  });
  sm.customProgramCacheKey = () => 'ld-stars';
  const stars = new THREE.Points(g, sm);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);
  // 契约：sky 自带 update（main.js 走 env.update，这里再转发一遍时间uniform）
  return { mesh, stars, uni, sm, update(t) { uni.uTime.value = t; sm.uniforms.uTime.value = t; } };
}

/* ============================================================ 地形网格
 * 一张非均匀采样的网格：岛体与近岸（滩/栈道/港池）3.6 m 细网，
 * 外海与海峡 14 m 粗网。树、堤、船、灯都坐在这张面上，它必须真的存在。
 */
function buildTerrain(scene) {
  const axis = (v0, v1, f0, f1, fine, coarse) => {
    const out = [];
    for (let v = v0; v < f0; v += coarse) out.push(v);
    for (let v = f0; v <= f1 + 0.001; v += fine) out.push(v);
    for (let v = f1 + coarse; v <= v1 + 0.001; v += coarse) out.push(v);
    return out;
  };
  const xs = axis(-2300, 1300, -880, 780, 3.6, 14);
  const zs = axis(-2300, 1300, -340, 320, 3.6, 14);
  const nx = xs.length - 1, nz = zs.length - 1, rowLen = nx + 1;
  const pos = new Float32Array(rowLen * (nz + 1) * 3);
  const col = new Float32Array(rowLen * (nz + 1) * 3);
  const uvs = new Float32Array(rowLen * (nz + 1) * 2);
  const cWet = GEO.wet, cSand = GEO.sand, cRock = GEO.rock, cReef = GEO.reef,
    cGrass = GEO.grass, cSilt = GEO.silt, cMud = GEO.mud;
  const tmp = new THREE.Color();
  let k = 0;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = xs[i], z = zs[j];
      const h = terrainH(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uvs[k * 2] = x / 11; uvs[k * 2 + 1] = z / 11;
      const sp = slopeAt(x, z);
      const st = cl01((sp.x * sp.x + sp.y * sp.y) / 0.02);   // 坡度 ~14% 以上算岩
      if (h < -9) tmp.copy(cMud);                             // 海峡与外湾底
      else if (h < -0.35) tmp.copy(cSilt);                    // 水下泥砂
      else if (st > 0.5) tmp.copy(cReef).lerp(cRock, sstep(0.5, 0.85, st)); // 海蚀崖与礁盘
      else if (h > BEACH.rim + 2.5) tmp.copy(cGrass);         // 岛脊：黑松线上的暗绿
      else {
        // 潮间带湿沙 → 干沙 → 台地草坡，越往里越暗
        tmp.copy(cWet).lerp(cSand, sstep(-0.3, 1.5, h));
        tmp.lerp(cGrass, sstep(-14, -38, z - shoreAt(x)) * 0.55);
      }
      // 同一级高程留一点斑驳，别像纯色塑料
      const n = 0.84 + 0.28 * Math.abs(Math.sin(x * 0.31 + 1.7) * Math.cos(z * 0.23 - 0.9));
      tmp.multiplyScalar(n);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      k++;
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * rowLen + i, b = a + 1, c = a + rowLen, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.98, metalness: 0,
    map: T.sand(), emissive: rgb('#060a0e'), emissiveIntensity: 0.45,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

/* ============================================================ 远景剪影
 * 云台山（FAR_RANGE 四峰）隔鹰游海峡压在西北天际——只作暗色轮廓。
 * 山体不写进 terrainH：太远，永远被岛脊与海雾挡住。
 */
function buildRange(scene) {
  const grp = new THREE.Group();
  grp.name = 'range';
  const base = -26;
  const verts = [];
  for (const p of FAR_RANGE) {
    const nn = 26;
    for (let i = 0; i <= nn; i++) {
      const a = -1.28 + (i / nn) * 2.56;
      const fx = p.x + Math.sin(a) * p.r;
      const gz = p.z + Math.cos(a) * p.r * 0.42;
      const lat = cl01(Math.cos(a) * 1.12);
      const hh = base + p.a * (0.34 + 0.66 * Math.pow(Math.max(0, lat), 1.05))
        * (0.9 + 0.1 * Math.sin(i * 2.1 + p.x * 0.01));
      verts.push([fx, hh, gz], [fx, base - 130, gz]);
    }
  }
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
  const idx = [];
  const per = 2 * 27;
  for (let p = 0; p < FAR_RANGE.length; p++) {
    for (let i = 0; i < 26; i++) {
      const a = p * per + i * 2, b = a + 1, c = a + 2, e = a + 3;
      idx.push(a, b, c, b, e, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: rgb('#0a1220'), roughness: 1, metalness: 0,
    emissive: rgb('#040810'), emissiveIntensity: 0.5, fog: false,
  }));
  mesh.frustumCulled = false;
  grp.add(mesh);
  scene.add(grp);
  return { group: grp };
}

/* ============================================================ 海岸林
 * TREES 三组锚点：岛脊线、岬 bluff、港侧。夜里只读剪影——
 * 黑松是塔形的：一根主干 + 三片扁圆锥轮生冠，别做成阔叶球。
 */
function buildTrees(scene) {
  const grp = new THREE.Group();
  grp.name = 'trees';
  const spots = [];
  const push = (arr, spread) => {
    for (const [px, pz] of arr) {
      const n = 5 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const x = px + rr(-spread, spread);
        const z = pz + rr(spread * 0.8, spread * 1.7) * (rand() > 0.5 ? 1 : -1);
        if (terrainH(x, z) < 1.4) continue;           // 滩面与港池不种树
        spots.push({ x, z, s: rr(0.8, 1.5), lean: rr(-0.05, 0.05) });
      }
    }
  };
  push(TREES.ridge, 20);
  push(TREES.bluff, 14);
  push(TREES.harbor, 16);

  const mkCone = (r, hh, y, seg) => {
    const g = new THREE.ConeGeometry(r, hh, seg);
    g.translate(0, y, 0);
    return g;
  };
  const crowns = [mkCone(1.95, 2.4, 4.5, 7), mkCone(1.5, 2.1, 6.1, 7), mkCone(0.95, 1.9, 7.5, 6)];
  const trunk = new THREE.CylinderGeometry(0.12, 0.3, 5.2, 5);
  trunk.translate(0, 2.6, 0);
  const matPine = new THREE.MeshStandardMaterial({
    color: rgb('#0d1a12'), roughness: 0.98, metalness: 0,
    emissive: rgb('#040a07'), emissiveIntensity: 0.5, flatShading: true,
  });
  const matTrunk = new THREE.MeshStandardMaterial({ color: rgb('#141010'), roughness: 0.96 });
  const imC = crowns.map((g2) => new THREE.InstancedMesh(g2, matPine, spots.length));
  const imT = new THREE.InstancedMesh(trunk, matTrunk, spots.length);
  const d = new THREE.Object3D();
  spots.forEach((p, i) => {
    const y = terrainH(p.x, p.z);
    d.position.set(p.x, y - 0.4, p.z);
    d.rotation.set(p.lean, rand() * 6.28, p.lean * 0.7);
    d.scale.setScalar(p.s);
    d.updateMatrix();
    imT.setMatrixAt(i, d.matrix);
    for (const m of imC) m.setMatrixAt(i, d.matrix);
  });
  for (const m of imC) grp.add(m);
  grp.add(imT);
  scene.add(grp);

  // 山脊上挡机位的大树交给 declutter
  for (const p of spots) {
    if (p.z < -40 && p.s > 1.3) {
      const o = new THREE.Object3D();
      o.position.set(p.x, terrainH(p.x, p.z) + p.s * 6.5, p.z);
      scene.add(o);
      registerOccluder(o, 5.5);
    }
  }
  return {
    group: grp, spots,
    update() {},
  };
}

/* ============================================================ 海雾
 * 贴水与滩地的一层：潮沟、湿沙、港池静水各一条带。setMist 可关
 * （main.js 关它时同步切 water.setFrost）。
 */
function buildMist(scene) {
  const grp = new THREE.Group();
  grp.name = 'mist';
  const mkMat = () => {
    const m = new THREE.MeshBasicMaterial({
      map: T.fogSheet(), transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false,
      color: rgb('#8ea8c0'),
    });
    m.toneMapped = false;
    return m;
  };
  const bands = [
    // 大沙湾—苏马湾滩地：贴沙横条，人从中间走过去
    { n: 26, x0: -320, x1: 300, z0: 52, z1: 100, h: 7, w: [40, 90], o: [0.05, 0.13] },
    // 潮沟与低潮带：更高一点、更淡
    { n: 16, x0: -280, x1: 260, z0: 110, z1: 180, h: 9, w: [60, 110], o: [0.04, 0.09] },
    // 港池静水：贴在水面上三米
    { n: 12, x0: -820, x1: -360, z0: -300, z1: -20, h: 5, w: [90, 150], o: [0.05, 0.1] },
    // 堤外与海峡：远带，压住西天
    { n: 10, x0: -1500, x1: -800, z0: -460, z1: -300, h: 8, w: [140, 220], o: [0.04, 0.08] },
  ];
  const items = [];
  for (const B of bands) {
    for (let i = 0; i < B.n; i++) {
      const x = rr(B.x0, B.x1), z = rr(B.z0, B.z1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rr(B.w[0], B.w[1]), B.h), mkMat());
      m.material.opacity = rr(B.o[0], B.o[1]);
      m.position.set(x, Math.max(terrainH(x, z), -1) + B.h * 0.5, z);
      m.rotation.set(0, Math.PI / 2 + rr(-0.35, 0.35), 0);
      m.renderOrder = 6;
      m.userData = { phase: rand() * 6.28, base: m.material.opacity, y0: m.position.y };
      grp.add(m);
      items.push(m);
    }
  }
  scene.add(grp);
  return {
    group: grp, items,
    update(t) {
      for (const m of items) {
        const u = m.userData;
        m.material.opacity = u.base * (0.7 + 0.3 * Math.sin(t * 0.2 + u.phase));
        m.position.y = u.y0 + Math.sin(t * 0.18 + u.phase) * 0.5;
      }
    },
  };
}

/* ============================================================ 鸥鸟
 * 夜栖：白天在海上，夜里收在岸林与岬角上。数量少（22 只），
 * setGulls 可关；startle(x,z)（潮信惊更）把附近一小群连夜托起来。
 */
function buildGulls(scene) {
  const N = 22;
  const grp = new THREE.Group();
  grp.name = 'gulls';
  const body = new THREE.ConeGeometry(0.2, 1.15, 5);
  body.rotateX(-Math.PI / 2);
  const wing = new THREE.PlaneGeometry(1.15, 0.3);
  const mat = new THREE.MeshStandardMaterial({
    color: rgb('#141b24'), roughness: 1, side: THREE.DoubleSide,
    emissive: rgb('#0a1018'), emissiveIntensity: 0.55,
  });
  const mb = new THREE.InstancedMesh(body, mat, N);
  const mw = new THREE.InstancedMesh(wing, mat, N * 2);
  grp.add(mb, mw);
  scene.add(grp);

  const roosts = [...TREES.ridge, ...TREES.bluff];
  for (const p of HEAD_P) roosts.push([p.x, shoreAt(p.x) - 8]);
  const mk = roosts.slice(0, 14);
  const flock = [];
  for (let i = 0; i < N; i++) {
    const [rx, rz] = mk[i % mk.length];
    const x = rx + rr(-8, 8), z = rz + rr(-6, 6);
    flock.push({ x, z, hx: x, hz: z, y: terrainH(x, z) + rr(5, 11), startle: 0, ph: rand() * 6.28 });
  }
  const d = new THREE.Object3D();
  return {
    group: grp, mesh: mb,
    update(t, dt) {
      let wi = 0;
      for (let i = 0; i < flock.length; i++) {
        const b = flock[i];
        b.startle = Math.max(0, b.startle - dt * 0.18);
        const a = t * 0.16 + b.ph;
        const kk = Math.min(1, dt * (0.5 + b.startle * 2));
        b.x += (b.hx + Math.cos(a) * (10 + b.startle * 44) - b.x) * kk;
        b.z += (b.hz + Math.sin(a) * (7 + b.startle * 30) - b.z) * kk;
        const y = b.y + b.startle * 16 * Math.abs(Math.sin(t * 0.55 + i)) + Math.sin(t * 0.8 + b.ph) * 0.6;
        d.position.set(b.x, y, b.z);
        d.rotation.set(0, -a + Math.PI / 2, Math.sin(t * 9 + b.ph * 4) * 0.16);
        d.scale.setScalar(1 + b.startle * 0.25);
        d.updateMatrix();
        mb.setMatrixAt(i, d.matrix);
        for (const s of [-1, 1]) {
          d.rotation.set(0, -a + Math.PI / 2, s * (0.25 + 0.55 * Math.sin(t * 9.5 + b.ph * 3 + i * 0.4)));
          d.position.x += s * 0.28;
          d.updateMatrix();
          mw.setMatrixAt(wi++, d.matrix);
        }
      }
      mb.instanceMatrix.needsUpdate = true;
      mw.instanceMatrix.needsUpdate = true;
    },
    startle(x, z) {
      for (const b of flock) {
        b.startle = Math.max(b.startle, 1 / (1 + Math.hypot(b.hx - x, b.hz - z) / 110));
      }
    },
    set(on) { grp.visible = on; },
  };
}

/* ============================================================ 灯光
 * 半球光定夜底 + 月光平行光勾轮廓 + 一盏跟相机的冷光（main.js 每帧
 * 设 lights[1].position）保住脚下礁石的质感。港内橘金交给发光件与 bloom。
 */
function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(rgb('#2a3d58'), rgb('#0a0e13'), 0.42);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(rgb(PAL.moonWhite), 0.55);
  moon.position.copy(MOON_DIR).multiplyScalar(600);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -420, right: 260, top: 320, bottom: -320, near: 200, far: 1200 });
  moon.shadow.bias = -0.0007;
  moon.shadow.normalBias = 0.35;
  scene.add(moon, moon.target);

  // 跟机的冷光：index 1，main.js 每帧把它拖到相机旁
  const follow = new THREE.PointLight(rgb('#a9c2e4'), 22, 52, 1.8);
  scene.add(follow);

  // 定点补光：数得过来——两片滩、港池、口门、岬角、羊窝头
  const nodes = [
    [-140, 10, 70, PAL.lanternWarm, 20, 60],     // 大沙湾腹地灯串下
    [40, 10, 74, PAL.lanternWarm, 16, 52],
    [250, 9, 88, PAL.harborGold, 14, 46],        // 苏马湾
    [-560, 8, -230, PAL.harborGold, 26, 90],     // 港池停泊区
    [-306, 12, -16, PAL.navRed, 18, 60],         // 口门
    [340, 16, 30, '#9fb8d8', 16, 66],            // 岬角栈道的阴面
    [642, 14, 30, '#93aecb', 14, 56],            // 羊窝头礁盘
  ];
  const statics = [];
  for (const [x, y, z, c, i, dist] of nodes) {
    const l = new THREE.PointLight(rgb(c), i, dist, 1.9);
    l.position.set(x, y, z);
    scene.add(l);
    statics.push(l);
  }
  return { hemi, moon, follow, statics };
}

/* ============================================================ 装配 */

export function buildEnvironment(scene) {
  scene.fog = new THREE.FogExp2(GEO.fog.clone(), 0.0018);
  scene.background = GEO.bg.clone();

  const sky = buildSky(scene);
  buildTerrain(scene);
  const range = buildRange(scene);
  const trees = buildTrees(scene);
  const mist = buildMist(scene);
  const gulls = buildGulls(scene);
  const lights = buildLights(scene);

  // 栈道锚点上的挡机位岩脊：只注册锚点本身，避免把机位埋进地形
  for (const [bx, bz] of BOARDWALK) {
    const o = new THREE.Object3D();
    o.position.set(bx, terrainH(bx, bz) + 6, bz);
    scene.add(o);
    registerOccluder(o, 4.5);
  }

  let lastQ = -1;
  const fogDawn = rgb('#141c26');
  return {
    sky, trees, range, mist, gulls,
    lights: [lights.hemi, lights.follow, lights.moon, ...lights.statics],
    moon: lights.moon,
    hemi: lights.hemi,
    setMist(on) {
      mist.group.visible = on;
      scene.fog.density = on ? 0.0018 : 0.0009;
    },
    setGulls(on) { gulls.set(on); },
    startle(x, z) { gulls.startle(x, z); },
    dayness: () => sky.uni.uDay.value,
    update(t, dt, hour, level) {
      void level;
      const day = dayness(hour);
      sky.uni.uTime.value = t;
      sky.uni.uDay.value = day;
      sky.uni.uMoon.value.copy(moonAltitude(hour));
      sky.sm.uniforms.uTime.value = t;
      sky.sm.uniforms.uDay.value = day;
      lights.moon.position.copy(sky.uni.uMoon.value).multiplyScalar(600);
      lights.moon.target.position.set(-80, 0, -40);
      // 灯与雾色每 1/8 格才挪一次：逐帧插值不值得
      const q = Math.round(day * 8) / 8;
      if (q !== lastQ) {
        lastQ = q;
        const k = Math.min(1, day / 0.32);
        lights.hemi.intensity = 0.42 + day * 0.85;
        lights.moon.intensity = 0.55 * (1 - k * 0.55);
        scene.fog.color.copy(GEO.fog).lerp(fogDawn, k);
        scene.background.copy(GEO.bg).lerp(fogDawn, k * 0.8);
      }
      mist.update(t);
      gulls.update(t, dt);
      trees.update(t);
    },
  };
}
