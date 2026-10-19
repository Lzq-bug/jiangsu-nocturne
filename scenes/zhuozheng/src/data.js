/**
 * 场地、水面、机位与解说。坐标单位为米（写意压缩过的尺度，非测绘）。
 * 轴向：+X 东、−X 西、+Z 南、−Z 北。水面 y = 0，路面 y ≈ 0.35。
 * 游线：南部宅园（李宅）→ 东园 → 投影游廊 → 中园 → 西园（补园），
 * 机位 pos 是眼睛所在，look 是所朝的一点，mark 是热点标签锚定的实体地标。
 */

/** 园墙外沿与全园范围，超出即出画 */
export const SITE = {
  minX: -112, maxX: 104, minZ: -62, maxZ: 72,
  wall: { x0: -104, x1: 92, z0: -56, z1: 64 },
  groundY: 0.34,
};

/**
 * 水面：每口塘一圈折点（顺时针），程序按点列生成池面、塘底与驳岸。
 * 中部一池是主景，东园、西园各一池，中间以水巷相连。
 */
export const PONDS = [
  {
    id: 'mid', name: '中部大池',
    pts: [
      [22, 20], [26, 6], [22, -10], [10, -22], [-10, -26], [-26, -20],
      [-36, -6], [-34, 10], [-24, 20], [-10, 24], [4, 22], [14, 24],
      [20, 18], [22, 20],
    ],
    depth: 2.1,
  },
  {
    id: 'east', name: '东园水塘',
    pts: [
      [44, 34], [52, 36], [58, 30], [56, 22], [48, 20], [42, 26], [44, 34],
    ],
    depth: 1.5,
  },
  {
    id: 'west', name: '西部水池',
    pts: [
      [-52, 10], [-56, 22], [-66, 24], [-78, 22], [-86, 14], [-86, 0],
      [-76, -4], [-62, -4], [-52, 2], [-52, 10],
    ],
    depth: 1.9,
  },
  {
    id: 'lane', name: '东南水巷',
    pts: [
      [28, 24], [34, 20], [34, 8], [28, 6], [26, 12], [26, 20], [28, 24],
    ],
    depth: 1.4,
  },
];

/** 池中洲岛：水面之上的落脚处，亭与曲桥都长在它们身上 */
export const ISLANDS = [
  { id: 'lotus', name: '荷风四面亭洲', cx: -6, cz: -2, rx: 8.4, rz: 6.2, y: 0.72 },
  { id: 'west-islet', name: '西部渚', cx: -66, cz: 8, rx: 6.6, rz: 4.4, y: 0.66 },
];

/* ------------------------------------------------------------- 水面几何工具
   纯函数，谁都能调；塘沿折点算一次就挂在 def 上。 */

/** 把塘的多边形按点距细分，并沿法线抖一点，岸线才不是尺规画的 */
export function pondOutline(def, step = 2.2) {
  if (def._outline) return def._outline;
  const src = def.pts;
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const [x0, z0] = src[i], [x1, z1] = src[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const wob = Math.sin((i * 7 + k * 1.9) * 1.7) * 0.5 + Math.sin(k * 0.7 + i) * 0.4;
      out.push([x + nx * wob * 0.8, z + nz * wob * 0.8]);
    }
  }
  const centroid = out.reduce((a, p) => [a[0] + p[0] / out.length, a[1] + p[1] / out.length], [0, 0]);
  def._outline = out;
  def._center = centroid;
  return out;
}

/** 极坐标采样塘沿：angle → 该方向上的岸边点（打灯、布置投影都靠它） */
export function pondEdgeAt(def, angle) {
  const pts = pondOutline(def);
  const [cx, cz] = def._center;
  let best = pts[0], bestDiff = 1e9;
  for (const p of pts) {
    const a = Math.atan2(p[1] - cz, p[0] - cx);
    let d = Math.abs(a - angle);
    d = Math.min(d, Math.PI * 2 - d);
    if (d < bestDiff) { bestDiff = d; best = p; }
  }
  return [best[0], best[1]];
}

export function pointInPond(x, z, shrink = 1) {
  for (const def of PONDS) {
    const pts = pondOutline(def);
    const [cx, cz] = def._center;
    const px = cx + (x - cx) / shrink, pz = cz + (z - cz) / shrink;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return def;
  }
  return null;
}

export function pointInIsland(x, z) {
  return ISLANDS.some((il) => ((x - il.cx) / il.rx) ** 2 + ((z - il.cz) / il.rz) ** 2 < 1);
}

export const STATIONS = [
  {
    id: 'lizhai',
    name: '李宅 · 会客厅',
    short: '李宅',
    pos: [80, 2.3, 55],
    look: [80, 3.2, 46],
    mark: [80, 5.6, 42],
    era: '南部宅园',
    lead: '推开长窗，墙上那幅山水先醒过来。',
    body: '夜游《拙政问雅》从这片宅院起头。园子明正德初年由御史王献臣所筑，园名取潘岳《闲居赋》"此亦拙者之为政也"；今入口一带的老宅院，项目里称作李宅，会客厅是其中一间。它的手法很轻：把一幅静止的水墨山水投出月升与水波，人先看见的是水面在动。本场景照同一思路做了一面可点亮的画屏，投影内容、顺序与时长都是写意示意，不代表实际演出。',
    tags: ['宅园门厅', '山水画屏', '月升水波'],
    show: 'inkmoon',
    kun: null,
  },
  {
    id: 'lanxue',
    name: '兰雪堂 · 东园',
    short: '兰雪堂',
    pos: [57.5, 2.2, 22.5],
    look: [63.5, 2.9, 28],
    mark: [64, 6.8, 28],
    era: '东园',
    lead: '一进园先收竹与石，堂只作背景。',
    body: '东园以竹、石、水塘开路：兰雪堂前植竹，堂西一座缀云峰当路如屏风，再往北是芙蓉榭与天泉亭临着东园水塘。今天看到的东园格局是二十世纪五十年代整修后重新理出来的（1951 年整修、1952 年开放），堂名与旧景的对应关系历来说法不一，这里不作断言。',
    tags: ['竹石当路', '缀云峰', '东园水塘'],
    show: 'bamboo',
    kun: null,
  },
  {
    id: 'changlang',
    name: '光影长廊',
    short: '光影廊',
    pos: [48, 2.1, 46],
    look: [30, 2.4, 38],
    mark: [48, 3.9, 46],
    era: '夜游动线',
    lead: '廊里的灯一节节亮起来，像有人提着灯在前面走。',
    body: '"光影长廊"不是园林的正式景点名，它是夜游在游廊上打的一段光。园林造廊本是为了雨天能走、能停、能换个角度再看一次；夜里加了光，等于把这条"看"的路线重新排一遍。本场景的提灯引路就装在这条廊上：灯序沿廊走，走到哪一段，哪一段的漏窗才透出来。',
    tags: ['投影游廊', '提灯引路', '漏窗竹影'],
    show: 'corridor',
    kun: null,
  },
  {
    id: 'yuanxiang',
    name: '远香堂',
    short: '远香堂',
    pos: [16, 2.62, 24.6],
    look: [6, 3.2, -12],
    mark: [16, 8.2, 31],
    era: '中部主厅',
    lead: '四面厅对着四面荷，堂名从《爱莲说》里来。',
    body: '远香堂是中部的主厅，四面厅、歇山顶，堂名取自周敦颐《爱莲说》的"香远益清"——正对着这一池荷。站在厅前平台是夜里看水面最开阔的位置：月光、灯影、荷风四面亭的檐角都在同一个方向。中部以水为主，山、亭、廊都绕这一片水面布置；全园约 78 亩，池水所占的成数各家统计不一，此处不按数字断言。',
    tags: ['四面厅', '荷池正面', '水中月色'],
    show: 'moonrise',
    kun: null,
  },
  {
    id: 'xiaofeihong',
    name: '小飞虹',
    short: '小飞虹',
    pos: [25.4, 2.12, 19.6],
    look: [30, 2.8, 13],
    mark: [29, 4.4, 14],
    era: '中部水巷',
    lead: '桥上覆一间廊屋，虹的"飞"从跨水的势里来。',
    body: '小飞虹是苏州园林中极为少见的廊桥：桥身跨在东南水巷上，中段盖一间廊屋，檐口压得低，人走过去要先低头再看水。夜里桥不装大功率灯，光从廊屋里透出来，落进水里便是一段一段——所以这段水面最适合做倒影，而不适合打亮。',
    tags: ['廊桥', '东南水巷', '分段倒影'],
    show: 'bridge',
    kun: null,
  },
  {
    id: 'hefeng',
    name: '荷风四面亭',
    short: '荷风亭',
    pos: [2.2, 2.3, 8.2],
    look: [-6, 3.2, -1.5],
    mark: [-6, 5.2, -2],
    era: '中部池中',
    lead: '三面是水，四面是荷，亭子只给你一个坐的理由。',
    body: '荷风四面亭立在洲岛上，四面开敞，夏天风从荷上过来，是中部最凉的一块地方。从岛上往外看，视线被荷举到一半高度，远处的屋檐只剩轮廓——这是园林里"近景压远"的做法。夜里坐在亭沿，水面把每一条灯影都拉得比你想象的长。',
    tags: ['洲岛', '四面开敞', '荷丛齐腰'],
    show: 'lotuslight',
    kun: null,
  },
  {
    id: 'xiangzhou',
    name: '香洲 · 石舫',
    short: '香洲',
    pos: [-21.4, 2.2, -17.2],
    look: [-15.6, 2.4, -8.6],
    mark: [-16, 5.4, -8],
    era: '中部石舫',
    lead: '一艘不能开的船，停在荷丛里等一段笛声。',
    body: '香洲是一艘旱船：石砌的船身泊在水里，舱与阁都是木构。园林里放石舫取的是"水稳如舟"的意思，能不能开从来不是重点。夜游把昆曲放在这一带——笛声从舱里出来，贴着水面走，荷丛就成了观众席。本场景的唱段与鼓板都由 Web Audio 实时合成，只是音高与板眼的示意，不含任何演员录音，也不模仿某一位艺人。',
    tags: ['石舫', '水磨腔', '笛声贴水'],
    show: 'boatlamp',
    kun: 'xiangzhou',
  },
  {
    id: 'wuzhu',
    name: '梧竹幽居',
    short: '梧竹幽居',
    pos: [39.2, 2.06, 3.2],
    look: [32, 2.8, 0],
    mark: [32, 5.0, 0],
    era: '中部东岸',
    lead: '四面月洞门，站着不动也能看到四幅画。',
    body: '梧竹幽居是一座方亭，四面开月洞门——同一个位置转一圈，框出来的是四幅不同的景：水、桥、竹、山。相传这里的匾与联和文徵明有关，但题刻的来历各家说法不一，此处不作断言。园子里栽梧与竹本来就是冲着"声"去的：风过梧叶、雨打竹叶，都在亭子四面门框里发生。',
    tags: ['月洞门', '框景四面', '梧竹生声'],
    show: 'moongate',
    kun: null,
  },
  {
    id: 'tingyu',
    name: '听雨轩',
    short: '听雨轩',
    pos: [26.5, 2.2, 41],
    look: [35, 3.2, 44],
    mark: [36, 6.4, 44],
    era: '中部东南',
    lead: '假的芭蕉叶叠在真的上面，先听见的是雨。',
    body: '听雨轩旧时轩前种芭蕉与荷，取的是"雨打芭蕉"这一层听觉。夜游把这处交给了投影：灯光投出的芭蕉叶与园里真实的植物虚实交织，再加一段模拟的雨打芭蕉声。本场景用同一思路——投影的叶面在墙上呼吸，雨点落进轩前的水面，涟漪一圈圈推出去，把灯影打皱。',
    tags: ['芭蕉投影', '雨打水面', '虚实交织'],
    show: 'rain',
    kun: null,
  },
  {
    id: 'yushui',
    name: '与谁同坐轩',
    short: '与谁同坐',
    pos: [-49.6, 2.06, 17.6],
    look: [-46.2, 2.7, 12.6],
    mark: [-46.6, 4.2, 12.6],
    era: '西部补园',
    lead: '一柄折扇临水开，窗里只点一盏灯。',
    body: '西园又称补园，与谁同坐轩在其西部水面边上，平面像一柄折扇，轩名取苏轼《点绛唇》句"与谁同坐？明月清风我"。扇形小轩开长窗，窗里点一盏灯，水里的影子就成了一枚弯月。夜里这一处最安静：没有演艺，只有灯、水与一句词的余味。',
    tags: ['扇形平面', '临水长窗', '水中半月'],
    show: 'fanlight',
    kun: null,
  },
  {
    id: 'yuanyang',
    name: '卅六鸳鸯馆',
    short: '鸳鸯馆',
    pos: [-55.6, 2.6, -4.2],
    look: [-68, 3.4, -11.5],
    mark: [-68, 8.6, -14],
    era: '西部主厅',
    lead: '一厅两半，灯从长窗里一层层退到深处。',
    body: '卅六鸳鸯馆是西部的主厅，做成一厅分南北两半的鸳鸯厅格局，南半旧称十八曼陀罗花馆；与它隔水相对的留听阁，名取李商隐"留得枯荷听雨声"，阁前故意留了几杆残荷。夜游的光影在这里收尾：长窗是这场戏的最后一块银幕，窗色偏冷是画面的写意处理，不代表实际建筑的玻璃用色。',
    tags: ['鸳鸯厅', '隔水留听阁', '光影终章'],
    show: 'finale',
    kun: 'yuanyang',
  },
  {
    id: 'aerial',
    name: '塔影 · 全园俯瞰',
    short: '俯瞰',
    pos: [74, 27, 58],
    look: [-14, 3, -8],
    mark: [-96, 9, -6],
    era: '借景',
    lead: '往西北看，塔影像被栽进了园墙上。',
    body: '从西部水面往西北望，是全园最常被提起的一个视线：借景北寺塔。报恩寺塔（北寺塔）九级八面、砖身木檐，高约 76 米，始建于三国吴赤乌年间——它在园外几十里之外，属"外借"，不是园林本体的一部分。本场景按这个视线把塔影放在远处的城廓上，位置与尺度都为画面服务；俯瞰位取在南部宅园上空，一路往西北看过去，可以看清水面如何把整座园子串起来。',
    tags: ['借景北寺塔', '水面为轴', '全园轮廓'],
    show: 'skyline',
    kun: null,
  },
];

/** 可点击的投影节目：id 与 station.show 对应 */
export const SHOWS = {
  inkmoon: { name: '画屏月升', seconds: 9, hint: '山水屏上月亮升起、水波流动' },
  bamboo: { name: '竹影上墙', seconds: 8, hint: '粉墙做纸，竹影随风写一遍' },
  corridor: { name: '提灯引路', seconds: 11, hint: '廊灯一节节向前亮起来' },
  moonrise: { name: '荷塘月色', seconds: 10, hint: '月光在水面上拉开一条亮带' },
  bridge: { name: '桥洞分影', seconds: 8, hint: '灯从廊屋里透出，倒影一段段' },
  lotuslight: { name: '荷底流萤', seconds: 9, hint: '荷丛里浮起点点流萤' },
  boatlamp: { name: '舫中点灯', seconds: 9, hint: '石舫舱里亮一盏，笛声随之起' },
  moongate: { name: '四门框景', seconds: 8, hint: '月洞门内依次亮起四幅光' },
  rain: { name: '雨打芭蕉', seconds: 12, hint: '投影芭蕉与真叶交织，雨落水面' },
  fanlight: { name: '扇里半月', seconds: 8, hint: '长窗灯火在水上折成一枚弯月' },
  finale: { name: '长窗收影', seconds: 12, hint: '灯一层层退到厅深处' },
  skyline: { name: '塔影入园', seconds: 10, hint: '城廓亮一线，塔影落在园墙外' },
};

export const DEFAULTS = {
  lantern: 100, lotus: 100, firefly: 100, ripple: 100, window: 80, bloom: 60,
  reflect: true, labels: true, mist: true, lamp: true, tour: false, autoQuality: true,
};
