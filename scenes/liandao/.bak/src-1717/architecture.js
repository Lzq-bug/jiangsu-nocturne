/**
 * 连岛·开渔夏夜 —— 构筑物与硬景。
 * 西大堤 / 墟沟对岸城建 / 中心渔港（码头·船台·吊机·高杆灯）/ 防波堤与灯塔 / 口门灯桩
 * / 海滨栈道 / 苏马湾崖顶亭台与刻石 / 烟墩与羊窝头 / 浴场腹地 / 无名灯窗楼群。
 * 坐标：+X 东、+Z 南、y=0 平均海面；所有平面位置一律取 layout.js，本文件不另编坐标。
 * 纪律：重复构件走 instanced 或 mergeGeometries 合批；随机只走 kit 的 rand/rr，刷新画面必须一致。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, rgb, rand, rr, glow, lit, M, box, mesh, instanced, registerOccluder,
         tetrapodGeo, rockGeo, umbrellaGeo, mastGeo, railingGeo, concreteBlock, flagGeo, stringPath } from './kit.js';
import * as T from './textures.js';
import { terrainH, shoreAt, zoneAt } from './environment.js';
import { DYKE, ARMOUR, MAINLAND, HARBOR, QUAY, BREAKWATER, LIGHTHOUSE, BUOYS, BERTHS, CHANNEL,
         BOARDWALK, BOARDWALK_W, PAVILION, STELE, SHEEP, BEACON, FIELD, UMBRELLAS, LOOKOUT, HUTS,
         VILLAGE, LANTERN_LINES, PAL_HARBOR, STRIP_COLORS, FLEET_LIGHTS } from './layout.js';

/* ---------------------------------------------------------------- LAYOUT（运行期回填） */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GY = (x, z) => terrainH(x, z);
const RAD = THREE.MathUtils.degToRad;

export const LAYOUT = {
  chime: { pos: V(0, 0, 0), pivot: null, lamps: [] },
  tower: { pos: V(0, 0, 0), top: 0, door: V(0, 0, 0), gallery: V(0, 0, 0) },
  walk: { curve: null },
  dyke: { curve: null, lamps: [] },
  quay: { pts: QUAY.pts.map((p) => [p[0], p[1]]), top: QUAY.top, bollards: [] },
  stele: { pos: V(STELE.x, STELE.y, STELE.z), door: V(STELE.x, STELE.y, STELE.z) },
  pavilion: { pos: V(PAVILION.x, PAVILION.y, PAVILION.z) },
  berth: { door: V(BERTHS.x, QUAY.top, BERTHS.z) },
};

/* ---------------------------------------------------------------- 亮度总线 */

/* setStrip 只缩放颜色/不透明度的倍数，基色定义仍留在 kit 与 PAL 里 */
const STRIPS = [];
function strip(mat, gain = 1) {
  if (!mat) return mat;
  if (!STRIPS.some((e) => e.mat === mat)) {
    STRIPS.push({
      mat,
      base: mat.color ? mat.color.clone() : null,
      ei: typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0,
      op: typeof mat.opacity === 'number' ? mat.opacity : 1,
      gain,
    });
  }
  return mat;
}
function applyStrip(v) {
  const k = clamp(v, 0, 1.6);
  for (const e of STRIPS) {
    if (e.base) e.mat.color.copy(e.base).multiplyScalar(k * e.gain);
    if (e.ei) e.mat.emissiveIntensity = e.ei * k * e.gain;
    if (e.mat.transparent) e.mat.opacity = e.op * k;
  }
}

/* ---------------------------------------------------------------- 通用工具 */

/** 平面折线 → XZ 走向的曲线；高程由调用方逐桩位决定，不写进曲线本身 */
function curve2D(pts, y = 0, closed = false) {
  return new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], y, p[1])), closed, 'catmullrom', 0.5);
}

/** 等弧长桩位，放样与散布都靠它；折线转角处才不会疏密不均 */
function stationsOf(curve, step, cap = 900) {
  const n = clamp(Math.ceil(curve.getLength() / step), 2, cap);
  return curve.getSpacedPoints(n);
}

/**
 * 沿折线的输框架：u = 行进方向右手侧，v = 竖直方向。
 * DYKE.pts 自连岛端排向墟沟端、QUAY.pts 自西排向东，两者的 u>0 都正好落在港池一侧，
 * 撒护面块与立码头面时靠这个符号区分内外，不必逐条线再判一次朝向。
 */
function frame(stations) {
  const tangents = [];
  const sides = [];
  for (let i = 0; i < stations.length; i++) {
    const a = stations[Math.max(0, i - 1)];
    const b = stations[Math.min(stations.length - 1, i + 1)];
    const t = V(b.x - a.x, 0, b.z - a.z);
    if (t.lengthSq() < 1e-9) t.set(1, 0, 0);
    t.normalize();
    tangents.push(t);
    sides.push(V(-t.z, 0, t.x));
  }
  return {
    pts: stations,
    n: stations.length,
    at(i, u, v) {
      const s = stations[i];
      const d = sides[i];
      return V(s.x + d.x * u, s.y + v, s.z + d.z * u);
    },
    yaw(i) { return -Math.atan2(tangents[i].z, tangents[i].x); },
    side(i) { return sides[i]; },
  };
}

/**
 * 断面放样：prof[i] 是第 i 个桩位的 [u,v] 点序（各桩点数必须一致），逐段扫掠成壳。
 * 自己写顶点而不用 ExtrudeGeometry，是为了让 u/v 的语义跟 frame 完全一致。
 */
function loft(fr, prof, step) {
  const pn = prof[0].length;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < fr.n; i++) {
    for (let k = 0; k < pn; k++) {
      const p = fr.at(i, prof[i][k][0], prof[i][k][1]);
      pos.push(p.x, p.y, p.z);
      uv.push(i * step * 0.12, k * 0.5);
      nor.push(0, 1, 0);
    }
  }
  for (let i = 0; i < fr.n - 1; i++) {
    for (let k = 0; k < pn - 1; k++) {
      const a = i * pn + k;
      const b = a + pn;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
      const du = prof[i][k + 1][0] - prof[i][k][0];
      const dv = prof[i][k + 1][1] - prof[i][k][1];
      const s = fr.side(i);
      // 断面切向叉上路径切向 = 这条面的外法线
      const nx = s.z * dv;
      const ny = du;
      const nz = -s.x * dv;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const q of [a, a + 1, b, b + 1]) {
        nor[q * 3] = nx / l;
        nor[q * 3 + 1] = ny / l;
        nor[q * 3 + 2] = nz / l;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** 两点之间的直盒（可带仰角）：先绕 Z 抬 pitch、再绕 Y 转 heading，绕序天然正确 */
function segBox(a, b, w, h, center = false) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const Lh = Math.hypot(dx, dz) || 1e-4;
  const len = Math.hypot(Lh, dy) * 1.03;
  const g = box(len, h, w);
  g.translate(len / 2, center ? 0 : h / 2, 0);
  if (Math.abs(dy) > 1e-4) g.rotateZ(Math.atan2(dy, Lh));
  g.rotateY(-Math.atan2(dz, dx));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** 绕竖轴的一圈栏：railingGeo 沿 +X 建，平移到半径处再逐段转向，合批成一个网格 */
function ringRail(parent, cx, cy, cz, r, segs, opts) {
  const geos = [];
  const one = railingGeo((2 * Math.PI * r) / segs, opts);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const g = one.clone();
    g.translate(r, 0, 0);
    g.rotateY(-a);
    g.translate(cx, cy, cz);
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), steelMat());
  parent.add(m);
  return m;
}

/** 挂到父节点：kit 的 mesh 只做 geo+mat 组装，位置与朝向在这里补 */
function put(parent, geo, mat, p, ry = 0, rx = 0) {
  const o = mesh(geo, mat);
  o.position.set(p.x, p.y, p.z);
  if (ry) o.rotation.y = ry;
  if (rx) o.rotation.x = rx;
  parent.add(o);
  return o;
}

/* 同一份硬景材质复用到底：几十个构件组只占几份 uniform */
const MATCACHE = {};
function cached(key, make) {
  if (!MATCACHE[key]) MATCACHE[key] = make();
  return MATCACHE[key];
}
function plankMat() { return M.plank || cached('plank', () => lit(PAL.hull, { map: T.plank(), rough: 0.9 })); }
function rockMat() { return cached('rock', () => lit(PAL.rock, { map: T.rock(), rough: 0.95 })); }
function reefMat() { return cached('reef', () => lit(PAL.reef, { map: T.rock(), rough: 0.97 })); }
function concreteMat() { return cached('concrete', () => lit(PAL.moonWhite, { map: T.concrete(), rough: 0.9 })); }
function steelMat() { return cached('steel', () => lit(PAL.steel, { map: T.rust(), rough: 0.78, metal: 0.55 })); }
function rustMat() { return cached('rust', () => lit(PAL.rust, { map: T.rust(), rough: 0.82, metal: 0.45 })); }
function inkMat() { return cached('ink', () => lit(PAL.ink, { rough: 0.9 })); }

/** stringPath 可能回曲线也可能回点列，这里统一成点列，别把返回类型绑死 */
function linePoints(a, b, sag, seg = 28) {
  const raw = stringPath(a, b, sag, seg);
  if (raw && typeof raw.getPoints === 'function') return raw.getPoints(seg);
  if (Array.isArray(raw)) return raw.map((p) => (p && p.isVector3 ? p : V(p[0], p[1], p[2])));
  return [
    V(a[0], a[1], a[2]),
    V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2),
    V(b[0], b[1], b[2]),
  ];
}

/**
 * 消波块撒坡：bandFn(i,t) 给出 t∈[0,1] 时块心的 [u,v]（沿该桩断面的那条坡插值）；
 * 总个数按 ARMOUR.perMeter = 0.09 个/米在折线长度上配平，用 carry 补掉小数。
 */
function armourRun(parent, mat, fr, prof, step, opts) {
  const list = [];
  const iFrom = Math.ceil(opts.from ?? 1);
  const iTo = Math.floor(opts.to ?? fr.n - 2);
  let carry = 0;
  for (let i = iFrom; i <= iTo; i++) {
    carry += ARMOUR.perMeter * step * (opts.density ?? 1);
    while (carry >= 1) {
      carry -= 1;
      const b = opts.bandFn(i, rand());
      const p = fr.at(i, b[0] + rr(-1, 1) * opts.jit, b[1] + rr(-0.3, 0.5) * opts.jit);
      list.push({
        p: [p.x, p.y, p.z],
        r: [rr(-0.5, 0.5), rr(-3.14, 3.14), rr(-0.5, 0.5)],
        s: rr(0.84, 1.2),
      });
    }
  }
  if (!list.length) return null;
  const im = instanced(tetrapodGeo(ARMOUR.size), mat, list);
  parent.add(im);
  return im;
}

/** 一杆灯：灯杆与基座 instanced，灯头单独一个 InstancedMesh（好被点中、好统一调亮度） */
function lampRun(parent, fr, mats, opts = {}) {
  const poleH = opts.poleH ?? 7.6;
  const armU = opts.armU ?? -2.2;
  const posts = [];
  const heads = [];
  for (let i = 0; i < fr.n; i++) {
    const g0 = fr.at(i, 0, 0);
    posts.push({ p: [g0.x, g0.y + poleH / 2, g0.z], r: [0, fr.yaw(i), 0], s: [0.44, poleH, 0.44] });
    if (opts.foot) posts.push({ p: [g0.x, g0.y + 0.25, g0.z], r: [0, fr.yaw(i), 0], s: [1.5, 0.5, 1.5] });
    heads.push(fr.at(i, armU, poleH + 0.5));
  }
  parent.add(instanced(box(1, 1, 1), mats.post, posts));
  const hm = instanced(box(0.95, 0.82, 0.95), mats.head,
    heads.map((h) => ({ p: [h.x, h.y, h.z], r: [0, 0, 0], s: 1 })));
  hm.userData.kind = 'lampHeads';
  parent.add(hm);
  return { mesh: hm, heads };
}

/* ---------------------------------------------------------------- 1. 西大堤 */

/** 堤顶 +9、顶宽 12：外坡 1:1.7 迎浪，内坡 1:1.4 接港池静水，坡脚按实时地形收 */
function dykeProfile(fr) {
  const hw = DYKE.width / 2;
  const prof = [];
  for (let i = 0; i < fr.n; i++) {
    const s = fr.side(i);
    const p = fr.pts[i];
    // 内侧被 BASIN 切成洼地、外侧只是浅滩，两侧坡脚高程差得多，必须分开求
    const outY = clamp(GY(p.x - s.x * 30, p.z - s.z * 30), -9, 7);
    const inY = clamp(GY(p.x + s.x * 28, p.z + s.z * 28), -11, 7);
    const ho = DYKE.crown - outY;
    const hi = DYKE.crown - inY;
    prof.push([
      [-(hw + ho * 1.7), outY - DYKE.crown],
      [-hw, 0],
      [hw, 0],
      [hw + hi * 1.4, inY - DYKE.crown],
    ]);
  }
  return prof;
}

function buildDyke(parent) {
  const g = new THREE.Group();
  g.name = 'dyke';
  parent.add(g);
  const crownCurve = curve2D(DYKE.pts, DYKE.crown);
  const step = 9;
  const fr = frame(stationsOf(crownCurve, step, 160));
  const prof = dykeProfile(fr);
  const hw = DYKE.width / 2;

  const mass = put(g, loft(fr, prof, step), rockMat(), V(0, 0, 0));
  mass.castShadow = true;
  mass.receiveShadow = true;
  registerOccluder(mass);

  /* 两道背墙：沿堤顶内外缘各一条，直盒合批（闭合成面的绕序没这么稳） */
  const paraGeos = [];
  for (let i = 0; i < fr.n - 1; i++) {
    for (const edge of [1, 2]) {
      const shift = edge === 1 ? 0.5 : -0.5;
      const a = fr.at(i, prof[i][edge][0] + shift, 0);
      const b = fr.at(i + 1, prof[i + 1][edge][0] + shift, 0);
      paraGeos.push(segBox(a, b, 0.7, DYKE.parapet));
    }
  }
  const para = put(g, mergeGeometries(paraGeos), concreteMat(), V(0, 0, 0));
  para.castShadow = true;
  registerOccluder(para);

  /* 护面块：外坡一整面，加口门（t=0 连岛这头）内外两侧——合龙段吃浪最狠 */
  const am = reefMat();
  const outerBand = (i, t) => {
    const p = prof[i];
    return [p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] * (1 - t) + 0.35];
  };
  armourRun(g, am, fr, prof, step, { bandFn: outerBand, jit: 1.6 });
  const gateTo = fr.n * 0.18;
  const innerBand = (i, t) => [prof[i][3][0] * t + 1.2, -t * (DYKE.crown - 1.0) + 0.3];
  armourRun(g, am, fr, prof, step, { bandFn: innerBand, from: 1, to: gateTo, jit: 1.3, density: 1.2 });
  const toeBand = (i, t) => [prof[i][1][0] - 1.2 - t * 5.5, -t + 0.2];
  armourRun(g, am, fr, prof, step, { bandFn: toeBand, from: 1, to: gateTo, jit: 1.2, density: 1.6 });

  /* 堤顶灯：每 lampGap 一盏；机位取样的曲线走 y = 堤顶 + 0.2 */
  const lampCurve = curve2D(DYKE.pts, DYKE.crown + 0.2);
  const lampFr = frame(stationsOf(lampCurve, DYKE.lampGap, 60));
  const run = lampRun(g, lampFr, { post: steelMat(), head: strip(glow(PAL_HARBOR[1], 1.4), 1) },
    { poleH: 7.6, armU: -2.4, foot: true });
  LAYOUT.dyke.curve = lampCurve;
  LAYOUT.dyke.lamps = [run.mesh];

  /* 里程桩：混凝土小方桩每隔一段一根，6700 米的尺度要走堤时才读得出 */
  const marks = [];
  for (let i = 1; i < fr.n; i += 3) {
    const p = fr.at(i, hw - 1.1, 0.3);
    marks.push({ p: [p.x, p.y, p.z], r: [0, fr.yaw(i), 0], s: [0.3, 0.7, 0.3] });
  }
  g.add(instanced(box(1, 1, 1), concreteMat(), marks));

  return { group: g, crownCurve, lampCurve, lamps: run.heads };
}

/* ---------------------------------------------------------------- 2. 堤远端的墟沟城建 */

/** 堤的远端要有纵深：只给体块与亮窗，不指认任何地名 */
function buildMainland(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const blocks = [];
  const wins = [];
  for (let i = 0; i < MAINLAND.blocks; i++) {
    const x = MAINLAND.x + rr(-MAINLAND.spread, MAINLAND.spread * 0.8);
    const z = MAINLAND.z + rr(-MAINLAND.spread * 0.45, MAINLAND.spread * 0.55);
    const w = rr(15, 36);
    const d = rr(14, 32);
    const h = rr(MAINLAND.h0, MAINLAND.h1);
    const y = GY(x, z);
    blocks.push({ p: [x, y + h / 2 - 1.6, z], r: [0, rr(-0.3, 0.3), 0], s: [w, h, d] });
    const cols = Math.max(2, Math.round(w / 7));
    const rows = Math.max(2, Math.round(h / 5.4));
    for (let a = 0; a < cols; a++) {
      for (let b = 0; b < rows; b++) {
        if (rand() > 0.4) continue;
        const u = -w / 2 + (a + 0.5) * (w / cols);
        const v = -h / 2 + (b + 0.7) * (h / rows);
        // 只点朝场景的东、南两面，背面点了也看不见
        const east = rand() < 0.55;
        wins.push({
          p: [east ? x - w / 2 - 0.2 : x + u, y + h / 2 + v, east ? z + u : z + d / 2 + 0.2],
          r: [0, east ? Math.PI / 2 : 0, 0],
          s: 1,
        });
      }
    }
  }
  g.add(instanced(box(1, 1, 1), inkMat(), blocks));
  g.add(instanced(box(1.4, 1.9, 0.1), strip(glow(STRIP_COLORS[2], 0.5), 0.75), wins));
  return g;
}

/* ---------------------------------------------------------------- 3. 港池高杆灯 */

/** 四座高杆灯沿港池边立着；灯头用 27 面发光体，一个 draw call 点亮整片泊区 */
function buildHarborMasts(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const posts = [];
  const heads = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.42;
    const x = HARBOR.x + Math.cos(a) * HARBOR.rx * 0.86;
    const z = HARBOR.z + Math.sin(a) * HARBOR.rz * 0.86;
    const y = Math.max(GY(x, z), QUAY.top);
    posts.push({ p: [x, y + 9, z], r: [0, 0, 0], s: [0.7, 18, 0.7] });
    posts.push({ p: [x, y + 0.3, z], r: [0, 0, 0], s: [3.2, 0.6, 3.2] });
    heads.push({ p: [x, y + 18.3, z], r: [0, a, 0], s: 1 });
  }
  g.add(instanced(box(1, 1, 1), steelMat(), posts));
  g.add(instanced(new THREE.SphereGeometry(1.1, 16, 12), strip(glow(PAL_HARBOR[2], 1.6), 1), heads));
  return g;
}

/* ---------------------------------------------------------------- 4. 中心渔港码头 */

function buildQuay(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const deckW = 15;
  const curve = curve2D(QUAY.pts, QUAY.top);
  const step = 10;
  const fr = frame(stationsOf(curve, step, 90));
  const prof = [];
  for (let i = 0; i < fr.n; i++) {
    const s = fr.side(i);
    const p = fr.pts[i];
    // 岸侧回填按实时地形收，水侧立面一律落到 QUAY.face 之下，低潮时才露出整面墙
    const backY = clamp(GY(p.x + s.x * 12, p.z + s.z * 12), QUAY.top - QUAY.face - 4, QUAY.top - 1.2);
    const drop = backY - QUAY.top;
    prof.push([
      [-4.5, drop],
      [-1.2, drop],
      [-deckW / 2, 0],
      [deckW / 2, 0.12],
      [deckW / 2 + 6, -1.8],
    ]);
  }
  const body = put(g, loft(fr, prof, step), concreteMat(), V(0, 0, 0));
  body.castShadow = true;
  body.receiveShadow = true;
  registerOccluder(body);

  /* 系缆桩：沿岸缘隔一个桩位一根；桩顶世界坐标交出去，props 收缆就拴在这些点上 */
  const bpos = [];
  const bollard = [];
  for (let i = 1; i < fr.n - 1; i += 2) {
    const p = fr.at(i, -deckW / 2 + 1.0, 0.6);
    bpos.push({ p: [p.x, p.y, p.z], r: [0, rr(-0.3, 0.3), 0], s: [0.52, 1.15, 0.52] });
    bollard.push(V(p.x, p.y + 0.55, p.z));
  }
  g.add(instanced(box(1, 1, 1), steelMat(), bpos));

  /* 护舷木条 + 吊机走行轨：两条合批的带子把岸线切齐 */
  const fender = [];
  const rails = [];
  for (let i = 0; i < fr.n - 1; i++) {
    fender.push(segBox(fr.at(i, -deckW / 2, -0.5), fr.at(i + 1, -deckW / 2, -0.5), 0.45, 0.6));
    for (const u of [-deckW / 2 + 3.2, -deckW / 2 + 4.6]) {
      rails.push(segBox(fr.at(i, u, 0.12), fr.at(i + 1, u, 0.12), 0.2, 0.16));
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(fender), plankMat()));
  g.add(new THREE.Mesh(mergeGeometries(rails), steelMat()));

  /* 仓库与冰厂：檐口一圈发光细梁，夜里港内体量只靠这条边读出来 */
  const sheds = [
    { t: 0.16, u: 30, w: 34, d: 18, h: 10 },
    { t: 0.44, u: 34, w: 44, d: 20, h: 12 },
    { t: 0.72, u: 27, w: 28, d: 16, h: 9 },
    { t: 0.9, u: 32, w: 24, d: 14, h: 8 },
  ];
  const outline = strip(glow(PAL_HARBOR[0], 1.2), 1);
  for (const s of sheds) {
    const i = clamp(Math.round(s.t * (fr.n - 1)), 1, fr.n - 2);
    const p = fr.at(i, s.u, 0);
    const y = GY(p.x, p.z);
    const yaw = fr.yaw(i);
    const b = concreteBlock(s.w, s.h, s.d);
    b.position.set(p.x, y + s.h / 2, p.z);
    b.rotation.y = yaw;
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
    registerOccluder(b);
    const o = new THREE.Mesh(mergeGeometries([
      box(s.w + 0.3, 0.2, 0.2).translate(0, s.h / 2, s.d / 2),
      box(s.w + 0.3, 0.2, 0.2).translate(0, s.h / 2, -s.d / 2),
      box(0.2, 0.2, s.d + 0.3).translate(s.w / 2, s.h / 2, 0),
      box(0.2, 0.2, s.d + 0.3).translate(-s.w / 2, s.h / 2, 0),
    ]), outline);
    o.position.set(p.x, y + s.h / 2, p.z);
    o.rotation.y = yaw;
    g.add(o);
    // 装卸平台：朝水一侧一条矮台，货从船上直接上垛
    const plat = concreteBlock(s.w * 0.72, 1.1, 6);
    plat.position.set(p.x, y + 0.55, p.z);
    plat.rotation.y = yaw;
    g.add(plat);
  }

  /* 船台（滑道）：从码头面斜插到水下，四更最低潮时整条露出来 */
  const slipI = clamp(Math.round(0.6 * (fr.n - 1)), 1, fr.n - 2);
  const sp = fr.at(slipI, -deckW / 2 - 14, 0);
  const syaw = fr.yaw(slipI);
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(17, 30), concreteMat());
  ramp.rotation.set(-Math.PI / 2 + 0.3, 0, syaw);
  ramp.position.set(sp.x, GY(sp.x, sp.z) + 1.5, sp.z);
  ramp.receiveShadow = true;
  g.add(ramp);
  const kerb = [];
  const ka = fr.at(slipI, -deckW / 2 - 1, -0.2);
  const kb = fr.at(slipI, -deckW / 2 - 28, -2.6);
  for (const off of [-8.4, 8.4]) {
    const side = V(Math.cos(syaw + Math.PI / 2) * off, 0, -Math.sin(syaw) * off);
    kerb.push(segBox(V(ka.x + side.x, ka.y, ka.z + side.z), V(kb.x + side.x, kb.y, kb.z + side.z), 0.7, 0.8, true));
  }
  g.add(new THREE.Mesh(mergeGeometries(kerb), concreteMat()));

  /* 龙门吊：横梁加三条腿，instanced 四个构件 */
  const cp = fr.at(clamp(slipI + 3, 0, fr.n - 1), -deckW / 2 - 6, 0);
  const cy = GY(cp.x, cp.z);
  const craneParts = [
    { p: [cp.x, cy + 11.4, cp.z], r: [0, syaw, 0], s: [26, 0.9, 1.1] },
    { p: [cp.x, cy + 5.5, cp.z], r: [0, syaw, 0], s: [1.1, 11, 1.1] },
  ];
  for (const off of [-9, 9]) {
    craneParts.push({
      p: [cp.x + Math.cos(syaw) * off, cy + 5.5, cp.z - Math.sin(syaw) * off],
      r: [0, syaw, 0],
      s: [1.1, 11, 1.1],
    });
  }
  const crane = instanced(box(1, 1, 1), steelMat(), craneParts);
  crane.castShadow = true;
  g.add(crane);
  put(g, box(2.6, 1.4, 2.6), rustMat(), V(cp.x + Math.cos(syaw) * 4, cy + 10.3, cp.z - Math.sin(syaw) * 4), syaw);

  /* 门座吊：桅与索走 kit 的 mastGeo，吊臂斜挑向船台 */
  const mast = mastGeo(11, 0.42);
  const mp = fr.at(clamp(slipI - 4, 0, fr.n - 1), -deckW / 2 - 3, 0);
  mast.position.set(mp.x, GY(mp.x, mp.z) + 5.4, mp.z);
  mast.rotation.y = syaw;
  g.add(mast);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 15, 6), steelMat());
  boom.position.set(mp.x, GY(mp.x, mp.z) + 11.2, mp.z);
  boom.rotation.set(0.92, 0, syaw + 0.35);
  g.add(boom);

  /* 泊区边界的浮筒列 + 一盏桅顶白灯：船位由 props 排，这里只定界 */
  const floats = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = BERTHS.x + Math.cos(a) * BERTHS.rx * 1.05;
    const z = BERTHS.z + Math.sin(a) * BERTHS.rz * 1.05;
    floats.push({ p: [x, 0.15, z], r: [0, rr(-3.14, 3.14), 0], s: [1.2, 0.7, 1.2] });
  }
  g.add(instanced(box(1, 1, 1), rustMat(), floats));
  g.add(instanced(box(0.44, 0.44, 0.44), strip(glow(FLEET_LIGHTS.mast, 0.85), 0.7),
    floats.map((f) => ({ p: [f.p[0], 0.85, f.p[2]], r: [0, 0, 0], s: 1 }))));

  /* 码头面灯：沿岸缘一盏一盏，给千帆一个背景 */
  const qfr = frame(stationsOf(curve2D(QUAY.pts, QUAY.top + 0.1), 24, 70));
  const qrun = lampRun(g, qfr, { post: steelMat(), head: strip(glow(PAL_HARBOR[1], 1.25), 1) },
    { poleH: 8.6, armU: -5.2, foot: true });
  LAYOUT.dyke.lamps.push(qrun.mesh);

  LAYOUT.quay.pts = QUAY.pts.map((p) => [p[0], p[1]]);
  LAYOUT.quay.top = QUAY.top;
  LAYOUT.quay.bollards = bollard;

  /* 门口：岸线上离停泊区最近的那一点，门脸朝水，高程按码头面 */
  let best = 1;
  let bd = Infinity;
  for (let i = 0; i < fr.n; i++) {
    const p = fr.at(i, -deckW / 2 + 2, 0);
    const d = (p.x - BERTHS.x) ** 2 + (p.z - BERTHS.z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const dp = fr.at(best, -deckW / 2 + 1.0, 1.5);
  LAYOUT.berth.door = V(dp.x, QUAY.top + 1.5, dp.z);
  put(g, box(2.3, 3.0, 0.26), strip(glow(PAL_HARBOR[3], 0.9), 0.9), V(dp.x, QUAY.top + 1.55, dp.z), fr.yaw(best));

  return { group: g, curve, bollards: bollard };
}

/* ---------------------------------------------------------------- 5. 防波堤 */

function buildBreakwater(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const hw = BREAKWATER.width / 2;
  const crownCurve = curve2D(BREAKWATER.pts, BREAKWATER.crown);
  const step = 7;
  const fr = frame(stationsOf(crownCurve, step, 90));
  const prof = [];
  for (let i = 0; i < fr.n; i++) {
    const s = fr.side(i);
    const p = fr.pts[i];
    const outY = clamp(GY(p.x - s.x * 20, p.z - s.z * 20), -9, BREAKWATER.crown - 5);
    const inY = clamp(GY(p.x + s.x * 14, p.z + s.z * 14), -7, BREAKWATER.crown - 3);
    const ho = BREAKWATER.crown - outY;
    const hi = BREAKWATER.crown - inY;
    prof.push([
      [-(hw + ho * 1.8), outY - BREAKWATER.crown],
      [-hw, 0],
      [hw, 0],
      [hw + hi * 1.3, inY - BREAKWATER.crown],
    ]);
  }
  const body = put(g, loft(fr, prof, step), rockMat(), V(0, 0, 0));
  body.castShadow = true;
  body.receiveShadow = true;
  registerOccluder(body);

  const am = reefMat();
  const outerBand = (i, t) => {
    const p = prof[i];
    return [p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] * (1 - t) + 0.3];
  };
  armourRun(g, am, fr, prof, step, { bandFn: outerBand, from: 1, to: fr.n - 1, jit: 1.4 });
  const innerBand = (i, t) => [prof[i][3][0] * t, -t * (BREAKWATER.crown - 1.5) + 0.3];
  armourRun(g, am, fr, prof, step, { bandFn: innerBand, from: 0, to: fr.n * 0.5, jit: 1.2, density: 0.9 });

  /* 堤顶灯并进大堤的灯列，一起注册给 setStrip */
  const lfr = frame(stationsOf(curve2D(BREAKWATER.pts, BREAKWATER.crown + 0.2), 18, 40));
  const run = lampRun(g, lfr, { post: steelMat(), head: strip(glow(PAL_HARBOR[2], 1.2), 1) },
    { poleH: 5.6, armU: -1.4, foot: true });
  LAYOUT.dyke.lamps.push(run.mesh);

  /* 堤头灯桩与反光板：口门这里要有个可点的东西 */
  const tip = fr.at(fr.n - 1, 0, 0.4);
  put(g, box(0.8, 3.4, 0.8), lit(PAL.navRed, { map: T.rust(), rough: 0.72, metal: 0.4 }), V(tip.x, tip.y + 1.7, tip.z));
  const tipGlow = put(g, box(0.7, 0.7, 0.7), strip(glow(PAL.navRed, 1.1), 1), V(tip.x, tip.y + 3.7, tip.z));
  tipGlow.userData.flash = 3.0;

  return { group: g, tip: V(tip.x, BREAKWATER.crown, tip.z), lamps: run.heads };
}

/* ---------------------------------------------------------------- 6. 口门灯桩 */

/** 进港左红右绿，另加一座黄灯定航道；灯头带自己的 flash 周期供上层驱动 */
function buildBuoys(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const list = [];
  const cage = lit(PAL.ink, { rough: 0.86, metal: 0.3 });
  for (const b of BUOYS) {
    const y = Math.max(GY(b.x, b.z), -1.6);
    const mast = mastGeo(6.0, 0.22);
    mast.position.set(b.x, y + 3.0, b.z);
    g.add(mast);
    put(g, box(1.9, 0.4, 1.9), cage, V(b.x, y + 5.1, b.z));
    const lamp = put(g, box(1.15, 1.35, 1.15), strip(glow(b.hue, 1.7), 1), V(b.x, y + 6.0, b.z));
    lamp.userData.flash = b.flash;
    lamp.userData.kind = 'navLamp';
    // 昼标：顶上一块黑牌，夜里只读成剪影
    put(g, box(2.2, 0.22, 2.2), cage, V(b.x, y + 6.9, b.z));
    // 桩脚墩台：涨潮时正好被水盖住，桩才像是立在水里的
    put(g, box(2.6, 1.0, 2.6), rustMat(), V(b.x, y + 0.2, b.z));
    list.push(lamp);
  }
  g.userData.kind = 'buoys';
  return { group: g, lamps: list };
}

/* ---------------------------------------------------------------- 7. 灯塔 */

function buildLighthouse(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const x = LIGHTHOUSE.x;
  const z = LIGHTHOUSE.z;
  /* 焦点高程是硬指标：interiors 与扫光都按 focal 取样，所以塔基取 focal-h，
     塔高恒等于 LIGHTHOUSE.h，埋进堤头的那一段读作石砌墩台 */
  const base = LIGHTHOUSE.focal - LIGHTHOUSE.h;
  const topY = LIGHTHOUSE.focal - 2.2;
  const galleryR = 4.6;
  const lanternH = 2.7;
  const lanternY = LIGHTHOUSE.focal;
  const plinthH = Math.max(1.4, BREAKWATER.crown - base);
  const white = lit(PAL.moonWhite, { map: T.concrete(), rough: 0.72, metal: 0.04, emissive: '#0a0f16', ei: 0.2 });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 8.8, plinthH, 12, 1), rockMat());
  plinth.position.set(x, base + plinthH / 2, z);
  plinth.castShadow = true;
  g.add(plinth);
  registerOccluder(plinth);

  const shaftH = topY - (base + plinthH);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 4.3, shaftH, 16, 1), white);
  shaft.position.set(x, base + plinthH + shaftH / 2, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);
  registerOccluder(shaft);

  /* 红带：半径略大的短圆筒套在塔身上，不加新材质也能读出分色 */
  const redMat = lit(PAL.navRed, { map: T.rust(), rough: 0.8, metal: 0.08 });
  for (const f of [0.34, 0.68]) {
    const r0 = THREE.MathUtils.lerp(4.3, 2.9, f);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.97, r0, shaftH * 0.11, 16, 1), redMat);
    band.position.set(x, base + plinthH + shaftH * f, z);
    g.add(band);
  }

  /* 外廊板 + 回廊栏 */
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(galleryR, galleryR + 0.4, 0.5, 20, 1), white);
  slab.position.set(x, topY - 0.15, z);
  slab.castShadow = true;
  g.add(slab);
  ringRail(g, x, topY + 0.25, z, galleryR, 14, { height: 1.05, spacing: 0.42, rail: true });

  /* 灯室：玻璃围筒 + 八道竖框 + 穹顶，几何中心正落在 focal */
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.32, lanternH, 16, 1, true),
    M.glass || lit(PAL.glass, { rough: 0.16 }));
  glass.position.set(x, lanternY, z);
  g.add(glass);
  const astragal = [];
  for (let i = 0; i < 8; i++) {
    const b = box(0.16, lanternH, 0.16);
    b.translate(2.34, 0, 0);
    b.rotateY(-(i / 8) * Math.PI * 2);
    b.translate(x, lanternY, z);
    astragal.push(b);
  }
  g.add(new THREE.Mesh(mergeGeometries(astragal), rustMat()));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.0, 16),
    lit(PAL.navRed, { map: T.rust(), rough: 0.82, metal: 0.3 }));
  roof.position.set(x, lanternY + lanternH / 2 + 1.0, z);
  roof.castShadow = true;
  g.add(roof);
  put(g, box(0.18, 1.4, 0.18), steelMat(), V(x, lanternY + lanternH / 2 + 2.5, z));

  /* 回廊灯：一圈发光体合批，点它也算报一更 */
  const corGeos = [];
  for (let i = 0; i < 10; i++) {
    const b = box(0.5, 0.44, 0.5);
    b.translate(galleryR - 0.55, 0, 0);
    b.rotateY(-(i / 10) * Math.PI * 2);
    b.translate(x, topY + 1.2, z);
    corGeos.push(b);
  }
  const corridor = new THREE.Mesh(mergeGeometries(corGeos), strip(glow(PAL_HARBOR[2], 1.1), 0.85));
  corridor.userData.kind = 'galleryLamp';
  g.add(corridor);

  /* 潮信组：pivot 挂在 chime 之下——kaiyu 推 chime 即带动透镜，只推 pivot 也照样转 */
  const chime = new THREE.Group();
  chime.name = 'chime';
  chime.position.set(x, lanternY, z);
  g.add(chime);
  const pivot = new THREE.Group();
  chime.add(pivot);
  const lensMat = strip(glow(PAL.navWhite, 2.2), 1);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, 1.6, 12), lensMat);
  core.userData.kind = 'chimeCore';
  pivot.add(core);
  const optics = [];
  for (let i = 0; i < 2; i++) {
    const l = new THREE.Mesh(box(2.6, 1.25, 0.75), lensMat);
    l.position.set(Math.cos(i * Math.PI) * 1.5, 0, Math.sin(i * Math.PI) * 1.5);
    l.rotation.y = -i * Math.PI;
    optics.push(l);
    pivot.add(l);
  }

  /* 塔门：朝口门（航道出口）方向，门框一道暖光，portals 直接取 LAYOUT.tower.door */
  const ch = CHANNEL[3];
  const dir = V(ch[0] - x, 0, ch[1] - z).normalize();
  const doorX = x + dir.x * 3.1;
  const doorZ = z + dir.z * 3.1;
  const doorY = base + plinthH + 1.55;
  const yawDoor = -Math.atan2(dir.z, dir.x);
  put(g, box(1.7, 3.2, 0.5), inkMat(), V(x + dir.x * 3.35, base + plinthH + 1.5, z + dir.z * 3.35), yawDoor);
  const doorGlow = put(g, box(1.4, 2.7, 0.18), strip(glow(PAL_HARBOR[3], 0.95), 0.9), V(doorX, doorY, doorZ), yawDoor);
  doorGlow.userData.kind = 'towerDoor';

  /* 值班房与油机房：灯塔脚下两间附属房，塔才不像一根孤柱 */
  const ax = x - dir.x * 9 + dir.z * 4;
  const az = z - dir.z * 9 - dir.x * 4;
  const ay = Math.max(GY(ax, az), BREAKWATER.crown - 2);
  put(g, box(10.4, 4.2, 7.6), rockMat(), V(ax, ay + 1.0, az), yawDoor);
  const annex = concreteBlock(9, 3.4, 6.4);
  annex.position.set(ax, ay + 3.6, az);
  annex.rotation.y = yawDoor;
  annex.castShadow = true;
  g.add(annex);
  put(g, box(1.3, 1.1, 0.14), strip(glow(PAL_HARBOR[1], 0.8), 0.8), V(ax + dir.x * 3.3, ay + 3.8, az + dir.z * 3.3), yawDoor);

  /* 塔身外侧的检修爬梯：一条 instanced 横档，登塔这件事要有凭据 */
  const rungs = [];
  for (let i = 0; i < 26; i++) {
    const yy = base + plinthH + 1.2 + i * 0.72;
    if (yy > topY - 0.4) break;
    const r1 = THREE.MathUtils.lerp(4.3, 2.9, (yy - (base + plinthH)) / shaftH) + 0.28;
    rungs.push({ p: [x - dir.x * r1, yy, z - dir.z * r1], r: [0, yawDoor, 0], s: [0.9, 0.08, 0.08] });
  }
  g.add(instanced(box(1, 1, 1), steelMat(), rungs));

  const footY = Math.max(GY(x, z), BREAKWATER.crown);
  LAYOUT.tower.pos = V(x, footY, z);
  LAYOUT.tower.top = lanternY + lanternH / 2 + 2.0;
  LAYOUT.tower.door = V(doorX, doorY, doorZ);
  LAYOUT.tower.gallery = V(x, topY + 1.75, z);
  LAYOUT.chime.pos = V(x, footY + 0.6, z);
  LAYOUT.chime.pivot = pivot;
  LAYOUT.chime.lamps = [core, ...optics, corridor, doorGlow];
  return { group: g, chime, pivot, foot: V(x, footY, z) };
}

/* ---------------------------------------------------------------- 8. 海滨栈道 */

/** 道面高程 = 岩脚 + 架高 1.7 + 板厚 0.32；机位取样的曲线就是这个 y */
function boardwalkY(x, z) {
  return GY(x, z) + 1.7 + 0.32;
}

function buildBoardwalk(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const hw = BOARDWALK_W / 2;
  const step = 1.6;
  const st = stationsOf(curve2D(BOARDWALK, 0), step, 400).map((p) => V(p.x, boardwalkY(p.x, p.z), p.z));
  const fr = frame(st);
  const prof = [];
  for (let i = 0; i < fr.n; i++) prof.push([[-hw, 0.32], [-hw + 0.14, 0], [hw - 0.14, 0], [hw, 0.32]]);
  const deck = put(g, loft(fr, prof, step), plankMat(), V(0, 0, 0));
  deck.receiveShadow = true;

  /* 横向踏步：一条 InstancedMesh 把道面读成一格一格 */
  const planks = [];
  for (let i = 0; i < fr.n; i++) {
    const p = fr.at(i, 0, 0.34);
    planks.push({ p: [p.x, p.y, p.z], r: [0, fr.yaw(i), 0], s: [BOARDWALK_W, 0.1, 0.52] });
  }
  g.add(instanced(box(1, 1, 1), plankMat(), planks));

  /* 纵梁：每三段取一道，两条合批 */
  const beams = [];
  for (let i = 0; i < fr.n - 1; i += 3) {
    const j = Math.min(fr.n - 1, i + 3);
    for (const u of [-hw + 0.5, hw - 0.5]) {
      beams.push(segBox(fr.at(i, u, 0.04), fr.at(j, u, 0.04), 0.34, 0.3));
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(beams), plankMat()));

  /* 立柱架在岩脚上：zoneAt 判是礁是滩，滩地那段的柱脚再插深一点 */
  const posts = [];
  for (let i = 1; i < fr.n - 1; i += 3) {
    const p = fr.at(i, 0, 0);
    const zone = zoneAt(p.x, p.z);
    const drop = clamp(p.y - GY(p.x, p.z) + (zone === 'sand' ? 0.7 : 0.2), 0.6, 6.5);
    for (const u of [-hw + 0.35, hw - 0.35]) {
      const c = fr.at(i, u, 0);
      posts.push({ p: [c.x, c.y - drop / 2, c.z], r: [0, fr.yaw(i), 0], s: [0.26, drop, 0.26] });
    }
    posts.push({ p: [p.x, p.y - drop / 2, p.z], r: [0, fr.yaw(i), 0], s: [0.3, drop, 0.3] });
  }
  g.add(instanced(box(1, 1, 1), steelMat(), posts));

  /* 栏：每 5 个桩位取一段，分段 railingGeo 合批成两条，转角处不留缝 */
  const railGeos = [];
  for (let i = 0; i < fr.n - 1; i += 5) {
    const j = Math.min(fr.n - 1, i + 5);
    for (const side of [-1, 1]) {
      const a = fr.at(i, side * (hw - 0.12), 0.32);
      const b = fr.at(j, side * (hw - 0.12), 0.32);
      const rg = railingGeo(a.distanceTo(b), { height: 1.12, spacing: 1.5, rail: true });
      rg.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
      rg.translate(a.x, a.y, a.z);
      railGeos.push(rg);
    }
  }
  const rails = new THREE.Mesh(mergeGeometries(railGeos), lit(PAL.moonWhite, { map: T.plank(), rough: 0.86 }));
  rails.castShadow = true;
  g.add(rails);

  /* 栏侧小灯：既是栈道灯的灯头，也是 props 灯串的挂点 */
  const hang = [];
  for (let i = 0; i < fr.n; i += 4) {
    for (const side of [-1, 1]) hang.push(fr.at(i, side * (hw - 0.12), 1.26));
  }
  g.add(instanced(box(0.34, 0.34, 0.34), strip(glow(STRIP_COLORS[1], 1.2), 0.9),
    hang.map((h) => ({ p: [h.x, h.y, h.z], r: [0, 0, 0], s: 1 }))));

  /* 两处观景小平台：折线中段与东端各一块，栈道才不是一条等宽窄带 */
  for (const t of [0.34, 0.8]) {
    const i = clamp(Math.round(t * (fr.n - 1)), 2, fr.n - 3);
    const c = fr.at(i, 3.8, 0.34);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.22, 12, 1), plankMat());
    pad.position.set(c.x, c.y, c.z);
    pad.receiveShadow = true;
    g.add(pad);
    ringRail(g, c.x, c.y + 0.11, c.z, 4.2, 10, { height: 1.05, spacing: 0.5, rail: true });
  }

  LAYOUT.walk.curve = new THREE.CatmullRomCurve3(
    BOARDWALK.map((p) => V(p[0], boardwalkY(p[0], p[1]), p[1])), false, 'catmullrom', 0.5,
  );
  g.userData.hang = hang;
  return { group: g, hang };
}

/* ---------------------------------------------------------------- 9. 崖顶灯串支架 */

/** 只架缆与挂点：会亮的那一圈归 props.strings，它要按潮信的波前点亮 */
function buildStringRig(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const wires = [];
  const hooks = [];
  for (const ln of LANTERN_LINES) {
    const pts = linePoints(ln.from, ln.to, ln.sag, 28);
    const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const n = Math.max(10, Math.round(c.getLength() / 2.4));
    for (let i = 0; i < n; i++) {
      const a = c.getPoint(i / n);
      const b = c.getPoint((i + 1) / n);
      wires.push(segBox(a, b, 0.08, 0.08, true));
      hooks.push({ p: [b.x, b.y - 0.18, b.z], r: [0, 0, 0], s: 1 });
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(wires), lit(PAL.rope, { rough: 0.92, metal: 0.05 })));
  g.add(instanced(box(0.16, 0.24, 0.16), steelMat(), hooks));
  return g;
}

/* ---------------------------------------------------------------- 10. 观日亭 */

function buildPavilion(parent) {
  const g = new THREE.Group();
  parent.add(g);
  g.position.set(PAVILION.x, GY(PAVILION.x, PAVILION.z), PAVILION.z);
  /* facing 按平面角（+X 起、向 +Z 为正）取；亭子按开口朝 +X 建模，
     绕 +Y 转 -facing 即把 +X 带到那个方向——开口朝东南外海，正是候日出的那一面 */
  g.rotation.y = -RAD(PAVILION.facing);
  LAYOUT.pavilion.pos = V(PAVILION.x, PAVILION.y, PAVILION.z);

  const stone = rockMat();
  const timber = plankMat();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.7, 0.6, 8, 1), stone);
  base.position.y = 0.3;
  base.receiveShadow = true;
  g.add(base);
  put(g, box(4.4, 0.26, 2.0), stone, V(5.2, 0.13, 0));
  put(g, box(4.4, 0.26, 1.2), stone, V(6.1, -0.14, 0));

  const posts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    // 正对 facing 的那一格留空读作入口，别把亭子围死
    if (a < 0.4 || a > Math.PI * 2 - 0.4) continue;
    posts.push({ p: [Math.cos(a) * 4.2, 2.9, Math.sin(a) * 4.2], r: [0, -a, 0], s: [0.42, 4.6, 0.42] });
  }
  g.add(instanced(box(1, 1, 1), timber, posts));

  const beam = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const b = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
    beam.push(segBox(
      V(Math.cos(a) * 4.2, 5.0, Math.sin(a) * 4.2),
      V(Math.cos(b) * 4.2, 5.0, Math.sin(b) * 4.2),
      0.3, 0.34,
    ));
  }
  g.add(new THREE.Mesh(mergeGeometries(beam), timber));

  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.7, 8),
    lit(PAL.ink, { map: T.canopy(), rough: 0.9, emissive: '#050708', ei: 0.15 }));
  roof.position.y = 6.65;
  roof.castShadow = true;
  g.add(roof);
  put(g, box(0.5, 1.0, 0.5), steelMat(), V(0, 8.25, 0));

  const lamp = new THREE.Mesh(box(0.72, 0.92, 0.72), strip(glow(PAL_HARBOR[2], 1.3), 1));
  lamp.position.set(0.8, 3.95, 0);
  g.add(lamp);
  registerOccluder(base);
  return g;
}

/* ---------------------------------------------------------------- 11. 刻石保护亭 */

function buildStele(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const ground = GY(STELE.x, STELE.z);
  g.position.set(STELE.x, ground, STELE.z);
  g.rotation.y = STELE.rot;
  const stone = concreteMat();
  const iron = lit(PAL.rust, { map: T.rust(), rough: 0.72, metal: 0.55 });

  /* 朝观众的岩壁：字口靠 T.steleFace；贴图暂缺时先退成普通岩面 */
  const faceTex = T.steleFace ? T.steleFace() : T.rock();
  // TODO: textures.js 落地 steleFace 后这里自动回到真字口，本文件不必再改
  const wall = put(g, box(6.6, 4.6, 1.1), lit(PAL.rock, { map: faceTex, rough: 0.94 }), V(0, 2.3, -1.7));
  wall.castShadow = true;
  registerOccluder(wall);

  /* 低矮保护罩：两堵侧墙加顶板，罩前开口留出可看的缝 */
  put(g, box(0.7, 2.5, 3.8), stone, V(-3.3, 1.25, 0));
  put(g, box(0.7, 2.5, 3.8), stone, V(3.3, 1.25, 0));
  const lid = put(g, box(7.4, 0.42, 4.6), stone, V(0, 2.7, 0));
  lid.castShadow = true;
  put(g, box(6.8, 0.26, 4.0), reefMat(), V(0, 0.13, 0));

  /* 铁栅：11 根竖条加两道横撑，一条 InstancedMesh */
  const bars = [];
  for (let i = 0; i < 11; i++) bars.push({ p: [-2.75 + i * 0.55, 1.35, 1.7], r: [0, 0, 0], s: [0.12, 2.5, 0.12] });
  for (const yy of [0.55, 2.3]) bars.push({ p: [0, yy, 1.7], r: [0, 0, 0], s: [5.9, 0.12, 0.12] });
  g.add(instanced(box(1, 1, 1), iron, bars));

  /* 一盏斜打岩面的洗墙灯：字口要有斜射的阴影才读得出 */
  const wash = new THREE.Mesh(box(0.55, 0.32, 0.32), strip(glow(PAL.navWhite, 0.75), 0.7));
  wash.position.set(2.5, 3.35, 0.7);
  wash.rotation.x = -0.7;
  g.add(wash);

  /* 文保牌：只写公开的保護口径，不写任何店名 */
  put(g, box(3.4, 0.72, 0.16), lit(PAL.ink, {
    map: T.sign('全国重点文物保护单位', { bg: '#2b2b2b', fg: '#e8e2d2' }), rough: 0.85,
  }), V(0, 1.05, 2.15));

  /* 参观步道：亭前一段板道接到崖顶 */
  const pad = [];
  for (let i = 0; i < 5; i++) pad.push(box(3.2, 0.14, 0.9).translate(0, 0.1, 3.5 + i * 1.0));
  g.add(new THREE.Mesh(mergeGeometries(pad), plankMat()));

  LAYOUT.stele.pos = V(STELE.x, ground + 1.4, STELE.z);
  /* 门口在栅门外侧：局部 (0,?,3.2) 绕 +Y 转 STELE.rot 后落回世界 */
  LAYOUT.stele.door = V(STELE.x + 3.2 * Math.sin(STELE.rot), ground + 1.35, STELE.z + 3.2 * Math.cos(STELE.rot));
  return g;
}

/* ---------------------------------------------------------------- 12. 烟墩与羊窝头 */

function buildBeacon(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const ground = GY(BEACON.x, BEACON.z);
  const stone = rockMat();
  const tiers = [
    { w: 11.6, d: 11.6, h: 2.3, y: 1.15 },
    { w: 9.6, d: 9.6, h: 2.1, y: 3.35 },
    { w: 7.8, d: 7.8, h: 1.8, y: 5.3 },
  ];
  for (const t of tiers) {
    const m = put(g, box(t.w, t.h, t.d), stone, V(BEACON.x, ground + t.y, BEACON.z), rr(-0.04, 0.04));
    m.castShadow = true;
    m.receiveShadow = true;
    registerOccluder(m);
  }
  put(g, box(8.8, 0.36, 8.8), concreteMat(), V(BEACON.x, ground + 6.35, BEACON.z));

  /* 台面薪垛：一堆短木，见警举火的那个台 */
  const logs = [];
  for (let i = 0; i < 28; i++) {
    const a = rand() * Math.PI * 2;
    const r = rr(0.3, 2.5);
    logs.push({
      p: [BEACON.x + Math.cos(a) * r, ground + 6.8 + rr(0, 0.9), BEACON.z + Math.sin(a) * r],
      r: [rr(-0.5, 0.5), rr(-3.14, 3.14), rr(-0.4, 0.4)],
      s: [0.34, rr(1.6, 2.9), 0.34],
    });
  }
  g.add(instanced(box(1, 1, 1), plankMat(), logs));
  const ember = new THREE.Mesh(box(2.3, 0.24, 2.3), strip(glow('#5a2a14', 0.45), 0.35));
  ember.position.set(BEACON.x, ground + 6.6, BEACON.z);
  g.add(ember);

  /* 墩脚一圈护坡石，方墩才不像插在平地上 */
  const skirt = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = rr(6.4, 8.8);
    const x = BEACON.x + Math.cos(a) * r;
    const z = BEACON.z + Math.sin(a) * r;
    skirt.push({ p: [x, GY(x, z) + 0.4, z], r: [rr(-0.4, 0.4), rr(-3.14, 3.14), rr(-0.4, 0.4)], s: rr(0.9, 2.2) });
  }
  g.add(instanced(rockGeo(1.8, 2), reefMat(), skirt));
  return g;
}

/** 羊窝头：岛最东端一整片礁盘，加一小块系缆／观日平台 */
function buildSheephead(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const rocks = [];
  for (let i = 0; i < 82; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * SHEEP.r;
    const x = SHEEP.x + Math.cos(a) * r;
    const z = SHEEP.z + Math.sin(a) * r * 0.78;
    const sc = rr(1.4, 4.4);
    rocks.push({ p: [x, GY(x, z) + sc * 0.22, z], r: [rr(-0.35, 0.35), rr(-3.14, 3.14), rr(-0.35, 0.35)], s: sc });
  }
  const rm = instanced(rockGeo(2.6, 2), reefMat(), rocks);
  rm.receiveShadow = true;
  g.add(rm);
  registerOccluder(rm);

  const y = SHEEP.top;
  const planks = [];
  for (let i = 0; i < 9; i++) planks.push(box(7.4, 0.16, 0.82).translate(0, 0, -3.3 + i * 0.82));
  const deck = new THREE.Mesh(mergeGeometries(planks), plankMat());
  deck.position.set(SHEEP.x - 7, y, SHEEP.z + 5);
  deck.receiveShadow = true;
  g.add(deck);

  const posts = [];
  for (let i = 0; i < 5; i++) {
    posts.push({ p: [SHEEP.x - 10.4 + i * 1.8, y - 1.5, SHEEP.z + 8.6], r: [0, 0, 0], s: [0.28, 2.8, 0.28] });
    posts.push({ p: [SHEEP.x - 3.6 + i * 1.8, y - 1.5, SHEEP.z + 0.8], r: [0, 0, 0], s: [0.28, 2.8, 0.28] });
  }
  g.add(instanced(box(1, 1, 1), steelMat(), posts));

  /* 三根系缆桩：退潮时小划子就拴在这块礁台上 */
  const moor = [];
  for (let i = 0; i < 3; i++) {
    moor.push({ p: [SHEEP.x - 9 + i * 3.2, y + 0.6, SHEEP.z + 9.0], r: [0, rr(-0.2, 0.2), 0], s: [0.5, 1.15, 0.5] });
  }
  g.add(instanced(box(1, 1, 1), steelMat(), moor));

  const lm = new THREE.Mesh(box(0.62, 0.62, 0.62), strip(glow(PAL_HARBOR[3], 1.1), 0.9));
  lm.position.set(SHEEP.x - 10.2, y + 1.7, SHEEP.z + 5);
  g.add(lm);
  return g;
}

/* ---------------------------------------------------------------- 13. 浴场腹地 */

/** 只在滩地上立桩铺场：低于 0.3 是水，高于 8.4 是后缘台地，z 还须在平均潮位岸线以北 */
function onBeach(x, z) {
  const y = GY(x, z);
  return y > 0.3 && y < 8.4 && z < shoreAt(x);
}

function buildField(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const wood = plankMat();
  const canopyMat = M.canopy || lit(PAL.lanternWarm, { map: T.canopy(), rough: 0.85 });

  /* 更衣亭：只有三座，逐个建比合批更省事 */
  for (const [x, z] of HUTS) {
    const y = GY(x, z);
    const a = rr(-0.28, 0.28);
    const body = put(g, box(4.2, 2.6, 3.4), wood, V(x, y + 1.3, z), a);
    body.castShadow = true;
    registerOccluder(body);
    put(g, box(4.9, 0.28, 4.1), canopyMat, V(x, y + 2.85, z), a);
    // 门缝里漏出一点光，亭子就不是一个黑盒子
    put(g, box(1.2, 2.0, 0.14), strip(glow(PAL_HARBOR[1], 0.7), 0.8),
      V(x + Math.cos(a) * 1.78, y + 1.1, z + Math.sin(a) * 1.78), -a);
  }

  /* 救生瞭望塔：四腿架高、小平台、一圈栏、朝滩的牌与灯 */
  const [lx, lz] = LOOKOUT;
  const ly = GY(lx, lz);
  const legs = [];
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    legs.push({ p: [lx + dx, ly + 3.2, lz + dz], r: [0, 0, dz > 0 ? 0.06 : -0.06], s: [0.3, 6.4, 0.3] });
  }
  g.add(instanced(box(1, 1, 1), wood, legs));
  const deck = put(g, box(4.8, 0.26, 4.8), wood, V(lx, ly + 6.5, lz));
  deck.receiveShadow = true;
  const towerRail = [];
  const oneRail = railingGeo(4.8, { height: 1.0, spacing: 0.9, rail: true });
  for (let k = 0; k < 4; k++) {
    const rg = oneRail.clone();
    rg.rotateY(-(k * Math.PI) / 2);
    rg.translate(Math.cos((k * Math.PI) / 2) * 2.3, 0, Math.sin((k * Math.PI) / 2) * 2.3);
    rg.translate(lx, ly + 6.63, lz);
    towerRail.push(rg);
  }
  g.add(new THREE.Mesh(mergeGeometries(towerRail), wood));
  /* 斜上的小梯：一条 instanced 踏步，从滩地直上平台 */
  const stair = [];
  for (let i = 0; i < 14; i++) {
    stair.push({ p: [lx + 2.4, ly + 0.5 + i * 0.45, lz + 2.4 - i * 0.16], r: [0, 0, 0], s: [1.3, 0.1, 0.34] });
  }
  g.add(instanced(box(1, 1, 1), wood, stair));
  put(g, box(3.2, 1.5, 0.14), lit(PAL.ink, { map: T.sign('救生瞭望', { bg: '#1b2a33', fg: '#ffd084' }), rough: 0.85 }),
    V(lx, ly + 7.6, lz - 2.4));
  const search = new THREE.Mesh(box(0.92, 0.72, 0.72), strip(glow(PAL.navWhite, 1.2), 1));
  search.position.set(lx, ly + 7.05, lz + 2.3);
  g.add(search);

  /* 广播杆：走 kit 的 mastGeo，夜里只读成剪影 */
  for (const [px, pz] of [[FIELD.x0 + 42, FIELD.z1 - 6], [FIELD.x1 - 42, FIELD.z0 + 14]]) {
    const m = mastGeo(7.2, 0.16);
    m.position.set(px, GY(px, pz) + 3.6, pz);
    g.add(m);
    put(g, box(0.95, 0.5, 0.58), steelMat(), V(px, GY(px, pz) + 7.1, pz));
  }

  /* 滩地边界矮桩：桩距与伞阵同距，明早排伞正好踩在格上 */
  const gap = UMBRELLAS.gap;
  const stakes = [];
  for (const z of [FIELD.z0, FIELD.z1]) {
    for (let x = FIELD.x0; x <= FIELD.x1; x += gap) {
      if (!onBeach(x, z)) continue;
      stakes.push({ p: [x, GY(x, z) + 0.42, z], r: [0, rr(-0.6, 0.6), rr(-0.07, 0.07)], s: [0.18, 0.9, 0.18] });
    }
  }
  for (const x of [FIELD.x0, FIELD.x1]) {
    for (let z = FIELD.z0; z <= FIELD.z1; z += gap) {
      if (!onBeach(x, z)) continue;
      stakes.push({ p: [x, GY(x, z) + 0.42, z], r: [0, rr(-0.6, 0.6), 0], s: [0.18, 0.9, 0.18] });
    }
  }
  if (stakes.length) g.add(instanced(box(1, 1, 1), lit(PAL.rope, { map: T.plank(), rough: 0.92 }), stakes));

  /* 救生圈架：滩头每隔一段一根横杆 */
  const rack = [];
  for (let x = FIELD.x0 + 30; x < FIELD.x1 - 10; x += 70) {
    const z = FIELD.z1 - 4;
    if (!onBeach(x, z)) continue;
    const y = GY(x, z);
    rack.push({ p: [x, y + 1.1, z], r: [0, 0, 0], s: [0.16, 2.2, 0.16] });
    rack.push({ p: [x, y + 2.1, z], r: [0, 0, 0], s: [1.1, 0.16, 0.16] });
  }
  if (rack.length) g.add(instanced(box(1, 1, 1), steelMat(), rack));

  /* 集散小场：码头与腹地之间铺几块混凝土砖，把硬景与沙地隔开 */
  const paving = [];
  for (let i = 0; i < 5; i++) {
    for (const z of [FIELD.z0 + 4, FIELD.z0 + 11]) {
      const x = FIELD.x0 + 40 + i * 64;
      if (!onBeach(x, z)) continue;
      paving.push({ p: [x, GY(x, z) + 0.06, z], r: [0, rr(-0.2, 0.2), 0], s: [26, 0.12, 9] });
    }
  }
  if (paving.length) g.add(instanced(box(1, 1, 1), concreteMat(), paving));
  return g;
}

/* ---------------------------------------------------------------- 14. 无名灯窗楼群 */

function buildVillage(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const blocks = [];
  const wins = [];
  const cornices = [];
  const wallMat = lit(PAL.moonWhite, { map: T.concrete(), rough: 0.86, emissive: '#0b1018', ei: 0.14 });
  const faces = [{ ax: 'x', s: 1 }, { ax: 'x', s: -1 }, { ax: 'z', s: 1 }, { ax: 'z', s: -1 }];
  for (const v of VILLAGE) {
    const y = GY(v.x, v.z);
    blocks.push({ p: [v.x, y + v.h / 2, v.z], r: [0, rr(-0.12, 0.12), 0], s: [v.w, v.h, v.d] });
    // 檐口一条发光细梁：夜里楼群的形只靠檐口与窗读出来
    const cg = mergeGeometries([
      box(v.w + 0.3, 0.24, 0.24).translate(0, v.h / 2, v.d / 2),
      box(v.w + 0.3, 0.24, 0.24).translate(0, v.h / 2, -v.d / 2),
      box(0.24, 0.24, v.d + 0.3).translate(v.w / 2, v.h / 2, 0),
      box(0.24, 0.24, v.d + 0.3).translate(-v.w / 2, v.h / 2, 0),
    ]);
    cornices.push(cg.translate(v.x, y + v.h / 2, v.z));
    const rows = Math.max(2, Math.round(v.h / 3.4));
    for (const f of faces) {
      const span = f.ax === 'x' ? v.w : v.d;
      const cols = Math.max(2, Math.round(span / 2.8));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          // 窗只给亮度不给字：任何店名都不写，点亮比例按 layout 的 win
          if (rand() > v.win) continue;
          const u = -span / 2 + (i + 0.5) * (span / cols);
          const yy = y + (j + 0.7) * (v.h / rows);
          wins.push({
            p: f.ax === 'x' ? [v.x + u, yy, v.z + f.s * (v.d / 2 + 0.09)]
              : [v.x + f.s * (v.w / 2 + 0.09), yy, v.z + u],
            r: [0, f.ax === 'z' ? Math.PI / 2 : 0, 0],
            s: 1,
          });
        }
      }
    }
  }
  const bm = instanced(box(1, 1, 1), wallMat, blocks);
  bm.castShadow = true;
  bm.receiveShadow = true;
  g.add(bm);
  registerOccluder(bm);
  g.add(instanced(box(1.5, 1.6, 0.08), strip(glow(PAL_HARBOR[3], 0.66), 0.7), wins));
  g.add(new THREE.Mesh(mergeGeometries(cornices), strip(glow(STRIP_COLORS[0], 0.8), 0.8)));
  return g;
}

/* ---------------------------------------------------------------- 装配 */

export function buildQuarter(scene, env) {
  const group = new THREE.Group();
  group.name = 'quarter';
  scene.add(group);
  // env 只读；硬景不碰环境的灯句柄（main.js 每帧改写 lights[1]），留形参只为对齐装配签名
  void env;

  const dykePart = buildDyke(group);
  const dyke = dykePart.group;
  buildMainland(group);
  buildHarborMasts(group);

  /* 港内灯单列一组：?hide=harbour 时整组可关，方便逐机位核对过曝 */
  const harborLights = new THREE.Group();
  harborLights.name = 'harborLights';
  group.add(harborLights);

  const quayPart = buildQuay(group);
  const bwPart = buildBreakwater(group);
  const buoyPart = buildBuoys(harborLights);
  const towerPart = buildLighthouse(group);
  buildBoardwalk(group);
  buildStringRig(group);
  buildPavilion(group);
  buildStele(group);
  buildBeacon(group);
  buildSheephead(group);
  buildField(group);
  buildVillage(group);

  const anchors = {
    quay: V(QUAY.pts[2][0], QUAY.top + 1.6, QUAY.pts[2][1]),
    tower: LAYOUT.tower.pos.clone(),
    lamp: dykePart.lamps.length ? dykePart.lamps[0].clone() : V(DYKE.pts[0][0], DYKE.crown + 6, DYKE.pts[0][1]),
    pier: bwPart.tip.clone(),
  };

  applyStrip(1);

  return {
    group,
    dyke,
    harborLights,
    // main.js 的 ?hide= 调试层用英式拼写 harbour，两个键指同一个组
    harbourLights: harborLights,
    anchors,
    chime: towerPart.chime,
    setStrip: (v) => applyStrip(v),
    // 附加字段：灯桩各自的闪周期不从 LAYOUT 读（契约里那八个键形状不动），
    // 交给 kaiyu/热点按 userData.flash 驱动；quay 的构件句柄也一并留个出口
    navLamps: { buoys: buoyPart.lamps, tip: bwPart.tip, dyke: dykePart.lampCurve },
    quay: quayPart,
  };
}
