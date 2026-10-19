/**
 * 狼山 · 江海第一山 夜景写意三维重建的尺寸、机位与解说。
 *
 * 坐标单位为米：-Z 为北，+X 为东，y=0 是长江水面。
 * 史实锚点（两处以上来源互证，可写进解说）：
 *   狼山在南通城南约六公里、长江北岸、西临长江，海拔 106.94 米（一作 109 米）；
 *   与军山、剑山、马鞍山、黄泥山沿长江呈弧形排列，通称五山；
 *   广教寺始建于唐总章二年（669），开山为唐代高僧僧伽（大圣菩萨），狼山因此被定为
 *     大势至菩萨道场，称"中国佛教八小名山之首"（一作"十小名山"）；
 *   支云塔建于北宋太平兴国年间（976—983，一作至 984），高 35 米（另有一处记塔体 25.7 米），
 *     砖木结构楼阁式，四面五级（一说"五级四层"、一说"八角形"），由下向上次第收分、绕以木栏，
 *     刹顶相轮七重加宝珠与金铎；与文峰塔、光孝塔并称"南通三塔"；明万历、清康熙、1984 年修；
 *   骆宾王墓：明正德九年（1514）城北黄泥口开荒掘得一墓，清乾隆十三年（1748）经刘名芳查访
 *     断碑、请示知府董权文后迁葬狼山东南麓；前置四柱三间门楼式碑坊，嵌清道光二十二年（1842）
 *     "唐侍御史谥文忠骆公赠淑人范氏合墓"碑；与宋金应将军墓、清刘名芳（南庐）墓三墓并列；
 *     1983 年列南通市首批文物保护单位，1989 年 12 月重修；
 *   三仙祠原祀吕洞宾、张果老，清雍正三年（1725）重建；
 *   1980 年 4 月广教禅寺列为汉传地区全国重点寺院；1980 年起耗资五百余万元全面维修，
 *     先法乳堂、支云塔、圆通宝殿、大圣殿、三仙祠，后藏经楼、晒经楼、枕山楼、葵竹山房、萃景楼。
 * 存疑（解说里必须标出，不作定论）：塔高与层数两套数字、《狼山观海》系王安石还是范仲淹、
 *   "八小"还是"十小"名山、军山 108.5 米为五山之最与"狼山为五山之首"的两种口径、
 *   鉴真东渡泊狼山仅见一处、"入山之门"匾与 2001 年落成仅见一处。
 * 写意（画出来的，不是史实）：山体轮廓与体量、五山彼此方位间距、各建筑方位与间距、
 *   盘山石蹬的台阶数与长短、江面宽度与对岸地名、以及全山的夜景灯光——狼山没有常设夜游
 *   （一处记 08:30—16:30，一处记 8:00—18:00），"以袈裟遮山"是把降狼的传说画成一道光。
 */

/** 江面 0，堤内平地 6.5 */
export const GROUND = 6.5;
export const WATER_Y = 0;

/** 狼山主体：一座落在江海平原上的孤山 */
export const HILL = {
  cx: 30, cz: 10, ax: 160, az: 135,
  crest: 101.5,
  /** 西坡压扁：同一 r 下西坡更陡，做出临江湖崖 */
  westSteep: 0.72,
};

/** 台地：只削不填——顶面高取这一方矩形里最低那点的自然地面，整方就此削平，
 *  靠山那一面留一道崖，临坡那一面与自然坡接平。山顶寺院本来就一层层咬在山里。 */
export const PADS = {
  /** 塔院：山顶最高一方，支云塔与大圣殿 */
  tower: { x0: 0, x1: 54, z0: -26, z1: 28, feather: 5 },
  /** 殿台：圆通宝殿、法乳堂、萃景楼，顺着坡排成一列 */
  hall: { x0: 76, x1: 100, z0: -30, z1: 34, feather: 5 },
  /** 西崖顶：大观台与望江亭，长边顺着等高线 */
  cliff: { x0: -30, x1: 0, z0: -8, z1: 26, feather: 5 },
};

/**
 * 盘山石蹬：东南坡上三重折。折点用极坐标给（θ 为绕山方位角、r 为归一化半径），
 * 因为山的平面轮廓就是椭圆；路床纵断面后面按限坡贴出来。
 * 路止于殿台之南，塔院与殿台之间另上踏道。
 */
export const ROAD = {
  width: 3.4,
  zig: [
    [0.66, 1.13], [0.2, 1.0], [0.72, 0.91], [0.26, 0.82], [0.7, 0.73],
    [0.34, 0.65], [0.62, 0.57], [0.46, 0.52], [0.36, 0.5],
  ],
};
/** 极坐标 → 平面位置 */
export function roadPolar(theta, r) {
  return [HILL.cx + Math.cos(theta) * HILL.ax * r, HILL.cz + Math.sin(theta) * HILL.az * r];
}

/** 长江：在狼山之西，水面 y=0 */
export const RIVER = {
  shoreX: -196,
  xTo: -1760,
  zFrom: -1240,
  zTo: 1240,
  /** 对岸只是视线里一条低低的灯带，不写地名 */
  farBankX: -980,
};

/** 山顶广教寺与全山建筑的写意方位 */
export const TEMPLE = {
  /** 塔院台 */
  pagoda: { x: 28, z: 4, rot: 0 },
  dasheng: { x: 12, z: -11, rot: Math.PI / 2, bays: 3, bayW: 4.2, depth: 6.8, colH: 4.4, deck: 1.4, name: '大圣殿' },
  sanxian: { x: 12, z: 14, rot: Math.PI / 2, bays: 3, bayW: 3.2, depth: 5.4, colH: 3.6, deck: 1.1, name: '三仙祠', yellow: false },
  /** 殿台 */
  yuantong: { x: 88, z: 10, rot: Math.PI / 2, bays: 3, bayW: 4.6, depth: 8.4, colH: 5.2, deck: 1.2, name: '圆通宝殿' },
  faru: { x: 87, z: -16, rot: Math.PI / 2, bays: 3, bayW: 3.4, depth: 6.0, colH: 4.0, deck: 1.2, name: '法乳堂', yellow: false },
  cuijing: { x: 87, z: 24, rot: Math.PI / 2, w: 6.4, d: 5.4 },
  /** 山门台 */
  gate: { x: 93, z: 24, rot: Math.PI / 2, width: 5.2, height: 4.4, name: '入山之门' },
  /** 西崖：一方临水的台加一座八角重檐亭 */
  daxiang: { x: -18, z: 16, w: 13, d: 9 },
  pavilion: { x: -18, z: 3, rot: 0, half: 2.9, name: '江山如画' },
  /** 临江摩崖：朝江的一面石壁，上刻"第一山"（传米芾书，立石年代无考） */
  cliffWall: { x: -38, z: -56, rot: -Math.PI / 2 - 0.3, w: 24, h: 12 },
};

/** 骆宾王墓区：狼山东南麓，三墓并列、前置四柱三间石坊 */
export const TOMB = {
  x: 176, z: 104, rot: -0.62,
  moundR: 2.7,
  /** 坊在墓前（明间朝东南） */
  archway: { dx: -12.5, dz: 0 },
  companions: [[-1.5, -7.2], [-1.5, 7.2]],
  walls: { w: 30, d: 22 },
};

/** 五山的写意方位：沿江弧形排列，狼山居中，余四山只作远影（次序与间距无测绘依据） */
export const SISTER_HILLS = [
  { name: '剑山', x: 10, z: -270, ax: 86, az: 58, h: 58 },
  { name: '黄泥山', x: -140, z: -360, ax: 70, az: 50, h: 40 },
  { name: '马鞍山', x: 150, z: -190, ax: 62, az: 44, h: 38 },
  { name: '军山', x: 140, z: 230, ax: 100, az: 66, h: 64 },
];

/* ------------------------------------------------------------------ 地形函数 */

const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** 纯山体轮廓（不含台地与路槽），盘的纵断面在它上面平滑出来 */
export function baseHeight(x, z) {
  const dx = (x - HILL.cx) / HILL.ax;
  const dz = (z - HILL.cz) / HILL.az;
  const ang = Math.atan2(dz, dx);
  let r = Math.hypot(x < HILL.cx ? dx / HILL.westSteep : dx, dz);
  r *= 1 + 0.085 * Math.sin(ang * 3 + 0.7) + 0.045 * Math.sin(ang * 5 - 1.4);
  const dome = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, r), 1.85)), 1.16);
  let y = GROUND + (HILL.crest - GROUND) * dome;
  const skirt = Math.max(0, 1 - Math.pow(Math.max(0, r - 0.92) * 3.4, 2));
  return GROUND + (y - GROUND) * skirt;
}

/** 折线按弧长加密；纵断面逐点限坡，路因此是"贴"在坡上走的，不是悬在半山的台 */
let roadSamples = null;
const GRADE_UP = 0.6;
const GRADE_DOWN = 0.3;
function roadLine() {
  if (roadSamples) return roadSamples;
  const pts = ROAD.zig.map(([a, r]) => roadPolar(a, r));
  const dense = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(L / 1.8));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      dense.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, acc + L * t]);
    }
    acc += L;
  }
  dense.push([pts.at(-1)[0], pts.at(-1)[1], acc]);
  let prev = baseHeight(dense[0][0], dense[0][1]);
  dense.forEach((d, i) => {
    const target = baseHeight(d[0], d[1]);
    const ds = i === 0 ? 0 : d[2] - dense[i - 1][2];
    const hi = prev + GRADE_UP * ds;
    const lo = prev - GRADE_DOWN * ds;
    prev = Math.min(hi, Math.max(lo, target));
    d.push(prev);
  });
  roadSamples = { pts: dense, length: acc };
  return roadSamples;
}

/** 路床顶高（dist 为沿路弧长） */
export function roadY(dist) {
  const { pts } = roadLine();
  let i = 1;
  while (i < pts.length && pts[i][2] < dist) i++;
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i)];
  const k = b[2] === a[2] ? 0 : (dist - a[2]) / (b[2] - a[2]);
  return a[3] + (b[3] - a[3]) * k;
}

function padWeight(x, z, p) {
  const fx = Math.min(x - p.x0, p.x1 - x) / p.feather;
  const fz = Math.min(z - p.z0, p.z1 - z) / p.feather;
  const f = Math.min(fx, fz);
  return f >= 1 ? 1 : f <= 0 ? 0 : smooth(f);
}

const PAD_KEYS = Object.keys(PADS);

/**
 * 台地顶面：取方内最低点的自然地面（再落 0.4 米），整方就此削平。
 * 建筑因此总站在真平地上，而不是悬在写死的数字上。
 */
for (const key of PAD_KEYS) {
  const p = PADS[key];
  let low = Infinity;
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 12; j++) {
      const v = baseHeight(p.x0 + (p.x1 - p.x0) * (i / 12), p.z0 + (p.z1 - p.z0) * (j / 12));
      if (v < low) low = v;
    }
  }
  p.y = p.yFixed !== undefined ? p.yFixed : Math.round((low - 0.4) * 10) / 10;
}

/** 该点被台地/路槽压平的程度：0 纯自然坡，1 人工平场 */
function flatnessAt(x, z) {
  let f = 0;
  for (const key of PAD_KEYS) f = Math.max(f, padWeight(x, z, PADS[key]));
  const line = roadLine();
  let best = 1e9;
  for (const [px, pz] of line.pts) {
    const dd = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (dd < best) best = dd;
  }
  const hd = Math.sqrt(best), rw = ROAD.width * 0.5 + 6.5;
  if (hd < rw) f = Math.max(f, hd <= ROAD.width * 0.5 ? 1 : 1 - smooth((hd - ROAD.width * 0.5) / 6.5));
  return Math.min(1, f);
}

/**
 * 山体高度场。西坡压扁成临江湖崖，东南坡缓下来接平原，
 * 山体被盘山路切出一条槽、被五方台地削平顶。
 */
export function heightAt(x, z) {
  let y = baseHeight(x, z);
  // 石骨先加在自然面上，台地与路槽再把它压掉
  const rock = 1.9 * Math.sin(x * 0.055 + 1.3) * Math.sin(z * 0.049 - 0.7)
    + 1.2 * Math.sin(x * 0.108 - z * 0.083) + 0.8 * Math.sin(x * 0.2 + z * 0.17);
  y += rock;

  const line = roadLine();
  let best = 1e9, bestDist = 0;
  for (const [px, pz, d] of line.pts) {
    const dd = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (dd < best) { best = dd; bestDist = d; }
  }
  const hd = Math.sqrt(best), rw = ROAD.width * 0.5;
  if (hd < rw + 6.5) {
    const w = hd <= rw ? 1 : 1 - smooth((hd - rw) / 6.5);
    y = y + (roadY(bestDist) - y) * w * 0.95;
  }

  for (const key of PAD_KEYS) {
    const p = PADS[key];
    const w = padWeight(x, z, p);
    if (w > 0) y = y + (Math.min(y, p.y) - y) * w;   // 只削不填
  }

  // 江：堤外一路沉到水下
  if (x < RIVER.shoreX) {
    const t = Math.min(1, (RIVER.shoreX - x) / 46);
    y = y + (-7.5 - y) * t;
  }
  return y;
}

/** 地表陡度：0 缓坡、1 崖，用于着色与光幕贴合 */
export function steepness(x, z) {
  const d = 6;
  const gx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
  const gz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
  return Math.min(1, Math.hypot(gx, gz) * 1.3);
}

/** 取一个落点：位置、顶面高 */
export function site(x, z, lift = 0) {
  return { x, z, y: heightAt(x, z) + lift };
}

/** 沿盘山路取一点（t: 0..1）：XZ、路床顶、切向 */
export function roadAt(t) {
  const { pts, length } = roadLine();
  const want = Math.min(1, Math.max(0, t)) * length;
  let i = 1;
  while (i < pts.length && pts[i][2] < want) i++;
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i)];
  const k = b[2] === a[2] ? 0 : (want - a[2]) / (b[2] - a[2]);
  return {
    x: a[0] + (b[0] - a[0]) * k,
    z: a[1] + (b[1] - a[1]) * k,
    y: roadY(want),
    dx: b[0] - a[0], dz: b[1] - a[1],
  };
}

/** 路的总长，机位与灯都按它排 */
export const roadLength = () => roadLine().length;

/* ------------------------------------------------------------------ 机位 */

export const STATIONS = [
  {
    id: 'jiang',
    name: '江上 · 一望入紫琅',
    short: '江上',
    pos: [-392, 13, 96],
    look: [18, 84, 2],
    mark: [26, 122, 0],
    era: '长江北岸 · 自西望山',
    lead: '江面上先看见的是塔，然后才是山。',
    body: '狼山海拔 106.94 米（一处记作 109 米），搁在江海平原上并不起眼，可它是这一带唯一从江里立起来的东西——原为长江中的孤岛，北宋时才与北岸涨接。山顶那座北宋的支云塔高 35 米，把山的轮廓又举出一截。夜里山的西崖只剩一条黑边，能读出体量的全是灯：塔的五层窗光、盘山石蹬上的一串、殿前那一片暖黄。',
    tags: ['西临长江', '海拔 106.94 m', '原为江中孤岛'],
  },
  {
    id: 'shore',
    name: '江堤 · 山脚与水线',
    short: '堤上',
    pos: [-176, GROUND + 1.6, 46],
    look: [40, 62, 6],
    mark: [-20, 88, 6],
    era: '山脚 · 驳岸与余脉',
    lead: '走到堤上抬头，山是从人家屋顶上直接长出来的。',
    body: '堤内这条平地是写意加的：把山的西脚与水线之间留出几十米，好放一段石堤、几处泊船的灯。西崖在这一面收得最紧——同一半径下西坡压扁了将近三成，才做出"独峭壁隆隆发数乾仞，疑造物者于此喜为斲刻以惊世也"那种被斫过的样子。山上岩石多呈紫色，北宋改称琅山之后，后人又叫它紫琅山，南通的雅称就从这里来。',
    tags: ['紫琅', '西崖写意', '堤与码头写意'],
  },
  {
    id: 'road',
    name: '盘山石蹬 · 夹道灯',
    short: '石蹬',
    pos: [150, 26.5, 74],
    look: [126, 26, 44],
    mark: [132, 30, 48],
    era: '蹬道 · 石路折上',
    lead: '路是把坡面切出一条槽来走的。',
    body: '登山的路在东南坡上盘旋，高度场里为它单独算了一段路床：纵断面是山体轮廓的滑动平均，低于地面就挖、高于地面就垒，两侧仍留自然坡的石骨。石蹬两旁的灯按"近处照亮路面、远处只留一点"来排。狼山的台阶数没有任何一处记载，这条路的长短与弯数都是按观感画的。',
    tags: ['路床贴坡', '台阶数无考', '夹道灯写意'],
  },
  {
    id: 'gate',
    name: '入山之门 · 半山一额',
    short: '山门',
    pos: [138, 35.4, 56],
    look: [128, 35, 45],
    mark: [128, 38, 45],
    era: '半山 · 寺门之前',
    lead: '山门不在山脚，在半山——还得再走一程。',
    body: '广教寺分山上山下两处：大佛殿、轮藏殿、大悲殿、金刚殿在山下，山门、萃景楼、圆通宝殿、大圣殿与支云塔在山顶。这里画的是半山的一道门，额上"入山之门"四字与其形制只见于通行说法，不敢当作古物；门上两盏灯、门侧一株古木，都是为夜里给登山的人一个"到了"的记号。',
    tags: ['山上山下两轴', '匾额写意', '半山台地'],
  },
  {
    id: 'hall',
    name: '圆通宝殿 · 山顶灯坪',
    short: '殿前',
    pos: [104, 90.3, 16],
    look: [88, 91, 4],
    mark: [88, 93, 4],
    era: '山顶 · 唐总章二年以来的香火',
    lead: '山顶这一方平台是全山最亮的地方，也是香火最热的地方。',
    body: '广教寺开创于唐总章二年（669），开山的是唐代高僧僧伽——也就是民间的大圣菩萨；狼山因此被定为大势至菩萨道场，列"中国佛教八小名山之首"（也有记作"十小名山"的）。现存山顶的殿宇是 1980 年以后陆续修复的：法乳堂、支云塔、圆通宝殿、大圣殿、三仙祠在先，藏经楼、晒经楼、枕山楼、葵竹山房、萃景楼在后。殿的间数、台地的方寸都按观感重排过。',
    tags: ['唐总章二年 669', '大势至菩萨道场', '1980 年后重修'],
  },
  {
    id: 'faru',
    name: '法乳堂 · 十八高僧之壁',
    short: '法乳堂',
    pos: [66, 89.4, -12],
    look: [74, 89, -8],
    mark: [73, 91, -8],
    era: '殿院西南 · 今人之壁',
    lead: '堂名是赵朴初题的，壁上刻的是十八个做过事的高僧。',
    body: '法乳堂今壁嵌十八幅高僧画像，取"法乳"意为佛法如乳养人；额由赵朴初题。巨赞有一联"江海大观，米芾数名山第一；高僧十八，精蓝澍法乳无穷"——把这座堂与山上那块"第一山"石刻系在一处。画像为近人所作，故这一处不作古物看，只作"山上到今天还在被添东西"的证据。',
    tags: ['赵朴初题额', '十八格·近人作', '巨赞联'],
  },
  {
    id: 'pagoda',
    name: '支云塔下 · 五级四面',
    short: '塔下',
    pos: [26, 99.2, 24],
    look: [26, 124, 0],
    mark: [26, 126, 0],
    era: '北宋太平兴国年间 976—984',
    lead: '站在塔根往上退，五层檐把一百米的山头又举高了三十五米。',
    body: '支云塔建于北宋太平兴国年间（976—983，一作至 984 年），高 35 米，砖木结构的楼阁式塔，四面五级（另有"五级四层"与"八角形"两说；塔体高度另有一处记作 25.7 米），每层绕以木栏、由下向上次第收分，刹顶是相轮七重加宝珠与金铎。它与城里的文峰塔、光孝塔并称"南通三塔"。明万历、清康熙与 1984 年都修过。',
    tags: ['高 35 m（一说 25.7 m）', '四面五级', '相轮七重·金铎'],
  },
  {
    id: 'cliff',
    name: '大观台 · 西崖对月',
    short: '望江',
    pos: [-14, 89.4, 18],
    look: [-320, 70, -20],
    mark: [-20, 90, 6],
    era: '崖顶 · 江与月之间',
    lead: '一脚踩空的地方立一座亭：脚下是江，江北岸是这座山。',
    body: '西崖是狼山最好的一面——近百米的高差直接落到水边。台上立一座八角重檐的亭，匾作"江山如画"，亭名与匾都取之通行说法，台子本身的方寸无考，故只写方位。江面在这里究竟多宽、对岸是哪个县，史料里没有实测，画面里就只留一条低低的灯带和一片水气。王安石（一说范仲淹）的《狼山观海》结句"遨游半在江湖里，始觉今朝眼界开"，"半在"一作"半是"。',
    tags: ['崖顶台与亭', '江宽岸名无考', '狼山观海'],
  },
  {
    id: 'luo',
    name: '骆宾王墓 · 石坊三墓',
    short: '墓门',
    pos: [158, GROUND + 2.6, 94],
    look: [178, GROUND + 2.4, 104],
    mark: [164, GROUND + 5, 104],
    era: '东南麓 · 明正德九年至清乾隆十三年',
    lead: '一块断碑在山脚下埋了二百三十年，才被挪到山上。',
    body: '传骆宾王兵败之后隐于邗水白水荡，卒葬南通。明正德九年（1514）城北黄泥口开荒掘得一墓，碑上只余"唐骆"二字；清乾隆十三年（1748），刘名芳查访断碑，请示知府董权文后把它迁葬狼山东南麓，与宋金应将军墓、清刘名芳（南庐）墓三墓并列。前置四柱三间门楼式石坊，嵌清道光二十二年（1842）所立"唐侍御史谥文忠骆公赠淑人范氏合墓"碑。1983 年列南通市首批文物保护单位，1989 年 12 月重修。真伪自清人就辩过——徐岭诗里有"黄泥口畔辩真坟"一句；义乌另有衣冠冢。',
    tags: ['明正德九年 1514', '清乾隆十三年迁葬', '1983 市保·1989 重修'],
  },
  {
    id: 'aerial',
    name: '山巅 · 五山与江',
    short: '鸟瞰',
    pos: [46, 164, 216],
    look: [-40, 82, -30],
    mark: null,
    era: '抬头看这一片平原',
    lead: '抬得更高才看出来：这是一条沿江摆开的弧形。',
    body: '狼山与军山、剑山、马鞍山、黄泥山沿长江呈弧形排列，通称五山；四山的体量、彼此方位与间距都没有测绘依据，画面里只按"沿江一排低丘"写意摆开。一处记军山 108.5 米为五山之最，与"狼山为五山之首"两种口径并存——"首"在这里多半说的是名位而不是高程。狼山原来就是江心的岛，泥沙把北岸一步一步推过来，北宋才并上陆地。',
    tags: ['五山弧形', '军山 108.5 m 异说', '北宋与陆涨接'],
  },
];

export const DEFAULTS = {
  lantern: 100,
  tier: 100,
  robe: 100,
  ripple: 100,
  bloom: 30,
  reflect: true,
  labels: true,
  tour: false,
  autoQuality: true,
};
