import * as THREE from 'three';
import { CHIME } from './data.js';
import { terrainH, shoreAt, MOON_DIR, GEO } from './environment.js';
import { PAL } from './kit.js';
import {
  SEA, BASIN, HARBOR, BERTHS, CHANNEL, QUAY, DYKE, BREAKWATER,
  LIGHTHOUSE, BUOYS, BOARDWALK, PAL_HARBOR, STRIP_COLORS,
} from './layout.js';

/**
 * 水。这一版和湖面不一样，核心是「潮位」：
 *   · 海水面整体在 y=level 上起落（level 由 main.js 每帧传进来，-1.65 ~ +1.65）；
 *   · 滩地很缓（BEACH.slope 0.052），所以 3.3 米的潮差在岸上摊成几十米的进退，
 *     水线泡沫必须自己找到「当前高程 = 当前潮位」那条线；
 *   · 港池与外海之间只有一条口门，落潮时潮沟会露出来，涨潮时潮信推过港池。
 *
 * 潮位是全场公共变量，所以本文件用三个模块级 uniform 把它接住，
 * 让水面、泡沫、光柱、倒影共用同一个 level，外部只需调 buildWater().update(t, swell, level)。
 */
const uTide = { value: 0 };      // 当前潮位（米，相对平均海面）
const uSwell = { value: 1 };     // 涌浪倍率（0..1.x）
const uFlow = { value: 0 };      // 潮流累计位移：涨为负、落为正，泡沫带上的纹路顺它走

const WAVE_MAX = 8;

/* ------------------------------------------------------------------ 高度场 */

/**
 * 水线泡沫的做法：把 environment.terrainH 烘一张 RGBA8 高度图（一次性 CPU 成本），
 * fragment 里按「地形高 - 潮位」再除以地形坡度，得到片元到当前水线的水平距离，
 * 于是泡沫带永远咬住真实水线，低潮自然退到更南，高潮自然吞进滩地。
 *   R = 钳位到 [-9.2, 16] 的地形高——只有这一段跟潮位有关，钳位换来 0.1 m 的量化精度
 *   G = 口门/潮沟的流速掩膜（烘的时候用 CHANNEL 折线距离算）
 *   B = 避风度（港池、停泊区内为 1，用来把涌浪压平）
 *   A = 钳位到 [-46, 20] 的同源地形高——水深色要用真实水深，R 钳位后不够用
 * 代价：① 一次 44 万次 terrainH 的烘焙——实测 0.8 秒（航道包络盒与避风度包络盒各挡掉九成额外计算），
 *         落在 loading 的「放上涨落三米三的潮水」那一步，只此一次；
 * ② 2.2 m/纹素的分辨率，泡沫带 5~7 米宽，所以线边会有轻微锯齿，夜里读不出来；
 * ③ 高度是钳位过的，所以只有「浅水—干滩」这段的泡沫可信，颜色靠 A 通道的粗高程撑深水。
 * 换来的是：泡沫、水线、礁盘出露、港池连通全都不需要第二套解析近似，改地形不用改水。
 */
const HM = {
  x0: -1620, z0: -430, x1: 960, z1: 420,
  w: 1152, h: 384,
  min: -9.2, max: 16.0,
  cmin: -46, cmax: 20,
};
HM.sx = (HM.x1 - HM.x0) / HM.w;
HM.sz = (HM.z1 - HM.z0) / HM.h;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** 点到折线的最短距离（米） */
function distToPolyline(pts, x, z) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 1e-6 ? clamp01(((x - ax) * dx + (z - az) * dz) / len2) : 0;
    const px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, Math.hypot(px, pz));
  }
  return best;
}

/** 港池、停泊区这些被大堤与岛圈起来的水面：涌浪在这里要压平 */
const SHELTER = [
  ...BASIN.map((b) => ({ x: b.x, z: b.z, r: b.r })),
  { x: HARBOR.x, z: HARBOR.z, r: Math.max(HARBOR.rx, HARBOR.rz) },
  { x: BERTHS.x, z: BERTHS.z, r: Math.max(BERTHS.rx, BERTHS.rz) },
];

/* 烘焙要跑 40 多万次，能提前跳过的分支一律先跳：这两条包络盒各挡掉九成采样 */
const CH_BOX = CHANNEL.reduce((a, [x, z]) => ({
  x0: Math.min(a.x0, x), x1: Math.max(a.x1, x), z0: Math.min(a.z0, z), z1: Math.max(a.z1, z),
}), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
CH_BOX.x0 -= 60; CH_BOX.x1 += 60; CH_BOX.z0 -= 60; CH_BOX.z1 += 60;
const SH_R = Math.max(...SHELTER.map((s) => s.r)) + 4;
const SHELTER_X0 = Math.min(...SHELTER.map((s) => s.x - s.r));
const SHELTER_X1 = Math.max(...SHELTER.map((s) => s.x + s.r));
const SHELTER_Z0 = Math.min(...SHELTER.map((s) => s.z - s.r));
const SHELTER_Z1 = Math.max(...SHELTER.map((s) => s.z + s.r));

function bakeHeightField() {
  const data = new Uint8Array(HM.w * HM.h * 4);
  const q = (v) => Math.round(clamp01((v - HM.min) / (HM.max - HM.min)) * 255);
  const qc = (v) => Math.round(clamp01((v - HM.cmin) / (HM.cmax - HM.cmin)) * 255);
  for (let row = 0; row < HM.h; row++) {
    const z = HM.z0 + (row + 0.5) * HM.sz;      // DataTexture.flipY=false：第 0 行就是 v=0
    for (let col = 0; col < HM.w; col++) {
      const x = HM.x0 + (col + 0.5) * HM.sx;
      let h = terrainH(x, z);
      if (!Number.isFinite(h)) h = HM.min;      // 地形函数还没写完时也别把水烧了
      // 口门与潮沟：沿航道一条，出了平均水线以南 150 m 就不再有束流
      let flow = 0;
      if (x > CH_BOX.x0 && x < CH_BOX.x1 && z > CH_BOX.z0 && z < CH_BOX.z1) {
        flow = Math.exp(-Math.pow(distToPolyline(CHANNEL, x, z) / 26, 2));
        if (z > shoreAt(x) + 150) flow *= 0.3;
        if (h > 1.2) flow *= 0.25;              // 低潮露出的河床不算流速带
      }
      let shelter = 0;
      if (x > SHELTER_X0 && x < SHELTER_X1 && z > SHELTER_Z0 && z < SHELTER_Z1) {
        for (const s of SHELTER) {
          const dx = x - s.x, dz = z - s.z;
          if (dx * dx + dz * dz > SH_R * SH_R) continue;
          shelter = Math.max(shelter, sstep(0.12, 0.82, 1 - Math.sqrt(dx * dx + dz * dz) / s.r));
        }
      }
      const i = (row * HM.w + col) * 4;
      data[i] = q(h);
      data[i + 1] = Math.round(clamp01(flow) * 255);
      data[i + 2] = Math.round(clamp01(shelter) * 255);
      data[i + 3] = qc(h);
    }
  }
  const tex = new THREE.DataTexture(data, HM.w, HM.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 水面与泡沫共用的采样段：uTide 已经由模块级 uniform 接住，
 * 所以潮位一起、泡沫带与光柱自动跟着走，不需要每个模块回报潮位。
 */
const HM_GLSL = `
  /* 约定：下面的 p 一律是 vec2(世界x, 世界z)，所以 z 在 p.y 上，没有 p.z。
     hmAt 返回 vec4(精确高程·钳位到潮位带, 流速掩膜, 避风度, 粗高程·用于水深) */
  uniform sampler2D uHM; uniform vec4 uHMRect; uniform vec2 uHMRange; uniform vec2 uHMRange2;
  uniform vec2 uHMStep;
  uniform float uTide; uniform float uTime; uniform float uSwell; uniform float uFlow;
  float sstep(float a, float b, float x){ float t = clamp((x - a)/(b - a), 0.0, 1.0); return t*t*(3.0-2.0*t); }
  vec4 hmAt(vec2 p){
    vec2 uv = (p - uHMRect.xy) / uHMRect.zw;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec4 t = texture2D(uHM, clamp(uv, 0.0, 1.0));
    return vec4(mix(uHMRange.x, uHMRange.x + t.r * uHMRange.y, inside), t.ga * inside,
                mix(uHMRange2.x, uHMRange2.x + t.a * uHMRange2.y, inside));
  }
  float hmH(vec2 p){ return hmAt(p).x; }
  /* 地形梯度：泡沫带宽要按坡度折算成水平距离，陡的堤脚才不会只剩一条亚像素线 */
  vec2 hmGrad(vec2 p){
    float gx = (hmH(p + vec2(uHMStep.x, 0.0)) - hmH(p - vec2(uHMStep.x, 0.0))) / (2.0*uHMStep.x);
    float gz = (hmH(p + vec2(0.0, uHMStep.y)) - hmH(p - vec2(0.0, uHMStep.y))) / (2.0*uHMStep.y);
    return vec2(gx, gz);
  }
  /* 到水线的水平距离：>0 在岸侧（干的），<0 在水下。深水钳位后梯度为 0，自然算出很远 */
  float shoreDist(vec2 p){
    float g = max(length(hmGrad(p)), 0.016);
    return clamp((hmH(p) - uTide) / g, -90.0, 90.0);
  }
  /* 到海床的深度：图内取粗高程，图外按海底坡度继续往外沉。
     不这么做的话，高度图那个方框的四条边会在水面上顶出一条直线色接缝（北边是真水道，尤其明显）。 */
  float hmDepth(vec2 p, vec4 hm){
    vec2 uv = (p - uHMRect.xy) / uHMRect.zw;
    vec2 o = max(max(-uv, uv - 1.0), vec2(0.0)) * uHMRect.zw;
    return uTide - hm.w - (o.x + o.y) * 0.05;
  }
  /* 高度图边缘 40 m 内把泡沫收掉：图外钳位值会在边界上顶出一条假的直线泡沫 */
  float hmBorder(vec2 p){
    vec2 uv = (p - uHMRect.xy) / uHMRect.zw;
    vec2 d = min(uv, 1.0 - uv) * uHMRect.zw;
    return sstep(6.0, 40.0, min(d.x, d.y));
  }
`;

/** 长浪（多正弦 + 一点噪声）。几何只取前两道，法线用全套；代价写在下面。 */
const SWELL_GLSL = `
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash21(i), hash21(i+vec2(1.0,0.0)), f.x),
               mix(hash21(i+vec2(0.0,1.0)), hash21(i+vec2(1.0,1.0)), f.x), f.y);
  }
  float fbm(vec2 p){ return vnoise(p)*0.5 + vnoise(p*2.07 + 13.0)*0.3 + vnoise(p*4.13 - 7.0)*0.2; }
  vec2 SW0 = vec2(0.0612, 0.0236), SW1 = vec2(-0.0318, 0.0724), SW2 = vec2(0.1152, -0.0481), SW3 = vec2(0.2081, 0.1633);
  /* 只给法线用的斜率：四道正弦的解析导数。几何那边只取前三道（见 WATER_VS）。 */
  vec2 swellG(vec2 p, float t){
    return SW0*cos(dot(p, SW0) + t*0.62)*0.34 + SW1*cos(dot(p, SW1) + t*0.47)*0.22
         + SW2*cos(dot(p, SW2) + t*0.95)*0.11 + SW3*cos(dot(p, SW3) + t*1.55)*0.045;
  }
`;

/** 潮信波环：五更从灯塔脚下推出去的那一圈，过港池、过湾、上了干滩就吸收掉 */
const CHIME_GLSL = `
  uniform vec4 uWaves[${WAVE_MAX}];
  uniform float uWaveSpeed; uniform float uWaveFade;
  float chimeWave(vec2 p, out vec2 grad){
    float sum = 0.0; grad = vec2(0.0);
    for (int i = 0; i < ${WAVE_MAX}; i++) {
      float amp = uWaves[i].w;
      if (amp <= 0.0) continue;
      vec2 o = uWaves[i].xy;
      float age = uTime - uWaves[i].z;
      if (age < 0.0) continue;
      float d = length(p - o);
      float front = age * uWaveSpeed;
      float wet = 1.0 - smoothstep(-0.4, 1.4, hmH(p) - uTide);   // 爬上岸就死
      float band = exp(-pow((d - front)/6.5, 2.0)) * exp(-age/uWaveFade) * exp(-d/520.0);
      float train = exp(-pow((d - front + 13.0)/11.0, 2.0)) * exp(-age/uWaveFade) * exp(-d/520.0) * 0.4;
      sum += (band + train) * amp * wet;
      if (sum > 2.0) break;
      grad += normalize(p - o + vec2(0.0001)) * (band + train) * amp * wet * 0.5;
    }
    return sum;
  }
`;

/**
 * 浪高要收敛：浅滩压浪（水深 < 2.5 m 起明显衰减），港池里几乎平。
 * 顶点位移另外在远处压平——那里网格很粗，留着只会抖出锯齿地平线。
 */
const SHL_GLSL = `
  /* 浪高倍率：浅水、港池、远处各压一档（远处网格太粗，留着只会抖出锯齿地平线） */
  float swellK(vec2 p, float t){
    vec4 hm = hmAt(p);
    float depth = hmDepth(p, hm);
    float deep = sstep(0.10, 2.8, depth) * sstep(-0.2, 4.0, depth);
    float sheltered = 1.0 - 0.9*hm.z;
    float far = 1.0 - sstep(820.0, 1500.0, max(abs(p.x + 60.0), abs(p.y)));
    return uSwell * deep * sheltered * (0.35 + 0.85*sstep(5.0, 20.0, depth)) * (0.25 + 0.75*far);
  }
`;

const WATER_VS = `
  varying vec3 vW;
  ${HM_GLSL}${SWELL_GLSL}${CHIME_GLSL}${SHL_GLSL}
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    /* 几何只吃前两道长浪：网格再密也架不住 SW2/SW3（30~60 m 波长）的采样，
       它们只进 fragment 的法线。代价：涌浪的浪尖与近处的小碎浪在几何上是平的，
       夜里靠法线与泡沫把它读回来。 */
    float k = swellK(p, uTime);
    float h = (sin(dot(p, SW0) + uTime*0.62)*0.34 + sin(dot(p, SW1) + uTime*0.47)*0.22
             + sin(dot(p, SW2) + uTime*0.95)*0.11) * k;
    vec2 gw;
    h += chimeWave(p, gw) * 0.42;
    wp.y += h;
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const WATER_FS = `
  uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShelf; uniform vec3 uSilt;
  uniform vec3 uMoon; uniform vec3 uCityDir; uniform vec3 uIsleDir;
  uniform vec3 uLampPos; uniform float uLampAz; uniform float uLampGain;
  uniform float uFrost;
  varying vec3 vW;
  ${HM_GLSL}${SWELL_GLSL}${CHIME_GLSL}${SHL_GLSL}

  vec3 skyAt(vec3 d){
    // 夜里不给天光：只留青黑的底、地平线一圈城建反光和月晕
    float up = clamp(d.y*0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.006, 0.010, 0.019), vec3(0.010, 0.016, 0.032), smoothstep(0.5, 0.86, up));
    float hz = pow(clamp(1.0 - abs(d.y)*3.0, 0.0, 1.0), 2.4);
    vec3 hd = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 0.0, 0.0001));
    col += vec3(0.050, 0.030, 0.015) * hz * pow(max(0.0, dot(hd, uCityDir)), 3.0) * 1.3;   // 墟沟
    col += vec3(0.030, 0.026, 0.018) * hz * pow(max(0.0, dot(hd, uIsleDir)), 4.0);          // 岛上两串灯
    float md = max(0.0, dot(d, uMoon));
    col += vec3(0.070, 0.082, 0.098) * pow(md, 20.0);
    return mix(col, vec3(0.004, 0.007, 0.013), smoothstep(0.0, -0.06, d.y));
  }

  void main(){
    vec2 p = vW.xz;
    float t = uTime;
    vec4 hm = hmAt(p);
    float depth = hmDepth(p, hm);
    float det = clamp(1.0 - length(cameraPosition - vW)/150.0, 0.0, 1.0);

    /* 法线：长浪用解析导数，碎浪与噪声只在这段出现，越近越有效 */
    float k = swellK(p, t);
    vec2 g = swellG(p, t) * k;
    float n1 = vnoise(p*0.85 + vec2(t*1.05, -t*0.62));
    float n2 = vnoise(p*2.15 - vec2(t*1.55, t*0.75));
    g += (vec2(n1 - 0.5, n2 - 0.5) * 0.55 + vec2(cos(p.x*2.2 + t*2.4), sin(p.y*1.9 - t*2.0)) * 0.18)
       * k * det * (1.0 - 0.75*hm.z);
    vec2 wg; float wv = chimeWave(p, wg);
    g += wg;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);

    /* 底色：深海 → 湾外中段 → 近岸浅水，港池单独往浊里带。
       外海必须落到 SEA.deep：夜里的海只该靠灯火和月光起亮，不靠自己。
       深水那一档在 6~12 m 就收住，正好压在高度图南边边上——图外钳位值是 -46，
       不收住就会在南界 z=420 上顶出一条横直线。 */
    float shelf = sstep(9.5, 1.3, depth);
    vec3 col = mix(uMid, uDeep, sstep(6.0, 12.0, depth));
    col = mix(col, uShelf, shelf * 0.86);
    col = mix(col, uSilt, hm.z * 0.8);
    col *= 0.55 + 0.45*sstep(-0.4, 2.2, depth);           // 水皮越薄越暗，露滩就不发光

    vec3 r = reflect(-V, n);
    col = mix(col, skyAt(normalize(r)) * 0.72, 0.10 + 0.40*fres);

    // 星子只在掠射角上落一线，密度压得很低
    vec2 sc = floor(r.xz*2.6 + t*0.02);
    col += vec3(0.30, 0.37, 0.52) * step(0.9984, hash21(sc)) * pow(fres, 2.4) * (1.0 - uFrost*0.6);

    /* 月：一条朝北偏西的长高光 */
    vec3 H = normalize(V + uMoon);
    float ndh = max(dot(n, H), 0.0);
    float lane = smoothstep(0.52, 0.995, dot(normalize(vec3(V.x, 0.0, V.z)), normalize(vec3(uMoon.x, 0.0, uMoon.z))));
    col += vec3(0.38, 0.44, 0.58) * pow(ndh, 520.0) * (0.30 + lane*1.55);
    col += vec3(0.09, 0.13, 0.20) * pow(ndh, 90.0) * (0.03 + lane*0.26);

    /* 灯塔扫光：6 秒一转的光楔落在口门外，楔形本身就把它拉成一条长高光。
       相位这里独立按 uTime 推——main.js 不回报闪光状态（kaiyu 才持有），
       有 setBeam() 可以外部校正，不调也只会差一点点，反正是一条软边。 */
    vec3 toL = uLampPos - vW;
    float dl = length(toL);
    vec3 HL = normalize(V + toL/max(dl, 0.001));
    float nlh = max(dot(n, HL), 0.0);
    float az = atan(vW.x - uLampPos.x, vW.z - uLampPos.z);
    float daz = abs(mod(az - uLampAz + 4.712389, 6.283185) - 3.141593);
    float wedge = exp(-pow(daz/0.085, 2.0)) * (1.0/(1.0 + dl*dl*0.00006));
    col += vec3(0.60, 0.70, 0.85) * (pow(nlh, 260.0)*0.9 + pow(nlh, 20.0)*0.10) * wedge * uLampGain;

    /* 潮沟与口门：束流处把水皮提亮一点，纹路顺 uFlow 走（落潮朝南、涨潮朝北） */
    float streak = fbm(p*0.05 - vec2(0.0, uFlow*0.35) + vec2(t*0.03, 0.0));
    col += vec3(0.09, 0.12, 0.14) * hm.y * (0.35 + 0.65*streak) * (1.0 - shelf*0.35);

    // 潮信过处：冷色浪脊加一道暖边
    col += vec3(0.22, 0.30, 0.43) * wv * 0.55;
    col += vec3(0.28, 0.16, 0.07) * wv * wv * 0.45;

    col *= 0.95 + (fbm(p*0.013 + vec2(t*0.02, -t*0.03)) - 0.5) * 0.12;
    col = mix(col, col*0.9 + vec3(0.024, 0.034, 0.046), uFrost*(0.18 + 0.22*fres));

    float a = clamp(0.90 + fres*0.08, 0.0, 0.97);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
  }`;

const FOAM_FS = `
  uniform vec3 uFoamCol; uniform vec3 uWarm; uniform float uFrost;
  varying vec3 vW;
  ${HM_GLSL}${SWELL_GLSL}${CHIME_GLSL}${SHL_GLSL}

  void main(){
    vec2 p = vW.xz;
    float t = uTime;
    vec4 hm = hmAt(p);
    float depth = hmDepth(p, hm);

    /* 水线：按坡度折算成水平距离，于是 5~7 m 宽的泡沫带在缓滩和陡堤脚上一样粗 */
    float hn = shoreDist(p);
    float drift = 0.9*sin(t*0.62 + p.x*0.041) + 0.6*sin(t*0.37 - p.y*0.062) + 0.4*sin(t*1.1 + p.x*0.11);
    float mottle = fbm(p*0.10 + vec2(uFlow*0.55 + t*0.05, t*0.02));
    float edge = exp(-pow((hn - 0.9 - drift*1.5)/2.7, 2.0));
    float back = exp(-pow((hn + 4.6 - drift*2.0)/4.2, 2.0)) * 0.55;
    float line = (edge + back) * (0.35 + 0.9*mottle);

    /* 碎浪：涌浪拍到浅滩与礁盘的那一圈白沫，港池里给压掉 */
    float energy = swellK(p, t) * (1.0 - 0.85*hm.z);
    float surf = sstep(3.6, 0.5, depth) * sstep(-0.5, 0.9, depth) * energy;
    surf *= 0.45 + 0.55*fbm(p*0.28 - vec2(t*0.9, t*0.35));

    /* 口门束流：流速掩膜高的地方一条更快的白水 */
    float mouth = hm.y * (0.30 + 0.70*fbm(p*0.14 - vec2(uFlow*1.6, t*0.55)));

    float a = clamp(line + surf*0.85 + mouth*0.5, 0.0, 1.0);
    a *= hmBorder(p) * (1.0 - uFrost*0.15);
    if (a < 0.012) discard;
    vec3 col = mix(uFoamCol, uWarm, clamp(surf*0.35 + mouth*0.7, 0.0, 0.5));
    col *= 1.0 - 0.35*hm.z;                     // 港内泡沫少、也脏
    gl_FragColor = vec4(col, a*0.85);
    #include <tonemapping_fragment>
  }`;

let HM_TEX = null;
const waterUniforms = () => ({
  uHM: { value: (HM_TEX || (HM_TEX = bakeHeightField())) },
  uHMRect: { value: new THREE.Vector4(HM.x0, HM.z0, HM.x1 - HM.x0, HM.z1 - HM.z0) },
  uHMRange: { value: new THREE.Vector2(HM.min, HM.max - HM.min) },
  uHMRange2: { value: new THREE.Vector2(HM.cmin, HM.cmax - HM.cmin) },
  uHMStep: { value: new THREE.Vector2(HM.sx, HM.sz) },
  uTide, uSwell, uFlow, uTime: { value: 0 },
  uWaves: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
  uWaveSpeed: { value: 60 }, uWaveFade: { value: CHIME.sustain },
  uFrost: { value: 1 },
});

/* ------------------------------------------------------------------ 潮信波环 */

/**
 * 潮信波环：五更从灯塔脚下推出去，一圈一圈推过港池与大沙湾。
 * 速度照 CHIME.sustain 定——波前在最后一声余响散尽时刚好拍到停泊区最里侧与湾的对岸。
 * 这里没有网格，环只是数据；水面与泡沫在 shader 里读 uWaves。
 */
export class WaveRings {
  constructor() {
    this.items = [];
    // 源点取灯塔脚下；跨度取「最远的港池洼地边缘」与「航道出湾口」两者的大值
    const spans = [
      ...BASIN.map((b) => Math.hypot(b.x - LIGHTHOUSE.x, b.z - LIGHTHOUSE.z) + b.r),
      Math.hypot(BERTHS.x - LIGHTHOUSE.x, BERTHS.z - LIGHTHOUSE.z) + BERTHS.rx,
      ...CHANNEL.map(([x, z]) => Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z)),
    ];
    this.span = Math.max(...spans);
    this.speed = this.span / (CHIME.sustain * 1.3);
    this.life = CHIME.sustain * 1.6;
  }
  emit(x, z, t0, amp = 1) {
    this.items.push({ x, z, t0, amp });
    while (this.items.length > WAVE_MAX) this.items.shift();
    return this.items[this.items.length - 1];
  }
  update(t) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (t - this.items[i].t0 > this.life) this.items.splice(i, 1);
    }
    return this.items;
  }
  get list() { return this.items; }
  fill(uniforms, t) {
    const arr = uniforms.uWaves.value;
    for (let i = 0; i < WAVE_MAX; i++) {
      const w = this.items[i];
      if (!w || t - w.t0 > this.life) { arr[i].set(0, 0, 0, 0); continue; }
      arr[i].set(w.x, w.z, w.t0, w.amp);
    }
    uniforms.uWaveSpeed.value = this.speed;
    uniforms.uWaveFade.value = CHIME.sustain;
  }
}

/* -------------------------------------------------------------------- 倒影 */

/** 镜像材质共用的抖动：潮位从 uTide 走，淡出因此始终按「水面以下多深」算 */
class Wobble {
  constructor() {
    this.time = { value: 0 };
    this.ripple = uSwell;
    this.tide = uTide;
    this.cache = new Map();
  }
  material(src) {
    const key = src.uuid;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.3);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: src.map || null, transparent: true, opacity: 0.32,
      depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.NormalBlending,
    });
    m.toneMapped = false;
    const wob = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wob.time;
      shader.uniforms.uRipple = wob.ripple;
      shader.uniforms.uTide = wob.tide;
      shader.vertexShader = 'uniform float uTime; uniform float uRipple;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.x += (sin(transformed.y*0.30 + uTime*1.7) + sin(transformed.z*0.49 - uTime*1.1)) * 0.24 * uRipple;
          transformed.z += (sin(transformed.y*0.25 - uTime*1.3) + sin(transformed.x*0.42 + uTime*1.9)) * 0.18 * uRipple;
        `)
          .replace('#include <common>', 'varying vec3 vWorldPosition;\n#include <common>')
          .replace('#include <worldpos_vertex>', `
            #include <worldpos_vertex>
            vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = 'uniform float uTide;\n' + shader.fragmentShader
        .replace('#include <common>', 'varying vec3 vWorldPosition;\n#include <common>')
        .replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          gl_FragColor.a *= smoothstep(-34.0, -0.8, vWorldPosition.y - uTide) * 0.94 + 0.06;
        `);
    };
    m.customProgramCacheKey = () => 'liandao-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 把渔港那一片构筑物倒扣到水下当倒影。
 * 镜面 y 必须跟着潮位走：mirror.position.y = 2*level，否则高潮时倒影沉、低潮时浮。
 */
export class Reflections {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'reflections';
    this.wobble = new Wobble();
    this.mirror = new THREE.Group();
    this.mirror.scale.set(1, -1, 1);
    this.mirror.position.y = 0;
    this.root.add(this.mirror);
    scene.add(this.root);
    this.pairs = [];
  }
  add(source) {
    const clone = source.clone(true);
    clone.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      o.castShadow = o.receiveShadow = false;
      if (o.isMesh) o.material = this.wobble.material(o.material);
    });
    this.mirror.add(clone);
    this.pairs.push([source, clone]);
    return clone;
  }
  sync() {
    for (const [src, clone] of this.pairs) {
      clone.position.copy(src.position);
      clone.rotation.copy(src.rotation);
      clone.scale.copy(src.scale);
      if (src.children.length) {
        const a = []; const b = [];
        src.traverse((o) => a.push(o));
        clone.traverse((o) => b.push(o));
        for (let i = 0; i < Math.min(a.length, b.length); i++) b[i].visible = a[i].visible;
      } else clone.visible = src.visible;
    }
  }
  set enabled(v) { this.root.visible = v; }
  get enabled() { return this.root.visible; }
  /** 第二参数是潮位（main.js 传的就是 level）；抖幅从本文件的 uSwell 取，不用外部回报 */
  update(t, level) {
    this.wobble.time.value = t;
    this.mirror.position.y = 2 * level;
    this.sync();
  }
}

/* ------------------------------------------------------------------ 灯的光柱 */

const COL_VS = `
  uniform float uTide; uniform float uTime; uniform float uSwell;
  attribute float aFlash; attribute float aPhase;
  varying vec2 vUv; varying vec3 vCol; varying float vPulse;
  float blink(float period, float phase, float t){
    if (period <= 0.0) return 1.0;
    float f = fract(t/period + phase);
    return smoothstep(0.34, 0.46, f) * (1.0 - smoothstep(0.52, 0.68, f)) + 0.05;
  }
  void main(){
    vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    /* 柱头用实例给的世界高程（堤顶 +9 就是 +9），柱脚一律落到当前潮位下 sy 处。
       所以外部就算把灯的相对高度传错，光柱也只会变长变短，不会离开水面。 */
    float head = max(wp.y, uTide + 0.05);
    float run = max(0.6, head - (uTide - sy));
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    float t = 1.0 - uv.y;
    float wob = sin(wp.z*0.34 + uTime*1.7)*0.6 + sin(wp.x*0.51 - uTime*1.25)*0.4
              + sin(wp.x*0.9 + wp.z*0.7 + uTime*2.6)*0.25;
    vec3 pos = vec3(wp.x, head - uv.y*run, wp.z)
             + right*((uv.x - 0.5)*sx*(0.40 + 1.15*t))
             + right*wob*uSwell*t*t*1.35;
    vUv = uv; vCol = instanceColor;
    vPulse = blink(aFlash, aPhase, uTime) * (0.78 + 0.22*sin(uTime*2.9 + wp.x*1.6 + wp.z*2.2));
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }`;

const COL_FS = `
  uniform float uStrength;
  varying vec2 vUv; varying vec3 vCol; varying float vPulse;
  void main(){
    float across = 1.0 - abs(vUv.x - 0.5)*2.0;
    /* 灯头最亮，往下留一条到底的尾巴：水面那一段不能提前断掉 */
    float along = 0.22 + 0.78*pow(1.0 - vUv.y, 1.5);
    float a = pow(across, 1.7) * along * vPulse * uStrength;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol * (0.8 + 0.5*across), a);
    #include <tonemapping_fragment>
  }`;

const POOL_VS = `
  uniform float uTide; uniform float uTime; uniform float uSwell;
  attribute float aFlash; attribute float aPhase;
  varying vec2 vUv; varying vec3 vCol; varying float vPulse;
  float blink(float period, float phase, float t){
    if (period <= 0.0) return 1.0;
    float f = fract(t/period + phase);
    return smoothstep(0.34, 0.46, f) * (1.0 - smoothstep(0.52, 0.68, f)) + 0.05;
  }
  void main(){
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    /* 水面的光斑永远贴在潮位上，再叠一点涌浪起伏，涨落时它自己跟着抬 */
    wp.y = uTide + 0.09 + sin(wp.x*0.13 + uTime*0.9)*0.05*uSwell + sin(wp.z*0.11 - uTime*0.7)*0.05*uSwell;
    vUv = uv; vCol = instanceColor;
    vPulse = blink(aFlash, aPhase, uTime);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const POOL_FS = `
  uniform float uStrength; uniform float uTime; uniform float uSwell;
  varying vec2 vUv; varying vec3 vCol; varying float vPulse;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
  void main(){
    vec2 q = (vUv - 0.5)*2.0;
    float d = length(q);
    float ripple = 1.0 + 0.10*uSwell*sin(d*13.0 - uTime*2.2) + 0.06*h21(floor(q*24.0));
    float a = exp(-pow(d*1.35/ripple, 2.6)) * vPulse * uStrength * 0.7;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol, a);
    #include <tonemapping_fragment>
  }`;

/**
 * 灯落在港池与湾口水面上的光柱（竖向拉长的碎光）加一圈贴水的光斑。
 * 本文件自己就把固定灯位铺好：堤灯、码头橘金灯、口门红绿灯桩、灯塔、栈道栏灯；
 * 渔船桅灯由 props.js 用 add()/setPos() 追加。
 */
export class LightColumns {
  constructor(scene) {
    this.items = [];
    this.dirty = true;
    this.capacity = 900;

    const streakGeo = new THREE.PlaneGeometry(1, 1);
    this.streakMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uSwell, uTide, uStrength: { value: 1 } },
      vertexShader: COL_VS, fragmentShader: COL_FS, side: THREE.DoubleSide,
    });
    this.streaks = new THREE.InstancedMesh(streakGeo, this.streakMat, this.capacity);
    this.streaks.renderOrder = 4;

    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uSwell, uTide, uStrength: { value: 1 } },
      vertexShader: POOL_VS, fragmentShader: POOL_FS, side: THREE.DoubleSide,
    });
    this.pools = new THREE.InstancedMesh(poolGeo, this.poolMat, this.capacity);
    this.pools.renderOrder = 4;

    for (const im of [this.streaks, this.pools]) {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
      im.geometry.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1));
      im.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1));
      im.frustumCulled = false;
      im.count = 0;
    }

    // 契约要求 mesh 可隐藏：两件套挂在一个 Group 上，?hide=columns 才关得干净
    this.mesh = new THREE.Group();
    this.mesh.name = 'light-columns';
    this.mesh.add(this.streaks, this.pools);
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.seed();
  }

  /** 固定灯位：全部由 layout.js 的点推出来，不写死坐标 */
  seed() {
    const warm = PAL_HARBOR[1];
    // 西大堤堤灯：每 34 m 一盏，堤顶 +9
    for (let i = 0; i < DYKE.pts.length - 1; i++) {
      const [ax, az] = DYKE.pts[i], [bx, bz] = DYKE.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / DYKE.lampGap));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        this.add(new THREE.Vector3(ax + (bx - ax) * t, DYKE.crown + 0.4, az + (bz - az) * t),
          STRIP_COLORS[1], 1.0, 11, 0.85, 0, 6.5);
      }
    }
    // 码头岸线：橘金，贴着 QUAY 折线
    for (let i = 0; i < QUAY.pts.length - 1; i++) {
      const [ax, az] = QUAY.pts[i], [bx, bz] = QUAY.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 26));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        this.add(new THREE.Vector3(ax + (bx - ax) * t, QUAY.top + 1.1, az + (bz - az) * t),
          warm, 1.2, 9, 1.0);
      }
    }
    // 口门灯桩：红、绿、黄，按各自 flash 周期闪
    for (const b of BUOYS) this.add(new THREE.Vector3(b.x, 3.4, b.z), b.hue, 1.1, 10, 1.25, b.flash);
    // 防波堤内坡一串
    for (let i = 0; i < BREAKWATER.pts.length - 1; i++) {
      const [ax, az] = BREAKWATER.pts[i], [bx, bz] = BREAKWATER.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let k = 0; k < len / 30; k++) {
        const t = (k + 0.5) * 30 / len;
        this.add(new THREE.Vector3(ax + (bx - ax) * t, BREAKWATER.crown + 0.3, az + (bz - az) * t),
          PAL_HARBOR[0], 0.9, 8, 0.7);
      }
    }
    // 灯塔：月白长柱 + 6 秒一闪
    this.add(new THREE.Vector3(LIGHTHOUSE.x, LIGHTHOUSE.focal, LIGHTHOUSE.z),
      PAL.moonWhite, 2.2, 16, 1.5, LIGHTHOUSE.phase);
    // 栈道栏灯：高程按脚下地形抬，别插进沙里
    for (let i = 0; i < BOARDWALK.length - 1; i++) {
      const [ax, az] = BOARDWALK[i], [bx, bz] = BOARDWALK[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let k = 0; k < len / 17; k++) {
        const t = (k + 0.5) * 17 / len;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        this.add(new THREE.Vector3(x, terrainH(x, z) + 3.4, z), PAL_HARBOR[2], 0.8, 7, 0.62);
      }
    }
    // 港池仓库山墙那两串
    for (const line of [[-700, -226], [-560, -280]]) {
      this.add(new THREE.Vector3(line[0], 6.4, line[1]), PAL_HARBOR[1], 1.3, 9, 0.9);
    }
  }

  /**
   * pos.y = 灯头在世界高程（含潮位，船的桅灯请把 level 一起算进来）。
   * depth 是光柱插到水面以下多深；flash>0 秒的周期让它一闪一闪（口门灯桩、灯塔）。
   */
  add(pos, color, width = 1.1, depth = 9, intensity = 1, flash = 0, pool = 0) {
    if (this.items.length >= this.capacity) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, flash, pool: pool || width * 3.4, phase: (i * 0.618034) % 1, on: true,
    });
    this.dirty = true;
    return i;
  }
  setPos(i, pos) {
    if (i < 0 || !this.items[i]) return;
    this.items[i].pos.copy(pos);
    this.dirty = true;
  }
  setOn(i, on) {
    if (i < 0 || !this.items[i] || this.items[i].on === on) return;
    this.items[i].on = on;
    this.dirty = true;
  }
  flush() {
    const d = this.dummy;
    const fa = this.streaks.geometry.attributes.aFlash;
    const pa = this.streaks.geometry.attributes.aPhase;
    const fb = this.pools.geometry.attributes.aFlash;
    const pb = this.pools.geometry.attributes.aPhase;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, it.pos.y, it.pos.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(it.on ? it.width : 0, it.on ? it.depth : 0, 1);
      d.updateMatrix();
      this.streaks.setMatrixAt(i, d.matrix);
      this.streaks.setColorAt(i, it.color);
      d.scale.set(it.on ? it.pool : 0, 1, it.on ? it.pool : 0);
      d.updateMatrix();
      this.pools.setMatrixAt(i, d.matrix);
      this.pools.setColorAt(i, it.color);
      fa.array[i] = it.flash; pa.array[i] = it.phase;
      fb.array[i] = it.flash; pb.array[i] = it.phase;
    });
    this.streaks.count = this.pools.count = this.items.length;
    this.streaks.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
    for (const a of [fa, pa, fb, pb]) a.needsUpdate = true;
    this.dirty = false;
  }
  /** gain 由外部给（潮信经过时 main.js 让它矮一口）；swell 决定碎得有多厉害 */
  update(t, swell, gain) {
    for (const m of [this.streakMat, this.poolMat]) {
      m.uniforms.uTime.value = t;
      m.uniforms.uStrength.value = gain * (0.85 + 0.15 * Math.min(1, swell));
    }
    if (this.dirty) this.flush();
  }
}

/* ---------------------------------------------------------------------- 海面 */

/** 顶点向岛这一侧加密：外海远处只要一条平地平线，湾里才需要 2~3 m 的采样 */
function seaGeo(nu, nv, hw, hd, warp = 2.0) {
  const f = (t) => Math.sign(t) * Math.pow(Math.abs(t), warp);
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const idx = [];
  let k = 0;
  for (let j = 0; j <= nv; j++) {
    const tz = f((j / nv) * 2 - 1) * hd;
    for (let i = 0; i <= nu; i++) {
      pos[k++] = f((i / nu) * 2 - 1) * hw;
      pos[k++] = 0;
      pos[k++] = tz;
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, dd = c + 1;
      idx.push(a, c, b, b, c, dd);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 海面 + 水线泡沫。mesh 与 foam 是两个平面，共用一套 uniform：
 * 每帧把 y 设为 level，水线、泡沫、光柱柱脚、倒影镜面全跟着起落。
 */
export function buildWater(scene, rings = new WaveRings()) {
  const waterMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(waterUniforms(), {
      uMoon: { value: MOON_DIR.clone().normalize() },
      uDeep: { value: new THREE.Color(GEO.deep) },
      uMid: { value: new THREE.Color(GEO.mid) },
      uShelf: { value: new THREE.Color(GEO.shelf) },
      uSilt: { value: new THREE.Color(GEO.silt) },                // 港池偏浊
      uCityDir: { value: new THREE.Vector3(-1, 0, -0.35).normalize() },
      uIsleDir: { value: new THREE.Vector3(0, 0, -1) },
      uLampPos: { value: new THREE.Vector3(LIGHTHOUSE.x, LIGHTHOUSE.focal, LIGHTHOUSE.z) },
      uLampAz: { value: 0 },
      uLampGain: { value: 1 },
    }),
    vertexShader: WATER_VS, fragmentShader: WATER_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  waterMat.customProgramCacheKey = () => 'liandao-water';

  const foamMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(waterUniforms(), {
      uFoamCol: { value: new THREE.Color(PAL.foam) },
      uWarm: { value: new THREE.Color('#e8c79a') },
    }),
    vertexShader: WATER_VS, fragmentShader: FOAM_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  foamMat.customProgramCacheKey = () => 'liandao-foam';

  // 外海铺到看不见边，鸟瞰机位才不穿帮
  const mesh = new THREE.Mesh(seaGeo(240, 240, SEA.halfW, SEA.halfD), waterMat);
  mesh.name = 'haizhou-bay-sea';
  mesh.position.y = uTide.value;
  mesh.renderOrder = 3;
  mesh.castShadow = mesh.receiveShadow = false;
  scene.add(mesh);

  // 泡沫只铺高度图那一片：外海没有水线，港池北岸由构筑物挡住
  const foam = new THREE.Mesh(seaGeo(96, 40, (HM.x1 - HM.x0) / 2, (HM.z1 - HM.z0) / 2, 1), foamMat);
  foam.name = 'tideline-foam';
  foam.position.set((HM.x0 + HM.x1) / 2, uTide.value + 0.13, (HM.z0 + HM.z1) / 2);
  foam.renderOrder = 5;
  scene.add(foam);

  let lastLevel = uTide.value;
  let beamExternal = false;

  const mats = [waterMat, foamMat];
  return {
    mesh, foam, rings,
    uniforms: waterMat.uniforms,
    foamUniforms: foamMat.uniforms,
    setFrost(v) { for (const m of mats) m.uniforms.uFrost.value = v ? 1 : 0; },
    /** kaiyu 的灯塔扫光如果要跟水面严格同相，把它此刻的方位角报进来；不报也只会差一点点 */
    setBeam(az, gain = 1) {
      beamExternal = true;
      waterMat.uniforms.uLampAz.value = az;
      waterMat.uniforms.uLampGain.value = gain;
    },
    update(t, swell, level) {
      const d = level - lastLevel;
      lastLevel = level;
      uTide.value = level;
      uSwell.value = swell;
      // 累计一点潮流位移：落潮为正（水往南退），涨潮反向，泡沫与束流的纹路顺它走
      uFlow.value = THREE.MathUtils.clamp(uFlow.value + d * 18, -120, 120);
      if (!beamExternal) {
        // 灯塔 6 秒一转：main.js 不回报闪光状态，这里按 uTime 自己推一版
        waterMat.uniforms.uLampAz.value = (t / LIGHTHOUSE.phase) * Math.PI * 2;
        waterMat.uniforms.uLampGain.value = 1;
      }
      for (const m of mats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uWaveSpeed.value = rings.speed;
      }
      rings.fill(waterMat.uniforms, t);
      rings.fill(foamMat.uniforms, t);
      rings.update(t);
      mesh.position.y = level;
      foam.position.y = level + 0.13;
    },
  };
}
