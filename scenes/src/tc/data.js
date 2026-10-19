/**
 * 台城 · 明城墙夜景 —— 几何函数与机位解说。单位米。
 * 方位照南京实景取：-Z 为北（玄武湖在城墙以北），+X 为东（太平门方向），-X 为西（玄武门方向），
 * 城墙轴线沿 X 展开，y=0 是玄武湖水面。
 *
 * 已核实的数：解放门 1951 年 12 月动工、1954 年辟为单券门，位太平门与神策门之间；
 * 玄武门 1908 年辟；台城段俗称沿六朝宫城而来，长约二百五十米；这一段垛口距城外地面约二十至二十五米。
 * 其余比例（墙宽、坡道、敌台、湖中堤洲）按夜景构图做过写意处理，解说里已逐条注明。
 */

/** 城墙轴线：沿 X 展开，中线 z 随山势摆动 */
export const WALL = {
  xFrom: -345,
  xTo: 345,
  /** 马道（墙顶通道）半宽：这一段并不宽，两人错身要侧肩 */
  halfTop: 3.1,
  /** 墙脚外撇，收分后的半宽 */
  halfBase: 9.6,
  /** 女墙（外侧垛墙）高 */
  merlonH: 2.0,
  /** 宇墙（内侧矮墙）高 */
  innerParapetH: 1.15,
  /** 垛口间距：十三余里城墙上的万计雉堞摊出来大约就是这个数 */
  merlonSpacing: 2.55,
  /** 城外（湖侧）地面 */
  outerGround: 3.2,
  /** 城内（市街侧）地面 */
  innerGround: 7.4,
};

/** 某一站的墙顶标高：起伏不大，但让长卷有呼吸 */
export function topY(x) {
  return 22.8 + 2.2 * Math.sin(x * 0.0062 + 0.5) + 0.9 * Math.sin(x * 0.0163 + 2.1);
}

/** 城墙中线在 z 上的位置 */
export function centerZ(x) {
  return 9.5 * Math.sin(x * 0.0084) + 4.2 * Math.sin(x * 0.0207 + 1.2);
}

/** 某一标高上墙面所在的 z：sign=-1 是外侧（湖那一面），+1 是内侧（城那一面） */
export function faceZ(x, y, sign) {
  const cz = centerZ(x), ty = topY(x);
  const baseY = sign < 0 ? WALL.outerGround + 0.7 : WALL.innerGround + 0.7;
  const t = Math.min(1, Math.max(0, (ty - y) / (ty - baseY)));
  return cz + sign * (WALL.halfTop + (WALL.halfBase - WALL.halfTop) * t);
}

/** 台城段：解放门(东)与玄武门(西)之间，取为场景主段 */
export const GATES = {
  jiefang: { x: 118, name: '解放门' },
  xuanwu: { x: -186, name: '玄武门' },
  taiping: { x: 318, name: '太平门' },
};

/** 写意敌台：一段凸出墙身、可以四望的平台，台城段上并没有存留实物 */
export const DITAI = { x: -34, over: 5.4, len: 22 };

export const LAKE = {
  /** 湖心大致在城墙以北 */
  cx: -60,
  cz: -150,
  /** 环湖路：贴着墙脚走的一条堤 */
  ringRoadZ: (x) => centerZ(x) - 20 - 4 * Math.sin(x * 0.011),
  /** 台城柳长堤：湖中与城墙平行的一道洲堤 */
  causeway: { z: -74, xFrom: -250, xTo: 190, halfWidth: 5.2 },
};

export const CITY = {
  /** 鸡鸣寺在解放门西南的城内侧，塔是这一段最容易认的地标 */
  temple: { x: 152, z: 86 },
  pagoda: { x: 158, z: 74, h: 41 },
  /** 湖对岸的现代天际线：紫峰一类的玻璃塔群，作古今同框的写意处理 */
  modern: { x: -430, z: -58 },
  /** 南京城墙博物馆：解放门外的低体块，压在湖与墙之间 */
  museum: { x: 92, z: -21 },
};

/** 站得稳的机位一律由几何函数推出来，改墙线时热点不会飘 */
const onWall = (x, dz = 0, dy = 1.62) => [x, topY(x) + dy, centerZ(x) + dz];
const onMark = (x, dz, dy = 0) => [x, topY(x) + dy, centerZ(x) + dz];

export const STATIONS = [
  {
    id: 'chengxia',
    name: '城下 · 解放门',
    short: '解放门',
    pos: [GATES.jiefang.x, WALL.innerGround + 1.62, centerZ(GATES.jiefang.x) + 27],
    look: [112, topY(118) - 3.5, centerZ(118) - 3],
    mark: onMark(116, 6, -14.5),
    era: '一九五四年辟门',
    lead: '一九五一年冬动工，一九五四年开成一个单券门——它不是明代的老门，是这座城市自己给自己开的口子。',
    body: '解放门在太平门与神策门之间，为的是城墙内外通行与当年的防空疏散。券洞只有这么一孔，石条门框嵌在砖墙里，抬头往上，砖面一直退到二十多米以上的天空。台城这段的垛口距城外地面约二十至二十五米，站在这道门下才量得出它有多高。',
    tags: ['单券门', '城砖', '登城口'],
  },
  {
    id: 'madao',
    name: '马道 · 一条砖石长街',
    short: '马道',
    pos: onWall(66, -0.4),
    look: onWall(250, -2, 0.4),
    mark: onMark(30, 2.4, -1.4),
    era: '洪武修城',
    lead: '墙顶铺砖石，宽不过六米，走起来像一条悬在城上的长街。',
    body: '明京城城墙自元至正二十六年拓筑起，历二十余年而成，周回九十六里，今实测约三十五公里，现存二十余公里，是现存最长的古代都城城墙。墙身依山傍水蜿蜒，不取方形古制：脚下这道弧线往东上九华山、往西收到玄武门。城砖重者三四十斤，一侧压印产地与匠人姓名，学界称作铭文砖。',
    tags: ['铭文砖', '收分', '长卷'],
  },
  {
    id: 'taicheng',
    name: '台城 · 湖山一览',
    short: '台城',
    pos: [-8, topY(-8) + 2.55, centerZ(-8) - 1.7],
    look: [-320, topY(-120) + 1, centerZ(-120) - 26],
    mark: null,
    era: '六朝宫城之名',
    lead: '西边收到玄武门，北边是湖与钟山，南边是鸡鸣寺的屋脊——"台城"两个字本指六朝的宫城。',
    body: '台城本是东晋南朝宫城的称呼，朝廷台省所在之地；地面建筑早已不存，这个名字却落到明城墙这一段上，成了六朝兴亡的代称。明初这一带湖面曾作黄册库，户部天下版籍黄册收在湖中洲上，百姓不得入游；今天湖心环洲、樱洲、梁洲、翠洲、菱洲五洲灯火通明，正是从那段禁地之后翻过来的。',
    tags: ['六朝', '玄武湖', '黄册库'],
  },
  {
    id: 'ditai',
    name: '敌台 · 垛口西望',
    short: '垛口',
    pos: [DITAI.x - 6, topY(DITAI.x) + 3.15, centerZ(DITAI.x) - WALL.halfTop - DITAI.over * 0.78],
    look: [DITAI.x - 40, 5, -330],
    mark: onMark(DITAI.x, -DITAI.over - 1, 1.2),
    era: '写意敌台',
    lead: '垛口凹下去的那一块就是射孔；从这里往北，湖把城墙的一排灯全接了过去。',
    body: '这一段垛口的密度按实测间距写意铺开，凹口对外的地表高二十余米。凸出的敌台是艺术添加——南京城墙原有窝铺、敌台之制，台城段上并无存留实物，此处只作构图与身位用。往西那道门是一九〇八年辟的玄武门：城墙第一次为游湖的人开口子，玄武湖南岸从此有了陆路。',
    tags: ['雉堞', '敌台写意', '一九〇八'],
  },
  {
    id: 'simiao',
    name: '鸡鸣寺 · 塔影当窗',
    short: '塔影',
    pos: onWall(150, WALL.halfTop - 0.4),
    look: [CITY.pagoda.x, CITY.pagoda.h * 0.72, CITY.pagoda.z + 6],
    mark: [CITY.pagoda.x, CITY.pagoda.h * 0.86, CITY.pagoda.z],
    era: '梁代同泰寺之说',
    lead: '城墙内侧下坡就是鸡鸣寺，夜里塔灯把寺的屋脊从一片民居里挑出来。',
    body: '鸡鸣寺相传始建于孙吴，南朝梁时扩建为同泰寺，梁武舍身于此是南京最著名的佛教故事之一；今寺之格局出自明清以来屡毁屡建，药师塔为近世重建。这里的塔只取方位与轮廓，层数、高度与灯位按夜景比例处理，不作形制复原。',
    tags: ['同泰寺', '药师塔', '城与寺'],
  },
  {
    id: 'liudi',
    name: '湖堤 · 台城柳',
    short: '台城柳',
    pos: [-272, 3.4, LAKE.causeway.z - 9],
    look: [30, 12, LAKE.causeway.z + 10],
    mark: [60, 7.6, LAKE.causeway.z - 1],
    era: '唐 韦庄《台城》',
    lead: '江雨霏霏江草齐，六朝如梦鸟空啼。无情最是台城柳，依旧烟笼十里堤。',
    body: '韦庄过六朝故地写下这首《台城》，柳与堤是那时长在宫城旧址上的东西。今天湖中这道与城墙平行的长堤是后世浚湖堆出的洲堤，遍植垂柳；夜里灯在柳丝里，光落到水面上，"烟笼"两字才有了解释——不是雾，是灯把柳照成了一团。',
    tags: ['垂柳', '十里堤', '晚唐诗'],
  },
  {
    id: 'xuanwumen',
    name: '玄武门 · 城尽处',
    short: '玄武门',
    pos: [GATES.xuanwu.x, WALL.outerGround + 1.62, centerZ(GATES.xuanwu.x) - 18],
    look: [GATES.xuanwu.x + 40, topY(GATES.xuanwu.x) - 2, centerZ(GATES.xuanwu.x) + 2],
    mark: onMark(GATES.xuanwu.x, -WALL.halfBase - 1, -6.5),
    era: '一九〇八年辟门',
    lead: '城墙在这里收进湖里。门是一九〇八年辟的——南京第一次为游湖的人开的口子。',
    body: '玄武门辟于一九〇八年，玄武湖南岸从此有路可入；城墙自门而西折北去，台城段到此结束。夜里站在湖侧堤上回望，墙身黑成一面整砖，只有垛口那一排灯把它咬出锯齿。往南往东，城内的楼群与湖对岸的新塔群一起亮——六朝的、明代的、民国的与今天的，在这张画面里同框。',
    tags: ['辟门', '湖墙交界', '同框'],
  },
  {
    id: 'aerial',
    name: '空中鸟瞰',
    short: '鸟瞰',
    pos: [-30, 74, -215],
    look: [40, 12, 70],
    mark: null,
    era: '全景',
    lead: '城墙把玄武湖半抱在怀里：湖在北，城在中，市街在南。',
    body: '自湖面抬升：台城柳长堤在前，环湖路贴着墙脚，明城墙沿鸡笼山余脉起伏东去；解放门的券洞灯火与一九〇八年的玄武门各在一端，鸡鸣寺塔影在城内侧。这一段城墙因六朝宫城得名，因晚唐诗出名，因一堵砖墙而仍在——写意重建取其势，不测绘其形。',
    tags: ['全景', '湖城相依', '写意'],
  },
];

export const DEFAULTS = {
  lantern: 100,
  crowd: 90,
  ripple: 100,
  boat: 80,
  bloom: 55,
  reflect: true,
  labels: true,
  tour: false,
  autoQuality: true,
};
