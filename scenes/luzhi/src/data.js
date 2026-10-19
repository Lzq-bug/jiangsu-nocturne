/**
 * 机位、解说与场景尺寸。坐标单位为米，y=0 是市河常年水面。
 *
 * 轴向（沿用本仓库其余场景）：+X = 西，-X = 东，+Z = 北，-Z = 南。
 * 全景模式 yaw=0 的眼睛朝 -Z，即朝南，所以罗盘南在上、西在右。
 *
 * 史实锚点（两处以上来源互证，可写进解说）：
 * · 甪直古称甫里，镇在苏州吴中区，古镇区约一平方公里；改名的通行说法是"水流形有酷如
 *   甪字"，另有独角神兽甪端巡察至此的传说——两个都是传说层面，不当史实使用。
 * · 保圣寺创建于南朝梁天监二年（503），原名保圣教寺，北宋大中祥符六年（1013）重建；
 *   现存山门（按清乾隆原貌重修）、天王殿（明崇祯年间在宋代殿基上重建，面阔三间、
 *   单檐歇山顶）、尊胜陀罗尼经咒石幢（南宋绍兴十五年 1145 重立，七层）、古物馆
 *   （1932 年落成，建在原大雄宝殿遗址上，中西合璧式样）。
 * · 寺内泥塑罗汉传为唐代"塑圣"杨惠之所作，两侧原列十八尊，今存九尊；
 *   1961 年 3 月 4 日"保圣寺罗汉塑像"列入第一批全国重点文物保护单位，编号 121。
 * · 水多桥多是镇的另一特色：通行记载为古镇区原有宋元明清各式石桥"七十二顶半"，
 *   现存四十一座。
 *
 * 写意处理（画面需要但记载不到，帮助面板里逐条承认）：河面的实际宽度、街宽与进深、
 * 各桥的形制尺寸与位置、保圣寺的院落纵深与罗汉壁的构图、沿河屋子的层数与马头墙、
 * 米行河埠的垛包，以及"满镇灯火"——这里没有常设夜游，夜里点灯是画出来的。
 */

/** 市河：东西向贯穿全镇，是本景的水面主干 */
export const RIVER = {
  xMin: -340,
  xMax: 320,
  southEdge: -8,      // 水面南边线（南岸驳岸外露面）
  northEdge: 8,       // 水面北边线
  bankTopY: 2.8,      // 驳岸顶 / 沿河石堤面
  streetY: 2.2,       // 石板街面
  wallTop: 3.2,       // 驳岸压顶石
};

/** 水巷：南北向支河，在市河以西汇入，形成"双桥"交汇的口 */
export const INLET = {
  x0: 92,             // 支河西岸（水边线）
  x1: 101,            // 支河东岸
  zFrom: 6,           // 与市河水面相接处（略插入主河，避免缝隙）
  zTo: 150,
  bankTopY: 2.8,
};

/** 街：市河两岸各一条，屋面前檐线贴街 */
export const STREET = {
  northZ: 22,         // 北岸街后（屋面前檐），街面在 16..22
  southZ: -22,        // 南岸屋前檐，街面在 -22..-16
  quayZ: 16,          // 河堤与街之间
  width: 6,
  xMinEast: -186,     // 东头让给米埠前的空地
  xMaxWest: 250,
};

/** 寺前巷：从北街向北进寺 */
export const LANE_TO_TEMPLE = { x: 30, width: 6, zFrom: 22, zTo: 38 };

/**
 * 保圣寺：中轴坐北朝南（写意排法），山门在前、天王殿居中、
 * 经幢立在院中、古物馆（原大雄宝殿遗址）在最后。
 */
export const TEMPLE = {
  cx: 30,                     // 中轴 x
  xMin: -12, xMax: 72,        // 院墙范围
  zWall: 34, zBack: 106,      // 院墙前后
  groundY: 2.6,               // 寺前地坪（比街面略起）
  plaque: '保圣寺',
  gate: { z: 44, bays: 11.4, depth: 6.2, h: 5.0, roofRise: 1.7 },
  screen: { z: 37.4, w: 9.2, h: 4.2 },        // 照墙
  hall: { z: 60, bays: 12.0, depth: 9.0, h: 6.0, roofRise: 2.4 },  // 天王殿（面阔三间）
  pillar: { x: 15, z: 72 },                    // 经幢（南宋 1145 重立，七层）
  museum: { z: 90, bays: 15.2, depth: 10.6, h: 6.6, roofRise: 1.5 }, // 古物馆
};

/** 古物馆内：壁面泥塑与九尊罗汉 */
export const ARHAT = {
  count: 9,
  wallInset: 0.9,     // 塑壁离后墙
  baseY: TEMPLE.groundY + 0.55,   // 罗汉台
  figureH: 1.62,      // 写意坐像尺度
  spacing: 1.44,
};

/** 米埠：《多收了三五斗》里的"万盛米行的河埠头"，此处按文学地标复建 */
export const MILL = {
  x: -148,
  z0: -30, z1: -9,
  width: 15,
  steps: 8,
  name: '万盛米行',
};

/**
 * 桥表：次第点亮的顺序就按这个数组走（自西而东跨过市河，再上水巷，最后落在那半座上）。
 * kind: arch=单孔拱, twin=两孔拱, beam=石梁平桥, half=只剩半座的桥
 * span=跨径（沿桥轴），rise=矢高，width=桥宽
 */
export const BRIDGES = [
  { id: 'w0', kind: 'twin', cross: 'main', at: 250, span: 17, rise: 3.2, width: 3.4, name: null },
  { id: 'w1', kind: 'arch', cross: 'main', at: HEFENG.x, span: 13, rise: 4.2, width: 4.6, name: '和丰桥', era: '宋' },
  { id: 'w2', kind: 'beam', cross: 'main', at: 132, span: 17, rise: 0.45, width: 3.0, name: null },
  { id: 'w3', kind: 'arch', cross: 'main', at: 58, span: 11, rise: 3.1, width: 3.2, name: null },
  { id: 'w4', kind: 'twin', cross: 'main', at: -22, span: 17, rise: 2.9, width: 3.6, name: null },
  { id: 'w5', kind: 'beam', cross: 'main', at: -96, span: 17, rise: 0.45, width: 2.6, name: null },
  { id: 'w6', kind: 'arch', cross: 'main', at: -168, span: 10.5, rise: 2.6, width: 3.0, name: null },
  { id: 'e0', kind: 'twin', cross: 'main', at: -236, span: 17, rise: 2.7, width: 3.4, name: null },
  { id: 'i0', kind: 'beam', cross: 'inlet', at: 21, span: 9.4, rise: 0.45, width: 3.0, name: null },
  { id: 'i1', kind: 'arch', cross: 'inlet', at: 48, span: 9.6, rise: 2.9, width: 3.2, name: null },
  { id: 'i2', kind: 'beam', cross: 'inlet', at: 86, span: 9.4, rise: 0.45, width: 2.6, name: null },
  { id: 'i3', kind: 'arch', cross: 'inlet', at: 124, span: 9.2, rise: 2.3, width: 2.8, name: null },
  { id: 'half', kind: 'half', cross: 'main', at: -296, span: 12, rise: 3.4, width: 3.2, name: null },
];

export const TOTAL_BRIDGES = 72.5;   // 记载里的"七十二顶半"，画面只摆得下这些

/** 街面/堤顶标高，机位眼高由这些算 */
export function groundAt(z, x) {
  if (z > STREET.quayZ && z < STREET.northZ) return RIVER.bankTopY;
  if (z >= STREET.northZ) return RIVER.streetY;
  if (z < STREET.quayZ && z > -STREET.quayZ) return RIVER.bankTopY - 0.3;
  if (z <= -STREET.quayZ && z >= STREET.southZ - 4) return RIVER.streetY;
  return RIVER.bankTopY;
}

const EYE = 1.62;
const north = (x, z) => [x, RIVER.streetY + EYE, z];
const south = (x, z) => [x, RIVER.streetY + EYE, z];
const quay = (x, z) => [x, RIVER.bankTopY + EYE - 0.4, z];

export const STATIONS = [
  {
    id: 'mouth',
    name: '水巷口 · 双桥',
    short: '水巷口',
    pos: quay(108, 13.6),
    look: [40, 5.2, -6],
    mark: [186, 6.4, 0],
    era: '市河 · 支河汇口',
    lead: '一条横河一条直港，两座桥隔着几步相望。',
    body: '甪直的骨架是水给的：古镇区大约一平方公里，记载里说这里原有宋元明清各式石桥七十二顶半，现存四十一座，"三步两桥"就是从这个密度里长出来的说法。这一张站在两河交界的堤角上：横着的是市河，竖着的是港，河街相邻，桥一头压住另一头的视线。',
    tags: ['水巷口', '双桥', '堤角'],
  },
  {
    id: 'market',
    name: '河街 · 灯影',
    short: '河街',
    pos: south(-46, -19.2),
    look: [-112, 4.6, -12],
    mark: [-96, 4.8, -9],
    era: '河北岸 · 南岸夹河',
    lead: '灯笼只够照亮半条街，剩下的都交给水。',
    body: '河两岸是枕河人家：前檐贴街，后墙压水，埠头从堤上一直下一级到船帮。街宽、河宽和屋子的层数都按画面需要写意排的——地方记载给的是桥的数目，没给街的尺度。夜里读得出来的还是那个老格局：一层街、一层河、一层屋脊。',
    tags: ['枕河人家', '埠头', '湿石板'],
  },
  {
    id: 'moon',
    name: '和丰穿月',
    short: '穿月',
    pos: quay(142, -5.2),
    look: [206, 4.6, 2.6],
    mark: [186, 7.6, 0],
    era: '镇西 · 宋桥',
    lead: '单孔桥洞里，月亮落下来时被切开一次。',
    body: '和丰桥是镇上有名的宋桥，"江南最古老的石拱桥"这类话是今人加的形容，年代可考到宋。记载里没有它的跨径与矢高，这一孔按一孔单孔拱该有的比例摆：跨径十三米、矢高四米二、桥面带桥坡二十六米。月从桥洞里过时最矮的那几分钟，就是这一机位要的东西。',
    tags: ['单孔石拱', '月痕', '宋桥'],
  },
  {
    id: 'temple',
    name: '保圣寺 · 山门与经幢',
    short: '保圣寺',
    pos: north(30, 26.4),
    look: [30, 5.4, 46],
    mark: [30, 6.0, 44],
    era: '梁天监二年（503）创建',
    lead: '从街上拐进寺前巷，先看见的是照墙。',
    body: '保圣寺创建于南朝梁天监二年（503），原名保圣教寺，北宋大中祥符六年（1013）重建，会昌灭佛时曾被毁后又复。现存山门按清乾隆原貌重修，天王殿是明崇祯年间在宋代殿基上重建的，面阔三间、单檐歇山；院中立着尊胜陀罗尼经咒石幢，南宋绍兴十五年（1145）重立，共七层。寺的坐向、院落纵深与巷宽都按写意排布。',
    tags: ['照墙', '山门', '经幢七层'],
  },
  {
    id: 'arhat',
    name: '古物馆 · 罗汉现形',
    short: '罗汉壁',
    pos: [TEMPLE.cx, TEMPLE.groundY + EYE, TEMPLE.museum.z - 3.4],
    look: [TEMPLE.cx, TEMPLE.groundY + 2.0, TEMPLE.museum.z + 4.6],
    mark: [TEMPLE.cx, TEMPLE.groundY + 2.6, TEMPLE.museum.z + 4.2],
    era: '传唐·杨惠之塑',
    lead: '九尊罗汉从壁里显出来，灯一盏一盏抬上去。',
    body: '保圣寺原有大雄宝殿，民国二十年（1931）前后倾毁，1932 年在其遗址上落成一座中西合璧式的古物馆，把幸存的泥塑罗汉收在壁间。壁上是山海相间的塑壁，两侧原列十八尊、今存九尊，传为唐代"塑圣"杨惠之所作；日本学者大村西崖曾为此著《吴郡奇迹：塑壁残影》。1961 年 3 月 4 日，"保圣寺罗汉塑像"列入第一批全国重点文物保护单位，编号 121。九尊的名号、姿态与壁面构图记载各有出入，这里按塑壁该有的样子补配，不当复原。',
    tags: ['塑壁', '九尊', '第一批国保'],
  },
  {
    id: 'mill',
    name: '米埠 · 夜泊',
    short: '米埠',
    pos: south(MILL.x + 12, -17.4),
    look: [MILL.x - 6, 3.4, -8],
    mark: [MILL.x, 4.4, -10],
    era: '文学地标 · 河埠头',
    lead: '稻船靠上岸的时候，米行门口还亮着。',
    body: '叶圣陶在甪直教过书，把《多收了三五斗》里的粜稻船停在"万盛米行的河埠头"——那是一家米行，也是小说里的地名，如今镇上的米行是照着文本复建的场面。这一处按文学地标来摆：石阶下水、稻包上岸、跳板与秤。船队与垛包的多少都是画面需要。',
    tags: ['河埠头', '稻船', '多收了三五斗'],
  },
  {
    id: 'aerial',
    name: '七十二顶半',
    short: '俯瞰',
    pos: [-70, 62, -58],
    look: [80, 4.5, 30],
    mark: null,
    era: '全景 · 桥次第',
    lead: '灯自西而东一座座点过去，最后那半座只点半盏。',
    body: '高处看这条街的骨架：一条市河横铺，一条港竖着切进去，桥压在水上，街贴着水走。画面里的桥只有十三座，记载说古镇区原有七十二顶半、现存四十一座——那半座是全景的收笔：一座只剩单孔单坡的桥，灯也只点一盏。',
    tags: ['全景', '次第点亮', '那半座'],
  },
];

export const DEFAULTS = {
  lantern: 100,
  window: 100,
  bridge: 100,
  boat: 100,
  arhat: 100,
  ripple: 100,
  bloom: 32,
  reflect: true,
  labels: true,
  tour: false,
  autoQuality: true,
};
