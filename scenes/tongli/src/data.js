/**
 * 同里古镇 · 川字河灯 —— 底图、机位与解说。
 * 坐标单位为米：-Z 为北，+X 为东，y=0 是镇河与湖的水面，岸顶 y=2.2。
 *
 * 底图的画法是先摆河、再由河之间的余量长出地块：
 * 三条东西河加几条南北河把陆地切开，块与块之间的缝天然就是可通的河道，
 * 桥只跨缝、船只走缝。于是"水多"是几何上的事实，不是画在地图上的纹理。
 *
 * 考据口径（写进帮助面板）：
 *   可核 —— 退思园的光绪十一年至十三年（1885—1887）、园主任兰生、设计者袁龙、
 *            园名取《左传·宣公十二年》"退思补过"、9.9 亩、东西长 112 米南北宽 83 米、
 *            2000 年 11 月 30 日随苏州古典园林列入世界文化遗产；
 *            三桥太平·吉利·长庆与"一走太平、二走吉利、三走长庆"的次序；
 *            吉利桥为石梁平桥、余二桥为拱桥；罗星洲明嘉靖四十二年（1563）筑圩、
 *            清道光三年（1823）因淘河堆土而成、四面环水须渡；
 *            耕乐堂明天顺六年（1457）、嘉荫堂清光绪乙亥（1875）、崇本堂清光绪元年（1875）；
 *            陈去病故居"百尺梧桐"曲尺形楼房、王锡阐（1628—1689）同里人。
 *   须避 —— 唐至德/乾符建镇、后山先水、"先有同里后有陈泊"、宋代始建、
 *            "明洪武间定名同里"（只见转述本）、退思园 1981 补植/1982 开放/
 *            1989 列省保/2001-07-11 列第 14 批国保（后两条实为他园）、
 *            "垂虹桥为邻"的三桥方位、珍珠塔（乾隆四年始建且园址已毁）。
 *   分歧 —— 桥数 42 与 49 都是晚近统计口径、旧志仅记嘉庆间九桥；罗星洲面积今 4500 平米、
 *            原 17000 平米两数并存；世界文化遗产日期另有 2001 年 7 月一说。
 *
 * 镇内的河道宽度、地块轮廓、桥的形制与位置、街巷走向都是按江南水乡通例摆的写意，
 * 不是测绘的镇图。
 */

import { rand, rr } from './kit.js';

/* ------------------------------------------------------------------ 基准 */

/** 岸顶（居民路面）：河面之上 2.2 米 */
export const BANK = 2.2;
/** 驳岸压在水下的深度 */
export const QUAY_DRAFT = 2.6;
/** 圩岸顶：湖边只比水面高一点 */
export const DEP = 1.15;
/** 镇外地坪 */
export const PLAIN_Y = 1.0;
/** 眼高：站在岸顶的人 */
export const EYE = 1.62;

/* ------------------------------------------------------------------ 河道 */

const RIVERS_EW = [
  { id: 'north', zh: '北河', z: -250, x0: -372, x1: 388, width: 16 },
  { id: 'mid', zh: '中河', z: 20, x0: -372, x1: 390, width: 18 },
  { id: 'south', zh: '南河', z: 275, x0: -370, x1: 386, width: 15 },
];
const RIVERS_NS = [
  { id: 'west', zh: '西界河', x: -360, z0: -420, z1: 420, width: 12 },
  { id: 'east', zh: '东长港', x: 372, z0: -420, z1: 460, width: 12 },
];
/** 弄河：只通小船，上面盖的是石梁 */
const LANES = [
  { id: 'lane1', zh: '西弄河', axis: 'ns', x: -140, z0: -250, z1: 20, width: 10 },
  { id: 'lane2', zh: '南弄河', axis: 'ns', x: 200, z0: 20, z1: 267, width: 10 },
  { id: 'lane3', zh: '北弄河', axis: 'ew', z: -150, x0: -470, x1: 470, width: 10 },
  { id: 'lane4', zh: '东弄河', axis: 'ew', z: 150, x0: 205, x1: 480, width: 9 },
];

export const CANALS = [];
for (const r of RIVERS_EW) {
  CANALS.push({ id: r.id, zh: r.zh, main: true, width: r.width, path: [[r.x0, r.z], [r.x1, r.z]] });
}
for (const r of RIVERS_NS) {
  CANALS.push({ id: r.id, zh: r.zh, main: true, width: r.width, path: [[r.x, r.z0], [r.x, r.z1]] });
}
for (const l of LANES) {
  CANALS.push({
    id: l.id, zh: l.zh, lane: true, width: l.width,
    path: l.axis === 'ew' ? [[l.x0, l.z], [l.x1, l.z]] : [[l.x, l.z0], [l.x, l.z1]],
  });
}
export const CANAL = {};
for (const c of CANALS) CANAL[c.id] = c;

/** 镇心：水面 shader 的暖光方向与船队都从这里取 */
export const TOWN = { center: { x: 10, z: 20 }, bankY: BANK, canals: CANALS };

/* ------------------------------------------------------------------ 地块 */

/**
 * 一块地 = 四个界桩之间的多边形。角上收圆、边上按确定性随机抖一点，
 * 于是镇子不是棋盘，但每一轮刷新都是同一个镇子。
 * 顶点按行走顺序排：弧 → 边 → 弧 → 边……乱序会把自己交成蝴蝶结。
 */
function blockPoly(x0, x1, z0, z1, { corner = 12, jitter = 1.6, seg = 3 } = {}) {
  const cs = Math.min(corner, (x1 - x0) / 2, (z1 - z0) / 2);
  const arcs = [
    [x0 + cs, z0 + cs, -Math.PI, -Math.PI / 2],
    [x1 - cs, z0 + cs, -Math.PI / 2, 0],
    [x1 - cs, z1 - cs, 0, Math.PI / 2],
    [x0 + cs, z1 - cs, Math.PI / 2, Math.PI],
  ];
  const edges = [
    [[x0 + cs, z0], [x1 - cs, z0]], [[x1, z0 + cs], [x1, z1 - cs]],
    [[x1 - cs, z1], [x0 + cs, z1]], [[x0, z1 - cs], [x0, z0 + cs]],
  ];
  const out = [];
  for (let k = 0; k < 4; k++) {
    const [cx, cz, a0, a1] = arcs[k];
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (a1 - a0) * (i / 4);
      out.push([cx + cs * Math.cos(a), cz + cs * Math.sin(a)]);
    }
    const [[ax, az], [bx, bz]] = edges[k];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (bz - az) / L, nz = -(bx - ax) / L;
    for (let i = 1; i <= seg; i++) {
      const t = i / (seg + 1);
      const o = (rand() - 0.5) * 2 * jitter;
      out.push([ax + (bx - ax) * t + nx * o, az + (bz - az) * t + nz * o]);
    }
  }
  const dedup = [];
  for (const q of out) {
    const a = dedup[dedup.length - 1];
    if (a && Math.abs(a[0] - q[0]) < 0.08 && Math.abs(a[1] - q[1]) < 0.08) continue;
    dedup.push(q);
  }
  return dedup;
}

/**
 * 九块地。今常说"十条河分七块"，那是晚近的统计口径；
 * 这里按水多桥密的体势摆，不在解说里标块数。
 */
export const ISLANDS = [
  { id: 'n1', name: '镇北', poly: blockPoly(-350, 362, -352, -258, { corner: 14 }) },
  { id: 'n2', name: '镇中北 · 西', poly: blockPoly(-350, -148, -242, -155, { corner: 10 }) },
  { id: 'n3', name: '镇中北 · 东', poly: blockPoly(-132, 362, -242, -155, { corner: 10 }) },
  { id: 'm1', name: '镇中 · 西', poly: blockPoly(-350, -148, -145, 11, { corner: 12 }) },
  { id: 'm2', name: '镇中 · 东', poly: blockPoly(-132, 362, -145, 11, { corner: 12 }) },
  { id: 's1', name: '镇南 · 西', poly: blockPoly(-350, 195, 29, 266, { corner: 14 }) },
  { id: 's2', name: '镇南 · 东北', poly: blockPoly(205, 362, 29, 145, { corner: 10 }) },
  { id: 's3', name: '镇南 · 东南', poly: blockPoly(205, 362, 155, 266, { corner: 10 }) },
  { id: 'r1', name: '镇南圩', poly: blockPoly(-350, 362, 283, 350, { corner: 12 }) },
  { id: 'ws', name: '西圩', poly: blockPoly(-442, -370, -340, 340, { corner: 14 }) },
  { id: 'es', name: '东圩', poly: blockPoly(382, 458, -336, 336, { corner: 14 }) },
];

export const ISLAND = {};
export const ISLAND_BOX = {};
for (const isl of ISLANDS) {
  ISLAND[isl.id] = isl;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of isl.poly) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  ISLAND_BOX[isl.id] = { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

export function pointIn(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 点在不在任何一块地上（船与灯要落在水里就得先过这一关） */
export function onLand(x, z) {
  for (const isl of ISLANDS) {
    const b = ISLAND_BOX[isl.id];
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (pointIn(isl.poly, x, z)) return isl.id;
  }
  return null;
}

/** 落位避让：名园与几处大宅各占一块，民居不许压在它们身上 */
export const RESERVE = [
  { id: 'tuisi', x0: 148, x1: 266, z0: -348, z1: -262 },
  { id: 'chongben', x0: 274, x1: 330, z0: -348, z1: -300 },
  { id: 'jiayin', x0: -318, x1: -262, z0: -348, z1: -306 },
  { id: 'gengle', x0: -270, x1: -206, z0: 34, z1: 78 },
  { id: 'chen', x0: 300, x1: 356, z0: -140, z1: -96 },
];

/**
 * 门前空地：宅第门楼之前那一块不盖屋的场地。
 * 民居与树都要避让——机位也正好站在这一块的中央，镜头才不会被自家的屋檐挡住。
 */
export const FORECOURT = [
  { id: 'chongben-f', x0: 274, x1: 330, z0: -300, z1: -286 },
  { id: 'jiayin-f', x0: -318, x1: -262, z0: -306, z1: -292 },
  { id: 'gengle-f', x0: -270, x1: -206, z0: 78, z1: 94 },
  { id: 'chen-f', x0: 300, x1: 356, z0: -96, z1: -80 },
  { id: 'gate-f', x0: 266, x1: 282, z0: -318, z1: -292 },
];

export function inReserve(x, z, pad = 1.6) {
  for (const r of RESERVE.concat(FORECOURT)) {
    if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return r.id;
  }
  return null;
}

/* ------------------------------------------------------------------ 湖与圩 */

export const LAKES = {
  extent: [
    [-1160, -1400], [-560, -1500], [160, -1450], [760, -1300], [1220, -940],
    [1360, -380], [1300, 260], [1120, 760], [640, 1120], [40, 1240],
    [-660, 1140], [-1180, 780], [-1380, 200], [-1340, -520],
  ],
  bed: { x: 0, z: -60, w: 3400, d: 3400 },
  /** 五湖名目可核，方位按一说摆，属写意 */
  sectors: [
    { id: 'jiuli', name: '九里湖', x: -180, z: -980 },
    { id: 'tongli', name: '同里湖', x: 880, z: -180 },
    { id: 'nanxing', name: '南星湖', x: 760, z: 760 },
    { id: 'yeze', name: '叶泽湖', x: -980, z: 620 },
    { id: 'pangshan', name: '庞山湖', x: -1000, z: -180 },
  ],
};

/** 圩岸：把一大片水分成几片，每条留一个豁口给镇河通湖 */
export const BANKS = [
  { id: 'bankN1', name: '北圩', path: [[-900, -520], [-560, -604], [-330, -576]], width: 24, y: DEP },
  { id: 'bankN2', name: '北圩', path: [[170, -604], [520, -648], [860, -560]], width: 24, y: DEP },
  { id: 'bankS1', name: '南圩', path: [[-840, 604], [-460, 664], [-170, 634]], width: 22, y: DEP },
  { id: 'bankS2', name: '南圩', path: [[60, 628], [420, 672], [790, 566]], width: 22, y: DEP },
  { id: 'bankW', name: '西圩', path: [[-940, -420], [-1000, 20], [-920, 440]], width: 20, y: DEP },
  { id: 'bankE', name: '东圩', path: [[900, -420], [960, -60], [900, 150]], width: 20, y: DEP },
];

/* ------------------------------------------------------------------ 桥 */

/**
 * dir 是桥身轴向：0 = 桥顺着 +X（跨南北河），PI/2 = 桥顺着 +Z（跨东西河）。
 * 三桥可核到的是名目、次序与形制（吉利桥石梁平桥、余二桥拱桥）；
 * 跨径、宽度与具体位置按镇河宽度给，属写意。
 */
const D = Math.PI / 2;
export const BRIDGES = [
  { id: 'taiping', name: '太平桥', over: 'mid', at: [-40, 20], dir: D, type: 'arch', span: 23, width: 4.2, rise: 2.5 },
  { id: 'jili', name: '吉利桥', over: 'mid', at: [52, 20], dir: D, type: 'beam', span: 23, width: 3.8, rise: 0.3 },
  { id: 'changqing', name: '长庆桥', over: 'mid', at: [140, 20], dir: D, type: 'arch', span: 23, width: 4.4, rise: 2.4 },
  { id: 'b_n1', over: 'north', at: [-260, -250], dir: D, type: 'arch', span: 20, width: 3.6, rise: 2.2 },
  { id: 'b_n2', over: 'north', at: [230, -250], dir: D, type: 'arch', span: 22, width: 3.8, rise: 2.1 },
  { id: 'b_n3', over: 'north', at: [60, -250], dir: D, type: 'beam', span: 20, width: 3.2 },
  { id: 'b_s1', over: 'south', at: [-80, 275], dir: D, type: 'arch', span: 22, width: 3.4, rise: 2.0 },
  { id: 'b_s2', over: 'south', at: [300, 275], dir: D, type: 'arch', span: 20, width: 3.2, rise: 1.9 },
  { id: 'b_w1', over: 'west', at: [-360, -120], dir: 0, type: 'arch', span: 24, width: 3.4, rise: 2.0 },
  { id: 'b_w2', over: 'west', at: [-360, 150], dir: 0, type: 'beam', span: 27, width: 3.2 },
  { id: 'b_e1', over: 'east', at: [372, -60], dir: 0, type: 'arch', span: 24, width: 3.4, rise: 2.0 },
  { id: 'b_e2', over: 'east', at: [372, 220], dir: 0, type: 'beam', span: 27, width: 3.2 },
  { id: 'b_l1', over: 'lane1', at: [-140, -200], dir: 0, type: 'arch', span: 20, width: 3.0, rise: 1.6 },
  { id: 'b_l2', over: 'lane1', at: [-140, -60], dir: 0, type: 'beam', span: 20, width: 2.8 },
  { id: 'b_l3', over: 'lane2', at: [200, 90], dir: 0, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_l4', over: 'lane2', at: [200, 210], dir: 0, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_l5', over: 'lane3', at: [-250, -150], dir: D, type: 'beam', span: 16, width: 2.8 },
  { id: 'b_l6', over: 'lane3', at: [250, -150], dir: D, type: 'arch', span: 14, width: 3.0, rise: 1.4 },
  { id: 'b_l7', over: 'lane4', at: [300, 150], dir: D, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_x1', over: 'lane3', at: [-60, -150], dir: D, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_x2', over: 'west', at: [-360, -290], dir: 0, type: 'arch', span: 24, width: 3.0, rise: 1.8 },
];

/** 三桥的次序：一走太平、二走吉利、三走长庆 */
export const WALK = ['taiping', 'jili', 'changqing'];

/* ------------------------------------------------------------------ 名园名宅 */

/** 一个带抖动边的椭圆：园池与洲都用它，免得每处再各写一遍 */
function ellipsePoly(cx, cz, rx, rz, { n = 30, wob = 0.14, seed = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    void seed;
    const k = 1 + (rand() - 0.5) * 2 * wob;
    out.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  return out;
}

/** 退思园：西园东宅的横长格局，园在西部、宅在东部，园门开在东墙 */
export const GARDEN = {
  plot: { x0: 148, x1: 266, z0: -348, z1: -262 },
  /** 长 112 米、宽 83 米、9.9 亩（可核）；水面尺度为写意 */
  lengthM: 112, widthM: 83, mu: 9.9,
  wallH: 4.1,
  pond: { cx: 192, cz: -305, rx: 27, rz: 16 },
  /** 池的多边形在数据里一次算定：园子画水、地块要挖这个洞 */
  pondPoly: ellipsePoly(192, -305, 27, 16, { n: 30, wob: 0.15 }),
  hall: { x: 192, z: -331, rot: Math.PI },        // 退思草堂：池北，正面朝南
  pavilion: { x: 213, z: -327, rot: 2.6 },         // 眠云亭：东北叠石之上，面朝池心
  tower: { x: 216, z: -296, rot: Math.PI / 2 },    // 辛台：贴东水面，面朝西
  boat: { x: 168, z: -303, rot: -Math.PI / 2 },    // 石舫：贴水西岸，头朝东入水
  gate: { x: 266, z: -305, rot: -Math.PI / 2 },   // 园门辟在东墙，门额"退思"
  rocks: [[206, -334], [216, -318], [176, -322], [200, -291], [163, -315]],
};

/* ------------------------------------------------------------------ 宅第 */

/** 几处宅第：形制按江南大宅通例补配 */
export const HOUSES = {
  chongben: { plot: RESERVE[1], name: '崇本堂', depth: 46, bays: 5, floors: 2 },
  jiayin: { plot: RESERVE[2], name: '嘉荫堂', depth: 36, bays: 4, floors: 1, porchHouse: true },
  gengle: { plot: RESERVE[3], name: '耕乐堂', depth: 40, bays: 4, floors: 2 },
  chen: { plot: RESERVE[4], name: '百尺梧桐', depth: 38, bays: 3, floors: 2, wutong: true },
};

/** 罗星洲：同里湖中一洲，四面环水、无桥可通，须渡 */
export const ISLET = {
  x: 830, z: 372, r: 52, y: 1.5, name: '罗星洲',
  wharf: { x: 782, z: 372, dir: 0 },
};

/** 镇外的田与村：只给地坪与几点渔火 */
export const OUTER = {
  groundY: PLAIN_Y,
  villages: [
    { x: -1000, z: -1000, n: 26 }, { x: 1040, z: -860, n: 22 },
    { x: 980, z: 880, n: 18 }, { x: -980, z: 900, n: 20 },
    { x: -1240, z: -140, n: 14 },
  ],
};

/* ------------------------------------------------------------------ 招牌动作 */

/**
 * 灯船自东南入镇，一路过三桥——次序就是走三桥的次序；
 * 出镇北口、穿豁口入湖，最后停在罗星洲的渡口。
 */
export const VOYAGE = {
  boats: 3,
  speed: 10.5,
  chain: WALK,
  route: [
    [520, 420], [440, 352], [374, 250], [372, 60], [372, 20], [300, 20], [240, 20],
    [140, 20], [52, 20], [-40, 20], [-140, 20], [-140, -80], [-140, -200], [-140, -250],
    [-260, -250], [-360, -250], [-360, -350], [-368, -424], [-300, -478], [-100, -516],
    [120, -536], [300, -524], [450, -384], [560, -160], [700, 60], [800, 262], [838, 366],
  ],
};

/** 河灯：沿镇河放的一圈，随水走 */
export const FLOATS = { count: 44 };

/* ------------------------------------------------------------------ 机位 */

const G = GARDEN.pond, H = (id) => BRIDGES.find((b) => b.id === id);
const T1 = H('taiping'), T2 = H('jili'), T3 = H('changqing');

/**
 * 机位约定：`at:[x,z]` 定站脚，`hOff` 是眼高（岸顶之上 1.62 米为人眼），
 * `look:[x,z,lift]` 是视点，`mark` 是热点标签锚定的实体地标——改机位要同步改 mark。
 */
export const STATIONS = [
  {
    id: 'qiaojie',
    name: '三桥 · 走三桥',
    short: '三桥',
    at: [-108, 8.5], hOff: EYE,
    look: [140, 20, 4.2],
    mark: [T2.at[0], T2.at[1], 5.6],
    era: '次序可核 · 形制写意',
    lead: '三座桥相接，夜里一座一座亮起来。',
    body: '同里镇中的太平、吉利、长庆三桥连成一片，旧时有"一走太平、二走吉利、三走长庆"的走法，图的就是桥名里的"太平""吉利""长庆"六个字。三桥今貌为清嘉庆、道光年间改建后之物，咸丰年间与同治、光绪几度重修；吉利桥是石梁平桥，太平、长庆二桥作拱桥。可核的是名目、次序与形制，跨宽与位置是按镇河撑出来的写意。旧时走桥以婚嫁为多——新婚必走三桥，另有一说为"走三桥祛病求子"，出处较单，这里只走次序、不写缘由。',
    tags: ['太平·吉利·长庆', '梁桥与拱桥', '次序可核'],
  },
  {
    id: 'chuan',
    name: '桥洞 · 灯船',
    short: '船底',
    at: [52, 20], hOff: 0.9, floorY: 0.4,
    look: [-40, 20, 4.6],
    mark: [T2.at[0], T2.at[1], 2.4],
    era: '一桥一港 · 摇橹船',
    lead: '坐在船头往回看，桥是压在头顶的一道亮。',
    body: '镇河是缝，桥是针脚，船走的正是这些缝。手摇船一般不装马达，橹在船尾、篷在船中，过拱桥要低头。吉利桥是三孔石梁，桥洞不高，灯影落在水面上被橹声揉开——这一景里唯一的动势就是这条船：它自东南入镇，一路过太平、吉利、长庆，出镇北豁口进湖，最后停在罗星洲的渡口。船与灯都是按水乡通例画的，不对应任何一条可核的夜航线。',
    tags: ['一橹一篷', '桥洞压顶', '夜航为写意'],
  },
  {
    id: 'houtianjie',
    name: '后街 · 河为道',
    short: '河街',
    at: [-286, 8.5], hOff: EYE,
    look: [-60, 20, 3.2],
    mark: [-40, 20, 5.2],
    era: '临水成街 · 形制写意',
    lead: '街不是给人走的，是给船看的。',
    body: '同里的街有两副面孔：一副是岸，一副是门。临河一面开小门、下水两级就是河埠头，门前一块系船石；后门开在街上，街与河只隔着这一进屋。粉墙黛瓦、硬山举架、山墙作观音兜（苏南常见那种圆头山尖，不是徽州的马头墙），有的后檐挑到河上作水阁——这些都是按江南民居通例摆的写意，不对应哪一栋可核的老宅。沿河一串灯笼离水只有一人多高，灯影在对面墙上晃，是夜里最好认的一段。',
    tags: ['前门街后门河', '河埠头', '观音兜'],
  },
  {
    id: 'tuisi',
    name: '退思园 · 贴水',
    short: '园中',
    at: [216, -278], hOff: EYE - 0.1, floorY: BANK + 0.1,
    look: [GARDEN.hall.x, GARDEN.hall.z, 3.6],
    mark: [GARDEN.hall.x, GARDEN.hall.z, 5.8],
    era: '光绪十一年至十三年 · 1885—1887',
    lead: '一座把家具直接搬到水边上的园子。',
    body: '退思园在同里新填街（今竹行街），光绪十一年（1885）由任兰生归乡后筑，十三年（1887）成，前后三年。园名取《左传·宣公十二年》"退思补过"——任兰生官至安徽皖南道、赏二品顶戴，光绪十四年因黄河决口案落职归里。设计者是同里人袁龙，字子振，画山水宗龚半千。园的格局最特别处在于不作常规的南北纵深，而是东西横列，全长 112 米、南北宽 83 米、占地 9.9 亩：西半为园、东半为宅，贴水而建，故俗称"贴水园"。池在园心，退思草堂据池北、眠云亭立于东南叠石之上，辛台与石舫贴水而居。2000 年 11 月 30 日随苏州古典园林列入世界文化遗产名录（另有一源记作 2001 年 7 月）。',
    tags: ['1885—1887', '袁龙设计', '9.9 亩 · 112×83 米'],
  },
  {
    id: 'yuanmen',
    name: '退思园 · 东墙园门',
    short: '园门',
    at: [276, -305], hOff: EYE,
    look: [264, -305, 3.2],
    mark: [GARDEN.gate.x, GARDEN.gate.z, 3.6],
    era: '门额"退思"',
    lead: '门开在东墙上，进去先看见的是园。',
    body: '园门辟在东墙，门额"退思"两字；按旧记，入门户即见园林，逾墙而后宅见——所以这一园的次序是"园在前、宅在后"，与常见的前宅后园反着来。墙内匾额还有"种玉""恂予""望月""飞梁"数处，多取自《诗经》与《汉书》。夜里只给门洞里一盏灯：墙是白的，光是暖的，额上的字要走近才读得出。形制与门洞做法按苏南园林通例补配。',
    tags: ['入园先见园', '匾额数处', '形制补配'],
  },
  {
    id: 'chongben',
    name: '崇本堂 · 砖雕门楼',
    short: '崇本堂',
    at: [302, -291], hOff: EYE,
    look: [302, -320, 4.2],
    mark: [302, -334, 4.8],
    era: '清光绪元年 · 1875',
    lead: '光斜着扫过去，砖雕才肯露层次。',
    body: '崇本堂在退思园旁，清光绪元年（1875）任兰生购地建为正厅宅第，面积 2088 平方米，前厅后楼，檐柱间用造船剩下的楠木作梁，故又称"楠木殿"。营造上有名的是那几组数：五柱计十四头、九界梁、六架椽，梁架间有雕花，东西两界还藏着暗顶与机关；砖雕门楼上"崇本堂"额与敬义堂所刻《朱子家训》为一处。今存面积为 1644 与 2088 两说并存。这些数字可核，但门楼的纹样与厅里陈设是补配。',
    tags: ['1875 年', '五柱十四头', '两说并存'],
  },
  {
    id: 'jiayin',
    name: '嘉荫堂 · 船篷轩',
    short: '嘉荫堂',
    at: [-290, -297], hOff: EYE,
    look: [-290, -322, 3.8],
    mark: [-290, -330, 4.4],
    era: '清光绪乙亥 · 1875',
    lead: '抬头是弧形的轩，像把船底翻过来。',
    body: '嘉荫堂在竹行街，清光绪乙亥年（1875）由任锡厚所建，面积仅 800 平方米，体量比崇本堂小得多。最值钱的是明间顶部那一架船篷轩，梁架作弧形如覆舟，拱眼雕鲤鱼跳龙门；窗辉用黄杨木雕。这一处 1999 年按原貌搬迁重建，所以眼前这一栋是新的，只有形制是旧的。堂里的格局、门罩与陈设都属补配。',
    tags: ['1875 年', '船篷轩', '1999 迁建'],
  },
  {
    id: 'gengle',
    name: '耕乐堂 · 天顺六年',
    short: '耕乐堂',
    at: [-238, 88], hOff: EYE,
    look: [-238, 52, 4.2],
    mark: [-238, 40, 4.8],
    era: '明天顺六年 · 1457',
    lead: '镇内最老的一处屋脚，六百年前立下的。',
    body: '耕乐堂原址在百间楼（旧称浦南弄，与苏州那处同名百间楼不是同一地方），明天顺六年（1457）由处士任完（号"乐痴"）始建，取"耕者乐得其食"之义。现存建筑占地 692 平方米，坐北朝南，前后两进、后进五楼，硬山式蒲河帮，2006 年列入全国重点文物保护单位。此园原附有耕乐堂花园，与祠堂区同属一组，1980 年政府出资修缮。这里按前后两进的通例摆其形制，楼阁间数与院内布置皆属补配。',
    tags: ['1457 年', '692 平米', '硬山蒲河帮'],
  },
  {
    id: 'wutong',
    name: '百尺梧桐 · 陈去病故居',
    short: '故居',
    at: [328, -86], hOff: EYE,
    look: [328, -120, 4.0],
    mark: [328, -118, 4.6],
    era: '曲尺形楼房',
    lead: '一楼一底的曲尺形，楼上的窗只亮两扇。',
    body: '陈去病故居在百尺梧桐（区文保点），"百尺梧桐"四字既是街名也是斋名，其宅西屋为一座曲尺形（尺形）的上下两层楼。陈去病（1874—1933）南社创始人之一，辛卯年（1911）参与发起南社——这一条出自单一来源，姑存其名。同里还出过清初天文学家王锡阐（1628—1689），《清史稿》有传。这里只按其位置摆一座临河的曲尺楼，窗里两盏灯，院里几株梧桐，形制补配。',
    tags: ['百尺梧桐', '曲尺形楼', '王锡阐同里人'],
  },
  {
    id: 'luoxing',
    name: '罗星洲 · 渡',
    short: '洲上',
    at: [ISLET.x - 26, ISLET.z + 6], hOff: EYE, floorY: ISLET.y,
    look: [ISLET.x + 18, ISLET.z - 22, 3.2],
    mark: [ISLET.x + 6, ISLET.z - 6, 6.2],
    era: '明嘉靖四十二年 · 1563 筑圩',
    lead: '洲上没有桥，回去只能等船。',
    body: '罗星洲在同里湖中，明嘉靖四十二年（1563）筑圩，清道光三年（1823）因淘河堆土而成洲，四面环水、无桥可通，须渡船乃登。面积今约 4500 平方米，与"原 17000 平方米"两数并存（另有 17 亩、250 亩等说法）；洲上庙宇多毁于抗战兵火，2005 年同里整治古镇与三湖、2011 年起收回集体。今 5A 级景区内的殿阁为近年重修。洲上的名目与形制查无可核来源，这里只按"四面环水、须渡乃登"摆一小片屋宇与一座待渡亭，塔影为写意补配，不署其名。',
    tags: ['1563 / 1823', '无桥须渡', '名目不可核'],
  },
  {
    id: 'wuhu',
    name: '镇北圩 · 五湖',
    short: '湖望',
    at: [-445, -590], hOff: EYE + 0.4, floorY: DEP,
    look: [20, 20, 12],
    mark: [-520, -604, 3.4],
    era: '五湖环绕 · 方位按一说',
    lead: '镇子外圈不是田，是水。',
    body: '同里被水绕着：志书可核的五湖是同里湖、九里湖、南星湖、叶泽湖、庞山湖。湖的方位没有测绘依据，这里按一说摆：镇北九里湖、镇东与东北同里湖、镇东南南星湖、镇西叶泽湖与庞山湖。镇北这一段的圩岸是一条人工堤，堤外是水、堤内也是水，中间只留一条走得人的塘路。至于"东连九里、西接庞山"那类说法与"五湖环同里"的歌诀都出自后世网络或转述，不作史实；"太湖三万六千顷，尽入吴县西"的引文实出自唐白居易《长洲曲》，亦不用。',
    tags: ['五湖名目可核', '方位写意', '塘路为堤'],
  },
  {
    id: 'aerial',
    name: '湖上鸟瞰 · 川与桥',
    short: '鸟瞰',
    at: [-260, 720], hOff: 178,
    look: [20, 20, 22],
    mark: null,
    era: '底图为写意',
    lead: '抬起来看，镇子是浮在水上的一串方块。',
    body: '从湖上空北望，三条东西河与几条南北河把陆地切成一块一块，块与块之间靠桥连——这就是常被说成"川字河分七块"的那个格局。可核的是川字水系与"为水所分"这两件事，河宽、桥数、地块轮廓都不过是按水乡通例撑出来的体势；42 座与 49 座桥两个数都是晚近统计口径，同里镇志仅在嘉庆间记九桥。夜景里最认得出的其实是屋顶：一片深灰的黛瓦中间夹着几条亮线，那是河。',
    tags: ['全景', '川字水系', '桥数两说'],
  },
];

export const DEFAULTS = {
  lantern: 100,
  window: 62,
  float: 36,
  ripple: 100,
  bloom: 30,
  walk: false,
  reflect: true,
  labels: true,
  tour: false,
  autoQuality: true,
};
