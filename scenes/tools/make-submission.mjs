/**
 * Generates the competition submission pack (report .docx + pitch .pptx) from one
 * shared content source, so editing the text and re-running rebuilds both.
 *   node tools/make-submission.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow,
  TableCell, WidthType, AlignmentType, PageBreak, BorderStyle,
} from 'docx';
import PptxGenJS from 'pptxgenjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'docs', 'shots');
const OUT = join(ROOT, 'docs');
const CJK = 'Microsoft YaHei';

/* ------------------------------------------------------------------ content */
const work = {
  title: '灯影江南',
  subtitle: '秦淮画廊 · 平江夜巷 双场景 3D 夜景全景漫游系统',
  track: '数字文旅 · 文化遗产数字化',
  contest: '2026 年第十四届全国大学生数字媒体科技作品及创意竞赛（CMIT）',
  slogan: '同一套参数化引擎，重建两座江南水城的夜 —— 桨声灯影的秦淮，与河街相邻的平江',
  team: {
    school: '【学校名称】', college: '【学院 / 系】', major: '【专业班级】',
    leader: '【负责人姓名 / 学号】', members: '【队员姓名 / 学号】',
    teachers: '【指导老师 1 / 指导老师 2】', contact: '【联系人 / 电话 / 邮箱】',
    date: '2026 年 10 月',
  },
  scenes: [
    {
      key: '秦淮画廊',
      entry: 'index.html',
      place: '南京 · 夫子庙—秦淮河',
      note: '以"秦淮灯会"这一国家级非遗事项的夜间氛围为对象：临水复廊下成排的宫灯、石拱桥券洞内的灯、横跨河面的灯串、行驶中的画舫。',
    },
    {
      key: '平江夜巷',
      entry: 'pingjiang.html',
      place: '苏州 · 平江路历史街区',
      note: '以《平江图》所载"水陆并行、河街相邻"的双棋盘格局为对象：一河一街的窄水面、粉墙黛瓦与观音兜山墙、梳齿般的横巷、跨河红灯笼与远处报恩寺塔。',
    },
  ],
  metrics: [
    ['场景数量', '2 套独立夜景场景，同一套引擎与共享构件库'],
    ['机位总数', '14 处（每场景 6 个景点机位 + 1 个空中鸟瞰）'],
    ['固定灯具', '秦淮 201 盏 / 平江 426 盏（宫灯、六角灯、路灯、巷灯、桥灯、窗灯）'],
    ['水面灯影', '秦淮 120 根加性光柱 / 平江 224 根光柱 + 16 串跨河红灯笼与水面光池'],
    ['动态元素', '画舫 9 艘与摇橹乌篷船 6 艘、岸上人流上限 320 人、漂流河灯 72 + 34 盏'],
    ['环境规模', '星点 1400 颗、远景屋脊与民居实例 920 + 380 个、报恩寺塔九级八面剪影'],
    ['工程形态', '共享层 9 个模块 + 场景侧各 5 个模块，零运行时依赖；单文件版各约 1.4 MB'],
    ['运行方式', '浏览器直接运行，桌面与触屏通用，支持离线双击打开'],
  ],
  stations: [
    ['秦淮画廊', '01-gallery.jpg', '临水复廊是秦淮灯会最经典的取景处。作品以 45 开间的朱红柱廊、双重檐屋顶与檐下灯串复现"廊下悬灯、栏外即河"的空间关系，画舫自灯影中穿出时，暖色被水面拖成长带。'],
    ['文德桥', '02-bridge.jpg', '站在桥顶沿中轴东望，牌坊、泮池方向与大成殿层层递进。石拱券以带孔洞的挤出体生成，券洞内点灯，桥侧设望柱与桥心石，是"二分明月"传说的空间载体。'],
    ['夫子庙大成殿', '03-dacheng.jpg', '重檐庑殿顶、列柱与隔扇门窗构成祭孔主殿的夜间形象，殿前列灯成排，金顶在夜色中形成视觉收束点。'],
    ['天下文枢坊', '04-paifang.jpg', '四柱三间两层屋顶的牌坊，匾额自右向左书"夫子庙"。此处机位反向回望河面，把牌坊灯、河上灯串与西岸长廊收进同一画面。'],
    ['江南贡院', '05-gongyuan.jpg', '龙门与举子号舍复现"明清最大科举考场"的空间尺度，两万余间号舍以阵列化体块概括，与夫子庙共同构成"庙学一体、科举相邻"的文化叙事。'],
    ['桃叶渡', '06-taoye.jpg', '渡口碑亭、石阶系缆与停泊画舫构成夜游解缆之处，六朝典故与当代灯会在此叠合，也是全场景上游的视觉起点。'],
    ['空中鸟瞰', '07-aerial.jpg', '抬升视角下，灯串沿河道铺成一条暖色带，水面接住一半——这一帧也用于检验整体构图与灯光配比的平衡。'],
  ],
  pjStations: [
    ['水埠头', 'pj-01-shuibutou.png', '一条河与一条街并肩而行的起点。窄河、低岸、石栏，跨河灯串把红灯笼的影子弹到水面上，形成"灯河"二字最直接的读法。'],
    ['石拱桥', 'pj-02-shigongqiao.png', '站在拱顶俯望，河面在脚下打开，两岸檐下灯与窗灯沿河道递次排到远处。此处的单孔石拱桥是为夜景构图做的写意添加——平江河上的真桥多为低平石梁桥。'],
    ['河沿', 'pj-03-huyan.png', '驳岸在河埠处凹进一段，石阶一级级降到水面，两侧收石笋；靠水一面设美人靠，门缝与窗格里的光落在湿石头上比落在街上更亮。'],
    ['夜巷', 'pj-04-yexiang.png', '垂直于河的横巷把街巷切成梳齿：悬桥巷、钮家巷、菉葭巷、大儒巷、中张家巷。巷窄而两边只有粉墙，墙头压一层黛瓦，一盏灯吊在山墙尽头，再往里就是黑。'],
    ['书场', 'pj-05-shuchang.png', '临河茶肆与书场的长窗只支起一半，琵琶与三弦的声音顺着水面传出去，灯光把窗格投影在河埠石阶上——这条街最动听的段落都在夜里。'],
    ['塔影', 'pj-06-taying.png', '街口石牌之后，报恩寺塔九级八面压着整片屋脊。旧时城里人辨方向不必看地图，抬头找塔尖就够了。'],
    ['空中鸟瞰', 'pj-07-niaokan.png', '自水面抬升，一副双棋盘：河在中，街与巷分列两岸，四座桥横在河上，摇橹船拖出一条白线，塔立在黛瓦屋脊之外。'],
  ],
  modules: [
    ['kit.js（共享）', '中式屋顶、立柱、栏杆、斗拱、匾额、人形、船体放样等构件的参数化生成与共享材质'],
    ['textures.js（共享）', '瓦垄、木纹、石作、纸灯、窗棂、匾额文字等贴图全部由 canvas 实时绘制'],
    ['water.js（共享）', '水面着色器、镜像倒影组、灯影光柱实例化系统；河宽、河长与月光方向为入参'],
    ['controls.js / hotspots.js / ui.js（共享）', '双相机模型与机位补间、地标锚定热点、参数面板与快捷键'],
    ['environment.js / architecture.js / props.js / interiors.js / portals.js', '秦淮场景的夜空与远景、街区建筑、灯彩船队人流、殿宇内景与门洞进出'],
    ['src/pj/data.js', '平江河—街—巷的坐标常量、桥与巷的清单、7 处机位与解说文案'],
    ['src/pj/environment.js', '清冷夜空与星月、屋脊海与报恩寺塔九级八面剪影、沿河柳与樟、月光与暖色补光'],
    ['src/pj/architecture.js', '驳岸与河埠凹口、石栏、沿街铺面与观音兜山墙、横巷、石梁桥与写意单孔拱桥、街口石牌'],
    ['src/pj/props.js', '复用共享灯场分配路灯/檐灯/窗灯/巷灯/桥灯，跨河红灯笼串与水面光池、乌篷船队、街巷人流'],
    ['src/pj/main.js', '第二场景的独立入口：渲染管线、参数联动、画质自适应与机位深链自检'],
  ],
  innovations: [
    ['氛围优先的"非测绘"数字化路径', '针对夜间景观难以被摄影测量捕捉的问题，采用参数化三维重建：几何、贴图、灯光全部由代码生成，可在无外部素材、无网络条件下复现同一帧画面，也为后续接入真实测绘模型留出替换空间。'],
    ['一套引擎、两座水城：框架与场景真正解耦', '第二场景没有改动第一场景的任何渲染代码。共享层只做了三处"常量变入参"的最小改造：界面默认值改为注入、水面的河宽与月光方向改为形参、人流的行走路径与桥面曲线改为可注入函数。场景侧只需提供 data / environment / architecture / props 四个模块与一个入口页，即可得到完整的机位、热点、解说、倒影、泛光与画质自适应。'],
    ['可复现的中式屋顶参数模型', '把"反曲坡面 + 四角起翘 + 庑殿折痕"写成单一函数：以 max(dzN, dxN) 精确落在脊线与角梁上，一套函数生成廊、桥亭、殿、坊、照壁压顶与江南民居的两坡水屋顶等不同比例屋顶。'],
    ['按河宽分级的两套灯影方案', '秦淮河面宽阔，用 120 根竖直加性光柱 + 建筑镜像即可；平江河仅 6.8 米宽，浅视角会把竖直光柱压成一条线，于是改用"跨河灯串 + 贴水光池"的组合，并让灯影强度与花灯密度严格联动。'],
    ['零构建、零依赖的工程形态', 'ES Module + importmap 直跑，Node 端仅用内置模块提供本地服务；自研打包器支持多入口，把每张模块图各压成约 1.4 MB 的单文件 HTML，双击即可展示，适合评审与展陈现场无网络环境。'],
    ['面向解说的交互结构', '热点锚定在实体地标而非相机位置，全景与自由两种视角共享同一套机位数据；解说文案与坐标同源，改机位即改标签，降低布展与维护成本。'],
  ],
  creative: [
    ['"桨声灯影"的文学母题', '秦淮河的夜间形象很大程度上是文学塑造出来的——自六朝竹枝词到朱自清、俞平伯的同名散文《桨声灯影里的秦淮河》，"灯"与"水"始终是绑在一起被观看的。作品把这句话拆成可实现的渲染目标：灯必须在水面上被第二次看见，因此水面不是贴图，而是解析法线波纹、天空反射、建筑镜像与加性光柱的合成。'],
    ['南宋《平江图》的城市底图', '苏州平江路的格局不是当代景观设计的结果，而是南宋绍定二年（1229）刻石《平江图》上已经画清的水系：水陆并行、河街相邻，像一副双棋盘。作品的鸟瞰机位就是按这副棋盘来构图的——河在中、街在侧、横巷如梳齿排开。'],
    ['粉墙黛瓦与观音兜山墙', '江南民居的辨识度高墙少窗：白粉墙、青黑瓦、阶梯状或弧形的观音兜封火墙朝向街面，屋脊低平而不作北方殿宇的大起翘。第二场景因此刻意"降调"：去掉朱红柱廊与金顶，改用冷灰白墙、青石板和更少的暖光，让两城在气质上分开。'],
    ['一河一街的尺度感', '秦淮河是可航行的景观河，平江河是穿城而过的生活水道。两者的差别被直接翻译成参数：河面半宽从 16.5 米收到 3.4 米，视线从开阔变为被墙夹住，雾密度提高、补光距离缩短，桥也从"可以登临的中轴桥"变成"贴着水面的石梁"。'],
    ['夜声的可视化', '平江路的夜不只有光，还有茶肆书场里的评弹与昆曲。作品无法呈现声音，于是用"半支的长窗 + 窗内暖光 + 挑出的幌子"来暗示声源——把听觉经验转译为可见的线索，是本项目在呈现方式上做过的一次取舍实验。'],
    ['为什么只做强夜', '团队在立项时明确放弃昼/夜切换：白天信息量大而情绪弱，夜间信息量小而情绪强，夜景才是这两处街区共同的价值所在，也是数字化最难留下证据的部分。'],
  ],
  measurements: [
    ['测试分辨率', '1280 × 720，设备像素比 1.0'],
    ['每帧绘制调用（秦淮）', '约 698 次（含 5 遍泛光模糊与合成）'],
    ['每帧三角面数（秦淮）', '约 384,600（含倒影镜像副本）'],
    ['每帧三角面数（平江）', '约 188,000 静态几何 + 倒影副本与后期全屏通道'],
    ['离线几何统计', '秦淮 496 个网格 / 201 盏灯 / 120 根光柱；平江 1,122 个网格 / 426 盏灯 / 224 根光柱 / 16 串跨河灯'],
    ['着色器程序数', '45 个（编译后常驻）'],
    ['首帧构建耗时', '约 1.2 秒（含贴图绘制与几何合并），随后关闭阴影自动更新'],
    ['帧率参考', '在受遮挡的自动化测试窗口中约 8–20 fps，属下限；平江场景的正常桌面帧率需按附录命令复测后填写'],
  ],
  runtime: [
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），无构建步骤，源码即运行码'],
    ['运行时依赖', '零 npm 运行时依赖。three.js（MIT）与其附加模块随仓库 vendor 在本地，不产生任何网络请求'],
    ['浏览器要求', '支持 WebGL2 与现代 ES Module 的桌面/移动浏览器（Chrome、Edge、Firefox、Safari 均可）'],
    ['离线展示', '执行 npm run build:all 生成 dist 下两个单文件 HTML，双击即可运行，无需网络与服务'],
    ['开发预览', '执行 npm run dev 启动仓库自带的零依赖静态服务（禁用缓存），打开 /index.html 或 /pingjiang.html'],
    ['推荐配置', '独显或较新核显、1920×1080 窗口；移动端 SoC 建议下调沿街灯火密度或开启画质自适应'],
    ['输入方式', '鼠标拖拽 / 滚轮、触屏单指环视与双指捏合、键盘 A·D·Space·P·F·H·Esc 全键位'],
  ],
  value: [
    ['线上夜游与文旅导览', '单文件即可嵌入景区公众号、小程序 webview 与官网，不依赖服务器渲染，弱网与离线可用。'],
    ['非遗灯会的数字化存档', '灯组位置、色彩与配比全部参数化，可按届次保存与复原某一年元宵的灯光方案。'],
    ['展馆大屏与教学课件', '每套场景的 7 个机位天然对应 7 段展项；同一份代码可跑在拼接屏、交互一体机与学生平板上。'],
    ['可复制的街区迁移方法', '两个街区的实践给出了一条明确的迁移路径：新场景只需重写形制参数与机位文案，共享渲染层不动，边际成本随场景数量递减。'],
    ['历史格局的可视化教具', '《平江图》的双棋盘格局、河街相邻与梳齿巷制，可用鸟瞰与自动巡览直接演示，适用于城市规划与建筑史课程。'],
  ],
  limits: [
    '作品为写意重建，建筑比例、灯位与空间关系经过艺术化处理，不是测绘级模型，不能用于工程或保护规划用途。',
    '为构图需要做的形制添加已在文案中标注：平江场景的单孔石拱桥即属写意添加（真桥多为低平石梁桥），河与路的左右方位亦未按实测断言。',
    '人群、船只与灯组数量为示意性密度，未做真实客流与航运仿真。',
    '移动端 SoC 上高灯密度与泛光叠加会明显发热，需借助画质自适应或下调花灯密度。',
    '匾额文字按传统自右向左书写，与当代横排习惯不同，属有意为之的文化表达。',
    '作品呈现视觉与交互，不含音频；评弹、昆曲等声音元素仅以画面线索暗示。',
  ],
  next: [
    '接入倾斜摄影或激光点云，把写意几何替换为测绘模型，保留同一套灯光与交互。',
    '为两个场景补昼夜与四季节律、雨雪雾天气，支持"白天看建筑、夜晚看灯彩"。',
    '封装 WebXR 会话，进入头显做沉浸式夜游；同时提供语音讲解与多语言字幕。',
    '把共享层沉淀为可配置的场景模板：新增一个街区只需填写形制与机位两张表。',
    '与景区实测客流与灯会日程联动，让虚拟夜游与真实灯会同步开关灯。',
  ],
  originality: '本作品全部源代码、程序化贴图与文案由团队自行创作生成，未使用任何第三方受版权保护的模型、贴图、字体位图或音频素材。渲染基于 three.js（MIT 许可，已随源码保留版权声明），后处理泛光与输出通道同样取自 three.js 官方示例并保留原始许可头。两处街区的历史背景描述基于公开史料与地方志常识，其中写意处理的部分已在报告与作品内说明中明确标注。作品未在其他赛事中重复申报。',
};

const shot = (name) => readFileSync(join(SHOTS, name));
const kind = (name) => (name.endsWith('.png') ? 'png' : 'jpeg');
// pptxgenjs wants "image/png;base64,..." rather than a Buffer
const img = (name) => `image/${kind(name)};base64,${shot(name).toString('base64')}`;

/* ------------------------------------------------------------------ helpers */
const p = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 300 },
  alignment: opts.align,
  children: [new TextRun({ text, font: CJK, size: opts.size ?? 21, bold: opts.bold, color: opts.color })],
});
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 140 }, children: [new TextRun({ text: t, font: CJK, bold: true, size: 28, color: '7A2E22' })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 100 }, children: [new TextRun({ text: t, font: CJK, bold: true, size: 23, color: '2F4A63' })] });
const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, font: CJK, size: 21 })] });
const caption = (t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 }, children: [new TextRun({ text: t, font: CJK, size: 18, color: '666666' })] });
const picture = (name, w, h) => new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new ImageRun({ type: kind(name), data: shot(name), transformation: { width: w, height: h } })],
});
const table = (rows, widths) => new Table({
  columnWidths: widths,
  rows: rows.map((r, i) => new TableRow({
    children: r.map((cell, k) => new TableCell({
      width: { size: widths[k], type: WidthType.DXA },
      shading: i === 0 ? { fill: 'F2E7D5' } : undefined,
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CFC3AE' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CFC3AE' }, left: { style: BorderStyle.SINGLE, size: 2, color: 'CFC3AE' }, right: { style: BorderStyle.SINGLE, size: 2, color: 'CFC3AE' } },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: CJK, size: 20, bold: i === 0 })] })],
    })),
  })),
});

/* ------------------------------------------------------------------ report */
function buildReport() {
  const t = work.team;
  let fig = 0;
  const kids = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1600, after: 120 }, children: [new TextRun({ text: work.title, font: CJK, bold: true, size: 60 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [new TextRun({ text: work.subtitle, font: CJK, size: 28, color: '7A2E22' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [new TextRun({ text: work.slogan, font: CJK, size: 22, italics: true, color: '555555' })] }),
    table([
      ['竞赛名称', work.contest],
      ['申报方向', work.track],
      ['学校 / 学院', `${t.school}　${t.college}`],
      ['专业班级', t.major],
      ['团队负责人', t.leader],
      ['团队成员', t.members],
      ['指导老师', t.teachers],
      ['联系方式', t.contact],
      ['完成日期', t.date],
    ], [2600, 6700]),
    new Paragraph({ children: [new PageBreak()] }),

    h1('一、作品概述'),
    p(`${work.title}是一件面向数字文旅场景的实时三维交互作品，包含两套彼此独立的夜景场景：南京夫子庙—秦淮河的"秦淮画廊"，与苏州平江路历史街区的"平江夜巷"。两套场景由同一套参数化引擎驱动，各自拥有独立的入口页、机位表与解说文案。`),
    ...work.scenes.map((sc) => p(`【${sc.key}】（${sc.place}，入口 ${sc.entry}）：${sc.note}`)),
    p('使用者可以站在任一景点机位上原地转头环视 360°，也可以脱离机位绕场景自由飞行观察；画面中的发光热点锚定在实体地标上，点击即可把相机送到该处并展开解说。作品不依赖任何摄影素材与外部资源，打开即可运行，也可各自打包为单个 HTML 文件离线双击展示。'),
    h2('关键指标'),
    table([['项目', '指标'], ...work.metrics], [2600, 6700]),

    h1('二、选题背景与立意'),
    p('两处街区的核心价值都集中在"夜"。白天的殿宇牌坊与粉墙黛瓦是静态的，入夜后灯彩沿河次第点亮，才形成"十里秦淮"与"姑苏水巷"的场所感。这类夜间景观恰恰最难被常规数字化手段记录：摄影测量在弱光与高反光下失效，全景照片只能固定视点、无法表现水面把灯光拖成长带的动态关系，短视频则丧失了"我可以自己转头看"的在场感。'),
    p('作品因此选择了一条氛围优先的路径：不追求逐砖逐瓦的测绘复制，而是把中式建筑的形制规律（屋顶反曲、四角起翘、柱网开间、封火山墙、匾额题字）与灯会的色彩配比抽象成参数，用代码重建"可信的夜"。第二场景的加入把这条路径变成了一项可验证的能力——同一套引擎、同一批构件函数、同一个渲染管线，换掉形制参数与机位文案即可迁移到另一座城市。'),
    p('立意的另一层是"公共性"。两套场景的最终产物各是一个约 1.4 MB 的 HTML 文件，不需要 GPU 服务器、不需要安装、不需要网络，景区公众号、展馆一体机、学生平板都能直接打开，这让文化数字化的成果不必停留在演示视频里。'),

    h1('三、创意来源'),
    ...work.creative.flatMap(([title, text]) => [h2(title), p(text)]),

    h1('四、作品呈现：两组机位'),
    h2('4.1 秦淮画廊（南京）'),
    p('机位既是观展路线，也是解说结构。六处景点机位沿河道自上游桃叶渡排到下游江南贡院，文德桥居中，西岸画廊与东岸庙宇隔水相望。'),
  ];

  const renderStations = (list) => list.forEach(([name, file, text]) => {
    fig += 1;
    kids.push(h2(`${fig}. ${name}`));
    kids.push(picture(file, 600, 338));
    kids.push(caption(`图 ${fig}　${name}机位实时渲染画面`));
    kids.push(p(text));
  });
  renderStations(work.stations);

  kids.push(h2('4.2 平江夜巷（苏州）'));
  kids.push(p('第二场景的动线自河埠头起，经写意石拱桥、河沿美人靠、横巷深处、临河书场，终于街口望塔，最后抬升为鸟瞰以检验"双棋盘"格局。'));
  renderStations(work.pjStations);

  fig += 1;
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(h2('交互界面'));
  kids.push(picture('00-ui.png', 460, 377));
  kids.push(caption(`图 ${fig}　全景漫游界面：顶部视角模式与帧率，右侧参数面板，底部景点导航条，右下罗盘`));
  kids.push(p('界面遵循"少遮挡"原则：参数面板在小屏下默认收起，解说卡片在开场十余秒后自动让位给画面，罗盘实时指示当前朝向，便于在导览场景中口头定位"往左再转一点"。两套场景共用同一套界面组件，仅配色不同——秦淮用金粉朱红，平江用水墨竹青。'));

  kids.push(h1('五、产品技术方案'));
  kids.push(h2('5.1 模块划分'));
  kids.push(table([['模块', '职责'], ...work.modules], [2900, 6400]));
  kids.push(h2('5.2 双场景架构与迁移成本'));
  kids.push(p('共享层与场景层的边界是刻意划出来的：kit / textures / water / controls / hotspots / ui 六个模块只描述"怎么画"，不描述"画哪座城"；场景侧的 environment / architecture / props / data 四个模块只描述形制与文案。为了让第二场景不必改动第一场景，共享层做了三处最小改造：界面默认参数由常量导入改为构造时注入；水面着色器所需的河宽、河长与月光方向由模块常量改为形参（默认值保持秦淮原状）；人流系统的行走路径与桥面曲线由硬编码改为可注入函数，秦淮的中轴桥弧线成为该参数的一个默认实现。'));
  kids.push(p('打包脚本同步改为多入口：同一份 CSS 与 HTML 模板，配合不同的入口页与入口模块，产出两个互不依赖的单文件。第二场景另提供机位深链（#station=、#eye=&at=、#bare），既用于自检构图，也可作为展陈时的直达链接。'));
  kids.push(h2('5.3 程序化建模'));
  kids.push(p('建筑构件全部由函数生成。核心是中式屋顶的参数化曲面：在矩形网格上以"到脊线的归一化距离"求高度，坡面用 t 与 √t 的混合实现反曲（近脊陡、近檐缓），四角再叠加随角梁方向增长的起翘项。庑殿顶的脊线折痕由 max(dzN, dxN) 这一度量精确落在角梁位置上——早期版本用两项相加，会把长向屋顶压成一片平板并让四角外翻，是实测中修正掉的关键缺陷。同一函数通过改变宽高比与脊长比例，即生成廊顶、桥亭、重檐大殿、牌坊楼头、照壁压顶与江南民居的两坡水屋顶。'));
  kids.push(p('江南民居另需处理山墙：观音兜形式的封火墙用带二次曲线的挤出体生成，垂直于屋脊闭合两坡面，这是两个街区在轮廓上最直观的差别。此外还有石驳岸在河埠处的分段开洞、随拱起翘的桥面（侧墙轮廓与桥面共用同一个标高函数，桥面、望柱与栏板沿同一条曲线排布）、以及巷道的双墙夹缝与巷口石库门。'));
  kids.push(p('立柱、柱础、栏杆（地栿/寻杖/望柱/栏板）、斗拱叠块、匾额与题字同样参数化。为避免绘制调用失控，长廊立柱使用实例化网格，梁枋与斗拱按材质合并为单一几何体。'));
  kids.push(h2('5.4 程序化贴图'));
  kids.push(p('瓦垄、木构纹理、石作砌缝、墙面、纸灯肋纹、窗棂花格、云团、光晕与光柱衰减，全部在 canvas 上按参数绘制后作为纹理使用，匾额文字直接用系统字体绘制成贴图。因此仓库内没有任何图片素材，也不产生网络请求，同时保证任何机器上渲染出的都是同一张图。'));
  kids.push(h2('5.5 水面与灯影'));
  kids.push(p('水面由三层合成。第一层是水面本身：顶点做低频起伏，片元用与顶点同源的波函数解析求导得到法线，再按菲涅尔项混合深水色与天空反射色，月光高光被限制在朝向月亮的窄带内，避免整条河泛白。第二层是倒影：把建筑组沿水面镜像，替换为暗化材质并在顶点阶段注入随时间摆动的水纹扰动，按入水深度淡出。第三层是灯影光柱：每盏登记在水面上的灯具对应一根竖直朝向相机的加性混合实例面片，带闪烁与横向摆动，随花灯密度开关联动熄灭。'));
  kids.push(p('两条河的宽度差了一个量级，灯影方案因此分级。秦淮河面宽阔，竖直光柱足以撑起画面；平江河仅约 7 米宽，浅视角会把光柱压成一条线，于是改为"跨河灯串 + 贴水光池"的组合——灯串把光源真正放到水面上方，光池用一组沿河铺开的加性混合面片补足近处的可读性。开发过程中修正了两个真实缺陷：半透明水面会透出天球穹顶下半球的亮色导致整条河"白天化"，通过把地平线以下压暗解决；高频细波在远距离产生摩尔纹，通过随距离把细节波交接给低频长波解决。'));
  kids.push(h2('5.6 光照与后期'));
  kids.push(p('每个场景只有一轮固定的月亮作为主光方向常量，配合半球光与多组暖色点光模拟两岸灯彩的溢光；月光投影只渲染一次后关闭阴影自动更新，把静态阴影的开销摊薄为零。后期采用 UnrealBloom 泛光 + 统一的输出通道：因为渲染进入的是半浮点离屏缓冲，材质阶段不做色调映射，色调与色彩空间转换统一在输出通道完成，灯具颜色因此可以超过 1.0 而成为真正的高光，泛光阈值也才能稳定卡住。两城的月光方向、色温与雾密度分别标定：秦淮偏暖偏开，平江偏冷偏窄。'));
  kids.push(h2('5.7 交互设计'));
  kids.push(p('两种相机行为共用一套代码：全景模式下相机钉在机位上，拖拽改变朝向并带惯性，滚轮调节视野角（22°–96°）模拟变焦；自由模式下围绕目标点环绕、推拉与平移。机位切换用带角度最短路径的补间飞行，触屏支持单指环视与双指捏合。热点标签每帧投影到屏幕坐标，背向相机、超出视野或属于当前机位时自动隐藏。'));
  kids.push(h2('5.8 工程与性能'));
  kids.push(p('工程无构建步骤：源码为原生 ES Module，通过 importmap 解析 three.js 与官方附加模块。开发期由仓库自带的 Node 脚本提供零依赖本地服务（禁用缓存，改完刷新即生效）；提交与展陈期由自研打包脚本把整张模块图编译为单文件 HTML——每个模块被编译成注册表中的工厂函数，使 three.js、附加模块与自有代码各自保有独立作用域，避免顶层标识符冲突。渲染侧提供画质自适应，持续低帧时依次降低分辨率与关闭倒影，并明确提示用户可手动下调花灯密度。'));

  kids.push(h1('六、创新点'));
  work.innovations.forEach(([title, text]) => {
    kids.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, font: CJK, bold: true, size: 21, color: '2F4A63' })] }));
    kids.push(p(text));
  });

  kids.push(h1('七、实测与验证'));
  kids.push(p('以下数据在 1280×720、设备像素比 1.0 条件下由页面内置统计接口与离线几何统计共同给出，绘制调用与三角面数为每帧均值。'));
  kids.push(table([['指标', '数值'], ...work.measurements], [2900, 6400]));
  kids.push(p('功能层面已完成逐项验证：十四处机位构图与遮挡检查、拖拽环视与惯性、滚轮变焦、热点点击传送与解说弹出、全景/自由模式互切、花灯密度归零时灯具与水面光柱同步熄灭、自动巡览、参数恢复默认、画面截图导出。渲染层无 WebGL 报错与着色器编译失败。第二场景在开发过程中通过无头浏览器逐机位截图复核构图，修正了驳岸过高遮挡水面、机位视高过低、拱桥券圈半径与桥面不匹配等三处构图缺陷。'));
  kids.push(p('复测命令（浏览器控制台执行，返回每帧绘制调用与三角面数）：', { after: 60 }));
  kids.push(p('　qinhuai.renderer.info.autoReset = false; qinhuai.renderer.info.reset();', { size: 18, color: '555555', after: 40 }));
  kids.push(p('　// 连续观察 60 帧后读取 renderer.info.render.calls / triangles；平江场景句柄为 window.pingjiang', { size: 18, color: '555555', after: 200 }));

  kids.push(h1('八、应用价值与推广'));
  work.value.forEach(([title, text]) => kids.push(bullet(`${title}：${text}`)));

  kids.push(h1('九、局限与后续计划'));
  work.limits.forEach((l) => kids.push(bullet(l)));
  kids.push(h2('下一步'));
  work.next.forEach((n) => kids.push(bullet(n)));

  kids.push(h1('十、原创性与素材声明'));
  kids.push(p(work.originality));

  kids.push(h1('十一、团队与分工'));
  kids.push(table([
    ['成员', '角色', '主要工作'],
    [t.leader, '负责人 / 技术与设计', '总体方案、渲染与交互实现、双场景架构、性能调优'],
    [t.members, '成员', '建筑形制与史料整理、机位与构图、解说文案'],
    [t.members, '成员', '视觉风格与配色、测试与展陈材料'],
    [t.teachers, '指导老师', '选题指导与文化内容审订'],
  ], [2600, 2400, 4300]));

  kids.push(h1('附录 A　运行环境与复现'));
  kids.push(table([['项目', '说明'], ...work.runtime], [2600, 6700]));
  kids.push(h2('操作键位'));
  kids.push(p('左键拖拽环视 / 右键或两指平移 / 滚轮变焦 / A·D 切换景点 / 空格自动巡览 / P 切换视角模式 / F 全屏 / H 帮助 / Esc 关闭面板。'));
  kids.push(h2('构建与运行命令'));
  kids.push(table([
    ['命令', '作用'],
    ['npm run dev', '启动零依赖本地服务，打开 http://127.0.0.1:8765/index.html 或 /pingjiang.html'],
    ['npm run build', '打包秦淮场景单文件到 dist 目录'],
    ['npm run build:pingjiang', '打包平江场景单文件到 dist 目录'],
    ['npm run build:all', '两个场景一并打包'],
    ['npm run submission', '由本脚本从同一份内容源重新生成申报报告与路演文稿'],
  ], [3400, 5900]));

  kids.push(h1('附录 B　史实与写意边界'));
  kids.push(p('为避免把艺术处理误读为测绘成果，逐条列明两处场景的依据与添加：'));
  work.limits.forEach((l) => kids.push(bullet(l)));
  kids.push(bullet('秦淮场景：夫子庙始建于北宋景祐元年（1034）、江南贡院鼎盛期号舍两万余间、文德桥"二分明月"之说、桃叶渡得名于东晋王献之送别桃叶，均为公开史料与通行说法；今日大成殿等建筑按清末形制于上世纪八十年代重建。'));
  kids.push(bullet('平江场景：南宋绍定二年（1229）《平江图》刻石所载水陆并行格局、通利桥与朱马交桥与胡厢使桥与唐家桥与雪糕桥等桥名、悬桥巷与钮家巷与大儒巷与菉葭巷与中张家巷等巷名、报恩寺塔九级八面砖身木檐高约 76 米且始建于三国吴赤乌年间，均有公开资料可查；桥与巷的数量、位置关系与单孔石拱桥为构图需要做的写意安排。'));

  return new Document({
    creator: work.team.school,
    title: `${work.title}${work.subtitle} 作品申报报告`,
    description: work.contest,
    styles: { default: { document: { run: { font: CJK, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } }, children: kids }],
  });
}

/* ------------------------------------------------------------------ slides */
const NAVY = '0A1124', GOLD = 'E6C084', WHITE = 'FFFFFF', DIM = 'A9B3CC', RED = 'C8503C';

function buildDeck() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: 13.333, height: 7.5 });
  pptx.layout = 'W16x9';
  pptx.author = work.team.school;
  pptx.title = `${work.title} ${work.subtitle}`;

  const base = (s, title, kicker) => {
    s.background = { color: NAVY };
    s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: GOLD } });
    if (kicker) s.addText(kicker, { x: 0.7, y: 0.42, w: 12, h: 0.3, fontFace: CJK, fontSize: 12, color: GOLD, charSpacing: 3 });
    if (title) s.addText(title, { x: 0.68, y: 0.72, w: 12, h: 0.7, fontFace: CJK, fontSize: 28, bold: true, color: WHITE });
    return s;
  };
  const bullets = (s, items, opt) => s.addText(items.map((t, i) => ({
    text: t, options: { bullet: { code: '25AA', indent: 14 }, color: DIM, breakLine: i < items.length - 1, paraSpaceAfter: 10 },
  })), { fontFace: CJK, fontSize: 15, valign: 'top', ...opt });
  const grid = (s, files, y0) => {
    files.forEach(([f, label], i) => {
      const x = 0.6 + (i % 2) * 6.2, y = y0 + Math.floor(i / 2) * 2.75;
      s.addImage({ data: img(f), x, y, w: 5.9, h: 2.35 });
      s.addText(label, { x, y: y + 2.36, w: 5.9, h: 0.3, fontFace: CJK, fontSize: 11.5, color: GOLD });
    });
  };

  let s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addImage({ data: img('02-bridge.jpg'), x: 0, y: 0, w: 13.333, h: 7.5, transparency: 30 });
  s.addShape('rect', { x: 0, y: 4.0, w: 13.333, h: 3.5, fill: { color: '05080F', transparency: 22 } });
  s.addText(work.title, { x: 0.9, y: 4.2, w: 11.5, h: 1.1, fontFace: CJK, fontSize: 48, bold: true, color: WHITE, charSpacing: 10 });
  s.addText(work.subtitle, { x: 0.95, y: 5.3, w: 11.5, h: 0.5, fontFace: CJK, fontSize: 20, color: GOLD, charSpacing: 2 });
  s.addText(work.slogan, { x: 0.95, y: 5.85, w: 11.5, h: 0.4, fontFace: CJK, fontSize: 13.5, italic: true, color: DIM });
  s.addText(`${work.contest}　|　申报方向：${work.track}\n${work.team.school} ${work.team.college}　团队负责人：${work.team.leader}　指导教师：${work.team.teachers}`,
    { x: 0.95, y: 6.35, w: 11.6, h: 0.8, fontFace: CJK, fontSize: 12.5, color: 'C9D2E8', lineSpacing: 19 });

  s = base(pptx.addSlide(), '为什么是"江南的夜"', '01 / 选题背景');
  s.addImage({ data: img('07-aerial.jpg'), x: 6.85, y: 1.7, w: 5.8, h: 3.26 });
  s.addText('秦淮鸟瞰：灯串沿河道铺成一条暖色带', { x: 6.85, y: 5.0, w: 5.8, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });
  bullets(s, [
    '两处街区的核心价值都在"夜"，而夜景恰恰最难被数字化记录',
    '摄影测量在弱光与高反光下失效；全景照片视点固定，无法表现水面拖长灯影',
    '短视频有画面，但没有"我可以自己转头看"的在场感',
    '本作品的回答：把建筑形制与灯彩配比抽象成参数，用代码重建可信的夜',
    '成果形态：两套场景各一个约 1.4 MB 单文件，无需服务器、网络与安装',
  ], { x: 0.7, y: 1.8, w: 5.9, h: 4.6 });

  s = base(pptx.addSlide(), '创意来源：从文学母题到城市底图', '02 / 创意来源');
  bullets(s, [
    '「桨声灯影」——秦淮河的夜间形象由文学塑造，作品把它拆成渲染目标：灯必须在水面上被第二次看见',
    '南宋《平江图》（1229 刻石）——水陆并行、河街相邻的双棋盘格局，直接决定平江场景的鸟瞰构图',
    '粉墙黛瓦与观音兜山墙——江南民居高墙少窗，故第二场景去掉朱红金顶，改冷灰白墙与更少的暖光',
    '一河一街的尺度——河面半宽 16.5 m 收到 3.4 m，雾更浓、光更近、桥更平',
    '夜声的可视化——评弹与昆曲无法发声，用半支长窗、窗内暖光与挑出幌子暗示声源',
    '只做强夜——立项时明确放弃昼夜切换：夜间信息量小而情绪强',
  ], { x: 0.7, y: 1.75, w: 12, h: 5.2 });

  s = base(pptx.addSlide(), '场景一：秦淮画廊（南京夫子庙）', '03 / 作品呈现');
  grid(s, [['01-gallery.jpg', '秦淮画廊 · 临水复廊'], ['02-bridge.jpg', '文德桥 · 中轴东望'], ['04-paifang.jpg', '天下文枢坊'], ['06-taoye.jpg', '桃叶渡 · 夜游解缆']], 1.6);
  s.addText('7 处机位：画廊 / 文德桥 / 大成殿 / 文枢坊 / 江南贡院 / 桃叶渡 / 空中鸟瞰',
    { x: 0.68, y: 7.0, w: 12, h: 0.35, fontFace: CJK, fontSize: 12, color: DIM });

  s = base(pptx.addSlide(), '场景二：平江夜巷（苏州平江路）', '04 / 作品呈现');
  grid(s, [['pj-01-shuibutou.png', '水埠头 · 一河一街'], ['pj-02-shigongqiao.png', '石拱桥 · 灯河入画'], ['pj-04-yexiang.png', '夜巷 · 粉墙夹灯'], ['pj-07-niaokan.png', '鸟瞰 · 双棋盘格局']], 1.6);
  s.addText('7 处机位：水埠头 / 石拱桥 / 河沿 / 夜巷 / 书场 / 塔影 / 空中鸟瞰（单孔拱桥为写意添加）',
    { x: 0.68, y: 7.0, w: 12, h: 0.35, fontFace: CJK, fontSize: 12, color: DIM });

  s = base(pptx.addSlide(), '核心体验：站定环视 360°，或自由绕场', '05 / 交互设计');
  s.addImage({ data: img('00-ui.png'), x: 7.15, y: 1.75, w: 5.5, h: 4.5 });
  s.addText('界面：视角模式 / 参数面板 / 景点条 / 罗盘', { x: 7.15, y: 6.3, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });
  bullets(s, [
    '双相机模型共用一套机位数据：全景模式钉在机位转头，自由模式环绕推拉',
    '拖拽带惯性，滚轮调视野角 22°–96°，触屏支持单指环视与双指捏合',
    '热点锚定在实体地标（殿顶、桥心、坊楼、巷灯），点击即飞行前往并展开解说',
    '参数面板：灯火密度 / 人流量 / 水面波纹 / 船速 / 灯影辉光 + 自动巡览',
    '两城同一套界面组件，仅配色不同：秦淮金粉朱红，平江水墨竹青',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  s = base(pptx.addSlide(), '难点一：把中式屋顶写成函数', '06 / 产品技术');
  s.addImage({ data: img('04-paifang.jpg'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  bullets(s, [
    '坡面反曲：高度用 t 与 √t 混合，近脊陡、近檐缓',
    '四角起翘：随角梁方向增长的抬升项，控制系数避免翻成"布幔"',
    '庑殿折痕：以 max(dzN, dxN) 让折线精确落在角梁上（早期用相加，长向屋顶被压平）',
    '一套函数覆盖廊顶 / 桥亭 / 重檐大殿 / 牌坊楼头 / 照壁压顶 / 民居两坡水',
    '观音兜山墙用带二次曲线的挤出体，垂直屋脊闭合两坡面',
    '柱网、栏板、望柱、斗拱、匾额题字同样参数化；立柱实例化以控绘制调用',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.6 });
  s.addText('屋顶形制修正后的牌坊与泮池广场', { x: 7.15, y: 4.9, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '难点二：灯影不是贴图，是分层合成', '07 / 产品技术');
  s.addImage({ data: img('pj-03-huyan.png'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  bullets(s, [
    '水面：解析法线波纹 + 菲涅尔天空反射，月光高光限制在朝月的窄带内',
    '倒影：建筑组沿水面镜像，顶点注入水纹摆动，按入水深度淡出',
    '光柱：朝向相机的加性混合面片，带闪烁，与灯火密度开关联动',
    '按河宽分级：秦淮 120 根竖直光柱；平江河窄，改用跨河灯串 + 贴水光池',
    '修正①：水面透出天球下半球导致"白天化"→ 地平线以下压暗',
    '修正②：远距离细波摩尔纹 → 随距离交接给低频长波',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });
  s.addText('窄河上的河埠、美人靠与跨河灯串', { x: 7.15, y: 4.9, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '难点三：框架与场景解耦，迁移成本递减', '08 / 产品技术');
  bullets(s, [
    '共享层只描述"怎么画"：kit / textures / water / controls / hotspots / ui',
    '场景层只描述"画哪座城"：data / environment / architecture / props + 一个入口页',
    '为第二场景所做的全部共享层改造：界面默认值改为注入、水面河宽与月光方向改为形参、人流路径与桥面曲线改为可注入函数',
    '第二场景没有改动第一场景的任何渲染代码，秦淮表现回归验证通过',
    '打包脚本改为多入口：同一份 CSS 与模板，两个互不依赖的单文件产物',
    '新场景另提供机位深链 #station= / #eye=&at= / #bare，用于构图自检与展陈直达',
  ], { x: 0.7, y: 1.8, w: 12, h: 3.5 });
  s.addTable([
    [{ text: '规模', options: { bold: true, color: NAVY, fill: { color: GOLD } } }, { text: '秦淮画廊', options: { bold: true, color: NAVY, fill: { color: GOLD } } }, { text: '平江夜巷', options: { bold: true, color: NAVY, fill: { color: GOLD } } }],
    ['机位 / 固定灯具', '7 / 201 盏', '7 / 426 盏'],
    ['水面光柱 / 跨河灯串', '120 根 / 6 串', '224 根 / 16 串'],
    ['离线网格数 / 三角面数', '496 / 约 23.0 万', '1,122 / 约 18.8 万'],
  ], { x: 0.7, y: 5.5, w: 12, fontFace: CJK, fontSize: 12.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.34, colW: [4.4, 3.8, 3.8] });

  s = base(pptx.addSlide(), '零构建、零依赖、可离线交付', '09 / 工程实现');
  bullets(s, [
    '原生 ES Module + importmap，three.js（MIT）与附加模块随仓库 vendor，无运行时依赖',
    '开发：仓库自带 Node 零依赖静态服务，禁用缓存，改完刷新即生效',
    '交付：自研打包器把模块图编译为约 1.4 MB 单文件 HTML，双击即运行',
    '打包要点：每个模块编译为独立工厂函数，避免顶层标识符冲突',
    '踩坑：String.replace 会把源码里的 "$" 当成替换模式，必须用函数式替换',
    '画质自适应：持续低帧依次降分辨率、关倒影，并提示手动下调灯火密度',
  ], { x: 0.7, y: 1.8, w: 12, h: 3.6 });
  s.addTable([
    [{ text: '运行环境', options: { bold: true, color: NAVY, fill: { color: GOLD } } }, { text: '说明', options: { bold: true, color: NAVY, fill: { color: GOLD } } }],
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），源码即运行码'],
    ['浏览器', '支持 WebGL2 与现代 ES Module 的桌面/移动浏览器'],
    ['离线展示', 'npm run build:all → dist 下两个单文件，双击即可运行'],
    ['输入方式', '鼠标 / 触屏（单指环视、双指捏合）/ 全键位键盘'],
  ], { x: 0.7, y: 5.55, w: 12, fontFace: CJK, fontSize: 12.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.34, colW: [2.6, 9.4] });

  s = base(pptx.addSlide(), '创新点小结', '10 / 创新点');
  work.innovations.forEach(([title], i) => {
    const y = 1.7 + i * 0.87;
    s.addShape('roundRect', { x: 0.7, y, w: 12, h: 0.74, fill: { color: '111B33' }, line: { color: '2A3550', width: 0.75 }, rectRadius: 0.06 });
    s.addText(String(i + 1).padStart(2, '0'), { x: 0.85, y: y + 0.12, w: 0.7, h: 0.5, fontFace: CJK, fontSize: 18, bold: true, color: RED });
    s.addText(title, { x: 1.55, y: y + 0.14, w: 11, h: 0.5, fontFace: CJK, fontSize: 14, bold: true, color: WHITE });
  });
  s.addText('展开说明见申报报告第六章', { x: 0.7, y: 7.0, w: 8, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '实测与验证', '11 / 实测');
  s.addImage({ data: img('pj-06-taying.png'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  s.addTable([
    [{ text: '指标', options: { bold: true, color: NAVY, fill: { color: GOLD } } }, { text: '数值', options: { bold: true, color: NAVY, fill: { color: GOLD } } }],
    ...work.measurements.slice(0, 5),
  ], { x: 0.7, y: 1.8, w: 6.2, fontFace: CJK, fontSize: 11.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.46, colW: [2.1, 4.1] });
  bullets(s, [
    '14 处机位逐一无头截图复核构图与遮挡',
    '平江场景修正：驳岸过高遮挡水面、机位视高过低、拱券与桥面不匹配',
    '灯火归零时灯具与水面光柱同步熄灭，参数与画面严格联动',
    '渲染层无 WebGL 报错、无着色器编译失败',
  ], { x: 7.15, y: 5.0, w: 5.5, h: 1.9 });

  s = base(pptx.addSlide(), '应用价值与推广', '12 / 价值');
  work.value.forEach(([title, text], i) => {
    const x = 0.7 + (i % 2) * 6.2, y = 1.75 + Math.floor(i / 2) * 1.9;
    s.addShape('roundRect', { x, y, w: 5.8, h: 1.7, fill: { color: '111B33' }, line: { color: '2A3550', width: 0.75 }, rectRadius: 0.08 });
    s.addText(title, { x: x + 0.22, y: y + 0.14, w: 5.4, h: 0.35, fontFace: CJK, fontSize: 14.5, bold: true, color: GOLD });
    s.addText(text, { x: x + 0.22, y: y + 0.52, w: 5.4, h: 1.1, fontFace: CJK, fontSize: 11.5, color: DIM, lineSpacing: 16 });
  });

  s = base(pptx.addSlide(), '局限、下一步与声明', '13 / 反思');
  bullets(s, [
    '写意重建而非测绘模型：比例与灯位经过艺术化处理，不用于工程或保护规划',
    '形制添加已标注：平江的单孔石拱桥为构图需要，真桥多为低平石梁桥',
    '人群与船只为示意密度，未做真实客流与航运仿真；作品不含音频',
    '下一步：接入倾斜摄影 · 补昼夜四季与天气 · 封装 WebXR · 沉淀为可配置场景模板',
    `原创声明：${work.originality}`,
  ], { x: 0.7, y: 1.8, w: 12, h: 4.2 });
  s.addText(`${work.team.school} ${work.team.college}　|　${work.team.leader}　|　指导：${work.team.teachers}　|　${work.team.date}`,
    { x: 0.7, y: 6.6, w: 12, h: 0.4, fontFace: CJK, fontSize: 12, color: GOLD });

  return pptx;
}

/* ------------------------------------------------------------------ run */
const { writeFile } = await import('node:fs/promises');
const report = await Packer.toBuffer(buildReport());
await writeFile(join(OUT, '灯影江南-作品申报报告.docx'), report);
await buildDeck().writeFile({ fileName: join(OUT, '灯影江南-路演.pptx') });
console.log('已生成：');
console.log('  docs/灯影江南-作品申报报告.docx');
console.log('  docs/灯影江南-路演.pptx');
