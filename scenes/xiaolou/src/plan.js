/**
 * 小娄巷 · 平面。单位米：主巷沿 X 轴（-X 为西巷口、+X 为东巷尾），
 * -Z 为北、+Z 为南，巷内地面 y=0。
 * 巷在无锡梁溪区老城，东西向、青石板路，全长约四百米【可考】；
 * 巷宽无公开实测，这里写意取 3.4–5.2 米；宅第进深、开间、檐口高按江南
 * 砖木民居常例取值（一层檐口 3.3–3.8、二层 6.2–6.6、脊 7.5–8.5），非测绘数据。
 */

/** 巷身中线：一条缓弯，东段偏南，视线在山墙处收住 */
export function centerZ(x) {
  return 6.4 * Math.tanh((x + 46) / 74) + 2.1 * Math.sin(x * 0.0125 + 0.6);
}

export function slope(x) {
  const d = 0.8;
  return (centerZ(x + d) - centerZ(x - d)) / (2 * d);
}

/** 半宽：井边、坊下、祠堂门前略放宽，平日三米四 */
export function laneHW(x) {
  return 1.72
    + 0.95 * Math.exp(-((x + 196) ** 2) / (2 * 11 ** 2))
    + 0.85 * Math.exp(-((x + 80) ** 2) / (2 * 9 ** 2))
    + 0.9 * Math.exp(-((x + 128) ** 2) / (2 * 10 ** 2))
    + 1.05 * Math.exp(-((x - 66) ** 2) / (2 * 12 ** 2))
    + 0.8 * Math.exp(-((x - 186) ** 2) / (2 * 11 ** 2));
}

/** 沿巷的某一点（off 为垂直巷中线的位移，正为南） */
export function lanePoint(x, off = 0) {
  const L = Math.hypot(1, slope(x));
  return {
    x: x - (off * slope(x)) / L,
    z: centerZ(x) + off / L,
    n: [-slope(x) / L, 0, 1 / L],
  };
}

/** side=+1 在巷南、side=-1 在巷北；yaw 把宅子的正面转进巷弯 */
export function yawAt(x, side) {
  const a = Math.atan(slope(x));
  return side > 0 ? Math.PI - a : -a;
}

export const LANE = {
  xFrom: -205,
  xTo: 195,
  groundY: 0,
  eaveLow: 3.45,
  eaveHigh: 6.35,
};

/** [side, x0, x1, depth, bays, floors, kind, siteId] */
const ROWS = [
  // —— 巷北（-Z）
  [-1, -205, -188, 16, 3, 1, 'row'],
  [-1, -188, -168, 22, 4, 1, 'shrine', 'shrine'],
  [-1, -168, -150, 18, 3, 1, 'row'],
  [-1, -150, -136, 20, 3, 1, 'row', 'well-north'],
  [-1, -136, -108, 4.5, 5, 2, 'hall', 'ancestry'],
  [-1, -108, -88, 20, 3, 1, 'row'],
  [-1, -88, -68, 22, 4, 1, 'row', 'bye-mouth'],
  [-1, -68, -50, 18, 3, 1, 'row'],
  [-1, -50, -22, 26, 4, 2, 'great'],
  [-1, -22, 6, 18, 3, 1, 'shop'],
  [-1, 6, 30, 22, 4, 1, 'row'],
  [-1, 30, 56, 28, 5, 2, 'tower', 'crane-tower'],
  [-1, 56, 92, 8, 5, 1, 'garden-house', 'yiyuan'],
  [-1, 92, 112, 20, 3, 1, 'row'],
  [-1, 112, 138, 26, 4, 2, 'great', 'shoujian'],
  [-1, 138, 168, 22, 4, 1, 'row'],
  [-1, 168, 195, 18, 3, 1, 'corner'],

  // —— 巷南（+Z）
  [1, -205, -190, 18, 3, 1, 'corner'],
  [1, -190, -166, 24, 4, 2, 'great'],
  [1, -166, -144, 18, 3, 1, 'row'],
  [1, -144, -116, 4.5, 5, 2, 'hall', 'fushou'],
  [1, -116, -96, 18, 3, 1, 'row'],
  [1, -96, -70, 22, 4, 1, 'row', 'well'],
  [1, -70, -44, 26, 4, 2, 'great'],
  [1, -44, -18, 18, 3, 1, 'shop'],
  [1, -18, 10, 4.5, 5, 2, 'great', 'zhang'],
  [1, 10, 34, 18, 3, 1, 'row'],
  [1, 34, 62, 22, 4, 1, 'row'],
  [1, 62, 92, 4.5, 5, 2, 'great', 'wanbei'],
  [1, 92, 118, 18, 3, 1, 'shop'],
  [1, 118, 148, 26, 4, 2, 'great', 'general'],
  [1, 148, 172, 18, 3, 1, 'row'],
  [1, 172, 195, 22, 4, 1, 'row'],
];

export const PLOTS = ROWS.map(([side, x0, x1, depth, bays, floors, kind, id]) => ({
  side, x0, x1, depth, bays, floors, kind, id,
}));

/** 有名字的几处：机位与门匾都从这里取位，改布局时不至于两处对不上 */
export const SITE = {
  /** 西巷口的石坊（现存牌坊为街区改造时新制，非旧物） */
  westArch: { x: -196, id: 'conggui', text: '丛桂坊' },
  /** 东巷口的石坊 */
  eastArch: { x: 188, id: 'xiuyi', text: '绣衣坊' },
  shrine: { x: -178, side: -1, name: '金胜神庙' },
  ancestry: { x: -122, side: -1, name: '谈氏宗祠', hall: '享堂' },
  fushou: { x: -130, side: 1, name: '福寿堂', peony: true },
  zhang: { x: -4, side: 1, name: '张孟肃宅' },
  wanbei: { x: 77, side: 1, name: '万备堂' },
  general: { x: 133, side: 1, name: '将军府' },
  shoujian: { x: 125, side: -1, name: '修俭堂' },
  'crane-tower': { x: 43, side: -1, name: '来鹤楼' },
  yiyuan: { x: 74, side: -1, name: '佚园' },
  'bye-mouth': { x: -78, side: -1, name: '备弄口' },
  well: { x: -82, side: 1, off: 1.15, r: 0.62, name: '明代古井' },
  'well-north': { x: -142, side: -1, off: -1.1, name: '井' },
};

/** 巷上的物件：x 给沿巷位置，off 给垂直位移 */
export const KEY = {
  trees: [
    { x: -182, off: -3.4, h: 8.4, r: 2.9 },
    { x: -96, off: 3.2, h: 7.0, r: 2.4 },
    { x: -24, off: -3.3, h: 9.2, r: 3.2 },
    { x: 22, off: 3.4, h: 7.6, r: 2.7 },
    { x: 96, off: -3.5, h: 8.6, r: 3.0 },
    { x: 160, off: 3.2, h: 7.4, r: 2.6 },
  ],
  /** 佚园：宅子后面的一方园子 */
  garden: { cx: 74, cz: -25, w: 27, d: 19, wallH: 3.5 },
  /** 今景：开街后的路灯、店招、灯箱、监控与导览牌 */
  modern: {
    lamps: [
      { x: -186, off: -2.0 }, { x: -120, off: 2.1 }, { x: -44, off: -2.1 },
      { x: 30, off: 2.2 }, { x: 100, off: -2.1 }, { x: 176, off: 2.1 },
    ],
    signs: [
      { x: -172, side: -1, y: 3.6, w: 2.4, h: 0.8, text: '茶食' },
      { x: -100, side: 1, y: 3.5, w: 2.8, h: 0.85, text: '惠山泥人' },
      { x: -30, side: -1, y: 3.9, w: 3.0, h: 0.9, text: '老宅咖啡' },
      { x: 44, side: 1, y: 3.4, w: 2.2, h: 0.75, text: '缂丝' },
      { x: 112, side: -1, y: 3.8, w: 2.6, h: 0.8, text: '书肆' },
      { x: 166, side: 1, y: 3.5, w: 2.4, h: 0.8, text: '文创' },
    ],
  },
};

/** 备弄：巷内一条百米窄弄，太平天国年间备乱而设，两侧高墙只留一线天 */
export const BYE = {
  /** 从主巷北岸进去 */
  x: -78, side: -1,
  width: 1.45,
  wallH: 3.7,
  /** 折线：每段给长度与航向转角（弧度），起头朝北 */
  legs: [
    { len: 34, turn: 0 },
    { len: 26, turn: 0.36 },
    { len: 24, turn: -0.5 },
    { len: 22, turn: 0.24 },
  ],
  /** 弄内的门、洞、滴水与一线月光的位置都按弧长 s 取 */
  doors: [
    { s: 12, side: 1 }, { s: 27, side: -1 }, { s: 46, side: 1 },
    { s: 63, side: -1 }, { s: 78, side: 1 },
  ],
};

/** 月：自东边巷尾上方升起，高度够让它的光落进三米多宽的巷槽里 */
export const MOON_DIR = (() => {
  const v = [0.8, 0.52, 0.28];
  const L = Math.hypot(...v);
  return v.map((c) => c / L);
})();
