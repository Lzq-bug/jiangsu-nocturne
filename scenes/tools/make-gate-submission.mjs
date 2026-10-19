/**
 * Generates the CMIT submission pack for the third scene (东方之门 · 金鸡湖) —
 * a standalone work with its own report .docx and pitch .pptx, built from one
 * shared content source so that editing the text and re-running rebuilds both.
 *   node tools/make-gate-submission.mjs
 *
 * Kept separate from make-submission.mjs on purpose: 灯影江南 is a two-scene
 * heritage entry, this one is a contemporary landmark and must not inherit that
 * narrative.
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
  title: '湖光门影',
  subtitle: '苏州东方之门 · 金鸡湖 3D 夜景全景漫游系统',
  track: '数字文化传播 / 城市夜景数字化（赛道细分以通知附件 2 为准）',
  contest: '2026 年第十四届全国大学生数字媒体科技作品及创意竞赛（CMIT）',
  slogan: '把一座三百米的当代地标，连同它落在金鸡湖里的第二份拷贝，重建为可自由站定环视的夜',
  team: {
    school: '【学校名称】', college: '【学院 / 系】', major: '【专业班级】',
    leader: '【负责人姓名 / 学号】', members: '【队员姓名 / 学号】',
    teachers: '【指导老师 1 / 指导老师 2】', contact: '【联系人 / 电话 / 邮箱】',
    date: '2026 年 10 月',
  },
  overview: '作品以苏州工业园区金鸡湖西岸的东方之门为对象，用参数化三维重建复现其夜间形象：两座塔楼在约 240 米高度收拢成拱、由空中连廊连成"门"字，幕墙灯窗、拱缘灯带、楼体灯光秀、探照光柱与湖西音乐喷泉同时点亮，金鸡湖把这一切接住并揉碎成倒影。使用者可站在六处机位之一原地环视 360°，也可脱离机位自由绕场；全部几何、贴图、灯光由代码生成，不引用任何摄影素材与网络资源，最终交付为一个约 1.4 MB 的单文件 HTML，双击即可运行。',
  metrics: [
    ['机位与解说', '6 处（湖东右岸 / 城市阳台 / 门洞之下 / 空中连廊 / 音乐喷泉 / 空中鸟瞰），热点锚定实体地标'],
    ['主体几何', '门形主体一次挤出成型：外立面与拱洞各由一条解析函数控制，302 m 高、300 m 跨度、62 m 进深'],
    ['幕墙窗格', '200 开间 × 76 层 = 15,200 格，随机点亮约 58%（约 8,800 格），另约 10% 楼层以整层灯带点亮'],
    ['城市环境', '环湖塔群 155 栋（湖西 74 / 两翼 52 / 湖东 26 + 3 栋地标塔）、远景剪影 520 块与 520 个窗光点'],
    ['水面与灯影', '金鸡湖水面 3,400 × 1,046 m；镜像倒影副本 18,316 三角面；水面光柱 46 根（拱缘 19 / 塔冠裙房 5 / 喷泉 22）'],
    ['动态元素', '音乐喷泉 420 粒（30 组喷嘴 × 14 粒同抛物线）、环湖车流 156 点、探照光柱 4 束、塔顶航空灯 2 座'],
    ['灯光秀', '媒体立面为独立加性网格，色相轮播 + 节拍脉冲统一编排，与喷泉、光柱、探照灯同步呼吸'],
    ['工程形态', '12 个模块约 3,050 行，零运行时依赖；单文件版 1.39 MB'],
  ],
  stations: [
    ['湖东右岸 · 隔湖望西', 'gate-rightbank.jpg', '金鸡湖是苏州工业园区的城市内湖，从东岸望过去，门形的两个塔腿在上方收拢、顶部一段才是真正横穿的空中连廊。夜里灯先把这条轮廓描出来，人眼才认得出体量；水面接住整栋楼，形成第二份拷贝。'],
    ['城市阳台 · 贴水仰视', 'gate-balcony.jpg', '湖西的滨水平台把地面一级级降到水边，台阶没入湖中。这个机位放弃了可读的整体轮廓，换取 302 米高度压在头顶的比例感——画面里唯一可靠尺度是 6 米高的路灯与 1.15 米的栏杆。'],
    ['门洞之下 · 拱腹曲线', 'gate-arch.jpg', '塔腿之间是通透的城市通道。站在这里才看得清内立面如何随高度倾斜、在两百余米高处合拢。拱腹用一条带椭圆帽的分段函数生成，避免曲线在顶部退化成尖点。'],
    ['空中连廊 · 高空平台', 'gate-bridge.jpg', '约 240 米标高的观景平台，视线与湖面近乎平行。湖东塔群缩小成背景，水面把它们的灯压成一条横向的亮带——这也是全场景唯一一处"人站得比楼群高"的机位。'],
    ['音乐喷泉 · 水上灯阵', 'gate-fountain.jpg', '浮筒排成一条长线横在门前湖面，喷嘴按程序分段跳起。每个喷嘴用 14 个粒子沿同一条抛物线错相排布，才读得出"水柱"而不是一团水雾；水柱落回水面时由光柱补足竖向拖影。'],
    ['空中鸟瞰 · 湖与城的边界', 'gate-aerial.jpg', '抬高视角，门形屋顶只剩一条横线，环湖道路与塔群重新排布成一张平面图。灯光秀在这时最清楚：整座楼体是一块可被写入的屏幕，而倒影是它的第二份拷贝。此帧也用于检验整体构图与灯光配比。'],
  ],
  creative: [
    ['"门"作为可读的城市符号', '东方之门的民间称呼与它的官方名称之间有一种张力：人们先认出的是一个动作——一扇门，然后才认出它是一栋楼。作品的第一个决定因此是"夜里先把轮廓点亮"：拱缘用发光管描线、塔冠用一道冷色檐口收边，让三百米高的体量在任何距离上都能被一眼读成"门"。'],
    ['城市内湖是第二块屏幕', '金鸡湖的夜间价值大半在倒影。作品因此没有把水面当作贴图：顶点做低频起伏，片元用与顶点同源的波函数解析求导得到法线，再按菲涅尔项混合深水色与天空反射色，最后把建筑与楼群沿水面镜像、注入水纹摆动。水面透明度按入射角调节——俯视时看进dark水里，平视时让倒影透出来。'],
    ['当代地标同样需要数字化存档', '与前作的历史街区不同，本件对象是 21 世纪的建筑。它没有被测绘保护的紧迫性，却同样是城市记忆的一部分：楼体灯光秀有节目单、有编排、有季节差异，而这些恰恰没有任何公开的可交互记录。作品把"氛围数字化"这条路从遗产延伸到当代城市。'],
    ['看不见的音乐', '音乐喷泉与楼体灯光秀都跟着音乐走，作品不含音频，于是把"编排"转译为可见的节奏：色相沿色轮轮播，节拍脉冲同时驱动媒体立面的亮度、喷泉的高度、探照灯的开合与水面光柱的强度——所有元素共用同一个时间函数，观众听不到音乐，但看得到它在打拍子。'],
    ['尺度靠近处的东西撑起来', '三百米的单体在画面里没有可比物。作品用三级尺度锚解决：近处 6 米路灯与 1.15 米栏杆、中景 18 米裙房与 62 米进深、远景车流与塔群窗格。鸟瞰机位之所以成立，正是因为地面上那些"小点"仍然可辨。'],
    ['只做强夜', '与前作一致，立项时明确放弃昼/夜切换：白天信息量大而情绪弱，夜间信息量小而情绪强；而且对这座楼来说，白天它只是一栋玻璃幕墙高楼，夜里它才是一扇门。'],
  ],
  innovations: [
    ['凹形"门"体的一次成型挤出', '把"门"的立面写成一条闭合的凹多边形轮廓：外立面半宽与拱洞半宽各由一条解析函数给出（幂律直段 + 椭圆帽），再沿进深方向挤出成体。相比用两个塔楼加一座连廊拼装，这样得到的拱腹与塔身是同一张连续表面，接缝、法线与贴图都无需二次处理。'],
    ['以米为单位的立面贴图，整栋楼不重复', '挤出体的顶面 UV 直接取世界坐标的米值，因此一张 2048² 画布恰好铺满 300 × 302 m 的整立面，200 开间 × 76 层窗格逐格随机点亮且无平铺接缝。若沿用常规平铺，同一窗格图案会在立面上重复上百次，夜景立刻失真。'],
    ['倒影与水面联动合成', '镜像组画在水面之下，水面按菲涅尔项调节自身透明度：俯视时水面近乎不透明、遮住倒影，平视时透明度下降、倒影浮出。开发中修正了两个真实缺陷——加性混合的镜像在浅视角会层层堆叠压成一条横贯画面的白带；以及靠近机位的小尺寸高亮灯带（观景台扶手）会糊成整幅画面的亮条。'],
    ['灯光编排与建筑本体解耦', '媒体立面是同一个轮廓生成的独立加性网格，不参与建筑几何；色相与节拍由一个纯函数 showState(t) 给出，媒体立面、喷泉、探照灯、水面光柱各自读取同一状态。改节目只需改这一个函数，也便于日后接入真实节目单。'],
    ['喷泉用"同抛物线错相"而非粒子系统', '每个喷嘴的 14 个粒子共用一条抛物线、按相位错开，在顶点着色器里由时间求位置，CPU 每帧零开销。相比随机粒子系统，这样才读得出连续水柱；粒子数从 860 降到 420，观感反而更实。'],
    ['零构建、零依赖、可离线交付', '原生 ES Module + importmap 直跑，three.js（MIT）随仓库 vendor；自研打包器把模块图编译为 1.39 MB 单文件 HTML，双击即运行。场景另提供机位深链（#station= / #eye=&at= / #bare），既用于开发期逐机位构图自检，也可作为展陈与导览的直达链接。'],
  ],
  modules: [
    ['gate/src/data.js', '门体尺寸常量（高 302 / 半幅 150 / 进深 62 / 拱半宽 88 / 拱顶 228）、湖体范围、6 处机位坐标与解说文案、参数默认值'],
    ['gate/src/gate.js', '门形轮廓的解析函数与挤出成型、拱缘发光管、塔冠檐口、空中连廊与观景平台、裙房与骑楼柱、滨水台阶与路灯'],
    ['gate/src/textures.js', '立面窗格画布（反照率 + 自发光双通道）、城市窗光贴片、铺地、光晕、光柱衰减、噪声，全部 canvas 实时绘制'],
    ['gate/src/lake.js', '水面着色器（解析法线 + 菲涅尔天空反射 + 月光滑轨 + 距离雾）、镜像倒影组与顶点水纹、实例化水面光柱'],
    ['gate/src/show.js', '媒体立面灯光秀、探照光柱、音乐喷泉粒子与色相编排（showState）'],
    ['gate/src/skyline.js', '环湖塔群与湖东地标（放样锥形棱柱，UV 以米计）、远景剪影与窗光点、环湖车流'],
    ['gate/src/sky.js', '夜空着色器（城市光霾 / 月晕 / 流云）、星点、月光与半球光、环湖补光与距离雾'],
    ['gate/src/controls.js · hotspots.js · ui.js · kit.js', '双相机模型与机位补间、地标锚定热点与投影标签、参数面板与快捷键、材质与几何工具'],
    ['gate/src/main.js', '装配与渲染管线、参数联动、画质自适应、截图导出、机位深链与调试句柄'],
    ['tools/build-single.mjs · serve.mjs · measure-gate.mjs', '多入口单文件打包、零依赖本地服务、逐机位性能与几何统计'],
  ],
  measurements: [
    ['测试条件', '1280 × 720，设备像素比 1.0，无头浏览器 + SwiftShader 软件渲染（无 GPU）'],
    ['每帧绘制调用', '58 – 104 次（含 5 遍泛光模糊与输出合成通道）'],
    ['每帧三角面数', '64,656 – 73,720（含倒影镜像副本）'],
    ['离线几何统计', '62 个网格 / 4 个点云 / 1 个实例化网格；本体 37,294 三角面，倒影副本 18,316 三角面'],
    ['常驻资源', '着色器程序 56 个（含后期增至 58）；几何体 50 个；纹理 28 张'],
    ['软件渲染帧率', '5.6 – 196 fps，随机位而异，仅为无 GPU 条件下的下限参考，不代表真实显卡表现'],
    ['首帧构建耗时', '约 8.0 秒（软件渲染下含 56 个着色器程序编译与画布贴图绘制）'],
    ['交付体积', '单文件 HTML 1.39 MB；场景源码 12 个模块约 3,050 行，无任何图片 / 模型 / 字体位图素材'],
  ],
  runtime: [
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），无构建步骤，源码即运行码'],
    ['运行时依赖', '零 npm 运行时依赖。three.js r160（MIT）与其附加模块随仓库 vendor 在本地，运行期不产生任何网络请求'],
    ['浏览器要求', '支持 WebGL2 与现代 ES Module 的桌面 / 移动浏览器（Chrome、Edge、Firefox、Safari 均可）'],
    ['在线预览', 'npm run dev 启动仓库自带的零依赖静态服务（禁用缓存），打开 http://127.0.0.1:8765/gate/index.html'],
    ['离线展示', 'npm run build:gate 生成 dist/东方之门金鸡湖-3D夜景.html（1.39 MB），双击即可运行，无需网络与服务'],
    ['直达链接', '#station=arch 等机位深链、#eye=x,y,z&at=x,y,z&fov= 自由视点、#bare 隐藏界面用于出图'],
    ['推荐配置', '独显或较新核显、1920×1080 窗口；移动端 SoC 建议开启画质自适应或下调灯光秀强度'],
    ['输入方式', '鼠标拖拽 / 滚轮变焦、触屏单指环视与双指捏合、键盘 A·D·Space·P·F·H·Esc 全键位'],
    ['复现与度量', 'npm run submission:gate 由同一内容源重产报告与路演；node tools/measure-gate.mjs 重跑逐机位性能统计'],
  ],
  value: [
    ['城市夜游与灯光秀预演', '楼体亮度、色相编排、喷泉高度与光柱强度都是实时参数，可作为灯光秀编排的可视化预演与节目单沟通工具。'],
    ['文旅目的地的轻量分发', '单文件 HTML 可直接嵌入景区公众号、小程序 webview 与官网，不需要 GPU 服务器，弱网与离线可用。'],
    ['摄影与展陈的机位预演', '六处机位与深链等价于六个可复现的取景方案，踩点、构图与光线配比都能在开工前于浏览器里定稿。'],
    ['参数化地标建模的教学样例', '凹形轮廓一次挤出、以米为单位的立面贴图、分层水面合成，是可直接拆解讲授的计算设计案例。'],
    ['与前作共用的迁移方法', '本件是同一套引擎迁移出的第三个场景，验证了"新增一座城只重写形制与文案、渲染层不动"的边际成本递减路径。'],
  ],
  limits: [
    '作品为写意重建：建筑高度、跨度、连廊标高与灯位均按观感取整与调整，不是测绘级模型，不能用于工程、产权或保护规划用途。',
    '观景平台、拱腹灯槽、部分塔冠与裙房屋顶灯带是为构图与可读性所做的形制添加，不对应真实做法。',
    '灯光秀的色相轮播与节拍、音乐喷泉的编排与高度均为虚构，不代表金鸡湖真实的灯光节目单或喷泉工程参数。',
    '环湖塔群按分区随机生成，建筑身份与位置关系未做核实，仅用于构成城市底衬与尺度参照。',
    '作品不含音频，喷泉与灯光秀的"音乐性"仅以同步的节奏与色彩暗示。',
    '在移动端 SoC 上，高亮度媒体立面与泛光叠加会明显发热，需借助画质自适应或下调灯光秀强度。',
  ],
  next: [
    '接入倾斜摄影或激光点云，把写意几何替换为测绘模型，保留同一套灯光、水面与交互。',
    '把 showState 的时间轴换成可编排的节目单（关键帧 + 音轨对齐），做成真正的灯光秀预演工具。',
    '补昼夜与季节、雨雾天气：雨天的湖面会改变整幅画面的反射结构，是值得单独做一版的状态。',
    '封装 WebXR 会话，进入头显做湖西岸的沉浸式夜游；同时提供语音讲解与多语言字幕。',
    '与前两件合并为"可配置场景模板"：新增一座城只需填写形制参数与机位文案两张表。',
  ],
  originality: '本作品全部源代码、程序化贴图与文案由团队自行创作生成，未使用任何第三方受版权保护的模型、贴图、字体位图或音频素材，仓库内不含任何图片素材文件。渲染基于 three.js r160（MIT 许可，已随源码保留版权声明），后处理泛光与输出通道同样取自 three.js 官方示例并保留原始许可头。关于场地与建筑的背景描述基于公开常识，其中写意与虚构的部分已在报告、作品内说明与限制条款中逐条标注。本件为独立作品，与团队其他参赛作品不重复申报。',
};

/* ------------------------------------------------------------------ helpers */

const shot = (name) => readFileSync(join(SHOTS, name));
const kind = (name) => (name.endsWith('.png') ? 'png' : 'jpeg');
// pptxgenjs wants "image/png;base64,..." rather than a Buffer
const img = (name) => `image/${kind(name)};base64,${shot(name).toString('base64')}`;

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 300 },
  alignment: opts.align,
  children: [new TextRun({ text, font: CJK, size: opts.size ?? 21, bold: opts.bold, color: opts.color })],
});
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 140 }, children: [new TextRun({ text: t, font: CJK, bold: true, size: 28, color: '1D4F74' })] });
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
      shading: i === 0 ? { fill: 'E3F0FA' } : undefined,
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: 'B9CBD9' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'B9CBD9' }, left: { style: BorderStyle.SINGLE, size: 2, color: 'B9CBD9' }, right: { style: BorderStyle.SINGLE, size: 2, color: 'B9CBD9' } },
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
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [new TextRun({ text: work.subtitle, font: CJK, size: 28, color: '1D4F74' })] }),
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
    p(work.overview),
    h2('关键指标'),
    table([['项目', '指标'], ...work.metrics], [2600, 6700]),

    h1('二、选题背景与立意'),
    p('金鸡湖西岸的夜间形象是由三样东西共同构成的：一栋被点亮的门形高楼、一片把高楼完整复制一遍的水面、以及一场跟着音乐走的灯光秀与喷泉。这三样都是转瞬的、依赖光照条件的，因而恰好落在常规数字化手段的盲区里——摄影测量在弱光与高反光下失效，全景照片视点固定且无法表现水面把灯拖长的过程，短视频有画面却没有"我可以自己转头看"的在场感。'),
    p('作品因此延续团队在夜景数字化上的一贯路径：不做逐层逐樘的测绘复制，而是把这座建筑最可识别的形式规律——外立面近乎垂直、内立面随高度收拢、在约 240 米高处合拢成拱、顶部由连廊收口——抽象成两条解析函数，再用代码重建"可信的夜"。灯光是这套重建真正的主角：幕墙窗格逐格随机点亮，拱缘被发光管描出，媒体立面成为一块可写入的屏幕，而水面负责把这一切第二次呈现。'),
    p('立意的另一层是公共性。作品的最终产物是一个约 1.39 MB 的 HTML 文件：不需要 GPU 服务器、不需要安装、不需要网络，景区公众号、展馆一体机、学生平板都能直接打开。城市夜景的数字化成果因此不必停留在一段演示视频里，它可以被任何人随时走进去。'),

    h1('三、创意来源'),
    ...work.creative.flatMap(([title, text]) => [h2(title), p(text)]),

    h1('四、作品呈现：六处机位'),
    p('机位既是观展路线，也是解说结构。六处机位按"远—近—内—高—水上—空中"排布，从隔湖的整体轮廓一路推到塔腿之间的仰视，再抬升到俯瞰湖面与城市边界。'),
    ...work.stations.flatMap(([name, file, text]) => {
      fig += 1;
      return [h2(`${fig}. ${name}`), picture(file, 600, 338), caption(`图 ${fig}　${name}机位实时渲染画面`), p(text)];
    }),
  ];

  fig += 1;
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(h2('交互界面'));
  kids.push(picture('gate-ui.jpg', 460, 259));
  kids.push(caption(`图 ${fig}　全景漫游界面：顶部视角模式与帧率，右侧参数面板，底部机位导航条，右下罗盘`));
  kids.push(p('界面遵循"少遮挡"原则：参数面板在小屏下默认收起，解说卡片在开场十余秒后自动让位给画面，罗盘实时指示朝向，便于导览时口头定位"再往湖心转一点"。配色与前作分开——秦淮用金粉朱红、平江用水墨竹青，本件用钢蓝与冷白，只在裙房与路灯处保留少量暖色，让"当代"这件事在界面层也被说出来。'));

  kids.push(h1('五、产品技术方案'));
    kids.push(h2('5.1 模块划分'));
    kids.push(table([['模块', '职责'], ...work.modules], [3400, 5900]));
    kids.push(h2('5.2 门形主体的解析建模'));
    kids.push(p('建筑被拆成两条函数：外立面半宽 o(y) = 150 − 8·(y/H)²，几乎垂直而略带收分；拱洞半宽 a(y) 用幂律段 a·(1 − u^2.6)^0.72 描述近于直立、在顶部迅速内收的塔身内表面，并在接近拱顶处交接给一段椭圆帽 a·√(1 − t²) 收口。后者是必要的：直接沿用幂律会在拱顶产生垂直切线的尖点，挤出后在该处退化出零面积三角形，光照与贴图都会崩掉。两条函数采样为一条闭合的凹多边形轮廓，沿进深一次挤出成型，得到塔身、拱腹与连廊连续的同一张表面。'));
    kids.push(p('挤出体的顶面 UV 由世界坐标的米值直接给出，因此一张 2048² 画布恰好覆盖 300 × 302 m 的整立面：200 开间 × 76 层的窗格逐格随机点亮，既不重复也无接缝。若按常规做法用平铺贴图，同一窗格图案会在立面上重复上百次，夜景立刻失真。反照率与自发光分作两张画布，前者画玻璃与横梁，后者只画亮着的窗，材质上以 emissiveMap 驱动，因此灯光秀可以整体压暗窗光而不动建筑颜色。'));
    kids.push(h2('5.3 水面、倒影与灯影的分层'));
    kids.push(p('水面分四层。第一层是水体本身：顶点做低频起伏，片元用与顶点同源的波函数解析求导得到法线，按菲涅尔项混合深水色与天空反射色，月光高光被限制在朝向月亮的窄带内，并叠加一层与场景雾同参的距离衰减，使一公里外的湖岸自然融进夜色。第二层是倒影：把建筑组与湖东塔群分别沿水面镜像，替换为暗化材质并在顶点阶段注入随时间摆动的水纹扰动，按入水深度淡出。第三层是水面光柱：拱缘、塔冠、裙房与喷泉线上共 46 个登记点各自生成一根朝向相机的加性混合实例面片，带闪烁与横向摆动。第四层是喷泉落水的贴水光池。'));
    kids.push(p('这一分层是在两个真实缺陷上修正出来的。其一是加性混合的镜像：在观景平台这类浅视角下，数百栋楼的倒影被压缩到地平线附近的一条带上，加性叠加直接堆成一条横贯画面的白带；改为镜像使用与自身 alpha 通道对齐的窗格贴图、以正常混合绘制，并把水面的透明度改为随入射角变化（俯视看进水里、平视透出倒影）。其二是尺度极小的近景发光体：观景台扶手上一条 0.12 米高的灯带，在距离相机 8 米时会横跨整个画面，任何亮度都会糊成亮条——最终把它压到接近不可见，改由栏杆本体承担轮廓。'));
    kids.push(h2('5.4 灯光秀的统一编排'));
    kids.push(p('媒体立面是与建筑同轮廓的独立加性网格，偏移在幕墙之前，只负责"节目"：竖向扫掠、斜向交叉、以拱顶为中心的呼吸环，三种图案按进度混合，LED 像素网格由片元内的分格函数给出，因此远看是整面墙的色块、近看能看见点阵。色相与节拍由一个纯函数 showState(t) 给出，返回进度、脉冲与三种配色；媒体立面、探照灯、喷泉与水面光柱各自读取同一状态，全场景因此同步呼吸。要换成真实节目单，只需替换这一个函数。'));
    kids.push(h2('5.5 城市底衬与尺度'));
    kids.push(p('环湖塔群用同一套放样函数生成：水平截面为圆角矩形，按层级缩放并可选扭转，UV 同样以米为单位，因此所有楼的窗格密度一致、可以合并为单一几何体一次绘制。分区给定高度分布（湖西 46–221 m、两翼 40–170 m、湖东 60–210 m 并置三栋 236 / 292 / 336 m 的地标塔），并强制避让：不落入湖域、不侵入建筑与裙房范围、不压住任何机位。远景以 520 个剪影体块与 520 个窗光点闭合地平线，环湖车流用 156 个沿路段循环的点光源表示，两个方向分别为前照白与尾灯红。'));
    kids.push(h2('5.6 光照、后期与工程形态'));
    kids.push(p('全场景只有一轮固定的月亮作为主光方向常量，配合半球光、两束方向性补光（湖面冷、城侧暖）与五处岸边暖色点光。后期为 UnrealBloom 泛光加统一输出通道：渲染进入的是半浮点离屏缓冲，材质阶段不做色调映射，色调与色彩空间转换统一在输出通道完成，灯具颜色因此可以超过 1.0 成为真正的高光，泛光阈值也才稳定。工程无构建步骤：源码为原生 ES Module，由 importmap 解析依赖；开发期由仓库自带的 Node 脚本提供零依赖本地服务；交付期由自研打包器把整张模块图编译为单文件 HTML，每个模块编译为注册表中的工厂函数，使 three.js、附加模块与自有代码各保独立作用域。渲染侧提供画质自适应，持续低帧时依次降低分辨率与关闭倒影，并明确提示可手动下调灯光秀强度。'));

  kids.push(h1('六、创新点'));
    work.innovations.forEach(([title, text], i) => {
      kids.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${String(i + 1).padStart(2, '0')}　${title}`, font: CJK, bold: true, size: 21, color: '2F4A63' })] }));
      kids.push(p(text));
    });

  kids.push(h1('七、实测与验证'));
    kids.push(p('以下数据由页面内置统计接口在无头浏览器中逐机位采集，绘制调用与三角面数为每帧均值。'));
    kids.push(table([['指标', '数值'], ...work.measurements], [2900, 6400]));
    kids.push(p('功能层面已完成逐项验证：六处机位构图与遮挡检查、拖拽环视与惯性、滚轮变焦、热点点击传送与解说弹出、全景 / 自由模式互切、灯光秀与喷泉强度归零时媒体立面与光柱同步熄灭、自动巡览、参数恢复默认、画面截图导出、单文件离线运行。渲染层无 WebGL 报错与着色器编译失败。构图层面通过无头逐机位截图复核，修正了倒影白带、扶手灯带糊屏、喷泉粒子过粗、观景台机位贴脸栏杆等四处缺陷，并把门洞与城市阳台两处机位的视高与视野角重新标定。'));
    kids.push(p('复测命令（浏览器控制台执行，返回每帧绘制调用与三角面数）：', { after: 60 }));
    kids.push(p('　dongfang.renderer.info.autoReset = false; dongfang.renderer.info.reset();', { size: 18, color: '555555', after: 40 }));
    kids.push(p('　// 连续渲染若干帧后读取 renderer.info.render.calls / triangles，或直接执行 node tools/measure-gate.mjs', { size: 18, color: '555555', after: 200 }));

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
      [t.leader, '负责人 / 技术与设计', '总体方案、门形解析建模、水面与灯光秀实现、性能调优'],
      [t.members, '成员', '场地与建筑资料整理、机位与构图、解说文案'],
      [t.members, '成员', '视觉风格与配色、无头逐机位测试与提交材料'],
      [t.teachers, '指导老师', '选题指导与内容审订'],
    ], [2600, 2400, 4300]));

  kids.push(h1('附录 A　运行环境与复现'));
    kids.push(table([['项目', '说明'], ...work.runtime], [2600, 6700]));
    kids.push(h2('操作键位'));
    kids.push(p('左键拖拽环视 / 右键或两指平移 / 滚轮变焦 / A·D 切换机位 / 空格自动巡览 / P 切换视角模式 / F 全屏 / H 帮助 / Esc 关闭面板。'));
    kids.push(h2('构建与运行命令'));
    kids.push(table([
      ['命令', '作用'],
      ['npm run dev', '启动零依赖本地服务，打开 http://127.0.0.1:8765/gate/index.html'],
      ['npm run build:gate', '打包本场景单文件到 dist/东方之门金鸡湖-3D夜景.html'],
      ['node tools/measure-gate.mjs', '逐机位采集绘制调用、三角面数、资源与帧率统计'],
      ['npm run submission:gate', '由本脚本从同一份内容源重新生成申报报告与路演文稿'],
    ], [3400, 5900]));

  kids.push(h1('附录 B　事实与写意边界'));
    kids.push(p('为避免把艺术处理误读为测绘成果，逐条列明依据与添加：'));
    work.limits.forEach((l) => kids.push(bullet(l)));
    kids.push(bullet('可核实的公开背景：东方之门位于苏州工业园区金鸡湖西岸，由两座塔楼在约 240 米高处由空中连廊相连构成"门"形，建筑高度约 300 米，民间因其轮廓戏称"大秋裤"；金鸡湖为工业园区的城市内湖，环湖为商务与文旅功能区，湖西水域设有音乐喷泉，楼体夜间的灯光秀是当地知名的夜间景观。'));
    kids.push(bullet('本作品对上述背景的呈现方式是"读法"而非"尺寸"：真正被复现的是那条内收合拢的曲线与它落在湖里的倒影；高度、跨度、连廊厚度、拱顶标高都经过取整与观感调整。'));
    kids.push(bullet('环湖塔群、观景平台、媒体立面节目、喷泉编排均为虚构或示意，不代表任何真实项目的参数或日程。'));

    return new Document({
      creator: work.team.school,
      title: `${work.title}${work.subtitle} 作品申报报告`,
      description: work.contest,
      styles: { default: { document: { run: { font: CJK, size: 21 } } } },
      sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } }, children: kids }],
    });
}

/* ------------------------------------------------------------------ slides */

const NAVY = '040A16', CYAN = '9ED8FF', GOLD = 'E6C084', WHITE = 'FFFFFF', DIM = 'A9B3CC', ICE = '7FC4EF';

function buildDeck() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: 13.333, height: 7.5 });
  pptx.layout = 'W16x9';
  pptx.author = work.team.school;
  pptx.title = `${work.title} ${work.subtitle}`;

  const base = (s, title, kicker) => {
    s.background = { color: NAVY };
    s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: CYAN } });
    if (kicker) s.addText(kicker, { x: 0.7, y: 0.42, w: 12, h: 0.3, fontFace: CJK, fontSize: 12, color: CYAN, charSpacing: 3 });
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
      s.addText(label, { x, y: y + 2.36, w: 5.9, h: 0.3, fontFace: CJK, fontSize: 11.5, color: CYAN });
    });
  };

  let s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addImage({ data: img('gate-rightbank.jpg'), x: 0, y: 0, w: 13.333, h: 7.5, transparency: 28 });
  s.addShape('rect', { x: 0, y: 4.0, w: 13.333, h: 3.5, fill: { color: '02060D', transparency: 22 } });
  s.addText(work.title, { x: 0.9, y: 4.2, w: 11.5, h: 1.1, fontFace: CJK, fontSize: 48, bold: true, color: WHITE, charSpacing: 10 });
  s.addText(work.subtitle, { x: 0.95, y: 5.3, w: 11.5, h: 0.5, fontFace: CJK, fontSize: 20, color: CYAN, charSpacing: 2 });
  s.addText(work.slogan, { x: 0.95, y: 5.85, w: 11.5, h: 0.4, fontFace: CJK, fontSize: 13.5, italic: true, color: DIM });
  s.addText(`${work.contest}　|　申报方向：${work.track}\n${work.team.school} ${work.team.college}　团队负责人：${work.team.leader}　指导教师：${work.team.teachers}`,
    { x: 0.95, y: 6.35, w: 11.6, h: 0.8, fontFace: CJK, fontSize: 12.5, color: 'C9D2E8', lineSpacing: 19 });

  s = base(pptx.addSlide(), '为什么是"湖上的门"', '01 / 选题背景');
  s.addImage({ data: img('gate-aerial.jpg'), x: 6.85, y: 1.7, w: 5.8, h: 3.26 });
  s.addText('鸟瞰：门形屋顶只剩一条横线，城市重新排成平面图', { x: 6.85, y: 5.0, w: 5.8, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });
  bullets(s, [
    '金鸡湖西岸的夜由三样东西构成：被点亮的门形高楼、复制它一遍的水面、跟着音乐走的灯光秀与喷泉',
    '三样都是转瞬的、依赖光照的，正落在常规数字化手段的盲区',
    '摄影测量在弱光与高反光下失效；全景照片视点固定；短视频没有"我自己转头看"',
    '本作品的回答：把最可识别的形式规律写成函数，用代码重建可信的夜',
    '成果形态：一个 1.39 MB 单文件，无需服务器、网络与安装',
  ], { x: 0.7, y: 1.8, w: 5.9, h: 4.6 });

  s = base(pptx.addSlide(), '创意来源：从"读成门"到"读成夜"', '02 / 创意来源');
  bullets(s, [
    '民间称呼与官方名称的张力：人们先认出"一扇门"这个动作，才认出它是一栋楼——所以夜里先描轮廓',
    '城市内湖是第二块屏幕：水面不是贴图，而是解析法线 + 菲涅尔反射 + 镜像倒影 + 加性光柱四层合成',
    '当代地标同样需要数字化存档：楼体灯光秀有节目单与季节差异，却没有可交互的公开记录',
    '看不见的音乐：不含音频，改用色相轮播 + 节拍脉冲把"编排"转译为可见的节奏',
    '尺度靠近处的东西撑起：6 m 路灯、1.15 m 栏杆、156 个车流光点构成近—中—远三级尺度锚',
    '只做强夜：白天它只是一栋玻璃幕墙高楼，夜里它才是一扇门',
  ], { x: 0.7, y: 1.75, w: 12, h: 5.2 });

  s = base(pptx.addSlide(), '六处机位：远 · 近 · 内 · 高 · 水上 · 空中', '03 / 作品呈现');
  grid(s, [
    ['gate-rightbank.jpg', '湖东右岸 · 隔湖望西'],
    ['gate-balcony.jpg', '城市阳台 · 贴水仰视'],
    ['gate-arch.jpg', '门洞之下 · 拱腹曲线'],
    ['gate-fountain.jpg', '音乐喷泉 · 水上灯阵'],
  ], 1.6);
  s.addText('另有：空中连廊（约 240 m 标高）与空中鸟瞰　·　热点锚定实体地标，点击即飞行前往并展开解说',
    { x: 0.68, y: 7.0, w: 12.2, h: 0.35, fontFace: CJK, fontSize: 12, color: DIM });

  s = base(pptx.addSlide(), '核心体验：站定环视 360°，或自由绕场', '04 / 交互设计');
  s.addImage({ data: img('gate-ui.jpg'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  s.addText('界面：视角模式 / 参数面板 / 机位条 / 罗盘', { x: 7.15, y: 4.9, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });
  bullets(s, [
    '双相机模型共用一套机位数据：全景模式钉在机位转头，自由模式环绕推拉',
    '拖拽带惯性，滚轮调视野角 20°–96°，触屏支持单指环视与双指捏合',
    '参数面板：楼体灯光秀 / 幕墙灯窗 / 音乐喷泉 / 水面波纹 / 灯影辉光 + 倒影、标签、自动巡览',
    '画质自适应：持续低帧依次降分辨率、关倒影，并提示可手动下调灯光秀强度',
    '界面配色与前作分开：钢蓝冷白为主，只在裙房与路灯保留少量暖色',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  s = base(pptx.addSlide(), '难点一：把"门"写成两条函数', '05 / 产品技术');
  s.addImage({ data: img('gate-arch.jpg'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  bullets(s, [
    '外立面 o(y) = 150 − 8·(y/H)²：近乎垂直而略带收分',
    '拱洞 a(y) = 88·(1 − u^2.6)^0.72：近直立、在顶部迅速内收',
    '拱顶交接一段椭圆帽 √(1−t²) 收口——否则产生垂直切线尖点，挤出后退化成零面积三角形',
    '两条函数采样为一条闭合凹多边形，沿进深一次挤出：塔身 / 拱腹 / 连廊是同一张连续表面',
    '顶面 UV 取世界米坐标 → 一张 2048² 画布铺满 300×302 m 立面，200×76 窗格无重复无接缝',
    '反照率与自发光分画布：灯光秀可整体压暗窗光而不动建筑颜色',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  s = base(pptx.addSlide(), '难点二：倒影要"在水里"，不是"在图上"', '06 / 产品技术');
  s.addImage({ data: img('gate-bridge.jpg'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  bullets(s, [
    '四层：水体（解析法线 + 菲涅尔天空反射 + 月光滑轨 + 距离雾）／镜像倒影／46 根水面光柱／喷泉贴水光池',
    '倒影用与自身 alpha 对齐的窗格贴图、正常混合，随入水深度淡出',
    '水面透明度随入射角变化：俯视看进水里，平视透出倒影',
    '修正①：加性镜像在浅视角层层堆叠，压成横贯画面的白带',
    '修正②：观景台扶手上一条 0.12 m 灯带，在 8 m 距离上横跨全画面 → 压到接近不可见',
    '环湖塔群 155 栋共用一套放样函数，UV 以米计，合并为单次绘制',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  s = base(pptx.addSlide(), '难点三：一场看不见的音乐', '07 / 产品技术');
  bullets(s, [
    '媒体立面是与建筑同轮廓的独立加性网格，只负责"节目"，不参与几何',
    '三种图案按进度混合：竖向扫掠 / 斜向交叉 / 以拱顶为中心的呼吸环；LED 点阵由片元分格给出',
    'showState(t) 一个纯函数返回进度、脉冲与三种配色，被立面、探照灯、喷泉、光柱共同读取',
    '喷泉不用随机粒子：每喷嘴 14 粒共用一条抛物线错相排布，顶点着色器求位置，CPU 每帧零开销',
    '从 860 粒随机喷雾改成 420 粒同轨水柱，数量减半而"水柱"终于读得出来',
    '换成真实节目单只需替换这一个函数',
  ], { x: 0.7, y: 1.8, w: 12, h: 3.5 });
  s.addTable([
    [{ text: '规模', options: { bold: true, color: NAVY, fill: { color: CYAN } } }, { text: '数值', options: { bold: true, color: NAVY, fill: { color: CYAN } } }, { text: '规模', options: { bold: true, color: NAVY, fill: { color: CYAN } } }, { text: '数值', options: { bold: true, color: NAVY, fill: { color: CYAN } } }],
    ['机位 / 幕墙窗格', '6 / 15,200 格（点亮约 58%）', '环湖塔群 / 远景剪影', '155 栋 / 520 块'],
    ['本体三角面 / 倒影副本', '37,294 / 18,316', '水面光柱 / 探照光柱', '46 根 / 4 束'],
    ['喷泉粒子 / 车流光点 / 星点', '420 / 156 / 950', '着色器程序 / 纹理', '56 个 / 28 张'],
  ], { x: 0.7, y: 5.4, w: 12, fontFace: CJK, fontSize: 12, color: DIM, border: { pt: 0.5, color: '22324A' }, rowH: 0.36, colW: [3.0, 3.0, 3.0, 3.0] });

  s = base(pptx.addSlide(), '零构建、零依赖、可离线交付', '08 / 工程与运行环境');
  bullets(s, [
    '原生 ES Module + importmap，three.js r160（MIT）与附加模块随仓库 vendor，无运行时依赖',
    '开发：仓库自带 Node 零依赖静态服务（禁用缓存），打开 /gate/index.html',
    '交付：自研打包器把模块图编译为 1.39 MB 单文件 HTML，双击即运行',
    '直达链接：#station= / #eye=&at= / #bare 用于构图自检、展陈直达与出图',
    '度量：tools/measure-gate.mjs 逐机位采集绘制调用、三角面数、资源与帧率',
    '仓库内不含任何图片、模型、字体位图或音频素材',
  ], { x: 0.7, y: 1.8, w: 12, h: 3.6 });
  s.addTable([
    [{ text: '运行环境', options: { bold: true, color: NAVY, fill: { color: CYAN } } }, { text: '说明', options: { bold: true, color: NAVY, fill: { color: CYAN } } }],
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），源码即运行码'],
    ['浏览器', '支持 WebGL2 与现代 ES Module 的桌面 / 移动浏览器'],
    ['离线展示', 'npm run build:gate → dist 单文件，双击即可运行'],
    ['输入方式', '鼠标 / 触屏（单指环视、双指捏合）/ 全键位键盘'],
    ['推荐配置', '独显或较新核显、1920×1080；移动端开启画质自适应'],
  ], { x: 0.7, y: 5.35, w: 12, fontFace: CJK, fontSize: 12.5, color: DIM, border: { pt: 0.5, color: '22324A' }, rowH: 0.34, colW: [2.6, 9.4] });

  s = base(pptx.addSlide(), '实测与验证', '09 / 实测');
  s.addImage({ data: img('gate-fountain.jpg'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  s.addTable([
    [{ text: '指标', options: { bold: true, color: NAVY, fill: { color: CYAN } } }, { text: '数值', options: { bold: true, color: NAVY, fill: { color: CYAN } } }],
    ...work.measurements.slice(1, 6),
  ], { x: 0.7, y: 1.8, w: 6.2, fontFace: CJK, fontSize: 11, color: DIM, border: { pt: 0.5, color: '22324A' }, rowH: 0.5, colW: [2.0, 4.2] });
  bullets(s, [
    '六处机位逐一无头截图复核构图与遮挡',
    '修正：倒影白带、扶手灯带糊屏、喷泉粒子过粗、连廊机位贴脸栏杆',
    '灯光秀与喷泉强度归零时，媒体立面与水面光柱同步熄灭',
    '渲染层无 WebGL 报错、无着色器编译失败',
    '帧率为无 GPU 软件渲染下限，不代表真实显卡表现',
  ], { x: 7.15, y: 5.0, w: 5.5, h: 2.0 });

  s = base(pptx.addSlide(), '应用价值与推广', '10 / 价值');
  work.value.forEach(([title, text], i) => {
    const x = 0.7 + (i % 2) * 6.2, y = 1.75 + Math.floor(i / 2) * 1.9;
    s.addShape('roundRect', { x, y, w: 5.8, h: 1.7, fill: { color: '0A1526' }, line: { color: '22324A', width: 0.75 }, rectRadius: 0.06 });
    s.addText(title, { x: x + 0.22, y: y + 0.14, w: 5.4, h: 0.35, fontFace: CJK, fontSize: 14.5, bold: true, color: CYAN });
    s.addText(text, { x: x + 0.22, y: y + 0.52, w: 5.4, h: 1.1, fontFace: CJK, fontSize: 11.5, color: DIM, lineSpacing: 16 });
  });

  s = base(pptx.addSlide(), '局限、下一步与声明', '11 / 反思');
  bullets(s, [
    '写意重建而非测绘模型：高度、跨度、连廊标高与灯位按观感取整，不用于工程或规划用途',
    '观景平台、拱腹灯槽、部分塔冠与裙房屋顶灯带为构图添加；环湖塔群按分区生成，未核实建筑身份',
    '灯光秀色相轮播与节拍、喷泉编排与高度均为虚构，不代表真实节目单；作品不含音频',
    '下一步：接入倾斜摄影 · showState 换成可编排节目单 · 补昼夜与雨雾 · 封装 WebXR · 沉淀为可配置场景模板',
    `原创声明：${work.originality}`,
  ], { x: 0.7, y: 1.8, w: 12, h: 4.2 });
  s.addText(`${work.team.school} ${work.team.college}　|　${work.team.leader}　|　指导：${work.team.teachers}　|　${work.team.date}`,
    { x: 0.7, y: 6.6, w: 12, h: 0.4, fontFace: CJK, fontSize: 12, color: GOLD });

  return pptx;
}

/* ------------------------------------------------------------------ run */

const { writeFile } = await import('node:fs/promises');
const report = await Packer.toBuffer(buildReport());
await writeFile(join(OUT, '湖光门影-作品申报报告.docx'), report);
await buildDeck().writeFile({ fileName: join(OUT, '湖光门影-路演.pptx') });
console.log('已生成：');
console.log('  docs/湖光门影-作品申报报告.docx');
console.log('  docs/湖光门影-路演.pptx');
