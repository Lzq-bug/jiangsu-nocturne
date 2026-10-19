/**
 * 机位、地形函数与全山尺寸。坐标单位为米：-Z 为北，+X 为东，y=0 是海面。
 * 山是南北走向的一条脊，西临内海、东临黄海——清康熙五十年（1711）它连陆之
 * 前就是海中孤岛，所以画面把两面的水都留着。真实云台山南北长约数十里，这
 * 里只取登山主轴那一段，水平距离压缩过（山门到巅图上不足一公里），高程按
 * 2025 年江苏省公布的 624.4 米走。本文件不 import three，可以直接用 node 采样。
 */

const sq = (v) => v * v;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/* ------------------------------------------------------------------ 山体 */

/** 玉女峰：江苏省最高峰，2025 年 8 月省自然资源厅公布全省前十山峰列第一 */
export const PEAK = { x: 12, z: -60, y: 624.4 };

/** 主脊的 X 位置随 Z 蜿蜒 */
export function crestX(z) {
  return 20 + 95 * Math.sin(z * 0.0011 + 0.35) + 38 * Math.sin(z * 0.0027 - 1.0);
}

function hCrestRaw(z) {
  return 640 * Math.exp(-sq((z + 60) / 520))
    + 215 * Math.exp(-sq((z - 600) / 380))
    + 240 * Math.exp(-sq((z + 740) / 400))
    - 105;
}
const HSCALE = PEAK.y / hCrestRaw(PEAK.z);

/** 脊线上任一点的山头高程 */
export function hCrest(z) { return hCrestRaw(z) * HSCALE; }

/** 山体的坡面：脊顶圆钝，西坡陡、东坡缓，两脚都插进海里 */
const WEST_K = 0.95, EAST_K = 0.72, ROUND_R = 150;
export function wallAt(x, z) {
  const d = x - crestX(z);
  const k = d < 0 ? WEST_K : EAST_K;
  return hCrest(z) - k * (Math.sqrt(sq(d) + sq(ROUND_R)) - ROUND_R);
}

/* ------------------------------------------------------------------ 山前成陆的平野 */

/** Deterministic value noise — the same night on every reload. */
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function noise2(x, y) { return vnoise(x, y); }

/**
 * 山脚下的平野是 1711 年之后淤出来的：东、西两面各一条带宽度的滩地—田—街，
 * 往海的方向一路降到 0。旧海岸（山脚线）与新海岸都画在这里。
 */
const WEST_SHORE = -1310;   // 今日西面水尽处（再往西就是海州湾）
const EAST_SHORE = 1210;    // 宿城以东的海岸
const MUD_Y = 3.4;          // 滩地高程：淹不着、又离水不远

function plainAt(x, z) {
  const wN = 1 + 0.25 * vnoise(x * 0.0016, z * 0.0016);
  const west = x < 0;
  const shore = (west ? WEST_SHORE : EAST_SHORE) + 30 * Math.sin(z * 0.0019 + (west ? 1.4 : 0.3));
  // d > 0 是往内陆走，d < 0 是往海里走；山脚方向平野慢慢升高（洪积的扇）
  const d = west ? x - shore : shore - x;
  if (d < 0) return Math.max(-26, 2.6 + d * 0.15);
  const span = west ? (-690 - shore) : (shore - 900);
  const fan = clamp01(d / Math.max(120, span));
  const inlandY = 4 + 11 * wN * smooth(fan);
  return lerp(2.6, inlandY, smooth(clamp01(d / 240)));
}

/* ------------------------------------------------------------------ 泄沟与崖脚 */

/** 西坡三条泄沟：沟口汇到山麓，九龙桥就跨在最南那条上 */
export const GULLIES = [
  { z: 150, x: -380, halfW: 118, depth: 74, len: 330 },   // 水帘洞那条
  { z: -250, x: -330, halfW: 96, depth: 58, len: 300 },   // 娲遗石一带
  { z: -680, x: -420, halfW: 120, depth: 62, len: 340 },
];
/** 沟里出来的水在平野上刻出的槽，一直槽到今日海岸 */
const CHANNELS = [
  { z: 150, halfW: 30, depth: 9.5, x0: -1330, x1: -620 },
  { z: -250, halfW: 24, depth: 7.5, x0: -1330, x1: -640 },
];

/** 洞前的潭、桥下的渊：在已铺好的地上再挖一盆 */
export const POOLS = [
  { x: -408, z: 158, rx: 24, rz: 17, depth: 5.2 },   // 三潭汲浪的第一潭
  { x: -690, z: 150, rx: 21, rz: 13, depth: 3.4 },   // 桥下那段渊
];

/** 洞口在坡面上切出的凹口：没有它，人字洞里看到的是外面的山坡 */
export const NOTCHES = [
  { x: -392, z: 150, rx: 36, rz: 34, depth: 52, soft: 1.5 },
];

function gullyAt(x, z) {
  let cut = 0;
  for (const g of GULLIES) {
    const dz = Math.abs(z - g.z);
    if (dz > g.halfW * 2.6) continue;
    const across = Math.max(0, 1 - sq(dz / g.halfW));
    const along = Math.exp(-sq((x - g.x) / g.len));
    cut += g.depth * across * along;
  }
  return cut;
}

/** 沟出山口以后在平野上槽出的那条涧，桥就跨它 */
function channelAt(x, z) {
  let cut = 0;
  for (const c of CHANNELS) {
    if (x < c.x0 || x > c.x1) continue;
    const dz = Math.abs(z - c.z);
    if (dz > c.halfW) continue;
    const along = smooth(clamp01((x - c.x0) / (c.x1 - c.x0))) * 0.4 + 0.6;
    cut += c.depth * (1 - sq(dz / c.halfW)) * along;
  }
  return cut;
}

/* ------------------------------------------------------------------ 人工台地 */

/** 殿前、门洞里、峰顶这几处是削出来或垒出来的平地，机位也站在这些面上 */
export const PLATFORMS = [
  { x: -441, z: -40, rx: 152, rz: 74, y: 297, soft: 2.0 },  // 三元宫门前平台
  { x: 29, z: 205, rx: 36, rz: 32, y: 506, soft: 1.4 },     // 南天门垭口
  { x: PEAK.x, z: PEAK.z, rx: 112, rz: 92, y: PEAK.y, soft: 1.75 },   // 玉女峰顶
  { x: -705, z: 150, rx: 52, rz: 44, y: 15, soft: 1.6 },    // 山门前的坡地
  { x: -452, z: 150, rx: 46, rz: 48, y: 176, soft: 1.7 },   // 水帘洞前的看潭台
  { x: -336, z: -252, rx: 66, rz: 54, y: 318, soft: 2.0 },  // 娲遗石的石坪
];

function platformAt(y, x, z) {
  let out = y;
  for (const p of PLATFORMS) {
    const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
    if (d > p.soft) continue;
    // the centre must land exactly on p.y: a station standing on a terrace
    // reads the same number the building did
    const k = d < 0.92 ? 1 : 1 - smooth(clamp01((d - 0.92) / (p.soft - 0.92)));
    out = lerp(out, p.y, k);
  }
  return out;
}

/** 大村水库：削一个盆、埝一道矮堤，水面才有个可以倚靠的岸 */
function basinAt(x, z) {
  const d = Math.hypot((x - RESERVOIR.x) / RESERVOIR.rx, (z - RESERVOIR.z) / RESERVOIR.rz);
  if (d > 1.4) return 0;
  const bowl = -9.5 * smooth(clamp01((1.06 - d) / 0.5));
  const rim = 3.4 * Math.exp(-sq((d - 1.07) / 0.1));
  return bowl + rim;
}

/* ------------------------------------------------------------------ 采样 */

/** 水帘洞这一段要有一面真崖：西坡本是 40° 光滑锥面，洞楣与刻石都没处依附 */
function cliffBand(x, z) {
  const along = Math.exp(-sq((z - SITE.cave.z) / 96));
  if (along < 0.02) return 0;
  const up = smooth(clamp01((x - (SITE.cave.x - 34)) / 52));
  return 54 * up * along;
}

/** 全场地形：机位、建筑、植被都从这里取高度，改山不会改出悬空的楼 */
export function groundAt(x, z) {
  const wall = wallAt(x, z) + cliffBand(x, z);
  const plain = plainAt(x, z);
  const onWall = wall > plain;
  let y = onWall ? wall : plain;
  if (onWall) {
    // 泄沟切进坡面，但沟底不许挖到平野以下——否则山脚会出现一条倒灌的深槽
    y = Math.max(y - gullyAt(x, z), plain + 3);
  }
  // 岩面起伏：越高越硬，滩地上只留一点波
  const rough = clamp01((y - 8) / 160);
  y += (vnoise(x * 0.019, z * 0.019) - 0.5) * (3 + 13 * rough);
  // 高频一档交给纹理，不交给网格：否则坡面全是菱形折线
  y += basinAt(x, z);
  y = platformAt(y, x, z);
  // 台地铺好以后涧才从这里穿过去：山门前的广场被水切开一道口
  if (!onWall) y -= channelAt(x, z);
  for (const p of POOLS) {
    const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
    if (d < 1.15) y -= p.depth * smooth(clamp01((1.15 - d) / 0.5));
  }
  for (const n of NOTCHES) {
    const d = Math.hypot((x - n.x) / n.rx, (z - n.z) / n.rz);
    if (d < n.soft) y -= n.depth * smooth(clamp01((n.soft - d) / (n.soft * 0.62)));
  }
  // 岛要有海岸线：不这么做，地形网格的矩形边会在海面上露出一块方裙边
  const od = Math.hypot((x - 60) / 1620, z / 1560);
  const isl = smooth(clamp01((1.05 - od) / 0.26));
  if (isl < 1) y = Math.min(y, lerp(-18, 30, isl));
  return Math.max(y, -90);
}

/** 眼高：站在地上的人 */
export function onGround(x, z, eye = 1.72) {
  return [x, groundAt(x, z) + eye, z];
}

/** 坡面法线的近似倾角，用来判断哪里还能站树 */
export function slopeAt(x, z) {
  const d = 6;
  const dx = groundAt(x + d, z) - groundAt(x - d, z);
  const dz = groundAt(x, z + d) - groundAt(x, z - d);
  return Math.hypot(dx, dz) / (2 * d);
}

/* ------------------------------------------------------------------ 海面与两条岸线 */

export const SEA = {
  y: 0,
  /** 画面里水要铺到天际，给一个足够大的方形水面 */
  x0: -7200, x1: 7200, z0: -7200, z1: 7200,
  /** 康熙五十年（1711）"忽成陆地，直抵山下"——旧海岸就在山脚 */
  oldShore: (z) => -700 + 40 * Math.sin(z * 0.0016 + 0.7),
  /** 今日西面水尽处 */
  newShore: () => WEST_SHORE,
};

/** 大村水库：1958 年海清寺为建库让路，只留下那座宋塔 */
export const RESERVOIR = { x: -1085, z: 520, rx: 165, rz: 105, y: 5.2 };

/* ------------------------------------------------------------------ 连岛 */

/** 东面屏海的是东西连岛，主峰大桅尖 601.0 米——和玉女峰同在一份名录上 */
export const LIANDAO = {
  x: 2650, z: -140, rx: 1500, rz: 520, y: 601.0,
  /** 西大堤：1985 动土、1993 合龙，全长 6700 米，把连岛与大陆拦成一片 */
  causeway: { x: 1560, z0: -520, z1: 900, y: 4.2, width: 26 },
};

export function liandaoAt(x, z) {
  const d = Math.hypot((x - LIANDAO.x) / LIANDAO.rx, (z - LIANDAO.z) / LIANDAO.rz);
  if (d > 1.6) return -40;
  const h = LIANDAO.y * Math.max(0, 1 - Math.pow(d, 1.7)) * 1.0;
  return h + (vnoise(x * 0.004 + 3.3, z * 0.004 - 2.2) - 0.5) * 26;
}

/* ------------------------------------------------------------------ 点位 */

export const SITE = {
  /** 山门与九龙桥：单孔石拱，长 33.4 米、宽 8 米、孔宽 6.6 米，明万历十五年重修 */
  bridge: { x: -672, z: 150, rot: Math.PI / 2, span: 33.4, width: 8, arch: 6.6 },
  gate: { x: -742, z: 150, rot: Math.PI / 2 },
  /** 海清寺阿育王塔：北宋天圣元年（1023），九级八面，高 40.58 米，塔门朝南 */
  pagoda: { x: -1010, z: 402, rot: 0, height: 40.58, storeys: 9 },
  /** 三元宫：发迹于唐、重建于宋、敕赐于明，1938 年毁于兵火后于 1980 年起修复 */
  temple: { x: -441, z: -40, rot: Math.PI / 2 },
  /** 水帘洞：天然裂隙，洞口呈"人"字形，在三元宫东侧崖壁下 */
  cave: { x: -392, z: 150, rot: Math.PI / 2 + 0.22 },
  /** 娲遗石与一线天 */
  boulders: { x: -336, z: -252, rot: 0 },
  /** 南天门：明代石拱门，清道光年间陶澍题"高镇南天" */
  southgate: { x: 29, z: 205, rot: Math.PI },
  peak: { x: PEAK.x, z: PEAK.z },
};

/** 登山一径：山灯沿这条线次第点亮，机位也贴着它走 */
export const PATH = [
  [-742, 150], [-672, 150], [-612, 128], [-556, 60], [-500, -12],
  [-452, -46], [-420, -120], [-404, -196], [-372, -252], [-338, -292],
  [-300, -300], [-252, -268], [-208, -218], [-172, -120], [-152, 6],
  [-140, 108], [-108, 168], [-60, 196], [0, 204], [29, 205],
  [48, 148], [40, 60], [24, -20], [12, -60],
];

/* ------------------------------------------------------------------ 机位 */

export const STATIONS = [
  {
    id: 'sea',
    name: '海面 · 山从海起',
    short: '海上',
    pos: [-1740, 26, -120],
    look: [-420, 300, 20],
    mark: [-560, 250, 150],
    era: '西海 · 十八世纪以前',
    lead: '这座山一直到康熙五十年还立在水里。',
    body: '云台山古称郁州山，唐宋称苍梧山、又叫青峰顶，明以后才叫云台山。市志里那句"海涨沙淤……至五十年忽成陆地"记的是同一件事：1711 年之前它是悬在海州城东的一座岛，西面是内湾，东面直对黄海。夜里从水上望过去，山没有过渡——滩、田、村之后一道石壁直插到六百多米，壁上那串亮点就是一径山灯。今天的水已退到山西一里开外，旧海岸只剩下山脚那一条线。',
    tags: ['海中孤岛', '康熙五十年连陆', '西壁如墙'],
  },
  {
    id: 'gate',
    name: '九龙桥 · 山门',
    short: '山门',
    stand: [-672, 150, 1.72],
    look: [-450, 330, -40],
    mark: [-672, 40, 150],
    era: '山麓 · 明万历十五年重修',
    lead: '进山先过桥，桥下是西坡三条山涧汇来的水。',
    body: '九龙桥是单孔石拱，长三十三米四、宽八米、孔宽六米六，桥下这道涧由山上九条沟的水汇成。石板桥唐宋就有了，明万历十五年重修成现在的拱，清康熙年间郯城那次大地震也没把它震倒。夜里拱洞里一盏、桥面上两盏，水从桥下走，光在水面上拖成一条抖动的竖带。抬头往上看，山壁从这里起——从桥到巅的水平距离在画面上被压过，真实的登山道要绕得多。',
    tags: ['单孔石拱 33.4×8', '九涧汇此', '登山之始'],
  },
  {
    id: 'pagoda',
    name: '海清寺塔 · 九级灯',
    short: '宋塔',
    stand: [-1046, 706, 1.72],
    look: [-1010, 30, 402],
    mark: [-1010, 51, 402],
    era: '北宋天圣元年 · 40.58 米',
    lead: '寺是 1958 年为水库拆的，只剩这一座塔立在水边。',
    body: '海清寺阿育王塔建于北宋天圣元年（1023），九级八面、仿楼阁式砖塔，通高 40.58 米，塔门朝南。它原是三元宫的下院；1958 年海清寺主体为建大村水库拆掉，塔留了下来，1975 年修塔时从塔基下取出银椁、银精舍、鎏金银棺、汝窑瓷瓶和佛牙，2006 年列为全国重点文物保护单位。夜里每层四面券门透出一圈灯，四面直棂假窗是死的——灯把这两类开口一分开，塔的层数就不用数了。',
    tags: ['天圣元年 1023', '九级八面 40.58 米', '1958 寺废塔存'],
  },
  {
    id: 'temple',
    name: '三元宫 · 山门灯火',
    short: '三元宫',
    stand: [-556, -40, 1.72],
    look: [-470, 306, -40],
    mark: [-505, 307, -40],
    era: '山腰 · 唐发迹、宋重建、明敕赐',
    lead: '宫墙下这一片灯火，是 1980 年以后重新垒起来的。',
    body: '三元宫的说法是"发迹于唐、重建于宋、敕赐于明"：万历十五年（1587）谢淳大建、二十四年落成，二十二年慈圣太后颁过大藏经，天启四年赐额"敕赐护国三元宫"，清代康熙又御书"遥镇洪流"匾。宫里供天、地、水三官大帝，1938 年毁于日军轰炸，1980 年起修复——所以今天看到的殿宇是新物，形制按通例补，不是原构。门前石级历代添过（原有五十三级，取"一步一拜"的五十三参之意），这里只画石级，不画那个数。',
    tags: ['天启四年赐额', '1938 毁、1980 复', '三官大帝'],
  },
  {
    id: 'stone',
    name: '娲遗石 · 一线天',
    short: '娲遗石',
    stand: [-380, -262, 1.72],
    look: [-330, 332, -252],
    mark: [-332, 342, -252],
    era: '坡上 · 崩裂与海蚀',
    lead: '一块石头卡在两道石缝之间，上不靠天、下不着地。',
    body: '娲遗石就是坡上一块崩落后又卡住的巨石，上面还压着半边象卵形的石头——小说里孙悟空从石卵迸出，山上这块石头因此有了名字。这一带的洞海天洞、二仙洞、万佛洞、朝阳洞、啸云洞、莲花洞，"七十二洞"从来不是实数，概言其多；石缝、崩积、加上海水冲刷才造出这些洞口。夜里给每块巨石的底面打一点光，石与石之间那道缝就亮成一线天，比任何题刻都更像小说里的场景。',
    tags: ['七十二洞非实数', '崩裂加海蚀', '石卵迸猴'],
  },
  {
    id: 'curtain',
    name: '水帘洞 · 揭帘',
    short: '水帘洞',
    stand: [-478, 150, 2.6],
    look: [-394, 168, 150],
    mark: [-392, 191, 150],
    era: '三元宫东侧 · 人字形裂隙',
    lead: '洞口是个"人"字，水从崖顶挂下来把它遮住。',
    body: '水帘洞是一处天然裂隙洞穴，洞口呈人字形，在三元宫东侧、崖壁之下。洞外那道泉瀑旧名"三潭汲浪"，崖上的刻石比"水帘洞"这个叫法老得多：嘉靖二十八年（1549）海州知州王同题的"高山流水"落款"己酉年重阳日，中泉子王同书"，此外还有"灵泉""神泉普润"和道光年间御赐陶澍的"印心石屋"——至于康熙年间某人题"水帘洞"三字一说，查不到出处，这里不刻。把水帘拉到底，洞门与崖刻才一齐露出来。',
    tags: ['人字形裂隙洞', '嘉靖二十八年崖刻', '半壁飞泉今古流'],
  },
  {
    id: 'inner',
    name: '洞内 · 出帘',
    short: '洞内',
    stand: [-382, 150, 2.6],
    look: [-566, 172, 166],
    mark: null,
    era: '帘后 · 逆光',
    lead: '从洞里往外看，水在光里只剩一层会抖的纱。',
    body: '站在洞内朝外，唯一的来源是洞口的天光与月：水帘逆着光就看不见水，只看见一条一条往下抽的亮线，石头的前沿被照得很短，洞底反而黑。《西游记》写这一洞用的句子是"一派白虹起，千寻雪浪飞"——明人朱世巨刻在崖上的"半壁飞泉今古流"是同一层意思。洞内不陈设：所谓石锅、石床、石灶一类都出自小说与导游口径，没有方志依据。',
    tags: ['逆光成纱', '洞内不陈设', '小说家言'],
  },
  {
    id: 'southgate',
    name: '南天门 · 高镇南天',
    short: '南天门',
    stand: [62, 205, 1.72],
    look: [-392, 318, 74],
    mark: [29, 514, 205],
    era: '脊上垭口 · 明代石拱门',
    lead: '山脊上只一个石头门洞，门外就是西面那片旧海。',
    body: '南天门在风门口东上方，背倚峻岭，是明代砌的一座石拱门，门前有石级；清道光年间陶澍题"高镇南天"，门内的武安宫（关帝庙）毁于战火，1982 年 8 月这里公布为连云港市文物保护单位。站在这里回头看：山灯从门下一路坠到山脚，山脚以外是淤出来的平野与村市，再往外才是今日的水。所谓"一千八百一十八级台阶"是泰山十八盘的说法，挪到这座山上没有任何出处，这里只画石级、不画数。',
    tags: ['明代石拱门', '道光陶澍题额', '不写台阶数'],
  },
  {
    id: 'peak',
    name: '玉女峰 · 月出东海',
    short: '巅上',
    stand: [12, -60, 2.1],
    look: [900, 545, -700],
    mark: [12, 632, -60],
    era: '六百二十四米四 · 江苏最高',
    lead: '顶上什么都没有，只一个高程标志。',
    body: '玉女峰 624.4 米，2025 年 8 月江苏省公布全省海拔前十山峰，它排第一；《云台补遗》说这一带"双峰耸立，东曰清风，西曰玉女"。山顶没有殿也没有亭，只一个高程点标志，画面里那圈矮石栏与一块小石桩都是补的。真正可看的是东面：宿城以东的水外浮着一道长影，那是东西连岛，它的主峰大桅尖 601.0 米和玉女峰在同一份名录上——江苏最高的两座山隔着的那道海，1985 到 1993 年间被一条 6700 米的拦海大堤拦住了。',
    tags: ['624.4 米（2025 公布）', '顶无古建筑', '连岛 601.0 米'],
  },
  {
    id: 'aerial',
    name: '全山 · 一岛两海',
    short: '鸟瞰',
    stand: [-1850, 900, 980],
    look: [60, 320, 0],
    mark: null,
    era: '山海易位',
    lead: '从高空看，海退了多少一目了然。',
    body: '抬高视角：山脊南北一条，东西两面曾经都是水。西面那条亮线是康熙五十年以前的海岸，当时海水直抵山下；线以西一大片平野与灯火都是 1578 到 1855 年间淤出来的（市志记这一带淤长一度超百米一年）。东面是宿城外的黄海，连岛屏在前面，岛与陆之间今日有堤。《禹贡》一类典籍里这座山叫郁州山的说法留在志书里，而"花果山"这个山名最早见于 1930 年代许绍蘧的《连云一瞥》——山还是那座山，名字是近代按小说定下来的。',
    tags: ['一岛两海', '淤长超百米/年', '山名起于 1930 年代'],
  },
];

/** 云台三十六湾的旧说与"东磊"都在别处，此景一律不入 */
export const DEFAULTS = {
  veil: 100,
  tower: 100,
  climb: 100,
  cloud: 62,
  ripple: 100,
  wind: 100,
  bloom: 34,
  carvings: true,
  reflect: true,
  labels: true,
  tour: false,
  autoQuality: true,
};
