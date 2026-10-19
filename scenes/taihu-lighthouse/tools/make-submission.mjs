/**
 * 生成参赛材料：作品说明书（.docx）+ 演示文稿（.pptx）
 *   node tools/make-submission.mjs
 *
 * 两份文件共用下面同一个 work 对象，改文案只改这里，重跑即可。
 * 机位图来自 docs/shots/，由页面离屏渲染回传（见 tools/collect.mjs）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ImageRun, BorderStyle,
} from 'docx';
import PptxGenJS from 'pptxgenjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'docs', 'shots');
const OUT = join(ROOT, 'docs');
const CJK = 'Microsoft YaHei';

/* ------------------------------------------------------------------ 内容源 */

const work = {
  title: '鼋头渚 · 太湖灯塔',
  subtitle: '3D 夜景全景漫游系统',
  track: '【按本届通知附件 2 的赛道名称填写，建议：数字文旅 / 文化遗产数字化方向】',
  contest: '2026 年第十四届全国大学生数字媒体科技作品及创意竞赛（CMIT，cmit.cn）',
  slogan: '太湖的夜不需要被照亮，它需要的是一个方向 —— 用可交互的三维重建，留住一处夜间景观',
  team: {
    school: '【学校名称】', college: '【学院 / 系】', major: '【专业班级】',
    leader: '【负责人姓名 / 学号】', members: '【队员姓名 / 学号】',
    teachers: '【指导老师 1 / 指导老师 2】', contact: '【联系人 / 电话 / 邮箱】',
    date: '2026 年 10 月',
  },
  metrics: [
    ['场景机位', '7 处（灯塔 / 鼋渚春涛 / 游船码头 / 太湖仙岛 / 长春桥 / 樱花谷 / 空中鸟瞰）'],
    ['地形', '解析高程函数驱动的 301×301 高度场（2600 m 见方，近处 3 m、远处 16 m 网格），190 片拍岸泡沫'],
    ['夜樱林', '210 株实例化樱花树 + 210 池上照灯光斑 + 900 片落樱粒子'],
    ['人造光', '29 盏场景光源；5 艘夜航游船带航迹与舷灯；1 艘复原七桅帆船泊于码头'],
    ['水面', '开阔湖着色器（三层涌浪 + 落月银带 + 贴岸泡沫）+ 地形/灯塔/建筑镜像倒影 + 加性光柱'],
    ['环境', '星点 2600 颗、三维噪声薄云、湖对岸山脊剪影与岸线村灯、太湖仙岛远景灯群'],
    ['工程形态', '13 个源码模块 / 152 KB，零运行时依赖，单文件版 1.44 MB'],
    ['运行方式', '浏览器直接运行，桌面与触屏通用，支持无网络双击打开'],
  ],
  stations: [
    ['太湖灯塔', '01-light.jpg', '石咀最高处的小塔：圆柱金山石塔身、黄色琉璃瓦重檐顶，实高 13.1 米。作品把塔顶灯做成全场景唯一的光源主角——空中一道旋转光锥，湖面跟着扫过一片被涌切碎的光扇，塔影与光同时落进水里。'],
    ['鼋渚春涛', '02-spring.jpg', '巨石突入湖中、形如浮鼋昂首，景点之名即由此来。灯塔之后立着两米多高的刻石，正面「鼋头渚」、背面「鼋渚春涛」。机位设在尖端礁石滩上回望，拍岸泡沫沿石线起落。'],
    ['游船码头', '03-pier.jpg', '栈桥顺坡下到开阔湖面，桥灯一档档铺到水边，尽头泊着一艘复原展示的七桅帆船。船离岸时船身横推，舷灯在水上拖出一道斜的光痕。'],
    ['太湖仙岛', '04-island.jpg', '从石咀向西南望，隔着水面浮着一座岛（原名三山岛，实测约 2.6 公里，场景按构图压缩）。会仙桥、天街一带的灯勾出岛的轮廓，岛脚下那一段黑正是山与水的交界——距离把灯压成一排，也把湖显出它真正的宽度。'],
    ['长春桥 · 长春花漪', '05-bridge.jpg', '1936 年秋无锡纺织业同仁为杨翰西花甲寿庆，在充山西麓沿湖围堤上建此桥，仿颐和园昆明湖玉带桥式样。作品用带孔洞的挤出体生成单孔高拱，桥堤两侧按"先花后叶"的染井吉野排开，短浜从桥下穿过。'],
    ['樱花谷', '06-grove.jpg', '1988 年辟中日樱花友谊林、2010 年扩谷，全园三万余株、六十余品种。白日的樱花谷靠颜色取胜，夜里颜色退场，只剩横向撑开的枝、被灯打亮的花簇边缘，以及花簇之间那些真正的黑。'],
    ['空中鸟瞰', '07-aerial.jpg', '抬到塔顶以上看地形逻辑：一道石咀把太湖与内湖分开，灯塔占着尖端，游船在湾里进出，樱花与长堤铺在内湖沿岸，丘岗退到北边。夜里所有人工光集中在这条窄陆地上，两侧的水把它夹成一支火把。这一帧也用于检验整体构图与灯光配比。'],
  ],
  modules: [
    ['data.js', '地理落位常数、7 处机位与解说文案的唯一来源（改机位即改热点）'],
    ['terrain.js', '解析高程场：陆块椭圆场 + 起伏权重 + 人工整平 + 短浜切割，导出 elev/island/depthTexture'],
    ['environment.js', '夜穹着色器（城市光害穹顶 / 月晕 / 三维噪声云）、星野、湖对岸山脊剪影、月光与补光体系'],
    ['water.js', '开阔湖水面着色器、极坐标 LOD 网格、镜像倒影组、加性光柱系统、沿岸拍岸浪'],
    ['lighthouse.js', '重檐琉璃顶灯塔、灯室与旋转光锥、与光锥同轴的水面亮扇'],
    ['structures.js', '单孔高拱长春桥、栈桥码头、七桅帆船、赏樱楼、涵虚亭、太湖仙岛远景灯群'],
    ['props.js', '夜樱林与上照灯光斑、落樱粒子、游船船队与航迹、步道人流、路灯'],
    ['kit.js / textures.js', '中式构件参数化生成（屋顶 / 立柱 / 栏杆 / 匾额）与全部 canvas 实时贴图'],
    ['controls.js / hotspots.js / ui.js', '全景 360° 与自由环绕双相机模型、地标锚定热点、参数面板'],
    ['main.js', '渲染管线、分步加载、画质自适应阶梯、离屏机位截图'],
  ],
  tech: [
    ['"非测绘"的氛围数字化路径', '夜间景观无法用摄影测量记录——暗部没有特征点，灯光本身是过曝的。作品因此改用参数化三维重建：几何、贴图、灯光全部由代码生成，在无外部素材、无网络的条件下可复现同一帧画面，同时为后续接入倾斜摄影模型留出替换空间。'],
    ['一座山咀由一个函数决定', '地形不是手工雕刻的网格，而是一个可查询的高程函数 elev(x,z)：陆块用带羽化的椭圆场叠加，每块地单独控制起伏权重（石咀必须低平，否则机位会爬得比灯塔还高），再用一组"人工整平"落塔基、平台、桥堤。所有模块——水面深度、树的位置、浪花摆哪、机位贴地高度——都向同一个函数取值，因此地形、植被、建筑与相机永远不会互相穿帮。'],
    ['开阔湖与河道不是一回事', '尺度差两个量级之后，一堆近似全部失效：天穹半径、雾密度、远山与地平线都要重标；水面高频碎浪在远处会混叠成雪花，于是按视距分三级把细节交给中浪与长涌；地形高程被烘成一张纹理交给水面 shader 查询，浅水染色、贴岸泡沫与岸线锐度才能对上——这里踩过一个坑：CanvasTexture 默认 flipY 会把高程图沿南北镜像，结果整片太湖被读成陆地、泡沫铺满湖面。'],
    ['光是这个场景的主角，所以要单独建模', '灯塔的光被拆成两层：空中是空心锥壳（正对镜头的一圈最亮，掠射处收暗，否则画出来是一块木板），湖面是与光锥同轴旋转的亮扇，并用同一张深度纹理把上岸的部分切掉。光束、灯核、点光、水面光柱与辉光共享同一个强度参数，调面板时它们同步变化。'],
    ['夜樱的亮度是"画"在树上的', '210 株实例化樱花树不能各挂一盏灯。上照灯的效果被写进树冠的顶点色——下缘亮、上缘暗，树下一池加性光斑交代光源，三盏共享点光只负责把地面与枝干带出来。花簇贴图必须由多个小圆叠成不规则轮廓：单个径向渐变的边界是正圆，交叉面片一多，整棵树就成了"被切开的球"。'],
    ['零构建、零依赖、可离线交付', 'ES Module + importmap 直接运行，Node 端只用内置模块提供本地服务与打包。自研打包器把整张模块图压成 1.44 MB 单文件 HTML，双击即开，适合评审与展陈现场无网络环境。'],
  ],
  origin: [
    ['为什么画的是"夜"', '太湖的美学重心在开阔，而开阔在白天只是一片白水；夜里人工光退成点，湖的宽度反而第一次变得可测量。作品想解决的就是这个矛盾：一段很难被摄影、也很难被测绘记录的夜间尺度感。'],
    ['一座小塔给一整片湖定方向', '鼋头渚灯塔只有 13.1 米，比任何海用灯塔都矮，但它站在太湖西北岸最要紧的一块石头上。作品的视觉母题由此确定：不表现"灯有多亮"，而表现"黑暗有多大"——所以全场景只允许灯塔做强光源，其余都是零星暖点。'],
    ['一个消失的夜景逼出来的取舍', '原计划里湖上该有渔火。查证后发现无锡 2020 年 8 月方案、10 月 1 日起太湖全面退捕禁渔，928 条渔船退场，"太湖渔火"作为现状已经不成立。作品因此没有把它当作眼前的风景来画，而是让湖上的光只剩航标与游船，并在解说里写明这件事——一件文旅作品如果复刻了已经消失的东西却不加说明，它骗的是评审也是观众。'],
    ['把"湖有多宽"画进画面', '太湖仙岛在景点西南约 2.6 公里。作品按构图把它压到约 1.1 公里，并在解说里注明压缩过。代价是牺牲一点测绘精度，换来的是观者能在一个画面里同时看到近处礁石、中景石咀与远处岛灯——这三层同时在场，才读得出"湖"。'],
    ['写意而非考据的边界', '造型按核实过的形制做（金山石圆柱塔身、黄色琉璃瓦重檐顶、正面「鼋头渚」背面「鼋渚春涛」的刻石、涵虚亭与赏樱楼的位置关系），旋转光束则是为夜间呈现做的艺术处理，实景以定光与灯质为主；这一条写在作品内的操作说明里，不藏在心里。'],
  ],
  runtime: [
    ['交付形态', '单文件 HTML（dist/鼋头渚太湖灯塔-3D全景.html，1.44 MB），three.js 与后处理通道已随包内联，双击即可运行，不需要服务器、不需要安装、不需要网络。'],
    ['浏览器', 'Chrome / Edge 110+、Firefox 115+、Safari 16.4+，需支持 WebGL2；推荐开启硬件加速。触屏端支持双指旋转视野与捏合缩放。'],
    ['显示', '推荐 1920×1080 及以上；界面在 1180 px 宽度以下自动折叠参数面板。高 DPI 屏按 1.35 上限渲染。'],
    ['硬件参考', '桌面独显或近三代核显可在全参数下流畅运行；移动端 SoC 在高光束强度与泛光叠加时会明显发热，可依赖画质自适应或手动下调参数。'],
    ['源码工程', 'Node.js ≥ 18，零运行时依赖（npm 依赖仅用于生成参赛文档）。npm run dev 起本地零依赖服务（端口 8766，响应头 no-store），npm run build 产出单文件。'],
    ['操作', '左键拖动环视 360° / 自由模式绕场；右键或双指拖动平移；滚轮或捏合调视野；点击发光热点移动机位并打开解说；A/D 切换景点、空格自动巡览、P 切换模式、F 全屏、H 帮助、Esc 关闭面板。'],
  ],
  measurements: [
    ['测试机位', '空中鸟瞰（全场景可见，最重负载）'],
    ['每帧绘制调用', '592 次（含 5 遍泛光模糊与合成）'],
    ['每帧三角面数', '约 719,700'],
    ['场景规模', '783 个网格 / 1,755 个实例 / 29 盏光源 / 428 份几何 / 47 张贴图'],
    ['着色器程序数', '49 个（编译后常驻）'],
    ['源码体积', '13 个模块共 152 KB；单文件版 1.44 MB'],
    ['帧率参考', '在受遮挡的自动化测试窗口中约 8–20 fps，属下限；正常桌面独显环境请按附录命令复测后填写'],
  ],
  value: [
    ['景区线上夜游与导览', '单文件可嵌入景区公众号、小程序 webview 与官网，弱网与离线可用；7 个机位天然对应 7 段展项。'],
    ['夜间景观的数字化存档', '地形、灯位、光强与色配比全部参数化，可按届次保存一套夜间灯光方案并复现，这是摄影测量做不到的。'],
    ['生态叙事的载体', '"渔火已退、航标仍在"这类事实被写进解说与画面取舍里，使作品成为一次可追问的环境叙述，而不只是好看的夜景。'],
    ['可迁移的框架', '引擎与场景解耦：替换 data / terrain / structures / props 四个模块即可迁移到其它滨水景区，秦淮与太湖两个工程同源即为例证。'],
    ['教学与展陈', '零构建、零依赖、代码全可读，适合做三维交互与计算美学的课程范例，也可跑在拼接屏与交互一体机上。'],
  ],
  limits: [
    '作品为写意重建：石咀地形、塔身高宽比、灯位与太湖仙岛视距经过艺术化处理与压缩，不是测绘级模型，不能用于工程或保护规划用途。',
    '旋转光束为夜间呈现的艺术处理，实景灯塔以定光与灯质显示为主；此说明已同时写在作品内的操作面板与本报告中。',
    '太湖已于 2020 年全面退捕禁渔，作品因此未把"渔火"当作现状呈现；湖上灯光为游船与航标。',
    '人流、船队与樱花密度为示意值，未做真实客流、航运与物候仿真（夜樱场景对应的是樱花节夜场时段）。',
    '部分史实细节（夜樱灯光色温、桥孔数与桥长、月出方位等）未查到可靠来源，一律未写入解说，仅按视觉需要处理。',
  ],
  next: [
    '移植空间切换：登塔（螺旋梯与顶层灯室俯瞰太湖）与立船头（游船甲板航行的湖面视角），把秦淮工程已验证的 portals 机制接过来。',
    '接入倾斜摄影或激光点云替换写意几何，保留同一套灯光与交互。',
    '补花期与天气层：花苞—盛花—落瓣的物候变化，以及雨、雾、风浪对水面与光束的影响。',
    '封装 WebXR 会话进入头显做沉浸式夜游，并提供语音讲解与多语言字幕。',
    '与景区实测灯光与客流数据联动，让虚拟夜游与真实夜场同步。',
  ],
  originality: '本作品的全部源代码、程序化贴图与文案由团队自行创作，未使用任何第三方受版权保护的模型、贴图、字体位图或音频素材。渲染基于 three.js（MIT 许可，已随源码保留版权声明），后处理的泛光与输出通道取自 three.js 官方示例并保留原始许可头。文中涉及景点形制与沿革的表述均取自公开资料，未证实的细节一律未写入。本作品与团队另一件参赛作品的场景、地形与内容均不相同，未在同一赛道重复申报。',
};

/* ------------------------------------------------------------------ 资源 */

const shot = (name) => readFileSync(join(SHOTS, name));
const img = (name) => `image/jpeg;base64,${shot(name).toString('base64')}`;

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, line: 320 },
  alignment: opts.align,
  children: [new TextRun({ text, font: CJK, size: 21, bold: opts.bold, color: opts.color })],
});
const h1 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 150 },
  children: [new TextRun({ text: t, font: CJK, bold: true, size: 28, color: '1F3A54' })],
});
const h2 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 100 },
  children: [new TextRun({ text: t, font: CJK, bold: true, size: 23, color: '2F4A63' })],
});
const bullet = (t) => new Paragraph({
  bullet: { level: 0 }, spacing: { after: 80 },
  children: [new TextRun({ text: t, font: CJK, size: 21 })],
});
const lead = (name, text) => new Paragraph({
  spacing: { after: 110, line: 320 },
  children: [
    new TextRun({ text: `${name}　`, font: CJK, size: 21, bold: true, color: '7A2E22' }),
    new TextRun({ text, font: CJK, size: 21 }),
  ],
});
const caption = (t) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 },
  children: [new TextRun({ text: t, font: CJK, size: 18, color: '666666' })],
});
const picture = (name, w, h) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 60, after: 40 },
  children: [new ImageRun({ type: 'jpg', data: shot(name), transformation: { width: w, height: h } })],
});
const table = (rows, widths) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' },
  },
  rows: rows.map((cells, r) => new TableRow({
    children: cells.map((c, i) => new TableCell({
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      shading: r === 0 ? { fill: 'EEF3F8' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        children: [new TextRun({
          text: String(c), font: CJK, size: 20, bold: r === 0,
        })],
      })],
    })),
  })),
});

/* ------------------------------------------------------------------ 报告 */

function buildReport() {
  const kids = [];

  kids.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 200 },
    children: [new TextRun({ text: work.title, font: CJK, bold: true, size: 52, color: '1F3A54' })],
  }));
  kids.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 420 },
    children: [new TextRun({ text: work.subtitle, font: CJK, size: 30, color: '2F4A63' })],
  }));
  kids.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: work.contest, font: CJK, size: 21 })],
  }));
  kids.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 700 },
    children: [new TextRun({ text: `申报方向：${work.track}`, font: CJK, size: 21 })],
  }));
  kids.push(table([
    ['申报单位', work.team.school],
    ['院系 / 专业', `${work.team.college}　/　${work.team.major}`],
    ['负责人', work.team.leader],
    ['团队成员', work.team.members],
    ['指导教师', work.team.teachers],
    ['联系方式', work.team.contact],
    ['完成日期', work.team.date],
  ], [24, 76]));
  kids.push(new Paragraph({ children: [], pageBreakBefore: true }));

  kids.push(h1('一、作品概述'));
  kids.push(p(work.slogan, { bold: true }));
  kids.push(p('本作品以无锡太湖鼋头渚为对象，用 Three.js 程序化重建了一处可交互的夜间三维全景：观众站在伸入太湖的石咀上，看一座 13.1 米高的中式灯塔把光甩向湖面，旋转的光锥与水面上的亮扇同步扫过礁石、内湖、长春桥与夜樱，西南方向隔着压缩过的水面浮着太湖仙岛的一排灯。场景不是照片贴图，也不是测绘模型，而是一套全部由代码生成的几何、贴图与灯光——地形由一个可查询的高程函数决定，花簇的亮度是画在顶点色里的，光是分两层建模的。'));
  kids.push(p('作品提供 7 处机位与地标锚定的解说热点，支持全景 360° 环视与自由环绕两种视角，并开放光束、夜樱照明、游船、人流、波纹与辉光六项实时参数。整个工程零运行时依赖，可打包为一个 1.44 MB 的单文件 HTML，双击即开、无需网络。'));
  kids.push(h2('关键指标'));
  kids.push(table([['项目', '指标'], ...work.metrics], [22, 78]));

  kids.push(h1('二、创意来源'));
  for (const [name, text] of work.origin) kids.push(lead(name, text));

  kids.push(h1('三、作品呈现：七处机位'));
  work.stations.forEach(([name, file, text], i) => {
    kids.push(h2(`${i + 1}. ${name}`));
    kids.push(picture(file, 560, 315));
    kids.push(caption(`图 ${i + 1}　${name}机位（1280×720 实机渲染截图）`));
    kids.push(p(text));
  });

  kids.push(h1('四、产品与技术'));
  kids.push(h2('4.1 产品形态'));
  kids.push(bullet('三种观看方式：站定环视的全景 360°、绕场自由视角、自动巡览（按机位顺序补间）。'));
  kids.push(bullet('7 处机位对应 7 段解说，热点锚定在实体地标（塔顶、刻石、桥、赏樱楼、仙岛）而非相机位置，标签不会随视角飘走。'));
  kids.push(bullet('6 项实时参数 + 4 项开关：灯塔光束、夜樱照明、湖上游船、岸上人流量、湖面波纹、灯影辉光；水中倒影、热点标签、自动巡览、画质自适应。'));
  kids.push(bullet('内置截图导出与全屏，便于展陈与评审；键盘快捷键覆盖全部操作。'));
  kids.push(h2('4.2 技术架构（模块与职责）'));
  kids.push(table([['模块', '职责'], ...work.modules], [30, 70]));
  kids.push(h2('4.3 关键技术'));
  for (const [name, text] of work.tech) kids.push(lead(name, text));
  kids.push(h2('4.4 运行环境'));
  kids.push(table([['项目', '要求'], ...work.runtime], [20, 80]));

  kids.push(h1('五、实测数据'));
  kids.push(p('以下数据在自动化测试窗口中用页面内 renderer.info 实测取得（关闭 info 自动重置后按整帧统计）。'));
  kids.push(table([['项目', '结果'], ...work.measurements], [26, 74]));

  kids.push(h1('六、应用价值与推广'));
  for (const [name, text] of work.value) kids.push(lead(name, text));

  kids.push(h1('七、局限与后续计划'));
  kids.push(h2('7.1 局限'));
  for (const l of work.limits) kids.push(bullet(l));
  kids.push(h2('7.2 后续计划'));
  for (const l of work.next) kids.push(bullet(l));

  kids.push(h1('八、原创性与素材来源声明'));
  kids.push(p(work.originality));

  kids.push(h1('九、团队与分工'));
  kids.push(table([
    ['成员', '角色', '主要工作'],
    [work.team.leader, '负责人 / 技术与场景', '地形高程函数、水面与光束着色器、渲染管线与打包'],
    ['【队员】', '建模与材质', '中式构件参数化、灯塔与桥、码头与船、程序化贴图'],
    ['【队员】', '文案与考据', '景点形制与沿革查证、解说文案、未证实项剔除'],
    ['【队员】', '交互与视觉', '机位与热点、参数面板、界面与配色、截图与演示'],
    [work.team.teachers, '指导教师', '选题指导与方案审校'],
  ], [22, 22, 56]));

  kids.push(h1('附录　运行与复现'));
  kids.push(p('环境：Node.js ≥ 18（仅用于本地服务、打包与生成文档）。'));
  kids.push(bullet('预览：npm run dev → http://127.0.0.1:8766/index.html'));
  kids.push(bullet('单文件：npm run build → dist/鼋头渚太湖灯塔-3D全景.html（双击即开，无需服务器）'));
  kids.push(bullet('本套材料：npm run submission → docs/ 下生成 .docx 与 .pptx'));
  kids.push(bullet('机位截图：页面内 window.taihu.shot([{station:0,tag:"x"}]) 离屏渲染 1440×810 后回传落盘'));
  kids.push(p('目录结构：index.html、styles.css、src/（13 个模块）、vendor/（three.js 与 addons）、tools/、dist/、docs/。', {}));

  return new Document({
    creator: work.team.school,
    title: `${work.title}${work.subtitle} 作品说明书`,
    description: work.contest,
    styles: { default: { document: { run: { font: CJK, size: 21 } } } },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } },
      children: kids,
    }],
  });
}

/* ------------------------------------------------------------------ 演示 */

const NAVY = '070C1A', GOLD = 'E6C084', WHITE = 'FFFFFF', DIM = 'A9B3CC', BLUE = '6FA8DC';

function buildDeck() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
  pptx.layout = 'W';
  pptx.author = work.team.school;
  pptx.title = `${work.title} ${work.subtitle}`;

  const foot = (s, tag) => {
    s.addText(`${work.title} · ${work.subtitle}`, { x: 0.5, y: 7.02, w: 6, h: 0.3, fontSize: 9, color: '5A6478', fontFace: CJK });
    if (tag) s.addText(tag, { x: 9.3, y: 7.02, w: 3.5, h: 0.3, fontSize: 9, color: '5A6478', align: 'right', fontFace: CJK });
  };
  const base = (s, tag) => {
    s.background = { color: NAVY };
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.09, fill: { color: GOLD } });
    if (tag) s.addText(tag, { x: 11.4, y: 0.4, w: 1.5, h: 0.4, fontSize: 11, color: GOLD, align: 'right', fontFace: CJK });
    foot(s, tag);
    return s;
  };
  const bullets = (s, items, box) => s.addText(
    items.map(([t, d]) => ({
      text: t, options: { bold: true, color: WHITE, fontSize: 14, breakLine: true },
    })).flatMap((o, i) => [o, {
      text: items[i][1], options: { color: DIM, fontSize: 11.5, breakLine: true, paraSpaceAfter: 10 },
    }]),
    { ...box, valign: 'top', fontFace: CJK },
  );

  /* 封面 */
  let s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addImage({ data: img('01-light.jpg'), x: 6.6, y: 1.5, w: 6.2, h: 3.49, transparency: 8 });
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.14, fill: { color: GOLD } });
  s.addText(work.title, { x: 0.7, y: 2.1, w: 6.2, h: 1.1, fontSize: 44, bold: true, color: WHITE, fontFace: CJK });
  s.addText(work.subtitle, { x: 0.72, y: 3.2, w: 6, h: 0.6, fontSize: 20, color: GOLD, fontFace: CJK });
  s.addText(work.slogan, { x: 0.72, y: 4.1, w: 5.7, h: 1.2, fontSize: 13, color: DIM, fontFace: CJK });
  s.addText(`${work.contest}\n申报方向：${work.track}`, { x: 0.72, y: 5.9, w: 11.9, h: 0.8, fontSize: 11, color: '7A8499', fontFace: CJK });

  /* 选题背景 */
  s = base(pptx.addSlide(), '01 / 选题背景');
  s.addText('为什么画太湖的夜', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['开阔在白天只是一片白水，夜里才量得出来', '太湖的美学重心是"开阔"。白天摄影与测绘都能记录，夜间暗部没有特征点、灯光本身过曝——这一段恰恰是既有数字化方法覆盖不到的。'],
    ['一座 13.1 米的小塔，给一整片湖定方向', '鼋头渚灯塔比任何海用灯塔都矮，但它站在太湖西北岸最要紧的一块石头上。作品的母题因此不是"灯有多亮"，而是"黑暗有多大"。'],
    ['渔火已经熄了：一次被迫的诚实取舍', '2020 年 10 月 1 日起太湖全面退捕禁渔，928 条渔船退场，"太湖渔火"作为现状已不成立。作品没有把它当风景复刻，湖上的光只剩航标与游船，并在解说里写明。'],
    ['写意不等于编造', '形制按核实过的资料做；旋转光束、岛距压缩等艺术处理在作品内与报告中都明确声明；未证实的细节一律不写进解说。'],
  ], { x: 0.5, y: 1.3, w: 6.1, h: 5.4 });
  s.addImage({ data: img('07-aerial.jpg'), x: 6.9, y: 1.5, w: 6.0, h: 3.38 });
  s.addText('鸟瞰：一道石咀把太湖与内湖分开，人工光集中在这条窄陆地上', { x: 6.9, y: 4.95, w: 6, h: 0.5, fontSize: 10.5, color: DIM, fontFace: CJK });

  /* 作品概览 */
  s = base(pptx.addSlide(), '02 / 作品概览');
  s.addText('七处机位，一条夜游动线', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  const grid = [['01-light.jpg', '太湖灯塔'], ['02-spring.jpg', '鼋渚春涛'], ['05-bridge.jpg', '长春桥 · 夜樱'], ['06-grove.jpg', '樱花谷'], ['03-pier.jpg', '游船码头'], ['04-island.jpg', '太湖仙岛']];
  grid.forEach(([f, t], i) => {
    const x = 0.5 + (i % 3) * 4.25, y = 1.35 + Math.floor(i / 3) * 2.85;
    s.addImage({ data: img(f), x, y, w: 4.0, h: 2.25 });
    s.addText(t, { x, y: y + 2.3, w: 4.0, h: 0.35, fontSize: 12, color: GOLD, align: 'center', fontFace: CJK });
  });
  s.addText('全部画面为程序化实时渲染截图，无一张外部素材', { x: 0.5, y: 7.05, w: 12, h: 0.35, fontSize: 11, color: DIM, fontFace: CJK });

  /* 交互 */
  s = base(pptx.addSlide(), '03 / 交互设计');
  s.addText('站定环视，或绕场自由看', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['两种相机模型共用一套机位数据', '全景 360°（眼睛钉在机位上转头、滚轮调视野）与自由环绕（绕地标推拉）之间切换时，机位与朝向自动换算，不需要两套配置。'],
    ['热点锚在实体地标上', '标签与光环指向塔顶、刻石、桥、赏樱楼、仙岛，而不是相机位置——所以改机位不会让标签飘掉，这是布展维护里最容易坏的一环。'],
    ['六项参数 + 四项开关，全部实时生效', '光束、夜樱照明、游船、人流、波纹、辉光；倒影、标签、巡览、画质自适应。画面与参数严格同源，关灯时水面光柱同步收掉。'],
    ['画质自适应有阶梯，不是一键降质', '持续掉帧才逐级降分辨率、再关倒影，最后一级才动光源；阴影贴图在首帧编译后关闭自动更新。'],
  ], { x: 0.5, y: 1.3, w: 7.2, h: 5.4 });
  s.addImage({ data: img('04-island.jpg'), x: 8.0, y: 1.5, w: 4.9, h: 2.76 });
  s.addText('向西南望太湖仙岛：距离把灯压成一排，也把湖显出宽度', { x: 8.0, y: 4.35, w: 4.9, h: 0.5, fontSize: 10.5, color: DIM, fontFace: CJK });

  /* 技术一：地形函数 */
  s = base(pptx.addSlide(), '04 / 技术方案');
  s.addText('难点一：一座山咀由一个函数决定', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['elev(x,z) 是全场景唯一的地面真值', '陆块用带羽化的椭圆场叠加，内湖与短浜从陆地凹下去，再用一组"人工整平"落塔基、平台、桥堤、楼基。'],
    ['每块地单独控制起伏权重', '石咀必须低平——否则丘陵的起伏会把观景机位抬到比灯塔还高，变成"从山上看塔"。'],
    ['整平与切割有先后', '短浜必须在桥台地整平之后再切，否则桥会把自己要跨的那条水道填平。这类顺序错误不会崩，只会让画面莫名其妙。'],
    ['下游全部向它取值', '水面深度、树能种在哪、浪花贴哪条岸、机位贴地高度、倒影是否穿帮——都来自同一个函数，所以不会互相打架。'],
  ], { x: 0.5, y: 1.3, w: 6.6, h: 5.4 });
  s.addImage({ data: img('02-spring.jpg'), x: 7.4, y: 1.5, w: 5.5, h: 3.1 });
  s.addText('尖端礁石滩回望：刻石、灯塔与光锥收在同一帧', { x: 7.4, y: 4.7, w: 5.5, h: 0.4, fontSize: 10.5, color: DIM, fontFace: CJK });

  /* 技术二：开阔湖 */
  s = base(pptx.addSlide(), '05 / 技术方案');
  s.addText('难点二：开阔湖不是放大的河道', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['尺度差两个量级后，近似全部失效', '天穹半径、雾密度、远山与地平线要重标；相机远端面从 1600 提到 7000。'],
    ['高频碎浪会混叠成雪花', '按视距分三级把细节交给中浪与长涌；碎浪只在 70 米内保留——再远它已是亚像素。'],
    ['高程烘成纹理交给 shader 查', '浅水染色、贴岸泡沫与岸线锐度才能对上地形分辨率，而不是靠粗糙的水面网格顶点近似。'],
    ['一个静默的坑：CanvasTexture 默认 flipY', '高程图被沿南北镜像，整片太湖被读成"陆地"，泡沫铺满湖面。表现是"远处有雪花"，真因在贴图上传的行序。'],
  ], { x: 0.5, y: 1.3, w: 6.6, h: 5.4 });
  s.addImage({ data: img('03-pier.jpg'), x: 7.4, y: 1.5, w: 5.5, h: 3.1 });
  s.addText('落月银带沿水面铺开，泊着的七桅帆船只点几盏舱灯', { x: 7.4, y: 4.7, w: 5.5, h: 0.4, fontSize: 10.5, color: DIM, fontFace: CJK });

  /* 技术三：光 */
  s = base(pptx.addSlide(), '06 / 技术方案');
  s.addText('难点三：光是主角，所以要单独建模', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['空中一层、水面一层，共用一根轴', '空中是空心锥壳：正对镜头的一圈最亮、掠射处收暗（反过来算会画成一块木板）。湖面是同轴旋转的亮扇，用同一张深度纹理把上岸的部分切掉。'],
    ['一个参数带动五种表现', '光锥强度、灯核高动态、月晕、水面光柱与辉光共享光束参数，不会出现"灯灭了光还在"。'],
    ['夜樱的亮度画在顶点色里', '210 株实例化树不可能各挂一盏灯：树冠下缘亮上缘暗，树下一池加性光斑交代光源，三盏共享点光只负责带出地面与枝干。'],
    ['倒影是镜像组，不是渲染目标', '把地形、灯塔与建筑克隆一份沿水面翻转，材质换成带扰动的半透明基础材质，成本远低于实时平面反射。'],
  ], { x: 0.5, y: 1.3, w: 12.3, h: 3.0 });
  s.addImage({ data: img('06-grove.jpg'), x: 0.5, y: 4.5, w: 6.0, h: 2.4 });
  s.addImage({ data: img('05-bridge.jpg'), x: 6.8, y: 4.5, w: 6.0, h: 2.4 });

  /* 工程 */
  s = base(pptx.addSlide(), '07 / 工程实现');
  s.addText('零构建、零依赖、可离线交付', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['ES Module + importmap 直跑', '不装包、不打包、不联网也能开发；Node 端只用内置模块提供本地服务。'],
    ['自研打包器产出单文件', '13 个模块 + three.js + 后处理压成 1.44 MB HTML，双击即开。两个坑：alias 必须按 key 长度倒序匹配（否则 three 会吞掉 three/addons/），String.replace 的替换串要用函数形式（three.js 源码里有字面量 $）。'],
    ['13 个模块 152 KB 源码', 'data / terrain / environment / water / lighthouse / structures / props / kit / textures / controls / hotspots / ui / main，职责单一，场景与引擎解耦。'],
    ['可迁移', '替换 data、terrain、structures、props 四个模块即可换景区——秦淮与太湖两个工程同源，即为验证。'],
  ], { x: 0.5, y: 1.3, w: 7.4, h: 5.4 });
  s.addTable([
    [['项目', { bold: true, color: GOLD }], ['结果', { bold: true, color: GOLD }]],
    ['每帧绘制调用', '592'],
    ['每帧三角面数', '约 719,700'],
    ['着色器程序', '49'],
    ['网格 / 实例', '783 / 1,755'],
    ['光源 / 贴图 / 几何', '29 / 47 / 428'],
    ['樱花树 / 泡沫 / 人流上限', '210 / 190 / 260'],
    ['星点 / 落樱粒子', '2,600 / 900'],
    ['源码 / 单文件体积', '152 KB / 1.44 MB'],
  ], {
    x: 8.2, y: 1.5, w: 4.7, colW: [2.6, 2.1], fontSize: 11, color: WHITE, fontFace: CJK,
    border: { type: 'solid', pt: 0.5, color: '2A3550' }, fill: { color: '0D1526' }, rowH: 0.42,
  });

  /* 运行环境 */
  s = base(pptx.addSlide(), '08 / 运行环境');
  s.addText('跑起来需要什么', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, work.runtime, { x: 0.5, y: 1.3, w: 12.3, h: 4.0 });
  s.addText('开发：Node.js ≥ 18；npm run dev（端口 8766）/ npm run build / npm run submission。npm 依赖仅用于生成参赛文档，运行作品本身零依赖。', { x: 0.5, y: 5.6, w: 12.3, h: 0.8, fontSize: 12, color: BLUE, fontFace: CJK });

  /* 价值 */
  s = base(pptx.addSlide(), '09 / 应用价值');
  s.addText('它能用在哪里', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, work.value, { x: 0.5, y: 1.3, w: 12.3, h: 5.2 });

  /* 反思 */
  s = base(pptx.addSlide(), '10 / 反思与声明');
  s.addText('局限、下一步，以及说清楚的话', { x: 0.5, y: 0.34, w: 11, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: CJK });
  bullets(s, [
    ['局限：写意而非测绘', '地形、塔身比例、灯位与仙岛视距经过艺术化处理与压缩，不能用于工程或保护规划用途。'],
    ['已声明的艺术处理', '旋转光束为夜间呈现而做，实景灯塔以定光与灯质为主——作品内操作面板与本报告都写明。'],
    ['已写入画面的事实', '太湖 2020 年全面退捕禁渔，渔火已熄；湖上灯光只有航标与游船，不做已消失之物的复刻。'],
    ['未证实者不写', '夜樱灯光色温、桥孔数与桥长、月出方位等查无实据，一律不入解说，只按视觉需要处理。'],
    ['下一步：空间切换', '移植登塔（螺旋梯与顶层灯室俯瞰太湖）与立船头（甲板航行视角）两套空间。'],
    ['下一步：测绘与物候', '接入倾斜摄影替换写意几何；补花苞—盛花—落瓣的物候层与雨雾风浪。'],
    ['下一步：沉浸与联动', '封装 WebXR 进头显；与景区实测灯光和客流数据联动，让虚拟夜游与真实夜场同步。'],
    ['原创性', '代码、程序化贴图与文案全部自创，未用第三方受版权保护的模型、贴图或字体位图；渲染基于 MIT 许可的 three.js。'],
  ], { x: 0.5, y: 1.3, w: 12.3, h: 5.4 });

  /* 结尾 */
  s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.14, fill: { color: GOLD } });
  s.addText('谢谢观看', { x: 0.7, y: 2.6, w: 12, h: 1.0, fontSize: 40, bold: true, color: WHITE, fontFace: CJK });
  s.addText(`${work.title} · ${work.subtitle}\n${work.team.school}　${work.team.leader}　指导教师：${work.team.teachers}`, { x: 0.72, y: 3.8, w: 12, h: 1.2, fontSize: 14, color: DIM, fontFace: CJK });

  return pptx;
}

/* ------------------------------------------------------------------ 落盘 */

const doc = await buildReport();
const buf = await Packer.toBuffer(doc);
const docxPath = join(OUT, '鼋头渚太湖灯塔-作品说明书.docx');
writeFileSync(docxPath, buf);
console.log(`已生成报告：${docxPath}  (${(buf.length / 1048576).toFixed(2)} MB)`);

const deck = buildDeck();
const pptxPath = join(OUT, '鼋头渚太湖灯塔-演示文稿.pptx');
await deck.writeFile({ fileName: pptxPath });
console.log(`已生成演示：${pptxPath}`);
