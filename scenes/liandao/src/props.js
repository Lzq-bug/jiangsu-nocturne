import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, glow, lit, rand, rr, stringPath, figureGeo, instanced,
  hullGeo, mastGeo, umbrellaGeo, flagGeo,
} from './kit.js';
import * as T from './textures.js';
import { terrainH, shoreZat } from './environment.js';
import { LAYOUT } from './architecture.js';
import { CHIME } from './data.js';
import {
  BERTHS, CHANNEL, FIELD, UMBRELLAS, WALK, LANTERN_LINES, HEADS, SHEEP, ARMOUR,
  DYKE, QUAY, BREAKWATER, FLEET_LIGHTS, STRIP_COLORS, BAYS, BEACH,
} from './layout.js';

/**
 * 软景与道具：候潮的船队、滩上的夜客、檐下的灯串、搁下的伞、拍礁的浪沫、船尾的渔旗。
 *
 * 全场只有一个时钟（main.js），潮位 level 与场景时刻 hour 由它逐帧喂进来。
 * fleet / umbrellas / spray 三个入口都拿到 level，于是把最新的一份写进 tideNow，
 * 其余拿不到 level 的系统（人群、灯串、旗）读这份共享值——最多晚一帧，看不出来。
 *
 * 随机一律走 kit.rand：确定性序列，刷新一次画面里船位、伞位、人数分毫不差。
 * 会重复摆动的东西一律 InstancedMesh 或合批 single mesh，逐帧只改矩阵。
 */

/* --------------------------------------------------------------- 潮位共享 */
const tideNow = { level: 0, hour: 19.4 };
function setTide(level, hour) {
  if (Number.isFinite(level)) tideNow.level = level;
  if (Number.isFinite(hour)) tideNow.hour = hour;
}

/* --------------------------------------------------------------- 小工具 */
const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const IDQ = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** 月光方向：从东南海上低低斜过来，只给人和船勾一道边 */
const MOONLIGHT = new THREE.Vector3(-0.34, 0.44, 0.83).normalize();

/** 贴图缺件时退回 softGlow：并行开发的模块不该把整场戏拖垮 */
function texOf(make, ...args) {
  try {
    const t = typeof make === 'function' ? make(...args) : null;
    if (t) return t;
  } catch { /* 那张贴图还没写 */ }
  return T.softGlow('255,240,220', 0.4);
}

/** 自己拥有一份发光材质：可以按夜色改亮度，又不会碰到 kit 里缓存的同色材质 */
const ownMats = new Map();
function lampMat(color, gain) {
  const key = `${color}|${gain}`;
  if (!ownMats.has(key)) {
    const m = glow(color, gain).clone();
    m.toneMapped = false; m.fog = false;
    ownMats.set(key, { mat: m, base: m.color.clone() });
  }
  return ownMats.get(key);
}

/** 黄昏掌灯、拂晓压火：只在 hour 上做，绝不自起时钟 */
function nightFactor(hour) {
  const t = ((hour % 24) + 24) % 24;
  const on = smoothstep(t, 17.9, 19.5);
  const off = smoothstep(t, 4.9, 7.4) * 0.7;
  return clamp(on * (1 - off), 0, 1);
}

/** 把 geometry 收拾成能 merge 的样子：只留 position/normal/uv，一律去索引 */
function normGeo(src) {
  let g = src.clone();
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  return g;
}

/** 把一个 Group（mastGeo / umbrellaGeo 给的）按材质烘成几块本地 geometry，能实例化 */
function bake(src, prefer) {
  const root = new THREE.Group();
  root.add(src);
  root.updateMatrixWorld(true);
  const acc = new Map();
  src.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = normGeo(o.geometry);
    g.applyMatrix4(o.matrixWorld);
    const material = (prefer && prefer(o.material)) || o.material || M.plank;
    const key = material && material.uuid ? material.uuid : 'any';
    if (!acc.has(key)) acc.set(key, { material, list: [] });
    acc.get(key).list.push(g);
  });
  const out = [];
  for (const { material, list } of acc.values()) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    merged.computeBoundingBox();
    out.push({ geometry: merged, material });
  }
  return out;
}

/** 归一化 [x,y,z] / Vector3 / 混合数组：架构那边回填的 anchors 什么形状都不怕 */
function vecs(a, out = []) {
  if (!a) return out;
  if (Array.isArray(a)) { for (const v of a) vecs(v, out); return out; }
  if (a.isVector3) { out.push(a.clone()); return out; }
  if (Array.isArray(a.p)) out.push(new THREE.Vector3(...a.p));
  else if (typeof a.x === 'number' && typeof a.z === 'number') out.push(new THREE.Vector3(a.x, a.y || 0, a.z));
  return out;
}

/* ------------------------------------------------------- 潮信波场（共用） */
export const WAVE_MAX = 8;
/** 一更报完，波前正好从灯塔脚下拍到苏马湾：CHIME.sustain 秒走完约 630 米 */
export const WAVE_SPEED = Math.round(630 / CHIME.sustain);
export const WAVE_SUSTAIN = CHIME.sustain;

/** 波环时刻表：灯串、人群、浪沫、渔旗吃的是同一套数，与 water.js 的 WaveRings 同速 */
export const waveGLSL = `
  uniform vec4 uWaves[${WAVE_MAX}];
  uniform vec3 uWaveCol[${WAVE_MAX}];
  float waveField(vec2 p, out vec3 tint){
    float sum = 0.0; tint = vec3(0.0);
    for (int i = 0; i < ${WAVE_MAX}; i++) {
      float amp = uWaves[i].w;
      if (amp <= 0.0) continue;
      float age = uTime - uWaves[i].z;
      if (age < 0.0 || age > ${WAVE_SUSTAIN.toFixed(2)}) continue;
      float d = length(p - uWaves[i].xy);
      float front = age * ${WAVE_SPEED.toFixed(1)};
      float band = exp(-pow((d - front)/8.2, 2.0)) * exp(-age/${WAVE_SUSTAIN.toFixed(2)}) * exp(-d/430.0);
      float trail = exp(-pow((d - front + 13.0)/9.5, 2.0)) * exp(-age/${WAVE_SUSTAIN.toFixed(2)}) * exp(-d/300.0) * 0.24;
      sum += (band + trail) * amp;
      tint += uWaveCol[i] * band * amp;
      if (sum > 1.7) break;
    }
    return sum;
  }`;

function waveUniforms() {
  return {
    uTime: { value: 0 },
    uWaves: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
    uWaveCol: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector3()) },
  };
}

/** 一圈潮信的记录。波源在灯塔脚下，全场只由 props.strings.wave 一个入口进队 */
function waveQueue(uni, gain = 1) {
  const items = [];
  return {
    emit(x, z, t0, hue, amp = 1) {
      items.push({ x, z, t0, amp, col: new THREE.Color(hue).multiplyScalar(gain) });
      if (items.length > WAVE_MAX) items.shift();
    },
    fill(t) {
      for (let i = 0; i < WAVE_MAX; i++) {
        const w = items[i];
        if (!w || t - w.t0 > WAVE_SUSTAIN * 1.3) { uni.uWaves.value[i].set(0, 0, 0, 0); continue; }
        uni.uWaves.value[i].set(w.x, w.z, w.t0, w.amp);
        uni.uWaveCol.value[i].copy(w.col);
      }
    },
  };
}

function fillInst(im, n) { for (let i = 0; i < n; i++) im.setMatrixAt(i, HIDE); im.instanceMatrix.needsUpdate = true; }

/* ============================================================ 船队 fleet
 * 停泊区 5 列 × 11 位 = 55 艘木质尖底拖网渔船，缆挂在泊位间的系缆桩上：
 * 船随潮位起落，桩顶高程是定值，于是缆绳一会俯一会仰、始终绷得住。
 * 五更报满，按航道次第解缆出港，走远了也不消失——只留在口门外的黑海上亮着号灯。
 */
const DRAFT = 0.62;          // 吃水比：船深的 62% 在水下
const BOAT_CLASSES = [
  { len: 10.4, beam: 2.9, depth: 1.55, mast: 5.2 },
  { len: 11.8, beam: 3.2, depth: 1.72, mast: 5.9 },
  { len: 13.2, beam: 3.5, depth: 1.92, mast: 6.6 },
];

/** 船上的发光件：拖网号灯上绿下白，舷灯左红右绿，桅前白灯，舱口一盏暖光 */
const LAMP_SPECS = [
  { id: 'trawlTop', color: FLEET_LIGHTS.trawlTop, gain: 3.0, r: 0.15, at: (b) => [0, b.deck + b.mast - 0.12, b.zMast] },
  { id: 'trawlBot', color: FLEET_LIGHTS.trawlBottom, gain: 2.3, r: 0.13, at: (b) => [0, b.deck + b.mast - 0.78, b.zMast] },
  { id: 'mast', color: FLEET_LIGHTS.mast, gain: 2.0, r: 0.12, at: (b) => [0, b.deck + 1.25, b.len * 0.3] },
  { id: 'port', color: FLEET_LIGHTS.port, gain: 1.7, r: 0.1, at: (b) => [b.beam * 0.44, b.deck + 0.46, b.len * 0.14] },
  { id: 'star', color: FLEET_LIGHTS.star, gain: 1.7, r: 0.1, at: (b) => [-b.beam * 0.44, b.deck + 0.46, b.len * 0.14] },
  { id: 'hatch', color: '#ffc879', gain: 2.6, r: 0.22, at: (b) => [0, b.deck + 0.26, -b.len * 0.06] },
];

function buildFleet(scene, columns, anchors) {
  void anchors;                        // 系缆点自己按 BERTHS 生成，不依赖码头回填
  const group = new THREE.Group();
  group.name = 'fleet';
  scene.add(group);

  const N = BERTHS.rows * BERTHS.perRow;
  const start = new THREE.Vector3(CHANNEL[0][0], 0, CHANNEL[0][1]);
  const far = new THREE.Vector3(CHANNEL[CHANNEL.length - 1][0], 0, CHANNEL[CHANNEL.length - 1][1]);
  const exit = new THREE.Vector3(BREAKWATER.pts[1][0], 0, BREAKWATER.pts[1][1]);

  /* ---- 泊位：5 列纵排铺在椭圆停泊区里，出格的收回椭圆边界内 */
  const boats = [];
  for (let r = 0; r < BERTHS.rows; r++) {
    for (let c = 0; c < BERTHS.perRow; c++) {
      let dx = (c / (BERTHS.perRow - 1) - 0.5) * 2 * BERTHS.rx * 0.9 + rr(-2.4, 2.4);
      let dz = (r / (BERTHS.rows - 1) - 0.5) * 2 * BERTHS.rz * 0.74 + rr(-2.2, 2.2);
      const k = Math.hypot(dx / (BERTHS.rx * 0.93), dz / (BERTHS.rz * 0.93));
      if (k > 1) { dx /= k; dz /= k; }
      const x = BERTHS.x + dx, z = BERTHS.z + dz;
      const cls = BOAT_CLASSES[boats.length % BOAT_CLASSES.length];
      // 船头对着航道下风那一侧，随泊位略偏
      const yaw = Math.atan2(start.x - x, start.z - z) + rr(-0.14, 0.14);
      const anchor = new THREE.Group();
      anchor.position.set(x, 0, z);
      anchor.userData = { kind: 'fishing', berth: boats.length };
      group.add(anchor);
      boats.push({
        i: boats.length, cls, x, z, yaw, s: rr(0.86, 1.06),
        phase: rand() * 6.28, sw: rr(0.55, 0.85),
        len: cls.len, beam: cls.beam, depth: cls.depth, mast: cls.mast,
        zMast: -cls.len * 0.1, deck: 1.0,
        state: 'moored', u: 0, out: 0, outX: 0, outZ: 1, travel: 0, delay: 0, throttle: 0,
        px: x, pz: z, heading: yaw,
        curve: null, curveLen: 1, endPt: null, endTg: null, speed: rr(11, 15),
        anchor, visible: true, rank: 0, pile: null, bitt: null, colId: null,
      });
    }
  }
  // 越靠航道口的越先走；滑杆把船数收小时也是从最里头那一列收起
  [...boats]
    .sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z))
    .forEach((b, i) => {
      b.rank = i;
      b.delay = clamp(12 + 26 * (i / (N - 1)) + rr(0, 2.4), 12, 40);
    });

  /* ---- 构件：每型船一份船体 + 桅与属具（按材质分桶，各一次实例化） */
  const classes = BOAT_CLASSES.map((cls) => {
    const hull = normGeo(hullGeo(cls.len, cls.beam, cls.depth));
    hull.computeBoundingBox();
    const span = Math.max(0.7, hull.boundingBox.max.y - hull.boundingBox.min.y);
    const size = hull.boundingBox.getSize(_v2);
    // 契约按 loftHull 的习惯把船长放在 Z；万一沿 X 放就转回来，船头取 +X 那端
    if (size.x > size.z) hull.rotateY(-Math.PI / 2);
    hull.computeBoundingBox();
    const bb = hull.boundingBox;
    const lift = -(bb.min.y + span * DRAFT);        // 水线压到本地 y=0
    hull.translate(0, lift, 0);
    const deck = Math.max(0.4, (bb.max.y - bb.min.y) * (1 - DRAFT));
    const len = Math.max(6, bb.max.z - bb.min.z);

    const parts = [];
    const mast = mastGeo(cls.mast, 0.09);
    mast.position.set(0, deck, -len * 0.1);
    parts.push(...bake(mast, (m) => m));

    const wood = [
      new THREE.BoxGeometry(cls.beam * 0.72, deck * 0.88, len * 0.24).translate(0, deck * 0.42, -len * 0.2),
      new THREE.BoxGeometry(cls.beam * 0.9, 0.14, len * 0.92).translate(0, deck * 0.98, 0),
      new THREE.CylinderGeometry(0.3, 0.3, cls.beam * 0.52, 8).rotateZ(Math.PI / 2).translate(0, deck * 0.52, len * 0.12),
    ];
    const metal = [
      new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6).translate(0, deck + 1.08, -len * 0.42),
      new THREE.CylinderGeometry(0.045, 0.045, len * 0.92, 6).rotateX(1.12).translate(0, deck + 0.62, len * 0.36),
      new THREE.CylinderGeometry(0.04, 0.05, deck + 1.15, 6).translate(cls.beam * 0.3, (deck + 1.15) * 0.5, len * 0.3),
    ];
    const add = (arr, material) => {
      const g = mergeGeometries(arr.map(normGeo), false);
      if (g) { g.computeBoundingBox(); parts.push({ geometry: g, material }); }
    };
    add(wood, M.plank);
    add(metal, M.metal);

    const byMat = new Map();
    for (const p of parts) {
      const key = p.material && p.material.uuid ? p.material.uuid : 'any';
      if (!byMat.has(key)) byMat.set(key, { material: p.material || M.plank, list: [] });
      byMat.get(key).list.push(p.geometry);
    }
    const extras = [];
    for (const { material, list } of byMat.values()) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!g) continue;
      const im = new THREE.InstancedMesh(g, material, N);
      im.frustumCulled = false;
      group.add(im);
      fillInst(im, N);
      extras.push(im);
    }
    const im = new THREE.InstancedMesh(hull, M.hull, N);
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    fillInst(im, N);
    return { cls, im, extras, deck, len };
  });
  for (const b of boats) {
    const c = classes[b.i % classes.length];
    b.clsRef = c;
    b.deck = c.deck;
    b.len = c.len;
    b.beam = c.cls.beam;
    b.mast = c.cls.mast;
    b.zMast = -c.len * 0.1;                    // 与烘进 geometry 的桅位对齐
    b.bitt = [
      new THREE.Vector3(0, b.deck * 0.9, b.len * 0.34),
      new THREE.Vector3(0, b.deck * 0.85, -b.len * 0.4),
    ];
  }

  /* ---- 号灯：六处各一次实例化，夜里长明 */
  const lamps = LAMP_SPECS.map((sp) => {
    const entry = lampMat(sp.color, sp.gain);
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(sp.r, 8, 6), entry.mat, N);
    im.frustumCulled = false;
    im.renderOrder = 8;
    group.add(im);
    fillInst(im, N);
    return { sp, entry, im };
  });

  /* ---- 缆绳（细圆柱两点定位）与尾流白沫 */
  const ropeIm = new THREE.InstancedMesh(normGeo(new THREE.CylinderGeometry(0.042, 0.034, 1, 5)), M.rope, N * 2);
  ropeIm.frustumCulled = false;
  group.add(ropeIm);
  fillInst(ropeIm, N * 2);

  const wakeMat = new THREE.MeshBasicMaterial({
    map: texOf(T.foam),
    color: new THREE.Color('#cfe6f8').multiplyScalar(1.6),
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  wakeMat.toneMapped = false;
  const wakeIm = new THREE.InstancedMesh(normGeo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), wakeMat, N * 3);
  wakeIm.frustumCulled = false;
  wakeIm.renderOrder = 6;
  group.add(wakeIm);
  fillInst(wakeIm, N * 3);

  /* ---- 系缆桩：桩顶高程定值（不随潮位），两两成簇钉在泊位之间 */
  const PILE_TOP = 2.05;
  const pileGeo = normGeo(new THREE.CylinderGeometry(0.12, 0.19, 13, 7).translate(0, -6.5, 0));
  const pileList = [];
  for (const b of boats) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const at = (s) => new THREE.Vector3(
      b.x + fx * s + fz * 3.0, PILE_TOP, b.z + fz * s - fx * 3.0,
    );
    b.pile = { bow: at(7.6), stern: at(-7.8) };
    for (const p of [b.pile.bow, b.pile.stern]) {
      for (const s of [-0.46, 0.46]) {
        pileList.push({ p: [p.x + fz * s, PILE_TOP, p.z - fx * s], r: [rr(-0.04, 0.04), rr(0, 3), rr(-0.04, 0.04)], s: 1 });
      }
    }
  }
  group.add(instanced(pileGeo, M.plank, pileList));

  /* ---- 光柱：水面上把桅顶绿灯拖长一点，隔三个泊位给一根，省批量 */
  const hasColumns = !!(columns && typeof columns.add === 'function');
  if (hasColumns) {
    for (const b of boats) {
      if (b.rank % 3 !== 0) continue;
      b.colPos = new THREE.Vector3(b.x, tideNow.level + b.deck + b.mast, b.z);
      b.colId = columns.add(b.colPos, FLEET_LIGHTS.trawlTop, 1.1, 7.6, 0.45);
    }
  }

  /* ---- 出港用的航道曲线：泊位 →（口门）→ 航道 → 更远的海 */
  const beyond = far.clone().add(far.clone().sub(start).normalize().multiplyScalar(300));
  function makeCurve(b) {
    const pts = [new THREE.Vector3(b.x, 0, b.z)];
    if (b.rank % 2 === 0) pts.push(exit.clone());     // 偶数号先拐到堤头再顺航道
    for (const [x, z] of CHANNEL) pts.push(new THREE.Vector3(x, 0, z));
    pts.push(new THREE.Vector3(beyond.x, 0, beyond.z));
    b.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    b.curveLen = Math.max(40, b.curve.getLength());
    b.endPt = b.curve.getPointAt(1);                  // 出口门那一点，之后沿切线往远海里放
    b.endTg = b.curve.getTangentAt(0.999);
  }

  const d = new THREE.Object3D();
  d.rotation.order = 'YXZ';
  let lead = boats[0] || null;
  let releasing = false, releaseClock = 0, moving = 0;

  /** 一根缆 = 单位圆柱的两点定位：俯仰随潮位变，长度随船挪，从不松 */
  function ropePair(slot, local, end, mat) {
    _v.copy(local).applyMatrix4(mat);
    _v2.copy(end).sub(_v);
    const len = Math.max(0.7, _v2.length());
    _q.setFromUnitVectors(UP, _v2.normalize());
    _v.addScaledVector(_v2, len * 0.5);
    _s.set(1, len, 1);
    ropeIm.setMatrixAt(slot, _m.compose(_v, _q, _s));
  }

  function advance(b, dt) {
    if (b.state === 'moored') { b.throttle = 0; return; }
    if (b.state === 'slip') {
      b.throttle = Math.min(1, b.throttle + dt * 0.5);
      // u 按弧长走（getPointAt），船速才不会一段快一段慢
      b.u = Math.min(1, b.u + (dt * b.speed * (0.3 + 0.7 * b.throttle)) / b.curveLen);
      const c = b.curve.getPointAt(b.u);
      const tg = b.curve.getTangentAt(Math.min(0.999, b.u));
      b.px = c.x; b.pz = c.z;
      b.heading = Math.atan2(tg.x, tg.z);
      b.travel = b.u * b.curveLen;
      if (b.u >= 1) {
        b.state = 'sea'; b.out = 0; b.outX = b.endTg.x; b.outZ = b.endTg.z;
      }
      return;
    }
    // 已出口门：沿末段切线继续往远海里走，走满 620 米就泊在海上亮灯
    b.out = Math.min(620, b.out + dt * b.speed);
    b.px = b.endPt.x + b.outX * b.out;
    b.pz = b.endPt.z + b.outZ * b.out;
    b.travel = b.curveLen + b.out;
    b.heading = Math.atan2(b.outX, b.outZ);
    b.throttle = b.out >= 620 ? 0 : 1;
  }

  return {
    group,
    boats,
    /** 旧接口：第 i 艘还泊着的船 */
    moored(i = 0) {
      const list = boats.filter((b) => b.state === 'moored');
      const b = list[i] || list[0] || boats[i] || boats[0];
      return b ? b.anchor : null;
    },
    /** 当前第一艘：interiors/portals 把"上船"门挂它身上，出港时门跟着走 */
    lead() { return lead ? lead.anchor : null; },
    depart(hour) {
      setTide(tideNow.level, hour);
      if (releasing) return;
      releasing = true;
      releaseClock = 0;
      moving = 0;
      for (const b of boats) makeCurve(b);
    },
    update(t, dt, scale, level, hour) {
      setTide(level, hour);
      const swell = 0.7 + 0.45 * Math.abs(Math.sin(t * 0.17));
      const night = nightFactor(hour);
      const shown = clamp(Math.round(N * clamp(scale, 0, 1)), 0, N);

      if (releasing) {
        releaseClock += dt;                       // 解缆的错峰按现实秒走：12~40 秒内次第离泊
        for (const b of boats) {
          if (b.state === 'moored' && releaseClock >= b.delay) {
            b.state = 'slip'; b.u = 0; b.throttle = 0; b.travel = 0;
            b.px = b.x; b.pz = b.z; b.heading = b.yaw;
            moving++;
          }
        }
      }

      let best = null;
      for (const b of boats) {
        if (b.state !== 'moored' && (!best || b.travel > best.travel)) best = b;
      }
      if (!best) best = boats.find((b) => b.state === 'moored' && b.rank < shown) || boats[0];
      lead = best || lead;

      const flick = 0.9 + 0.1 * Math.sin(t * 2.7) * Math.sin(t * 4.1);
      for (const L of lamps) L.entry.mat.color.copy(L.entry.base).multiplyScalar((0.4 + 0.6 * night) * flick);

      for (const b of boats) {
        advance(b, dt);
        b.visible = b.state !== 'moored' || b.rank < shown;

        const a = b.anchor;
        if (b.state === 'moored') {
          const roll = Math.sin(t * 0.62 * swell + b.phase) * 0.038 + Math.sin(t * 1.7 + b.phase * 2) * 0.008;
          const pitch = Math.cos(t * 0.53 * swell + b.phase * 1.3) * 0.024;
          a.position.set(b.x, level + Math.sin(t * b.sw + b.phase) * 0.07 * swell, b.z);
          a.rotation.set(pitch, b.yaw, roll);
        } else {
          const bob = Math.sin(t * (1.05 + b.sw) + b.phase) * 0.14 * swell;
          a.position.set(b.px, level + bob, b.pz);
          a.rotation.set(-0.055 * b.throttle, b.heading, Math.sin(t * 0.95 + b.phase) * 0.05 * swell);
        }
        a.scale.setScalar(b.visible ? b.s : 0.0001);
        a.updateMatrix();

        const c = b.clsRef;
        const mm = b.visible ? a.matrix : HIDE;
        c.im.setMatrixAt(b.i, mm);
        for (const im of c.extras) im.setMatrixAt(b.i, mm);

        for (const L of lamps) {
          if (!b.visible) { L.im.setMatrixAt(b.i, HIDE); continue; }
          const o = L.sp.at(b);
          _v.set(o[0], o[1], o[2]).applyMatrix4(a.matrix);
          _s.setScalar(b.s);
          L.im.setMatrixAt(b.i, _m.compose(_v, IDQ, _s));
        }

        // 艏缆 + 艉回缆：泊着的船才有，解缆即收
        if (b.visible && b.state === 'moored') {
          ropePair(b.i * 2, b.bitt[0], b.pile.bow, a.matrix);
          ropePair(b.i * 2 + 1, b.bitt[1], b.pile.stern, a.matrix);
        } else {
          ropeIm.setMatrixAt(b.i * 2, HIDE);
          ropeIm.setMatrixAt(b.i * 2 + 1, HIDE);
        }

        // 尾流：只有解缆在走的船有水花，艏沫一道、艉沫两道
        if (b.visible && b.state !== 'moored' && b.throttle > 0.05) {
          const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
          const y = level + 0.07;
          let k = b.i * 3;
          d.position.set(b.px + fx * b.len * 0.42, y, b.pz + fz * b.len * 0.42);
          d.rotation.set(0, b.heading, 0);
          d.scale.set(b.beam * 1.5 * b.s, 1, 2.6 + b.throttle * 2.4);
          d.updateMatrix(); wakeIm.setMatrixAt(k++, d.matrix);
          for (let j = 1; j <= 2; j++) {
            const back = b.len * (0.45 + j * 0.8) + b.throttle * j * 4.5;
            d.position.set(b.px - fx * back, y, b.pz - fz * back);
            d.rotation.set(0, b.heading + Math.sin(t * 0.8 + b.phase) * 0.05, 0);
            d.scale.set(b.beam * (1.2 + j * 0.9) * b.s, 1, 3.4 + j * 2.6);
            d.updateMatrix(); wakeIm.setMatrixAt(k++, d.matrix);
          }
        } else {
          for (let j = 0; j < 3; j++) wakeIm.setMatrixAt(b.i * 3 + j, HIDE);
        }

        if (hasColumns && b.colId !== null && b.colPos) {
          b.colPos.set(a.position.x, level + b.deck + b.mast, a.position.z);
          if (typeof columns.setPos === 'function') columns.setPos(b.colId, b.colPos);
          if (typeof columns.set === 'function') columns.set(b.colId, b.visible ? 1 : 0);
        }
      }

      wakeMat.opacity = moving > 0 ? 0.5 + 0.18 * Math.sin(t * 2.1) : 0;
      for (const c of classes) {
        c.im.instanceMatrix.needsUpdate = true;
        for (const im of c.extras) im.instanceMatrix.needsUpdate = true;
      }
      for (const L of lamps) L.im.instanceMatrix.needsUpdate = true;
      ropeIm.instanceMatrix.needsUpdate = true;
      wakeIm.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ============================================================ 夜客 crowd
 * 滩上、栈道上、堤顶三串人，外加沙滩散布；人形只是剪影，靠灯串的暖色在肩上
 * 挑一道边，潮信推过来时再染一口冷色。远处只剩手里那盏暖点，机位拉近才细分。
 */
const MAX_PEOPLE = 280;

function mkPaths() {
  const modes = ['sand', 'walk', 'dyke'];
  return WALK.map((p, i) => {
    const raw = p.pts.map(([x, z]) => ({ x, z }));
    if (p.loop) raw.push({ x: raw[0].x, z: raw[0].z });
    const cum = [0];
    for (let k = 1; k < raw.length; k++) {
      cum.push(cum[k - 1] + Math.hypot(raw[k].x - raw[k - 1].x, raw[k].z - raw[k - 1].z));
    }
    return { raw, cum, total: Math.max(1, cum[cum.length - 1]), loop: !!p.loop, mode: modes[i] || 'sand' };
  });
}

function samplePath(P, u) {
  const s = clamp(u, 0, 1) * P.total;
  let i = 1;
  while (i < P.cum.length - 1 && P.cum[i] < s) i++;
  const a = P.raw[i - 1], b = P.raw[i];
  const k = (s - P.cum[i - 1]) / Math.max(0.001, P.cum[i] - P.cum[i - 1]);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: b.x - a.x, dz: b.z - a.z };
}

function buildCrowd(scene) {
  const paths = mkPaths();
  const geo = figureGeo(1);
  const uni = {
    uTime: { value: 0 }, uTide: { value: 0 }, uDark: { value: 1 },
    uMoon: { value: MOONLIGHT.clone() }, uWarm: { value: new THREE.Color('#ffbe74') },
    ...waveUniforms(),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, fog: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aTint; attribute float aPhase; attribute float aKind;
      uniform float uTime; uniform float uTide;
      varying vec3 vN; varying vec3 vT; varying float vWave; varying float vKind;
      ${waveGLSL}
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 tw;
        float wv = waveField(wp.xz, tw);
        vWave = wv; vT = aTint; vKind = aKind; vN = normalize(mat3(modelMatrix) * normal);
        vec3 p = wp.xyz;
        p.x += sin(uTime*1.6 + aPhase*6.283) * 0.03 * position.y * aKind;
        // 踩进浪线里的人，水面以下那段直接砍掉——不然一堆人站在海上
        p.y -= 12.0 * (1.0 - step(-0.14, wp.y - uTide));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uWarm; uniform vec3 uMoon; uniform float uDark;
      varying vec3 vN; varying vec3 vT; varying float vWave; varying float vKind;
      void main(){
        vec3 N = normalize(vN);
        float up = clamp(N.y*0.5+0.5, 0.0, 1.0);
        // 灯串在腹地上空，暖色从斜上方落到肩与头顶；脚底只剩潮气
        float warm = pow(max(0.0, dot(N, normalize(vec3(0.18, 0.72, 0.62)))), 1.4) * 0.8 + up * 0.3;
        float rim = pow(1.0 - abs(dot(N, normalize(vec3(0.0, 0.3, 1.0)))), 2.4);
        vec3 col = vec3(0.014, 0.020, 0.034);
        col += vT * warm * 0.34;
        col += uWarm * rim * 0.16;
        col += uMoon * max(0.0, dot(N, uMoon)) * 0.075;
        col += vT * min(vWave, 0.85) * (0.35 + 0.65*vKind);
        col *= mix(0.3, 1.0, uDark);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.customProgramCacheKey = () => 'ld-crowd';
  const im = new THREE.InstancedMesh(geo, mat, MAX_PEOPLE);
  im.frustumCulled = false;
  scene.add(im);

  const tint = new Float32Array(MAX_PEOPLE * 3);
  const phase = new Float32Array(MAX_PEOPLE);
  const kind = new Float32Array(MAX_PEOPLE);
  const people = [];
  const bays = [BAYS.dashawan, BAYS.sumawan];
  for (let i = 0; i < MAX_PEOPLE; i++) {
    const k = i % 5;
    const P = k === 4 ? null : paths[k % 3];
    let x, z;
    if (P) { const s = samplePath(P, rand()); x = s.x; z = s.z; }
    else {
      const bay = bays[i % 2];
      x = bay.x + rr(-bay.halfW * 0.8, bay.halfW * 0.8);
      z = shoreZat(x, 0) + rr(3, 27);
    }
    // 身上的暖色按离灯串的远近给：滩心的亮，远端只留一个月光边
    let near = 999;
    for (const L of LANTERN_LINES) {
      near = Math.min(near, Math.hypot(x - (L.from[0] + L.to[0]) / 2, z - (L.from[2] + L.to[2]) / 2));
    }
    const warmth = clamp(1.2 - near / 125, 0.14, 1);
    const c = new THREE.Color(STRIP_COLORS[Math.floor(rand() * STRIP_COLORS.length)]).multiplyScalar(warmth);
    tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
    phase[i] = rand();
    kind[i] = P ? (P.mode === 'dyke' ? 0.5 : 1) : 0.4;
    people.push({
      P, u: rand(), dir: rand() < 0.6 ? 1 : -1, sp: rr(0.006, 0.019),
      off: rr(-2.2, 2.2), s: rr(0.9, 1.14), bob: rand() * 6.28, x, z,
    });
  }
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  fillInst(im, MAX_PEOPLE);

  // 手里的灯：一盏一盏暖点。远机位时，人就是靠这些点存在的
  const pPos = new Float32Array(MAX_PEOPLE * 3);
  const pPh = new Float32Array(MAX_PEOPLE);
  for (let i = 0; i < MAX_PEOPLE; i++) { pPh[i] = rand() * 6.28; pPos[i * 3 + 1] = -9999; }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('aPhase', new THREE.BufferAttribute(pPh, 1));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDark: { value: 1 }, uMap: { value: texOf(T.softGlow, '255,206,140', 0.12) } },
    vertexShader: `
      attribute float aPhase; uniform float uTime; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA = 0.55 + 0.45*sin(uTime*2.3 + aPhase*7.0);
        gl_PointSize = clamp(150.0 / max(1.0, -mv.z), 1.3, 13.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uDark; varying float vA;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.46) * (0.9 + vA*0.9), t.a * vA * 0.75 * uDark);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(pg, pmat);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  im.add(pts);      // 挂在这一个 mesh 下：main 关 crowd 图层时一起灭

  const d = new THREE.Object3D();
  const waves = waveQueue(uni, 0.5);
  let extraDark = 1;

  return {
    mesh: im,
    points: pts,
    wave: waves.emit,
    setDay(v) { extraDark = clamp(v, 0, 1); },
    update(t, dt, count, camPos) {
      uni.uTime.value = t;
      uni.uTide.value = tideNow.level;
      waves.fill(t);
      // 白天不出现：契约没给 crowd 传 hour，只能借 env 挂在 scene.fog 上的天色当白昼度
      const f = scene.fog && scene.fog.color;
      const lum = f ? 0.299 * f.r + 0.587 * f.g + 0.114 * f.b : 0.05;
      const day = clamp(1 - (lum - 0.06) / 0.14, 0, 1) * extraDark;
      uni.uDark.value = day;
      pmat.uniforms.uTime.value = t;
      pmat.uniforms.uDark.value = day;

      const want = clamp(Math.round(count || 0), 0, MAX_PEOPLE);
      const eye = camPos || new THREE.Vector3();
      let used = 0;
      for (let i = 0; i < want; i++) {
        const p = people[i];
        let x = p.x, z = p.z, yaw = 0, walk = 0, y;
        if (p.P) {
          p.u += dt * p.sp * p.dir * (p.P.mode === 'dyke' ? 0.55 : 1);
          if (!p.P.loop && (p.u > 1 || p.u < 0)) { p.dir *= -1; p.u = clamp(p.u, 0, 1); }
          else p.u = (p.u + 1) % 1;
          const s = samplePath(p.P, p.u);
          const nl = Math.hypot(s.dx, s.dz) || 1;
          x = s.x - (s.dz / nl) * p.off;
          z = s.z + (s.dx / nl) * p.off;
          yaw = Math.atan2(s.dx, s.dz);
          walk = 1;
        } else {
          x = p.x + Math.sin(t * 0.2 + p.bob) * 1.5;
          z = p.z + Math.cos(t * 0.17 + p.bob) * 1.1;
          yaw = Math.atan2(eye.x - x, eye.z - z);
        }
        if (p.P && p.P.mode === 'walk' && LAYOUT.walk && LAYOUT.walk.curve) {
          const c = LAYOUT.walk.curve.getPoint(clamp(p.u, 0, 1));
          const tg = LAYOUT.walk.curve.getTangent(clamp(p.u, 0, 1));
          x = c.x; z = c.z; y = c.y; yaw = Math.atan2(tg.x, tg.z);
        } else if (p.P && p.P.mode === 'dyke') {
          y = DYKE.crown + 0.42;
        } else {
          // 滩地上的人不淹在水里：踩到潮线以下就顺着水皮站
          y = Math.max(terrainH(x, z), tideNow.level + 0.04);
        }
        pPos[i * 3] = x; pPos[i * 3 + 1] = y + 1.16 * p.s; pPos[i * 3 + 2] = z;
        if (Math.hypot(x - eye.x, z - eye.z) > 165) continue;   // 远了不细看，只留那盏灯
        d.position.set(x, y + Math.abs(Math.sin(t * 4.6 + p.bob)) * 0.05 * walk, z);
        d.rotation.set(0, yaw, Math.sin(t * 2.2 + p.bob) * 0.015 * walk);
        d.scale.setScalar(p.s);
        d.updateMatrix();
        im.setMatrixAt(used++, d.matrix);
      }
      for (let i = want; i < MAX_PEOPLE; i++) { pPos[i * 3] = 0; pPos[i * 3 + 1] = -9999; pPos[i * 3 + 2] = 0; }
      im.count = used;
      pg.setDrawRange(0, want);
      pg.attributes.position.needsUpdate = true;
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ============================================================ 灯串 strings
 * LANTERN_LINES 的悬链串：灯泡是实例化的广告牌，顶点着色器吃潮信的波环时刻表，
 * 波前推到哪一串，哪一串就按那更的颜色染一下、短暂提亮。
 */
function buildStrings(scene) {
  const grp = new THREE.Group();
  grp.name = 'strings';
  scene.add(grp);

  const curves = LANTERN_LINES.map((l) => {
    const a = new THREE.Vector3(...l.from), b = new THREE.Vector3(...l.to);
    const n = Math.max(10, Math.round(a.distanceTo(b) / 3));
    return new THREE.CatmullRomCurve3(stringPath(a, b, l.sag, n), false, 'catmullrom', 0.5);
  });
  const wire = mergeGeometries(curves.map((c) => new THREE.TubeGeometry(c, 24, 0.036, 4, false)), false);
  if (wire) {
    const w = new THREE.Mesh(wire, lit('#20262e', { rough: 0.9, emissive: '#0a0d12', ei: 0.5 }));
    w.frustumCulled = false;
    grp.add(w);
  }

  const uni = {
    uOn: { value: 1 }, uMap: { value: texOf(T.softGlow, '255,196,122', 0.08) },
    ...waveUniforms(),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute vec3 offset; attribute vec3 tint; attribute float phase;
      uniform float uTime; uniform float uOn;
      varying vec2 vUv; varying vec3 vT; varying float vGlow;
      ${waveGLSL}
      void main(){
        vec3 tw;
        float wv = waveField(offset.xz, tw);
        vGlow = uOn * (0.76 + 0.24*sin(uTime*2.6 + phase*9.0)) * (1.0 + min(wv, 0.6)*0.85) + wv*0.4;
        vec4 mv = viewMatrix * vec4(offset, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = offset + right*(position.x*0.5) + up*(position.y*0.68 - 0.34);
        vUv = uv; vT = tint + tw*0.85;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vT; varying float vGlow;
      void main(){
        float m = texture2D(uMap, vec2(vUv.x, vUv.y*0.86+0.14)).a;
        gl_FragColor = vec4(min(vT * (2.0 + vGlow*0.8), vec3(2.6)), m * min(vGlow, 1.3) * 0.95);
      }`,
  });
  mat.customProgramCacheKey = () => 'ld-strings';

  const counts = curves.map((c) => Math.max(4, Math.round(c.getLength() / 1.6)));
  const total = counts.reduce((a, b) => a + b, 0);
  const off = new Float32Array(total * 3);
  const tint = new Float32Array(total * 3);
  const ph = new Float32Array(total);
  const warm = new THREE.Color(STRIP_COLORS[1]);
  const gold = new THREE.Color(STRIP_COLORS[3]);
  const jade = new THREE.Color(FLEET_LIGHTS.trawlTop);
  let k = 0;
  curves.forEach((c, ci) => {
    const harbor = c.getPoint(0.5).z < -60;    // 港池那串走绿白，滩上走橘金
    const pick = harbor ? (ci % 2 ? jade : gold) : (ci % 3 === 1 ? gold : warm);
    for (let s = 0; s < counts[ci]; s++, k++) {
      const p = c.getPoint((s + 0.5) / counts[ci]);
      off[k * 3] = p.x; off[k * 3 + 1] = p.y; off[k * 3 + 2] = p.z;
      const j = 0.8 + rand() * 0.35;
      tint[k * 3] = pick.r * j; tint[k * 3 + 1] = pick.g * j; tint[k * 3 + 2] = pick.b * j;
      ph[k] = rand();
    }
  });
  const bulbGeo = normGeo(new THREE.PlaneGeometry(0.46, 0.66));
  bulbGeo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  bulbGeo.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  bulbGeo.setAttribute('phase', new THREE.InstancedBufferAttribute(ph, 1));
  const im = new THREE.InstancedMesh(bulbGeo, mat, total);
  im.frustumCulled = false;
  im.renderOrder = 9;
  grp.add(im);

  const waves = waveQueue(uni, 0.7);
  return {
    group: grp, uni, total,
    wave: waves.emit,
    update(t) {
      uni.uTime.value = t;
      waves.fill(t);
    },
  };
}

/* ============================================================ 遮阳伞 umbrellas
 * FIELD 里的方阵：夜里大半收着立在那儿，少数还撑着。伞脚扎进沙里（y 取地形高程
 * 再沉 0.2），所以涨潮把前排淹到时，伞脚确实浸在水里——水面 y=level 自己会做到。
 */
function buildUmbrellas(scene) {
  const grp = new THREE.Group();
  grp.name = 'umbrellas';
  scene.add(grp);

  let parts = bake(umbrellaGeo(), (m) => m);
  if (!parts.length) {
    parts = [
      { geometry: normGeo(new THREE.ConeGeometry(1.35, 0.66, 12, 1, true).translate(0, 2.1, 0)), material: M.canopy },
      { geometry: normGeo(new THREE.CylinderGeometry(0.045, 0.05, 2.5, 6).translate(0, 1.25, 0)), material: M.plank },
    ];
  }
  for (const p of parts) p.geometry.computeBoundingBox();
  // 布面认得出来：横向跨度远大于杆
  const isCloth = parts.map((p) => {
    const s = p.geometry.boundingBox.getSize(new THREE.Vector3());
    return Math.max(s.x, s.z) > 1.1;
  });

  const U = UMBRELLAS;
  const items = [];
  const openCount = Math.round(U.cols * U.rows * U.open);
  for (let r = 0; r < U.rows; r++) {
    for (let c = 0; c < U.cols; c++) {
      const x = FIELD.x0 + U.gap * 0.7 + c * ((FIELD.x1 - FIELD.x0 - U.gap * 1.4) / (U.cols - 1)) + rr(-U.jitter, U.jitter);
      const z = FIELD.z0 + U.gap * 0.6 + r * ((FIELD.z1 - FIELD.z0 - U.gap * 1.2) / (U.rows - 1)) + rr(-U.jitter, U.jitter);
      items.push({
        x, z, y: terrainH(x, z), open: items.length < openCount,
        yaw: rr(-0.4, 0.4), ph: rand() * 6.28, s: rr(0.92, 1.08), tilt: rr(-0.05, 0.05),
      });
    }
  }
  const insts = parts.map((p) => {
    const im = new THREE.InstancedMesh(p.geometry, p.material, items.length);
    im.receiveShadow = true;
    im.frustumCulled = false;
    grp.add(im);
    return im;
  });

  const d = new THREE.Object3D();
  return {
    group: grp,
    update(t, level) {
      setTide(level);
      // 强风微颤：撑着的抖布面，收着的晃伞尖
      for (let pi = 0; pi < insts.length; pi++) {
        const im = insts[pi];
        const cloth = isCloth[pi];
        for (let i = 0; i < items.length; i++) {
          const u = items[i];
          const g = Math.sin(t * 1.35 + u.ph) * 0.022 + Math.sin(t * 5.2 + u.ph * 2) * 0.009;
          const furl = cloth && !u.open ? 0.17 : 1;
          d.position.set(u.x, u.y - 0.2, u.z);
          d.rotation.set(cloth ? g : g * 0.3 + u.tilt, u.yaw + g * 0.5, cloth ? g * 0.6 : g);
          d.scale.set(u.s * furl, u.s * (cloth && !u.open ? 1.02 : 1), u.s * furl);
          d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/* ============================================================ 浪沫 spray
 * 一次性白沫粒子，三处起：HEADS 岬角、SHEEP 羊窝头礁盘、大堤 ARMOUR 外坡。
 * 位置随潮位沿各点外向法线进退——低潮时礁盘露出来，浪沫自然在更外的地方炸。
 * 粒子的生灭、大小、透明度全在顶点着色器里算，buffer 建一次不再动。
 */
function spraySites() {
  const sites = [];
  const BEACH_SHIFT = 0.85 / BEACH.slope;
  for (const h of HEADS) {
    const z0 = shoreZat(h.x, 0);
    sites.push({ x: h.x - h.halfW * 0.55, z: z0 + 7, dir: [0.12, 1], shift: BEACH_SHIFT, h: 3.6, n: 66 });
    sites.push({ x: h.x + h.halfW * 0.5, z: z0 + 4, dir: [-0.1, 1], shift: BEACH_SHIFT, h: 4.2, n: 66 });
  }
  for (let i = 0; i < 4; i++) {                     // 苏马湾与羊窝头之间的礁链
    const x = 402 + i * 52;
    sites.push({ x, z: shoreZat(x, 0) + 5 + rr(-4, 7), dir: [0.2, 1], shift: BEACH_SHIFT * 0.55, h: 3.0, n: 52 });
  }
  const sh = SHEEP;
  for (let i = 0; i < 6; i++) {                     // 羊窝头礁盘外缘
    const a = -0.5 + i * 0.42;
    sites.push({
      x: sh.x + Math.cos(a) * sh.r * 0.92, z: sh.z + Math.sin(a) * sh.r * 0.7 + 18,
      dir: [Math.cos(a) * 0.4, 1], shift: 7.5, h: 4.0, n: 58,
    });
  }
  // 大堤外坡：沿中线每隔约 58 米取一处，法线挑背离港池那一侧
  const harbor = { x: -620, z: -215 };
  for (let i = 0; i < DYKE.pts.length - 1; i++) {
    const [ax, az] = DYKE.pts[i], [bx, bz] = DYKE.pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    let nx = dz / L, nz = -dx / L;
    if ((ax - harbor.x) * nx + (az - harbor.z) * nz < 0) { nx = -nx; nz = -nz; }
    const count = Math.max(2, Math.round(L / 58));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      sites.push({
        x: ax + dx * t + nx * 7.5, z: az + dz * t + nz * 7.5,
        dir: [nx, nz], shift: 1 / Math.max(0.02, ARMOUR.perMeter * 6), h: 4.6, n: 44,
      });
    }
  }
  return sites;
}

function buildSpray(scene) {
  const sites = spraySites();
  const N = sites.reduce((a, s) => a + s.n, 0);
  const pos = new Float32Array(N * 3);
  const dir = new Float32Array(N * 2);
  const shift = new Float32Array(N);
  const seed = new Float32Array(N);
  const sz = new Float32Array(N);
  const gain = new Float32Array(N);
  let i = 0;
  for (const s of sites) {
    for (let k = 0; k < s.n; k++, i++) {
      pos[i * 3] = s.x + rr(-4.5, 4.5);
      pos[i * 3 + 1] = s.h * rr(0.65, 1.5);         // 这一颗能喷多高
      pos[i * 3 + 2] = s.z + rr(-3.5, 5.5);
      dir[i * 2] = s.dir[0]; dir[i * 2 + 1] = s.dir[1];
      shift[i] = s.shift;
      seed[i] = rand();
      sz[i] = rr(7, 26);
      gain[i] = rr(0.5, 1.3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
  g.setAttribute('aShift', new THREE.BufferAttribute(shift, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aGain', new THREE.BufferAttribute(gain, 1));
  const uni = {
    uTime: { value: 0 }, uLevel: { value: 0 }, uOn: { value: 1 },
    uMap: { value: texOf(T.softGlow, '236,248,255', 0.16) },
    ...waveUniforms(),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute vec2 aDir; attribute float aShift; attribute float aSeed;
      attribute float aSize; attribute float aGain;
      uniform float uTime; uniform float uLevel; uniform float uOn;
      varying float vA; varying float vLife;
      ${waveGLSL}
      void main(){
        vec3 tw;
        float per = 1.9 + aSeed*2.8;
        float life = fract(uTime/per + aSeed);
        // 水线随潮位沿外向法线进退：退到外面，浪沫就在外面起
        vec3 p = position;
        p.xz += aDir * (-uLevel * aShift);
        p.y = uLevel + position.y*life - 3.4*life*life*life;
        p.xz += aDir * life * (3.5 + aGain*5.0);
        float wv = waveField(p.xz, tw);
        vLife = life;
        vA = (1.0 - life) * smoothstep(0.0, 0.1, life) * aGain * uOn * (1.0 + wv*0.8);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(aSize * (0.45 + life*1.7) * (18.0 / max(1.0, -mv.z)), 1.0, 24.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying float vA; varying float vLife;
      void main(){
        if (vA <= 0.002) discard;
        vec4 t = texture2D(uMap, gl_PointCoord);
        vec3 col = mix(vec3(0.55,0.70,0.88), vec3(0.95,0.99,1.0), 1.0 - vLife);
        gl_FragColor = vec4(col * (1.1 + vA), t.a * vA * 0.6);
      }`,
  });
  mat.customProgramCacheKey = () => 'ld-spray';
  const mesh = new THREE.Points(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  scene.add(mesh);

  const waves = waveQueue(uni, 0.6);
  return {
    mesh,
    wave: waves.emit,
    update(t, level) {
      setTide(level);
      uni.uTime.value = t;
      uni.uLevel.value = level;
      waves.fill(t);
      // 一涌一涌的：浪沫不是一直有，是隔一阵扑上来一次
      uni.uOn.value = clamp(0.35 + 0.95 * Math.abs(Math.sin(t * 0.21)) + 0.25 * Math.sin(t * 0.83), 0, 1.5);
    },
  };
}

/* ============================================================ 渔旗 flags
 * 船艉旗、艏斜桅小旗，外加码头与堤头的旗杆。顶点着色器按 uv.x（离旗杆的远近）
 * 起波：旗根几乎不动、旗脚甩得开，阵风与潮信推过来时各抖一口。
 */
function buildFlags(scene, fleet, anchors) {
  const grp = new THREE.Group();
  grp.name = 'flags';
  scene.add(grp);

  const boats = fleet.boats || [];
  const poleAt = vecs(anchors && (anchors.pier || anchors.quay));
  if (!poleAt.length) {
    const pts = (LAYOUT.quay && LAYOUT.quay.pts) || QUAY.pts;
    const top = (LAYOUT.quay && typeof LAYOUT.quay.top === 'number') ? LAYOUT.quay.top : QUAY.top;
    for (const p of pts) poleAt.push(new THREE.Vector3(p[0], top, p[1]));
  }
  for (const p of BREAKWATER.pts) poleAt.push(new THREE.Vector3(p[0], BREAKWATER.crown, p[1]));
  const poleYaw = poleAt.map((p) => Math.PI + Math.sin(p.x * 0.13) * 0.3);   // 定值，不用 Math.random

  const poleGeo = normGeo(new THREE.CylinderGeometry(0.05, 0.065, 4.4, 6).translate(0, 2.2, 0));
  const poleIm = instanced(poleGeo, M.plank, poleAt.map((p, i) => ({
    p: [p.x, p.y, p.z], r: [0, poleYaw[i], 0], s: 1,
  })));
  poleIm.frustumCulled = false;
  grp.add(poleIm);

  const N = boats.length * 2 + poleAt.length;
  const geo = normGeo(flagGeo(1.15, 0.75));
  const uni = {
    uTime: { value: 0 }, uGust: { value: 1 }, uMap: { value: texOf(T.flagStripe) },
    ...waveUniforms(),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.DoubleSide, fog: false,
    vertexShader: `
      attribute vec3 aTint; attribute float aPhase;
      uniform float uTime; uniform float uGust;
      varying vec3 vT; varying vec2 vUv; varying float vShade;
      ${waveGLSL}
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 tw;
        float wv = waveField(wp.xz, tw);
        float k = uv.x;                                // 离旗杆越远甩得越开
        float ph = aPhase*6.28319;
        float w1 = sin(uTime*7.0 + ph + k*8.0);
        float w2 = sin(uTime*4.3 + ph*1.7 + k*13.0);
        float amp = k*k*0.44*uGust*(1.0 + wv*1.5);
        vec3 p = wp.xyz;
        p += vec3(0.0, 1.0, 0.0) * (w1*amp*0.5 + w2*amp*0.22);
        p += normalize(vec3(0.0, 0.18, 1.0) + tw) * (w2*amp);
        vShade = 0.5 + 0.5*(0.5 + 0.5*w2) + wv*0.55;
        vT = aTint + tw*0.5; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec3 vT; varying vec2 vUv; varying float vShade;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        gl_FragColor = vec4(t.rgb * vT * vShade, 1.0);
      }`,
  });
  mat.customProgramCacheKey = () => 'ld-flags';

  const tint = new Float32Array(N * 3);
  const ph = new Float32Array(N);
  const cols = ['#ff3a2f', '#ffd36a', '#f2fbff', '#3dff9a', '#ffb14e'];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    c.set(cols[i % cols.length]).multiplyScalar(0.85);
    tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
    ph[i] = rand();
  }
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.frustumCulled = false;
  grp.add(im);
  fillInst(im, N);

  const d = new THREE.Object3D();
  d.rotation.order = 'YXZ';
  const waves = waveQueue(uni, 0.55);
  let gust = 1;

  return {
    group: grp,
    wave: waves.emit,
    update(t, dt) {
      uni.uTime.value = t;
      waves.fill(t);
      // 阵风：dt 只用来把 gust 推回去，不另起时钟
      gust = clamp(gust + (Math.sin(t * 1.9) > 0.92 ? dt * 0.7 : -dt * 0.22) + Math.sin(t * 0.31) * dt * 0.4, 0.65, 1.7);
      uni.uGust.value = gust;
      let i = 0;
      for (const b of boats) {
        for (const [y, z] of [[b.deck + 2.02, -b.len * 0.42], [b.deck + 1.3, b.len * 0.3]]) {
          if (i >= N) break;
          if (!b.visible) { im.setMatrixAt(i++, HIDE); continue; }
          _v.set(0, y, z).applyMatrix4(b.anchor.matrix);
          d.position.copy(_v);
          d.quaternion.copy(b.anchor.quaternion);
          d.scale.setScalar(b.s);
          d.updateMatrix();
          im.setMatrixAt(i++, d.matrix);
        }
      }
      for (let k = 0; k < poleAt.length; k++) {
        if (i >= N) break;
        const p = poleAt[k];
        d.position.set(p.x + 0.06, p.y + 3.55, p.z);
        d.rotation.set(0, poleYaw[k], 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        im.setMatrixAt(i++, d.matrix);
      }
      for (; i < N; i++) im.setMatrixAt(i, HIDE);
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ============================================================ 装配 */
export function buildProps(scene, columns, anchors, quarter) {
  void quarter;
  const fleet = buildFleet(scene, columns, anchors);
  const flags = buildFlags(scene, fleet, anchors);
  const strings = buildStrings(scene);
  const crowd = buildCrowd(scene);
  const umbrellas = buildUmbrellas(scene);
  const spray = buildSpray(scene);

  // 坞边的网堆与鱼筐：harbor 机位的前景得有点东西拿着
  const quayPts = vecs(anchors && anchors.quay);
  if (!quayPts.length) for (const p of QUAY.pts) quayPts.push(new THREE.Vector3(p[0], QUAY.top, p[1]));
  const crates = [];
  for (let i = 0; i < 34; i++) {
    const base = quayPts[i % quayPts.length];
    const x = base.x + rr(-17, 17), z = base.z + rr(-10, 10);
    // 筐与网只堆在坞面上：取码头面高程，别顺着洼下去的港池底漂
    const y = Math.max(base.y > 0.6 ? base.y : QUAY.top, terrainH(x, z)) + 0.08;
    crates.push({ p: [x, y, z], r: [0, rr(-0.6, 0.6), 0], s: [rr(0.8, 1.4), rr(0.5, 0.9), rr(0.8, 1.3)] });
  }
  fleet.group.add(instanced(normGeo(new THREE.BoxGeometry(1, 0.7, 1)), M.plank, crates));
  fleet.group.add(instanced(
    normGeo(new THREE.IcosahedronGeometry(1, 0)),
    M.net,
    crates.slice(0, 16).map((cr) => ({
      p: [cr.p[0] + 1.7, cr.p[1] + 0.35, cr.p[2] + 1.3], r: [rr(-0.2, 0.2), rr(0, 3), 0], s: rr(1.1, 2.2),
    })),
  ));

  return { crowd, strings, umbrellas, spray, flags, fleet };
}
