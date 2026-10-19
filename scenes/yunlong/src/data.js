/**
 * 云龙山 · 冈岭四合 —— 机位、解说与全山尺寸。
 * 坐标单位为米：-Z 为北，+X 为东，y=0 是云龙湖水面。
 *
 * 山体是按解析高度场铺出来的：`terrainHeight(x,z)` 同时供几何、机位与灯具使用，
 * 所以任何一处挪了山，站的高度与热点锚点都跟着挪（见 main.js 的 syncStations）。
 *
 * 可考的底子：山长三公里、分九节、主峰海拔 142 米（两源同数），西临云龙湖。
 * 九节的起讫与自哪一头起数没有定说，这里自北而南排九段，属写意。
 * "冈岭四合，隐然如大环，独缺其西一面"是苏轼《放鹤亭记》原文，山形就照这句摆：
 * 主脊纵贯南北，北支与南支折而向东围成环，西面缺口对着湖。
 */

/** 滨湖路面与山东市的地坪（云龙湖水面 y=0） */
export const SHORE = 4.2;
export const CITY_Y = 5.0;
/** 兼容旧命名：几何模块里的"地面基准" */
export const GROUND = SHORE;

/* ------------------------------------------------------------------ 山脊 */

/** 主脊十节点 = 九段（自北而南；节次为写意排布） */
export const MAIN = {
  name: 'main',
  nodes: [
    { x: 60, z: -1450, y: 46, w: 150, e: 150 },
    { x: 30, z: -1120, y: 68, w: 185, e: 175 },
    { x: -10, z: -840, y: 92, w: 210, e: 190 },
    { x: -40, z: -580, y: 114, w: 230, e: 200 },
    { x: -55, z: -300, y: 142, w: 245, e: 205 },
    { x: -60, z: -30, y: 126, w: 235, e: 200 },
    { x: -80, z: 250, y: 108, w: 220, e: 190 },
    { x: -110, z: 560, y: 88, w: 200, e: 175 },
    { x: -150, z: 900, y: 66, w: 175, e: 155 },
    { x: -190, z: 1240, y: 44, w: 150, e: 135 },
  ],
};

/** 北支：自主脊北段折向东北、再转南，成环之北臂 */
export const NORTH_SPUR = {
  name: 'north',
  nodes: [
    { x: 30, z: -1120, y: 64, w: 150, e: 150 },
    { x: 200, z: -1050, y: 56, w: 140, e: 145 },
    { x: 380, z: -880, y: 48, w: 135, e: 140 },
    { x: 455, z: -640, y: 38, w: 130, e: 135 },
    { x: 465, z: -380, y: 28, w: 125, e: 130 },
    { x: 450, z: -140, y: 20, w: 120, e: 125 },
  ],
};

/** 南支：自主脊南段折向东，成环之南臂 */
export const SOUTH_SPUR = {
  name: 'south',
  nodes: [
    { x: -110, z: 560, y: 84, w: 150, e: 150 },
    { x: 70, z: 660, y: 72, w: 140, e: 145 },
    { x: 250, z: 620, y: 60, w: 130, e: 140 },
    { x: 390, z: 500, y: 46, w: 125, e: 135 },
    { x: 460, z: 320, y: 32, w: 120, e: 130 },
    { x: 470, z: 120, y: 22, w: 118, e: 126 },
    { x: 462, z: -60, y: 17, w: 116, e: 124 },
  ],
};

export const SPINES = [MAIN, NORTH_SPUR, SOUTH_SPUR];

/* ------------------------------------------------- 高度场：几何与落位共用 */

const SAMPLES = SPINES.map((sp) => spineSamples(sp, 14));

/** 沿脊线稠密采样：位置、切向、两侧半宽 */
export function spineSamples(sp, perSpan = 10) {
  const pts = sp.nodes;
  const curve = catmull(pts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  const out = [];
  const n = (pts.length - 1) * perSpan + 1;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = curve.point(t);
    const tan = curve.tangent(t);
    const k = t * (pts.length - 1);
    const a = pts[Math.min(pts.length - 1, Math.floor(k))];
    const b = pts[Math.min(pts.length - 1, Math.ceil(k))];
    const f = k - Math.floor(k);
    out.push({
      x: p.x, y: p.y, z: p.z, tx: tan.x, tz: tan.z,
      w: lerp2(a.w, b.w, f), e: lerp2(a.e, b.e, f), len: 0,
    });
  }
  for (let i = 1; i < out.length; i++) {
    out[i].len = out[i - 1].len + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
  }
  out.total = out[out.length - 1].len;
  return out;
}

/** 某脊线在参数 u(0..1) 处的头高与位置；机位与山体共用 */
export function crestAt(spineIndex, u) {
  const s = SAMPLES[spineIndex];
  const i = Math.min(s.length - 1, Math.max(0, Math.round(u * (s.length - 1))));
  const p = s[i];
  return { x: p.x, y: p.y, z: p.z, w: p.w, e: p.e, tx: p.tx, tz: p.tz };
}

/** 主脊上第 i 节（0..8）的中点 */
export function sectionMid(i) {
  return crestAt(0, (i + 0.5) / 9);
}

/** 每根脊线的包围盒，查询先做粗筛 */
const BOX = SAMPLES.map((s) => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of s) {
    x0 = Math.min(x0, p.x - p.w - 40); x1 = Math.max(x1, p.x + p.e + 40);
    z0 = Math.min(z0, p.z - 90); z1 = Math.max(z1, p.z + 90);
  }
  return { x0, x1, z0, z1 };
});

/**
 * 全山高度场：取各脊线贡献的最大值，再叠一层大尺度起伏。
 * 横断面让脊线附近圆厚、山脚摊平——低岭才像低岭。
 */
export function terrainHeight(x, z) {
  let h = -1;
  for (let k = 0; k < SAMPLES.length; k++) {
    const b = BOX[k];
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    for (const p of SAMPLES[k]) {
      const dx = x - p.x, dz = z - p.z;
      const along = dx * p.tx + dz * p.tz;
      const lat = dx * p.tz - dz * p.tx;                 // 法向距离，+ 为东
      const half = lat < 0 ? p.w : p.e;
      const s = Math.abs(lat) / half;
      if (s >= 1) continue;
      const taper = Math.exp(-Math.pow(Math.max(0, Math.abs(along) - 26) / 175, 2));
      const v = p.y * Math.pow(1 - Math.pow(s, 1.7), 1.15) * (0.32 + 0.68 * taper);
      if (v > h) h = v;
    }
  }
  if (h < 0) return -0.8;
  const crestness = Math.min(1, Math.max(0, h / 90));
  h += (Math.sin(x * 0.0112 + z * 0.0071) * 2.6 + Math.sin(z * 0.021 - x * 0.0064) * 1.9)
    * (0.28 + 0.72 * crestness);
  return h;
}

/** 地表陡度（0..1）：崖壁显石、缓坡显土 */
export function steepness(x, z) {
  const d = 7;
  const hx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d);
  const hz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d);
  return Math.min(1, Math.hypot(hx, hz) / 0.6);
}

/* ------------------------------------------------------------------ 名物方位 */

/**
 * 山上的名物都在这张表里，几何与机位都从这里取点。
 * u 是主脊参数（0 北端、1 南端），off 是相对脊线的横向偏移：负为湖那一面、正为环内。
 */
export const FEATURES = {
  /** 放鹤亭：北宋元丰元年（1078）山人张天骥建，"山人之亭，适当其缺" */
  pavilion: { u: 0.505, off: -0.14, rot: -Math.PI / 2 },
  /** 饮鹤泉：亭南稍低处一泓 */
  spring: { u: 0.545, off: 0.06 },
  /** 招鹤亭：泉与亭之间 */
  callpav: { u: 0.585, off: 0.22, rot: -Math.PI / 2 },
  /** 观景台：今构，位置写意，台面朝西 */
  terrace: { u: 0.42, off: -0.26, rot: -Math.PI / 2 },
  /** 兴化禅寺与北魏大石佛：山东麓，殿门朝东、佛在殿后崖上 */
  temple: { u: 0.585, off: 0.70, rot: Math.PI / 2 },
  /** 摩崖龛像：寺北一段西向崖，写意作七组、共 71 龛 */
  niches: { u: 0.505, off: 0.30, rot: -Math.PI / 2 },
  /** 大士岩：山西麓，清康熙五十八年（1719）知州姜焯建 */
  dashiyan: { u: 0.665, off: -0.55, rot: Math.PI / 2 },
  /** 云龙书院：山西麓半山坡，清康熙六十年（1721）创 */
  academy: { u: 0.735, off: -0.40, rot: Math.PI / 2 },
  /** 黄茅冈：写意列在南起头两段的西坡，乱石南北走向 */
  huangmao: { u: 0.815, off: -0.62, rot: Math.PI / 2 },
  /** 东坡石床：3.3 × 1.3 × 1.75 米（可考尺寸） */
  bed: { u: 0.80, off: -0.68 },
  /** "黄茅冈"题刻壁：石壁长 3 米、高 1 米，字约 80×50 厘米 */
  gangWall: { u: 0.835, off: -0.70 },
  /** 山西峭壁上的题记带 */
  cliffBand: { u: 0.615, off: -0.48 },
};

/** 把 FEATURES 的（u, off）解成世界坐标与地面高 */
export function site(key) {
  const f = typeof key === 'string' ? FEATURES[key] : key;
  const c = crestAt(0, f.u);
  const a = crestAt(0, Math.max(0, f.u - 0.005));
  const b = crestAt(0, Math.min(1, f.u + 0.005));
  const tx = b.x - a.x, tz = b.z - a.z;
  const L = Math.hypot(tx, tz) || 1;
  const ux = tx / L, uz = tz / L;          // 单位切向（南行）
  const nx = uz, nz = -ux;                 // 单位法向：+ 指向东
  const lat = f.off < 0 ? f.off * c.w : f.off * c.e;
  const x = c.x + nx * lat, z = c.z + nz * lat;
  const y = terrainHeight(x, z);
  // 山坡在这一点的朝向：用两点差分的高程梯度
  const gx = (terrainHeight(x + 10, z) - terrainHeight(x - 10, z)) / 20;
  const gz = (terrainHeight(x, z + 10) - terrainHeight(x, z - 10)) / 20;
  return { x, y, z, ux, uz, nx, nz, gx, gz, crest: c };
}

const P = site('pavilion');
const SPRING = site('spring');
const CALL = site('callpav');
const TERRACE = site('terrace');
const TEMPLE = site('temple');
const NICHES = site('niches');
const DASHI = site('dashiyan');
const ACADEMY = site('academy');
const HUANG = site('huangmao');
const BED = site('bed');

export const SITES = {
  pavilion: P, spring: SPRING, callpav: CALL, terrace: TERRACE,
  temple: TEMPLE, niches: NICHES, dashiyan: DASHI, academy: ACADEMY,
  huangmao: HUANG, bed: BED,
};

/* ------------------------------------------------------------------ 湖与城 */

export const LAKE = {
  /** 湖在山之西（"东依云龙山"可考）；面积各源所说不一，故只给写意轮廓 */
  xWest: -1560, zFrom: -1560, zTo: 1560,
  /** 岸线：随山脚西退的一条折线（写意） */
  shore: [
    [-250, -1420], [-300, -1080], [-336, -720], [-322, -420],
    [-300, -140], [-312, 160], [-348, 460], [-330, 760], [-296, 1060], [-250, 1420],
  ],
  /** 长堤/湖中路：今构，写意。放在湖北段，免得从山巅西望时一条堤横在亭子背后 */
  causeway: { xFrom: -1160, xTo: -268, z: -640, width: 9.5 },
};

/** 城在环内与山北：今市写意，只给体势与灯火 */
export const CITY = {
  groundY: CITY_Y,
  blocks: [
    { x0: 150, x1: 440, z0: -140, z1: 540, h: [6, 15], rows: 7 },      // 环内（彭祖园一带）
    { x0: -300, x1: 480, z0: -1420, z1: -660, h: [5, 14], rows: 9 },   // 山北：市区压到山前
    { x0: 520, x1: 900, z0: -860, z1: 660, h: [7, 22], rows: 8 },      // 以东
  ],
  towers: [
    { x: 640, z: 60, h: 74 }, { x: 700, z: -200, h: 92 }, { x: 580, z: 340, h: 62 },
    { x: 300, z: -880, h: 58 }, { x: 40, z: -1250, h: 46 }, { x: 820, z: 220, h: 68 },
  ],
  /** 湖对岸：只在西岸远处留一条，绝不进水面 */
  westBank: { x0: -1520, x1: -1250, z0: -1200, z1: 1200, h: [4, 11], rows: 5 },
};

/** 索道：西站临湖、东站在环内（尺度可考：全长约 1200 米、垂直高差 88 米） */
export const CABLE = {
  west: { x: -300, z: 300 },
  east: { x: 400, z: 250 },
  spanMeters: 1200,
  riseMeters: 88,
  cabins: 7,
};

/** 登山道与堤上游路：折线（x,z），y 由 terrainHeight 决定 */
export const PATHS = {
  /** 自湖岸经摩崖、大士岩上至放鹤亭 */
  west: [
    [-268, -60], [-250, 60], [-230, 170], [-208, 270], [-190, 330],
    [-176, 250], [-160, 150], [-132, 50], [-98, -40], [-72, -140], [-60, -205],
  ],
  /** 环内自寺前上坡至亭后 */
  east: [
    [190, -120], [150, -112], [112, -98], [66, -80], [16, -62], [-26, -96], [-52, -168],
  ],
  /** 书院至黄茅冈的一径 */
  south: [[-166, 380], [-186, 470], [-206, 570], [-220, 660], [-212, 762]],
  /** 堤上 */
  causeway: [[-1150, -640], [-700, -640], [-280, -640]],
};

/* ------------------------------------------------------------------ 机位 */

/**
 * 机位约定：`at:[x,z]` 或 `site:'名物'` 定站脚，`hOff` 是眼高（相对该点地面），
 * `look:[x,z,lift]` 是视点（lift 为该点地面之上的高度），`mark` 同法。
 * 于是山一动，眼高、视线与热点锚点都跟着动。
 */
export const STATIONS = [
  {
    id: 'lake',
    name: '湖西 · 冈岭四合',
    short: '湖西',
    at: [-760, -230], hOff: 2.2,
    look: [P.x, P.z, 8],
    mark: [-430, -230, 12],
    era: '云龙湖 · 山之西',
    lead: '从湖上看，这座山是一只缺了西面的环。',
    body: '《放鹤亭记》开头写"彭城之山，冈岭四合，隐然如大环，独缺其西一面"——苏轼把徐州的山算成一张合围，只在西边留一道口子。夜里从湖西望过去，主脊南北横展，北支与南支折向东去，环内的城灯从缺口的两边露出来。山长三公里、分九节、主峰海拔 142 米，这些数字在暗处看不出，看得出的是那条压在湖面上的平脊。',
    tags: ['大环缺西', '海拔 142 米', '湖在山西'],
  },
  {
    id: 'causeway',
    name: '长堤 · 水面灯',
    short: '堤上',
    at: [-720, -640], hOff: 1.8, floorY: 1.55,
    look: [-300, -580, 40],
    mark: [-520, -640, 3],
    era: '湖中路 · 今构',
    lead: '堤把湖切成两半，灯一根一根插在水里。',
    body: '云龙湖在云龙山之西，"东依云龙山"是它靠得住的定位；湖的水域面积各源所说不一，这里只按写意铺开水面，不标数字。今日的长堤与滨湖路都是近世所治，不是宋时的湖形。夜里堤上的灯离水面只有一人多高，灯影被波纹揉成一条竖光——山在上面是一整块黑，水在下面也是一整块黑，亮着的只有这一排灯和山脊上几点寺观的灯。',
    tags: ['今堤非古', '贴水灯', '不写湖面数字'],
  },
  {
    id: 'gap',
    name: '西山之缺 · 望湖',
    short: '缺口',
    site: 'pavilion', hOff: 2.3,
    look: [-860, 40, 7],
    mark: [-330, 0, 8],
    era: '元丰元年 · 适当其缺',
    lead: '亭子正对着那道缺口，鹤每天早上从这里飞出去。',
    body: '"山人之亭，适当其缺"——亭建在环缺之处，也就是朝西这一面。记中又写山人所养二鹤"旦则望西山之缺而放焉"，天亮把鹤朝西边的缺口放出去，任其所往，入夜再从东山那边回来。所以站在这里，眼下是湖与一城的灯，身后是山。苏轼当年大概也是这个站位，只是他看见的是白天的水。',
    tags: ['适当其缺', '旦放暮归', '记中原文'],
  },
  {
    id: 'crane',
    name: '放鹤亭 · 亭形',
    short: '亭上',
    at: [P.x + 17, P.z + 9], hOff: 1.8,
    look: [P.x, P.z, 5.2],
    mark: [P.x, P.z, 5.6],
    era: '北宋 1078 · 张天骥建',
    lead: '一座长条形的亭子，南北长 11.95 米、东西深 4.95 米。',
    body: '放鹤亭在云龙山巅，北宋元丰元年（1078）由隐于山中的张天骥所建，因苏轼一记而传。亭的形制有可核的数：南北长 11.95 米，东西深 4.95 米——比常见的方亭窄长得多，更像一段敞廊。明嘉靖十一年、清同治十一年与 1979 年都重修过，今天的样子是几层后人叠上来的。亭旁有饮鹤泉、招鹤亭，名字都还守着记里那两只鹤。',
    tags: ['11.95×4.95 米', '1078 年建', '三次重修'],
  },
  {
    id: 'spring',
    name: '饮鹤泉 · 山顶一泓',
    short: '泉上',
    site: 'spring', hOff: 1.6,
    look: [SPRING.x - 8, SPRING.z - 26, 2.2],
    mark: [SPRING.x, SPRING.z, 1.4],
    era: '亭侧 · 泉在冈上',
    lead: '山上有一口泉，鹤下来喝它。',
    body: '饮鹤泉在放鹤亭旁，是低岭顶上的一小片水——泉不大，但因为高，夜里接得住月亮与灯的碎影。泉与亭、与招鹤亭同属一组以鹤为题的地名：记里只写了亭与二鹤，泉与"招鹤"这些名字是后人陆续点出来的，属补配。站着看，泉面比人的膝盖还低，得低头，这跟"升高而望，得异境焉"的亭正相反。',
    tags: ['山巅之泉', '接月', '题名后补'],
  },
  {
    id: 'buddha',
    name: '兴化禅寺 · 大石佛',
    short: '佛前',
    site: 'temple', hOff: 1.8,
    look: [TEMPLE.x - 6, TEMPLE.z, 9],
    mark: [TEMPLE.x, TEMPLE.z, 7],
    era: '北魏凿像 · 明洪武建殿',
    lead: '一尊依山崖雕出来的半身坐佛，通高三丈六尺。',
    body: '兴化禅寺在云龙山东麓，寺中的北魏大石佛依山崖巨石雕成，是一尊半身坐像：上半身出自石，下半与崖连成一体。高度诸源都记作约三丈六尺，合 11.52 米；始凿年代则两说并存——一记北魏正平（政平）年间约 450 年，一记孝文帝太和十年（486 年）。明洪武三十一年（1398）才缘佛始建大殿，把崖与像收到殿中；寺内现存明代形制的钟鼓楼、祖堂、藏经楼，还有一口重约三吨的铁钟。',
    tags: ['11.52 米', '450 / 486 两说', '1398 年建殿'],
  },
  {
    id: 'niche',
    name: '摩崖龛像 · 七组七一龛',
    short: '龛壁',
    site: 'niches', hOff: 1.6,
    look: [NICHES.x + 14, NICHES.z, 8],
    mark: [NICHES.x + 4, NICHES.z, 7],
    era: '唐宋 · 造像与题记',
    lead: '崖壁上七组龛，共 71 龛、195 尊。',
    body: '云龙山的摩崖造像是这座山真正的旧账：唐宋所凿的龛像共 71 龛、造像 195 尊，另有题记 38 段（一说"七组 195 尊"，并传 1993 年发掘，此处取两源同数的 71 与 195）。龛在崖面上，白天要斜着走才看得清；夜里把一盏灯贴着壁面横扫，石面的高低才跳出来——字与像都读不分明，能分明的是哪一块凿过、哪一块只是风化。',
    tags: ['71 龛 195 尊', '38 段题记', '斜光显刻'],
  },
  {
    id: 'dashiyan',
    name: '大士岩 · 雕巨石为观音',
    short: '大士岩',
    site: 'dashiyan', hOff: 1.7,
    look: [DASHI.x - 12, DASHI.z + 6, 5],
    mark: [DASHI.x, DASHI.z, 4],
    era: '清康熙五十八年 · 1719',
    lead: '一块巨石被雕成观音，它本来是放鹤亭的僧舍。',
    body: '大士岩在山西麓，清康熙五十八年（1719）由徐州知州姜焯主持，就着崖间巨石雕成观音像；其地原是放鹤亭的僧舍——亭与寺在这一段山坡上本连着。岩前一带有唐至清的摩崖石刻多处，与龛像同属一面崖。夜里的光只从像的右前方来，正面留暗，"巨石"两个字才看得出来。',
    tags: ['1719 年', '本为僧舍', '唐至清刻'],
  },
  {
    id: 'academy',
    name: '云龙书院 · 七进',
    short: '书院',
    site: 'academy', hOff: 1.7,
    look: [ACADEMY.x - 10, ACADEMY.z - 18, 5],
    mark: [ACADEMY.x, ACADEMY.z, 4.6],
    era: '清康熙六十年 · 1721',
    lead: '七进院子顺着山坡一级一级往上排。',
    body: '云龙书院创于清康熙六十年（1721），雍正十三年（1735）由徐州知府李根云改建，在山西麓的半山坡上。辛亥革命后原有建筑损毁，1996 年局部修复，2014 年全面重建为今天的七进院落——所以眼前这一串屋子是新的，只有山、坡与它的位置是旧的。另有记载把此院与近人徐树铮、张伯英连在一起，出自单一来源，姑存其名。夜里只点前两进的灯，往后各进留暗：一个书院不会把七进同时亮着。',
    tags: ['1721 / 1735', '2014 重建', '七进院落'],
  },
  {
    id: 'huangmao',
    name: '黄茅冈 · 乱石如群羊',
    short: '黄茅冈',
    site: 'huangmao', hOff: 1.8,
    look: [HUANG.x + 14, HUANG.z + 30, 3],
    mark: [HUANG.x, HUANG.z, 3],
    era: '山西坡 · 苏诗所走上',
    lead: '一道南北走向的冈，满冈的石头散得像羊群。',
    body: '黄茅冈在云龙山南起头两段的西坡，南北走向，冈上乱石散布。苏轼元丰元年（1078）在徐州写的《登云龙山》就起手在这里："醉中走上黄茅冈，满冈乱石如群羊。冈头醉倒石作床，仰看白云天茫茫"，末了落到"拍手大笑使君狂"——一个喝多了的知州被路人指着笑。这些石头夜里没有白云可看，只有月色把每一块的下缘留黑，羊群的样子反倒更清楚。',
    tags: ['满冈乱石如群羊', '元丰元年作', '节次为写意'],
  },
  {
    id: 'bed',
    name: '东坡石床 · 冈头一卧',
    short: '石床',
    site: 'bed', hOff: 1.5,
    look: [BED.x + 6, BED.z + 4, 1.6],
    mark: [BED.x, BED.z, 1.9],
    era: '石床 3.3×1.3×1.75 米',
    lead: '一块顶面磨平的巨石，据说他在这里睡过。',
    body: '"冈头醉倒石作床"——东坡石床在黄茅冈上，尺寸可核：长 3.3 米、宽 1.3 米、高 1.75 米，是冈上一块顶面被磨平的巨石，市级文物保护单位。西侧崖面有"洞天"摩崖，清乾隆年间杨四知题。"黄茅冈"三字另有一源记为明王守仁题、清乾隆重书，刻在长 3 米、高 1 米的石壁上，单字约 80×50 厘米——此说仅见一处，姑存。夜里这一处只用一盏极低的光贴石面扫过去，磨光的痕才显出来。',
    tags: ['3.3×1.3×1.75 米', '"洞天"题刻', '王守仁说存疑'],
  },
  {
    id: 'cable',
    name: '索道 · 横越山脊',
    short: '索上',
    at: [-24, 292], hOff: 112,
    look: [240, 250, 30],
    mark: [30, 292, 108],
    era: '今构 · 全长约 1200 米',
    lead: '一根钢丝绳从湖这边翻过山脊，掉到城里去。',
    body: '云龙山索道横穿山体，西站在湖这一侧、东站在环内对着彭祖园；一源记其全长约 1200 米、垂直高差 88 米。索道的建成年份没查到可靠说法，所以这里只按可核的尺度摆它与吊箱，不写年代。夜里吊箱是山上一串移动的光点：从湖西望过来，那几个亮点正好指出山脊的高度——看不见山的时候，就看见这几个灯走到哪儿、停在哪儿。',
    tags: ['1200 米 / 88 米', '年代无考', '移动光点'],
  },
  {
    id: 'terrace',
    name: '观景台 · 城在山下',
    short: '台上',
    site: 'terrace', hOff: 2.0,
    look: [300, -1200, 6],
    mark: [TERRACE.x, TERRACE.z, 4],
    era: '今构 · 年代无考',
    lead: '台上看的不是山，是山外面那座城。',
    body: '观景台是今构，建成的年份没查到可靠说法，位置也按观感写意放在主脊偏北的一段。徐州的老城在山的北边与东边，从台上望过去，屋脊与街灯一直铺到看不见的地方；苏轼当年在这里望的是"冈岭四合"的那张环，今天的环里全是电灯。台上这一圈栏杆与灯是夜景里最亮的一块，所以从湖西看山，山顶的亮点其实多半来自这里，而不是来自千年前的那些龛。',
    tags: ['今构不写年代', '城北与山东', '灯最好处'],
  },
  {
    id: 'aerial',
    name: '鸟瞰 · 大环与缺',
    short: '鸟瞰',
    at: [-1080, 300], hOff: 300,
    look: [-20, -80, 40],
    mark: null,
    era: '山的形状由那句记决定',
    lead: '抬起来看，山是 U 形，开口朝西，湖在口里。',
    body: '从湖上空的西边抬眼，全山是一只朝西开口的环：主脊纵贯南北，两支折向东合拢，环内是城。这个形状不是测绘来的，是按"冈岭四合，隐然如大环，独缺其西一面"摆的——山九节、长三公里、主峰 142 米是可考的数，但九节自哪一头起数、各节的起讫在哪里都没有定说，所以这里画的是苏轼那句话说出来的山，不是地图上的山。山上诸迹：北魏的佛、唐宋的龛、元丰元年的亭、康熙年间的岩与书院，各朝各占一段坡。',
    tags: ['全景', '环与缺', '按记文摆山'],
  },
];

/** 山脊灯：九节各一处，自北而南次第亮起（招牌交互的第二个动作） */
export const RIDGE_LAMPS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
  const c = sectionMid(i);
  return { section: i + 1, x: c.x, z: c.z, y: c.y };
});

export const DEFAULTS = {
  lamp: 100,
  niche: 55,
  pine: 100,
  ripple: 100,
  bloom: 30,
  crane: false,
  reflect: true,
  labels: true,
  tour: false,
  autoQuality: true,
};

/* ------------------------------------------------------------------ 小工具 */

// 函数声明会提升：SAMPLES 在模块顶部就要用到它
function lerp2(a, b, t) { return a + (b - a) * t; }

/** Catmull-Rom：与 kit.pathFrames 同一类插值，这里只要 x/y/z 与水平切向 */
function catmull(vs) {
  const n = vs.length;
  const at = (i) => vs[Math.min(n - 1, Math.max(0, i))];
  const point = (t) => {
    const k = t * (n - 1);
    const i = Math.floor(k);
    const f = k - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const o = {};
    for (const c of ['x', 'y', 'z']) {
      const v0 = (p2[c] - p0[c]) * 0.5;
      const v1 = (p3[c] - p1[c]) * 0.5;
      o[c] = p1[c] + v0 * f + (3 * (p2[c] - p1[c]) - 2 * v0 - v1) * f * f
        + (v0 + v1 - 2 * (p2[c] - p1[c])) * f * f * f;
    }
    return o;
  };
  const tangent = (t) => {
    const a = point(Math.max(0, t - 0.004));
    const b = point(Math.min(1, t + 0.004));
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    return { x: dx / L, z: dz / L };
  };
  return { point, tangent };
}
