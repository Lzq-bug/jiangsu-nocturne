/**
 * 生成参赛材料包（申报报告 .docx + 路演 .pptx），两者共用下面这一份内容源：
 * 改文案就改 work 对象，重跑即可同时刷新两份文件。
 *   node tools/make-submission.mjs
 *
 * 配图来自 docs/shots，由无头 Edge 逐机位截取：
 *   msedge --headless=new --screenshot=<绝对路径>.png "http://127.0.0.1:8790/index.html?st=<id>"
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
  title: '枫桥夜泊',
  subtitle: '寒山寺 · 上塘河 3D 夜景全景漫游系统',
  track: '数字文旅 · 文化遗产数字化',
  contest: '2026 年第十四届全国大学生数字媒体科技作品及创意竞赛（CMIT）',
  slogan: '把一首二十八字的唐诗，重建成一个可以走进去的夜——月落、霜天、江枫、渔火，与夜半钟声',
  team: {
    school: '【学校名称】', college: '【学院 / 系】', major: '【专业班级】',
    leader: '【负责人姓名 / 学号】', members: '【队员姓名 / 学号】',
    teachers: '【指导老师 1 / 指导老师 2】', contact: '【联系人 / 电话 / 邮箱】',
    date: '2026 年 10 月',
  },
  place: '苏州 · 寒山寺与枫桥景区（古运河上塘河段）',
  poem: '月落乌啼霜满天，江枫渔火对愁眠。姑苏城外寒山寺，夜半钟声到客船。',
  metrics: [
    ['机位总数', '9 处（客船夜泊 / 枫桥 / 寒山山门 / 钟楼·夜半钟 / 大雄宝殿 / 普明宝塔 / 铁铃关 / 古镇河市 / 空中鸟瞰）'],
    ['实体重建', '黄墙与山门、钟楼（内悬仿唐梵钟）、大雄宝殿、藏经楼、普明宝塔五层、碑廊诗碑、枫桥与江村桥两座单孔石拱、铁铃关券门与城墙、东岸廊棚河市、御码头与泊船'],
    ['固定灯具', '196 盏（寺灯、壁灯、桥堍石灯、拱腹灯、塔灯与檐铃、廊棚灯、市招灯、埠头灯）'],
    ['水面灯影', '69 根加性光柱 + 建筑镜像倒影 + 钟声波列（写入水面着色器）'],
    ['动态元素', '泊岸乌篷客船 3 艘与过往渔船 3 艘、岸上限 220 人、飘落枫叶 460 片、栖鸦 16 只'],
    ['环境规模', '星点 1,200 颗、远景城廓剪影 760 个实例、两岸江枫 17 株、贴水霜气 9 层'],
    ['核心交互', '夜半钟声：敲一响或撞满 108 响（约 2.4 分钟），同步钟体阻尼摆动、贴水波环、惊鸦离枝、落叶震散与渔火摇曳'],
    ['每帧开销（实测）', '609 次绘制调用 / 约 24.8 万三角面（含倒影与 5 遍泛光通道），常驻 48 个着色器程序'],
    ['工程形态', '13 个源码模块、约 4,300 行，零运行时依赖；单文件版 1.48 MB，双击即运行'],
  ],
  stations: [
    ['客船夜泊', '01-kechuan.png', '开场不在寺门，而在泊船边。三只乌篷客船系在寺前水弄堂的埠头外，船头一盏宫灯、船尾一堆渔火，篷骨在头顶拱成一道暗廊；对岸是沿河成市的廊棚与布幌。这一机位要交代的是"夜泊"这个动作本身——诗是从船上写完的。'],
    ['枫桥', '02-fengqiao.png', '站在桥顶西望，桥心的栏板、望柱与桥心石沿拱起翘，桥堍一对石灯把桥头收住；拱腹内点一排灯，使桥洞亮成一孔。桥下是可以通漕船的净空，远处普明宝塔与黄墙层层递进，是检验整体构图与灯光配比的主视角。'],
    ['寒山山门', '03-shanmen.png', '寺外面是一条只有五米宽的沿河纤道，山门就嵌在那道赭黄墙里，门额自右向左书"寒山寺"。作品刻意保留了这种"逼仄"：寺与运河之间没有广场，进香人是从水边直接走进门洞的。墙上一排壁灯与漏窗，是夜里最有辨识度的寺界。'],
    ['钟楼·夜半钟', '04-zhonglou.png', '钟楼是方形两层：下为砖身、上为敞亭，腰檐与平座把两层分开，二层明间吊一口仿唐梵钟，钟前悬撞木。点击钟身、按 B 敲一响、按 N 撞满一百八下——钟体开始阻尼摆动，钟声自合成器发出，一圈波列贴水推开。'],
    ['大雄宝殿', '05-dacheng.png', '重檐、列柱、隔扇与檐下成排的宫灯构成殿前的夜间形象，殿内三尊金身、供桌上的五盏长明灯与香炉一并重建，可从门口按"入殿"走进去。院中偏南立一面萧墙，山门望进来正被它挡住，这是江南寺观常见的空间处理。'],
    ['普明宝塔', '06-pagoda.png', '取寺的初名"妙利普明塔院"复建的仿唐方塔，五层、逐层收分、每层平座出檐、檐角悬铃。塔灯一层层点起，在夜行的运河船上就是认方位的凭据；塔刹在夜色里只剩一枚金色的亮。'],
    ['铁铃关', '07-tieling.png', '枫桥东头的抗倭关城，明嘉靖三十三年（1554）为防倭寇所筑，又名"枫桥敌楼"。券门跨驿道而开，关上垛口与门楼俱全，向南接一段城墙。它把这首诗从"风景"拉回"地名"：枫桥不只是一句诗，也是一处有过战事的关口。'],
    ['古镇河市', '08-huashi.png', '一河两岸的因船成市：河房前门卸货后门住家，临水一列立柱撑起廊棚，布幌伸到檐外，石埠一级级降到水面。夜里船家上岸吃酒，灯火一直挂到桥堍——这一岸是"渔火"之外的人间烟火。'],
    ['空中鸟瞰', '09-aerial.png', '抬升后一水串起桥、寺、关、市：枫桥居中跨河，其东是铁铃关与河市，其西岸是黄墙、钟楼与宝塔，上溯为江村桥。客船泊成一条橙线；此时撞钟，可以清楚看到声波贴着一圈圈推出去。'],
    ['钟声波环（实测帧）', '10-bell.png', '撞钟进行中的鸟瞰帧：钟口泛暖光、水面被波列推出一圈冷白 crest，渔火的亮度在同一时刻被压低。这一帧用于验证声画联动确实发生在同一时间轴上，而不是两段各自播放的动画。'],
  ],
  modules: [
    ['data.js', '九处机位与解说文案、上塘河坐标常量、泊位表、夜半钟的时间参数（108 响 / 1.35 秒 / 5.2 秒余响）'],
    ['kit.js（复用共享层）', '中式屋顶反曲与起翘、立柱、栏杆、斗拱、匾额、人形、船体放样的参数化生成；新增梵钟 Lathe 轮廓（外壁 + 内缩膛口 + 弦纹 + 蒲牢钮）'],
    ['textures.js（复用共享层）', '瓦垄、木纹、石作、粉墙、纸灯、窗棂、匾额、乌篷竹篾等贴图全部由 canvas 实时绘制；新增诗碑碑面、市招布幌、枫叶剪影与贴水霜气'],
    ['environment.js', '落月天空与星月、姑苏城廓与远塔剪影、寺后山脊、两岸江枫实例、栖鸦群、贴水霜气层，以及月落方向的月光标定'],
    ['architecture.js', '驳岸纤道与石埠、枫桥与江村桥两座单孔石拱、黄墙山门、钟楼（含可摆动的钟体与撞木）、大雄宝殿、藏经楼、普明宝塔五层、碑廊诗碑、铁铃关、东岸河市'],
    ['props.js', '196 盏灯具的统一灯场与密度联动、乌篷客船船队与渔火、香客舟子人流、460 片飘落枫叶'],
    ['water.js', '上塘河水面着色器、镜像倒影组、灯影光柱实例系统；新增钟声波列（顶点起伏与片元法线共用同一函数）'],
    ['bell.js', '夜半钟控制器：Web Audio 合成梵钟分音与撞木闷响、108 响计时与计数、钟体与撞木阻尼摆动、波环发射、惊鸦与落叶触发、渔火压暗回弹、按视距衰减音量'],
    ['portals.js / interiors.js', '四道光环门（入殿 / 登钟楼 / 看碑 / 入舱）与对应的室内内容：三尊金身与长明灯、钟楼二层木地板与楼灯、船舱小几与茶碗'],
    ['controls.js / hotspots.js / ui.js', '全景与自由双相机模型、地标锚定的热点与标签、参数面板、快捷键与夜半钟计数卡'],
    ['main.js', '启动序列与逐帧调度、画质自适应、机位深链（?st=）与钟声调试深链（?bell=）、场景统计句柄'],
    ['tools/serve.mjs · build-single.mjs', '零依赖本地静态服务；自研打包器把整张模块图压成单个 HTML，双击即运行'],
  ],
  innovations: [
    ['把"声音"当作夜景数字化的第一类对象', '夜半钟声是这段遗产里可听的那一半，却最常被数字化作品丢掉（通常只配一段音频）。本作品把钟声做成场景的主交互：梵钟的音列是不和谐的，因此用基音 + 约小三度的击音 + 一串高倍分音叠加，各分音衰减不同，再叠一记带通滤波的撞木闷响与短回馈延迟模拟寺院墙的反射；全程由 Web Audio 现场合成，仓库内没有任何音频文件。'],
    ['声画同源：一次敲击同时改写听觉与视觉状态', '敲击时刻与位置作为唯一输入，驱动钟体阻尼摆动、水面波列、钟口暖光、渔火压暗回弹、栖鸦惊起与落叶震散。这些不是并排放的动画，而是同一条时间轴上的耦合：撞满一百八下时，水面上始终有四五圈波列在互相穿过。'],
    ['波列写进水面着色器，而不是贴一层涟漪', '以敲击位置与时刻为参数，在顶点与片元共用同一个波列函数：前缘环带 + 尾随波列按时间与距离双指数衰减，法线由该函数解析求导后叠加到原有波纹上。因此倒影、月光高光与灯影光柱会同步被这圈波推动，而不是浮着一张贴图。'],
    ['一百八下的时间结构', '108 响 × 1.35 秒 ≈ 2.4 分钟，把"断百八烦恼"的宗教节律直接变成体验的时长；计数卡实时显示第几响与进度，Esc 可止。观众由此获得的不是"看完一段演示"，而是"陪一场仪式走完"。'],
    ['把诗本身做成场景里的实物', '《枫桥夜泊》四句二十八字由 canvas 按竖行右起绘制成碑面贴图，刻口带一侧受光高光，立在碑廊主碑上；在碑廊机位点"看碑"即可走近读碑。诗不是叠加的字幕，而是场景内可被看见、可被走近的一件文物。'],
    ['"月落"作为整套光照的标定原点', '月光方向常量压到约 10° 仰角，天空晕、水面月光窄带与投影平行光三处共用同一向量。低月使屋脊几乎接不到月光、水面反光带被拉长，因此额外补一盏来自城侧的暖色天光只负责形体塑造——这是为兑现"月落乌啼霜满天"而做的一次光照重构，而非套用常规夜景布光。'],
    ['与秦淮画廊同源的参数化引擎，零构建零依赖', '屋顶反曲、四角起翘、庑殿折痕、立柱栏杆、斗拱匾额、船体放样与水面/灯场/热点/相机系统全部复用自同一套共享层，新场景只重写形制参数与机位文案；梵钟是这套构件库新增的第一件金属器形。产物是一个 1.48 MB 的单文件 HTML，不依赖服务器、网络与安装。'],
  ],
  creative: [
    ['一夜未眠的记录', '这首诗的本体是一次"泊舟过夜"的私人记录，不是风景题咏。作品因此把开场机位放在船边而不是寺门前：先看见渔火与篷骨，再抬头看见黄墙与钟楼。观众在九个机位之间的移动，读起来是那一夜视线的一次次转移。'],
    ['被地理决定的构图', '上塘河在枫桥处收窄，西岸是寺、东岸是市，桥与关同城。场景因此以河为脊柱，把寺—桥—关—市排成一条线：河面半宽只有 9.6 米，三只泊船就能把半条河挡住，这既是"江枫渔火对愁眠"的物理条件，也是本作品与开阔河面夜景最直观的区别。'],
    ['夜半钟声的四百年公案', '欧阳修据此讥为"诗人语失"，后人以唐人作息（日入为夜、夜半近报晓）证夜半鸣钟并不违制；1979 年起寒山寺除夕子夜敲钟一百八下，与日本佛教的除夜钟相互呼应。作品把这段考据做成可以亲手操作的东西：想知道夜半钟声是什么感觉，就敲一次。'],
    ['"霜满天"怎么画', '霜不会飞满天，那是寒气、湿气与视觉上的白。作品用三段近似：贴水缓移的拉丝雾层、更浓的冷色雾密度、水面一层冷光泽，而不是给画面蒙一层白纱。观众看不见"霜"，但会觉得这一夜冷。'],
    ['乌啼作为证据点', '夜半钟响后栖鸦离枝，是把"乌啼"从形容词变回行为的尝试：鸦群平时栖在两岸枫树上，钟声不是每次都惊起它们，只有第七响起陆续有鸟离枝、盘旋后再回巢。这个细节同时也是声画是否真的同源的检验。'],
    ['为什么只做强夜', '与姊妹篇秦淮画廊同一个判断：白天信息量大而情绪弱，夜间信息量小而情绪强；而夜景恰恰是摄影测量与全景照片最难留下证据的时段。放弃昼夜切换，把全部力气放在"这一夜"。'],
  ],
  measurements: [
    ['测试分辨率', '1280 × 720，设备像素比 1.0'],
    ['每帧绘制调用', '609 次（含 5 遍泛光模糊与输出通道）'],
    ['每帧三角面数', '约 247,800（含建筑镜像倒影副本）'],
    ['离线几何统计', '889 个网格（其中 15 个实例化网格）、约 191,500 个不重复三角面、300 个几何体'],
    ['着色器程序 / 纹理', '48 个程序常驻，49 张纹理（全部 canvas 实时绘制，无外部图片）'],
    ['灯具与灯影', '196 盏固定灯具（100% 密度时全亮），69 根水面光柱'],
    ['动态元素规模', '6 艘船（3 泊 3 行）、220 名人流上限、460 片落叶、16 只栖鸦'],
    ['首帧构建耗时', '约 1.4 秒（贴图绘制 + 几何合并），随后关闭阴影自动更新'],
    ['单文件产物', '1.48 MB，file:// 双击可运行，已离线验证'],
  ],
  runtime: [
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），无构建步骤，源码即运行码'],
    ['运行时依赖', '零 npm 运行时依赖。three.js（MIT）与其附加模块随仓库 vendor 在本地，运行期不产生任何网络请求'],
    ['浏览器要求', '支持 WebGL2 与现代 ES Module 的桌面 / 移动浏览器（Chrome、Edge、Firefox、Safari 均可）'],
    ['开发预览', 'npm run dev 启动仓库自带的零依赖静态服务（禁用缓存），默认端口 8790'],
    ['离线展示', 'npm run build 生成 dist/寒山寺枫桥夜泊-3D全景.html，双击即可运行，无需网络与服务'],
    ['音频条件', '浏览器自动播放策略要求首次敲击由用户手势触发（点击钟身、界面按钮或按 B / N 键）；无音频文件、无外部服务'],
    ['推荐配置', '独显或较新核显、1920×1080 窗口；移动端 SoC 建议开启画质自适应或下调渔火寺灯密度'],
    ['输入方式', '鼠标拖拽 / 滚轮变焦 / 右键平移；触屏单指环视与双指捏合；键盘 A·D·Space·P·F·H·E·B·N·Esc 全键位'],
  ],
  value: [
    ['诗路文化带的可体验入口', '大运河国家文化公园与江苏"诗路"建设都需要把文本遗产转成可体验的空间内容；本作品给出一个最小可用样本：一首诗、一段河、一座寺，装进一个 1.48 MB 的文件。'],
    ['"可听遗产"的数字化范式', '钟声、市声、橹声这类遗产无法被三维扫描保存。作品示范了一条路径：把声音的生成规则与视觉状态绑定在同一时间轴上，使"听"成为数字化存档的一部分。'],
    ['线上夜游与弱网展陈', '单文件可嵌入景区公众号、小程序 webview、展馆一体机与课堂平板；无服务器、无网络依赖，适合展陈现场与乡村学校等弱网环境。'],
    ['语文与历史的情景教具', '《枫桥夜泊》的教学痛点是"夜"与"钟声"无法还原。作品提供九个机位的现场感与一次可亲手敲响的夜半钟，配合碑廊读碑，可直接用于课堂投屏。'],
    ['可复制的迁移方法', '与姊妹篇（秦淮画廊）共用同一套共享层，验证了新场景只需重写形制参数与机位文案即可迁移；本场景新增的梵钟构件与波列水面，也可反哺其他寺观与水乡场景。'],
  ],
  limits: [
    '作品为写意重建：建筑比例、灯位、树位与空间关系经过艺术化处理，不是测绘级模型，不能用于工程或保护规划用途。',
    '形制与位置做了为构图需要的添加：寒山寺山门朝向、钟楼层数与梵钟尺寸、枫桥与江村桥的相对位置、铁铃关城墙长度、两岸枫树密度均按诗意与江南尺度调整，未做实测断言。',
    '钟声为按梵钟音列特征合成的近似音色，不是寒山寺现场录音；一百八下的间隔取 1.35 秒，与真实除夕敲钟的现场节律不完全一致。',
    '人群、船只与灯组数量为示意性密度，未做真实客流与航运仿真；除钟声与撞木外不含其他环境音。',
    '移动端 SoC 上高灯密度与泛光叠加会明显发热，需借助画质自适应或下调渔火寺灯密度。',
    '匾额与诗碑文字按传统自右向左书写，与当代横排习惯不同，属有意为之的文化表达。',
  ],
  next: [
    '接入倾斜摄影或激光点云，把写意几何替换为测绘模型，保留同一套灯光、钟声与交互。',
    '补一年之期与一夜之序：霜降前后枫叶变色的层次、冬至交节与除夕子夜两种钟声语境。',
    '封装 WebXR 会话进入头显做沉浸式听钟；同时提供语音讲解与中英日多语字幕。',
    '与景区真实敲钟时刻联动，做"同一时刻，同一声"的线上听钟直播位。',
    '把共享层沉淀为可配置的场景模板：新增一座城只需填写形制与机位两张表。',
  ],
  originality: '本作品全部源代码、程序化贴图、合成音频与文案由团队自行创作生成，未使用任何第三方受版权保护的模型、贴图、字体位图或音频素材（梵钟音色由 Web Audio 按分音叠加实时合成，不含采样）。渲染基于 three.js（MIT 许可，已随源码保留版权声明），后处理泛光与输出通道同样取自 three.js 官方示例并保留原始许可头。诗中史实背景（张继与《枫桥夜泊》、寒山寺沿革、枫桥与江村桥、铁铃关抗倭、1979 年起除夕敲钟一百八下）基于公开史料与通行说法，写意处理的部分已在报告与作品内的说明中逐条标注。作品未在其他赛事中重复申报。',
  aiUsage: {
    tools: 'Qoder（AI 编程助手 IDE，底层为 Anthropic Claude 系列模型）；无头浏览器 Microsoft Edge（仅用于自动化截图与页面内脚本探针）。',
    stages: '需求拆解与技术方案、模块代码生成、着色器与音频合成算法实现、文案初稿、逐机位截图复核与缺陷定位、参赛材料生成脚本。',
    workflow: '① 人工确定选题边界与呈现方式（独立新工程、只要夜景、钟声做满 108 响）→ ② 人工给出地理与形制约束（上塘河沿 Z 轴、寺在西岸、月落方向）→ ③ AI 按模块生成代码与文案草稿 → ④ 人工在无头浏览器中逐机位截图验收 → ⑤ 人工指出具体缺陷并要求定点修正 → ⑥ 人工复核史实表述与写意边界。',
    promptExamples: '例如："把钟楼二层的梵钟做成可敲击的实体，钟体要阻尼摆动，水面要有一圈随时间扩散的波列，不要贴涟漪贴图"；"机位掉进船篷里了，把相机移到船尾渔火之后并按视高重算"；"照壁挡住了山门望大殿的中线，把它挪到院中偏南"。',
    humanReview: '人工主导并逐项验收的关键修正：中式屋顶在旋转后长宽轴互换的形制错误；寺内建筑轴线与热点锚点不一致导致标签飘移；钟楼被黄墙遮挡、相机穿模进船篷与关城墙面等六处机位重设；低月导致屋脊失光，补一盏城侧暖色天光；钟声波列过曝，收窄带宽并降低亮度；渔火与船灯亮度配比下调；写意添加与史实表述的逐条核对。',
    contribution: '团队的原创贡献在于：选题与呈现方式的判断、场景地理与形制约束的设定、九处机位的动线与构图、全部解说与文案的最终表述、夜半钟声这一核心交互的设计定义、以及以截图与页面内探针为准的验收标准。AI 生成的代码与文字均经过逐屏复核，未采纳的部分不进入最终作品。',
    compliance: '不含有第三方版权素材；不含有个人敏感信息与未经授权的数据集；全部数据由代码在运行时生成。使用 AI 辅助编程的目的与范围已如实披露，作品的可运行成果与表达内容由团队持有并负责。',
  },
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
      shading: i === 0 ? { fill: 'E7EEF4' } : undefined,
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: 'BFCBD8' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'BFCBD8' }, left: { style: BorderStyle.SINGLE, size: 2, color: 'BFCBD8' }, right: { style: BorderStyle.SINGLE, size: 2, color: 'BFCBD8' } },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: CJK, size: 20, bold: i === 0 })] })],
    })),
  })),
});

/* ------------------------------------------------------------------ report */
function buildReport() {
  const t = work.team;
  const ai = work.aiUsage;
  let fig = 0;
  const kids = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1500, after: 120 }, children: [new TextRun({ text: work.title, font: CJK, bold: true, size: 60 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 420 }, children: [new TextRun({ text: work.subtitle, font: CJK, size: 28, color: '2F4A63' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: work.poem, font: CJK, size: 22, italics: true, color: '7A2E22' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [new TextRun({ text: work.slogan, font: CJK, size: 20, color: '555555' })] }),
    table([
      ['竞赛名称', work.contest],
      ['申报方向', work.track],
      ['对象地点', work.place],
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
    p(`${work.title}是一件面向数字文旅场景的实时三维交互作品，以苏州寒山寺与枫桥一带的上塘河（古运河江南河段）为对象，重建张继《枫桥夜泊》所写的那个夜晚。作品为单一场景、九处机位：${work.stations.slice(0, 9).map(([n]) => n).slice(0, 9).join(' / ')}。`),
    p('使用者可以站在任一机位原地转头环视 360°，也可以脱离机位绕场自由观察；画面中的发光热点锚定在实体地标上，点击即可把相机送到该处并展开解说；山门殿、钟楼、碑廊与客船舱四处置有光环门，点击或走近按 E 即可进入其内。'),
    p('作品的核心交互是"夜半钟声"：点击钟身按 B 敲一响，按 N 撞满一百八下。钟声由 Web Audio 现场合成，一次敲击同时驱动钟体摆动、贴水扩散的声波环、钟口暖光、渔火摇曳、栖鸦惊起与落叶震散。'),
    p('作品不依赖任何摄影素材与外部资源，打开即可运行，并可打包为单个 1.48 MB 的 HTML 文件离线双击展示。'),
    h2('关键指标'),
    table([['项目', '指标'], ...work.metrics], [2600, 6700]),

    h1('二、选题背景与立意'),
    p('《枫桥夜泊》只有二十八个字，却几乎规定了江南之夜的全部要素：将落的月、啼起的鸦、满天的霜气、岸上的枫、船上的渔火，以及从寺里传到船上的钟声。这六个要素里，只有一个是可见的建筑（寺），其余全是光、天气、植物、火与声音——恰恰是常规数字化手段最难留下的部分。'),
    p('摄影测量在弱光与高反光下失效，全景照片视点固定且无法表现水面把灯光拖成长带，短视频有画面却没有"我可以自己转头看"的在场感，而钟声作为这段遗产里唯一可听的一半，几乎从不进入三维数字化作品的范围。作品因此选择了一条氛围优先的路径：不追求逐砖逐瓦的测绘复制，而是把中式建筑的形制规律、江南水巷的空间尺度与梵钟的声学特征抽象成参数，用代码重建"可信的夜"，并把钟声做成第一类对象。'),
    p('立意的另一层是"公共性"。这件作品的最终产物是一个 1.48 MB 的 HTML 文件：不需要 GPU 服务器、不需要安装、不需要网络，景区公众号、展馆一体机、课堂平板与学生手机都能直接打开。文化数字化的成果因此可以不必停留在演示视频里——包括那口钟，是可以被听众亲手敲响的。'),

    h1('三、创意来源'),
    ...work.creative.flatMap(([title, text]) => [h2(title), p(text)]),

    h1('四、作品呈现：九处机位与一次撞钟'),
    p('机位既是观展路线，也是解说结构。动线自泊船起，上桥、进门、登楼、望殿、观塔、过关、入市，最后抬升为鸟瞰以检验整体构图；每一处机位的热点标签都锚在实体地标上，而非相机位置。'),
  ];

  work.stations.forEach(([name, file, text]) => {
    fig += 1;
    kids.push(h2(`${fig}. ${name}`));
    kids.push(picture(file, 600, 338));
    kids.push(caption(`图 ${fig}　${name}机位实时渲染画面`));
    kids.push(p(text));
  });

  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(h2('交互界面'));
  kids.push(picture('04-zhonglou.png', 600, 338));
  kids.push(caption(`图 ${fig + 1}　漫游界面：顶部视角模式与帧率，左侧夜半钟计数卡，右侧参数面板，底部景点导航条，右下罗盘`));
  fig += 1;
  kids.push(p('界面遵循"少遮挡"原则：参数面板在小屏下默认收起，解说卡片在开场十余秒后自动让位给画面，罗盘实时指示朝向。左上角的夜半钟计数卡是本场景特有的控件，显示当前第几响与一百八下的进度，并在撞钟过程中高亮。'));

  kids.push(h1('五、产品技术方案'));
  kids.push(h2('5.1 模块划分'));
  kids.push(table([['模块', '职责'], ...work.modules], [2900, 6400]));
  kids.push(h2('5.2 场地坐标系与形制标定'));
  kids.push(p('全场景共用一个右手坐标系：上塘河沿 Z 轴展开，水面 y=0，岸顶 y=2.2 米，河面半宽 9.6 米；西岸（x 为负）是寒山寺，东岸是古镇河市与铁铃关。寺内建筑不再各自给坐标，而是全部由"寺前黄墙所在的线"这一常量向内递推（山门嵌在墙上，钟楼、大殿、藏经楼、塔院依次后退），因此改一道墙即可整体平移，机位与热点标签不会错位。桥、关、市同理各有一条基准线。'));
  kids.push(p('尺度上刻意保留三处"逼仄"：寺与运河之间只有约五米宽的纤道，河面窄到三只泊船即可挡住半条河，枫桥的拱顶为通漕船而起得高、桥头砌得陡。这三条是这首诗得以成立的物理条件，也是本场景与开阔河面夜景最直观的区别。'));
  kids.push(h2('5.3 程序化建模'));
  kids.push(p('建筑构件全部由函数生成，核心是中式屋顶的参数化曲面：在矩形网格上以"到脊线的归一化距离"求高度，坡面用 t 与 √t 的混合实现反曲（近脊陡、近檐缓），四角再叠加随角梁方向增长的起翘项，庑殿折痕由 max(dzN, dxN) 这一度量精确落在角梁位置上。同一函数通过改变宽高比与脊长比例，生成廊顶、桥亭、重檐大殿、门楼、塔檐、墙头压顶与江南民居的两坡水屋顶。'));
  kids.push(p('本场景新增两件器形。其一是梵钟：以 Lathe 旋转成型，外壁轮廓给出近圆柱的钟身、微撇的钟口与穹起的钟顶，同一轮廓向内缩出一道内壁，使口沿读起来是一圈壁厚而不是一个硬边，再加上下两道凸弦纹与顶部蒲牢钮。其二是乌篷客船：船体按站位剖面放样，竹篷用三段半圆拱加竹篾贴图，船头一盏宫灯、船尾一堆渔火、大橹与苫子俱全，舱内另置小几与茶碗。'));
  kids.push(p('普明宝塔为方形五层楼阁式，逐层收分，每层平座出檐、檐角悬铃；铁铃关的券门用带孔洞的挤出体生成，孔洞为半圆拱加直壁，关上布垛口与门楼并接一段城墙。为避免绘制调用失控，长廊立柱、两岸枫树、远景屋脊与人群均使用实例化网格，梁枋斗拱按材质合并为单一几何体。'));
  kids.push(h2('5.4 程序化贴图'));
  kids.push(p('瓦垄、木构纹理、石作砌缝、粉墙、纸灯肋纹、窗棂花格、乌篷竹篾、匾额题字、枫叶剪影与贴水霜气，全部在 canvas 上按参数绘制后作为纹理使用，仓库内没有任何图片素材，也不产生网络请求，同时保证任何机器上渲染出的都是同一张图。'));
  kids.push(p('《枫桥夜泊》诗碑是这套贴图里唯一"以文字为内容"的一张：四句诗按竖行自右向左排布，每字先画一侧偏移的浅色再压深色，模拟刻口受光；碑首题"枫桥夜泊"，落款与朱印另起。观众在碑廊机位点"看碑"即可走近读碑。'));
  kids.push(h2('5.5 水面、灯影与钟声波列'));
  kids.push(p('水面由三层合成。第一层是水面本身：顶点做低频起伏，片元用与顶点同源的波函数解析求导得到法线，再按菲涅尔项混合深水色与天空反射色；月光高光被限制在朝向月亮的窄带内，但由于这一夜的月只有约 10° 仰角，窄带被刻意放宽、亮度压低，使整条河呈一面冷镜而不是白茫茫一片。第二层是倒影：把建筑组沿水面镜像，替换为暗化材质并在顶点阶段注入随时间摆动的扰动，按入水深度淡出。第三层是灯影光柱：每盏登记在水面上的灯具对应一根朝向相机的加性混合实例面片，带闪烁与横向摆动，随渔火寺灯密度开关联动熄灭。'));
  kids.push(p('钟声波列叠加在同一套水面函数上：以敲击位置为圆心、敲击时刻为零点，前缘环带与尾随波列按"时间衰减 × 距离衰减"的双指数给出高度与亮度，法线由同一函数解析求导后叠加。因此一圈波推过时，倒影、月光窄带与灯影光柱会同步被扰动，而不是水面上浮着一张涟漪贴图。开发中修正了两处问题：半透明水面会透出天球穹顶下半球的亮色导致整条河"白天化"，通过把地平线以下压暗解决；波列初版带宽与亮度过宽过曝，在鸟瞰帧上糊成一片白斑，通过收窄高斯带宽并把亮度降到约一半解决。'));
  kids.push(h2('5.6 光照与后期'));
  kids.push(p('为兑现"月落"，月光方向常量被压到约 10° 仰角，天空晕、水面月光窄带与投影平行光三处共用这一个向量。低月的代价是屋脊几乎接不到月光，因此补一盏来自城侧（河东）的暖色平行光，只负责把形体模型出来而不参与投影；半球光承担冷调环境光，寺前灯、钟楼、大殿、渔火与河市共七组点光提供暖色溢出。月光投影只渲染一次后关闭阴影自动更新，把静态阴影的开销摊薄为零。'));
  kids.push(p('后期为 UnrealBloom 泛光 + 统一输出通道：因为渲染进入的是半浮点离屏缓冲，材质阶段不做色调映射，色调与色彩空间转换统一在输出通道完成，灯具颜色因此可以超过 1.0 而成为真正的高光，泛光阈值也才能稳定卡住。雾为指数平方冷雾，与贴水缓移的霜气层共同承担"霜满天"的观感。'));
  kids.push(h2('5.7 夜半钟声的交互实现'));
  kids.push(p('声音：梵钟的音列是不和谐的。作品以 96.5 Hz 为基音，叠加约小三度的击音与五个高倍分音（2.02 / 2.71 / 3.06 / 4.12 / 5.42），每个分音独立设定峰值与指数衰减（基音约 7.4 秒、最高分音约 1.2 秒），另用一段带通滤波的短噪声模拟撞木触钟的闷响；输出经低通与一条 0.23 秒的短回馈延迟，模拟寺院墙顶回来的空间感。音量按相机到钟的视距实时衰减，走近与远离听感不同。全程 Web Audio 现场合成，仓库内没有任何音频文件。'));
  kids.push(p('视觉耦合：每次敲击在控制器里留下一条记录，钟体与撞木按同一时刻做阻尼摆动（约 1.9 秒衰减、周期约 2.1 秒），多次敲击的摆动同相叠加，因此连敲时钟会越荡越大；波环、钟口暖光、渔火压暗、栖鸦惊起与落叶震散都由同一条记录触发。108 响的整套约 2.4 分钟，界面计数卡实时显示进度，Esc 可止。'));
  kids.push(h2('5.8 交互与工程'));
  kids.push(p('两种相机行为共用一套代码：全景模式下相机钉在机位上，拖拽改变朝向并带惯性，滚轮调节视野角（22°–96°）模拟变焦；自由模式下围绕目标点环绕、推拉与平移。机位切换用带角度最短路径的补间飞行，触屏支持单指环视与双指捏合。热点标签每帧投影到屏幕坐标，背向相机、超出视野或属于当前机位时自动隐藏。四道光环门只在室外或对应空间内显示，点击或按 E 进出，进入室内后热点与标签自动收起。'));
  kids.push(p('工程无构建步骤：源码为原生 ES Module，通过 importmap 解析 three.js 与官方附加模块。开发期由仓库自带的 Node 脚本提供零依赖本地服务（禁用缓存，改完刷新即生效）；交付期由自研打包脚本把整张模块图编译为单文件 HTML——每个模块被编译成注册表中的工厂函数，使 three.js、附加模块与自有代码各自保有独立作用域。渲染侧提供画质自适应，持续低帧时依次降低分辨率与关闭倒影，并明确提示用户可手动下调灯火密度。场景另提供机位深链（?st=）与钟声调试深链（?bell=），既用于构图自检，也可作为展陈直达链接。'));

  kids.push(h1('六、创新点'));
  work.innovations.forEach(([title, text]) => {
    kids.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, font: CJK, bold: true, size: 21, color: '2F4A63' })] }));
    kids.push(p(text));
  });

  kids.push(h1('七、实测与验证'));
  kids.push(p('以下数据在 1280×720、设备像素比 1.0 条件下，由页面内置的渲染统计接口与离线几何统计共同给出，绘制调用与三角面数为每帧均值。'));
  kids.push(table([['指标', '数值'], ...work.measurements], [2900, 6400]));
  kids.push(p('功能层面已完成逐项验证：九处机位的构图与遮挡检查、拖拽环视与惯性、滚轮变焦、热点点击传送与解说弹出、全景与自由模式互切、渔火寺灯密度归零时灯具与水面光柱同步熄灭、自动巡览、参数恢复默认、画面截图导出；夜半钟的一响与一百八下模式经页面内脚本探针确认计数递增、波环入队、钟体枢轴与撞木枢轴摆动、八道光环门位置正确；单文件产物以 file:// 离线打开渲染通过。渲染层无 WebGL 报错与着色器编译失败。'));
  kids.push(p('开发过程中通过无头浏览器逐机位截图复核构图，修正了六处实际缺陷：相机穿模进乌篷船竹篷与关城墙面、钟楼被黄墙挡死、殿顶旋转后长宽轴互换导致屋面压向面阔方向、照壁挡住山门望大殿的中线、水面波列过曝糊成白斑、低月导致屋脊失光。'));
  kids.push(p('复测命令（浏览器控制台执行，返回每帧绘制调用与三角面数）：', { after: 60 }));
  kids.push(p('　fengqiao.renderer.info.autoReset = false; fengqiao.renderer.info.reset(); fengqiao.composer.render();', { size: 18, color: '555555', after: 40 }));
  kids.push(p('　// 读取 fengqiao.renderer.info.render.calls / triangles；灯具与光柱数见 fengqiao.props.field.total 与 fengqiao.columns.items.length', { size: 18, color: '555555', after: 200 }));

  kids.push(h1('八、应用价值与推广'));
  work.value.forEach(([title, text]) => kids.push(bullet(`${title}：${text}`)));

  kids.push(h1('九、局限与后续计划'));
  work.limits.forEach((l) => kids.push(bullet(l)));
  kids.push(h2('下一步'));
  work.next.forEach((n) => kids.push(bullet(n)));

  kids.push(h1('十、原创性与素材声明'));
  kids.push(p(work.originality));

  kids.push(h1('十一、人工智能工具使用说明'));
  kids.push(p('按本届竞赛通知对"人工智能工具使用说明"的要求，逐项如实说明如下。'));
  kids.push(table([
    ['项目', '说明'],
    ['工具名称', ai.tools],
    ['应用环节', ai.stages],
    ['生成流程 / 工作流', ai.workflow],
    ['代表性提示词', ai.promptExamples],
    ['人工筛选与修改过程', ai.humanReview],
    ['参赛团队原创贡献', ai.contribution],
    ['版权与数据合规', ai.compliance],
  ], [2600, 6700]));

  kids.push(h1('十二、团队与分工'));
  kids.push(table([
    ['成员', '角色', '主要工作'],
    [t.leader, '负责人 / 技术与设计', '总体方案、渲染与交互实现、梵钟声画耦合、性能与构图调优'],
    [t.members, '成员', '建筑形制与史料整理、机位与构图、解说与文案'],
    [t.members, '成员', '视觉风格与配色、测试与展陈材料'],
    [t.teachers, '指导老师', '选题指导与文化内容审订'],
  ], [2600, 2400, 4300]));

  kids.push(h1('附录 A　运行环境与复现'));
  kids.push(table([['项目', '说明'], ...work.runtime], [2600, 6700]));
  kids.push(h2('操作键位'));
  kids.push(p('左键拖拽环视 / 右键或两指平移 / 滚轮变焦 / 点击钟身或 B 敲一响 / N 撞满一百八 / E 进出门 / A·D 切换景点 / 空格自动巡览 / P 切换视角模式 / F 全屏 / H 帮助 / Esc 关闭面板与止钟。'));
  kids.push(h2('构建与运行命令'));
  kids.push(table([
    ['命令', '作用'],
    ['npm run dev', '启动零依赖本地服务，打开 http://127.0.0.1:8790/index.html'],
    ['npm run build', '打包单文件到 dist/寒山寺枫桥夜泊-3D全景.html（约 1.48 MB，双击即运行）'],
    ['npm run submission', '由本脚本从同一份内容源重新生成申报报告与路演文稿'],
    ['启动预览.bat', 'Windows 下双击即启动本地服务并打开浏览器'],
  ], [3400, 5900]));
  kids.push(h2('逐机位配图复拍命令'));
  kids.push(p('　msedge --headless=new --disable-gpu --use-angle=swiftshader --window-size=1280,720 \\', { size: 18, color: '555555', after: 40 }));
  kids.push(p('　　　--virtual-time-budget=90000 --screenshot=D:/hanshan-fengqiao/docs/shots/<编号-机位>.png \\', { size: 18, color: '555555', after: 40 }));
  kids.push(p('　　　"http://127.0.0.1:8790/index.html?st=<机位 id>"　（加 &bell=1 可拍撞钟进行中的帧）', { size: 18, color: '555555', after: 200 }));

  kids.push(h1('附录 B　史实与写意边界'));
  kids.push(p('为避免把艺术处理误读为测绘或考据成果，逐条列明本场景的依据与添加：'));
  kids.push(bullet('可查证的公开史实：《枫桥夜泊》作者为唐代诗人张继；寒山寺始建于南朝梁天监年间，原名妙利普明塔院，相传唐贞观间寒山、拾得居之遂以"寒山"名寺，现存殿宇多为清光绪年间重建；枫桥位于姑苏城外阊门西的上塘河（古运河江南河段）上，旧桥毁于太平天国兵火，清同治六年（1867）重修；铁铃关为明嘉靖三十三年（1554）防倭所筑，又名"枫桥敌楼"；寺内《枫桥夜泊》诗碑以清光绪十六年（1890）俞樾所书最为著名；自 1979 年起寒山寺于除夕子夜敲钟一百八下迎新年。'));
  kids.push(bullet('存在争议或多元说法的部分："枫桥"一作"江村"，与下游江村桥的关系历来有争论；"乌啼"一谓夜半乌鹊惊啼，一谓附会为旧时桥名或山名；夜半鸣钟是否合于唐制，自欧阳修起聚讼千年。作品在解说中并列数说而未取定论。'));
  kids.push(bullet('写意添加：山门朝向与寺前纤道宽度、钟楼层数与梵钟尺寸、普明宝塔的塔院位置、枫桥与江村桥的相对距离、铁铃关城墙长度、两岸枫树与船只密度、殿内佛像与供桌陈设，均按诗意与江南尺度做艺术化处理，不构成实测断言。'));
  kids.push(bullet('梵钟音色为按分音叠加合成的近似，非寒山寺现场录音；一百八下的间隔取 1.35 秒，与真实除夕现场节律不完全一致。'));
  work.limits.forEach((l) => kids.push(bullet(l)));

  return new Document({
    creator: work.team.school,
    title: `${work.title}${work.subtitle} 作品申报报告`,
    description: work.contest,
    styles: { default: { document: { run: { font: CJK, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } }, children: kids }],
  });
}

/* ------------------------------------------------------------------ slides */
const INK = '071022', FROST = 'A8CFE0', WHITE = 'FFFFFF', DIM = 'A9B3CC', MAPLE = 'D9603A', NAVY2 = '0E1A2E';

function buildDeck() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: 13.333, height: 7.5 });
  pptx.layout = 'W16x9';
  pptx.author = work.team.school;
  pptx.title = `${work.title} ${work.subtitle}`;

  const base = (s, title, kicker) => {
    s.background = { color: INK };
    s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: FROST } });
    if (kicker) s.addText(kicker, { x: 0.7, y: 0.42, w: 12, h: 0.3, fontFace: CJK, fontSize: 12, color: FROST, charSpacing: 3 });
    if (title) s.addText(title, { x: 0.68, y: 0.72, w: 12, h: 0.7, fontFace: CJK, fontSize: 28, bold: true, color: WHITE });
    return s;
  };
  const bullets = (s, items, opt) => s.addText(items.map((tx, i) => ({
    text: tx, options: { bullet: { code: '25AA', indent: 14 }, color: DIM, breakLine: i < items.length - 1, paraSpaceAfter: 10 },
  })), { fontFace: CJK, fontSize: 15, valign: 'top', ...opt });
  const grid = (s, files, y0) => {
    files.forEach(([f, label], i) => {
      const x = 0.6 + (i % 2) * 6.2, y = y0 + Math.floor(i / 2) * 2.75;
      s.addImage({ data: img(f), x, y, w: 5.9, h: 2.35 });
      s.addText(label, { x, y: y + 2.36, w: 5.9, h: 0.3, fontFace: CJK, fontSize: 11.5, color: FROST });
    });
  };
  // 表头行：既接受一行单元格数组，也接受多行数组
  const headTable = (rows) => (Array.isArray(rows[0]) ? rows : [rows]).map((r) => r.map(
    (c) => ({ text: c, options: { bold: true, color: INK, fill: { color: FROST } } }),
  ));

  let s = pptx.addSlide();
  s.background = { color: INK };
  s.addImage({ data: img('02-fengqiao.png'), x: 0, y: 0, w: 13.333, h: 7.5, transparency: 32 });
  s.addShape('rect', { x: 0, y: 3.9, w: 13.333, h: 3.6, fill: { color: '04070F', transparency: 20 } });
  s.addText(work.title, { x: 0.9, y: 4.05, w: 11.5, h: 1.1, fontFace: CJK, fontSize: 50, bold: true, color: WHITE, charSpacing: 12 });
  s.addText(work.subtitle, { x: 0.95, y: 5.2, w: 11.5, h: 0.5, fontFace: CJK, fontSize: 20, color: FROST, charSpacing: 2 });
  s.addText(work.poem, { x: 0.95, y: 5.75, w: 11.5, h: 0.4, fontFace: CJK, fontSize: 13.5, italic: true, color: 'D8E4EE' });
  s.addText(`${work.contest}　|　申报方向：${work.track}\n${work.team.school} ${work.team.college}　团队负责人：${work.team.leader}　指导教师：${work.team.teachers}`,
    { x: 0.95, y: 6.3, w: 11.6, h: 0.8, fontFace: CJK, fontSize: 12.5, color: 'C9D2E8', lineSpacing: 19 });

  s = base(pptx.addSlide(), '二十八个字里，数字化最难的那一半', '01 / 选题背景');
  s.addImage({ data: img('09-aerial.png'), x: 6.85, y: 1.7, w: 5.8, h: 3.26 });
  s.addText('鸟瞰：一水串起桥、寺、关、市', { x: 6.85, y: 5.0, w: 5.8, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });
  bullets(s, [
    '《枫桥夜泊》的六要素：将落的月、啼起的鸦、满天的霜、岸上的枫、船上的渔火、寺里的钟声',
    '其中只有"寺"是可见的建筑，其余全是光、天气、植物、火与声音',
    '摄影测量在弱光与高反光下失效；全景照片视点固定；短视频没有在场感',
    '钟声是这段遗产唯一可听的一半，却几乎从不进入三维数字化作品',
    '作品的回答：把形制、尺度与声学特征抽象成参数，重建可信的夜，并把钟声做成第一类对象',
  ], { x: 0.7, y: 1.8, w: 5.9, h: 4.6 });

  s = base(pptx.addSlide(), '创意来源：从一夜未眠到一条河的尺度', '02 / 创意来源');
  bullets(s, [
    '诗的本体是一次"泊舟过夜"的私人记录——所以开场机位在船边，不在寺门前',
    '地理决定构图：上塘河在枫桥处收窄，西岸是寺、东岸是市，桥与关同城，故以河为脊柱',
    '刻意保留三处逼仄：寺与河只有五米纤道、三只船挡住半条河、桥拱为通漕船而起得高',
    '夜半钟声的四百年公案：欧阳修讥"三更不是打钟时"，后人以唐人作息证其不违制；1979 年起除夕敲钟 108 响与日本除夜钟相互呼应',
    '"霜满天"不是霜：用贴水拉丝雾 + 更浓的冷雾 + 水面冷光泽三段近似，而不是蒙一层白纱',
    '栖鸦被第七响惊起、盘旋后回巢——把"乌啼"从形容词变回行为',
  ], { x: 0.7, y: 1.75, w: 12, h: 5.2 });

  s = base(pptx.addSlide(), '九处机位（上）：船、桥、门、楼', '03 / 作品呈现');
  grid(s, [['01-kechuan.png', '客船夜泊 · 乌篷与渔火'], ['02-fengqiao.png', '枫桥 · 拱腹点灯'], ['03-shanmen.png', '寒山山门 · 五米纤道'], ['04-zhonglou.png', '钟楼 · 二层悬钟']], 1.6);
  s.addText('动线：泊船 → 上桥 → 进门 → 登楼 → 望殿 → 观塔 → 过关 → 入市 → 鸟瞰',
    { x: 0.68, y: 7.0, w: 12, h: 0.35, fontFace: CJK, fontSize: 12, color: DIM });

  s = base(pptx.addSlide(), '九处机位（下）：殿、塔、关、市', '04 / 作品呈现');
  grid(s, [['05-dacheng.png', '大雄宝殿 · 檐下宫灯'], ['06-pagoda.png', '普明宝塔 · 五层塔灯'], ['07-tieling.png', '铁铃关 · 券门与垛口'], ['08-huashi.png', '古镇河市 · 廊棚布幌']], 1.6);
  s.addText('四道光环门：入殿 / 登钟楼 / 看碑 / 入舱——点击或走近按 E 进入其内',
    { x: 0.68, y: 7.0, w: 12, h: 0.35, fontFace: CJK, fontSize: 12, color: DIM });

  s = base(pptx.addSlide(), '核心交互：夜半钟声一百八下', '05 / 一次撞钟');
  s.addImage({ data: img('10-bell.png'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  s.addText('撞钟进行中的鸟瞰帧：波列贴水推开，渔火同时矮一口', { x: 7.15, y: 4.9, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });
  bullets(s, [
    '点击钟身或按 B 敲一响；按 N 撞满 108 响（1.35 秒一响，约 2.4 分钟），Esc 止钟',
    '梵钟音列不和谐：基音 96.5 Hz + 约小三度击音 + 五个高倍分音，各自不同衰减',
    '另加带通短噪声模拟撞木触钟，输出走低通与 0.23 秒回馈延迟，模拟院墙反射',
    '一次敲击同轴驱动：钟体与撞木阻尼摆动、水面波列、钟口暖光、渔火压暗、栖鸦惊起、落叶震散',
    '音量按相机到钟的视距实时衰减；全程 Web Audio 合成，仓库内无一个音频文件',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  s = base(pptx.addSlide(), '难点一：波列写进水面着色器，而不是贴一层涟漪', '06 / 产品技术');
  s.addImage({ data: img('01-kechuan.png'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  bullets(s, [
    '水面三层：解析法线波纹 + 菲涅尔天空反射；建筑组镜像倒影；69 根加性灯影光柱',
    '波列以敲击位置与时刻为参数，前缘环带 + 尾随波列按时间与距离双指数衰减',
    '法线由同一波列函数解析求导后叠加，因此倒影、月光窄带与灯影同步被推动',
    '修正①：水面透出天球下半球导致"白天化"→ 地平线以下压暗',
    '修正②：波列初版过宽过曝，鸟瞰上糊成白斑 → 收窄带宽、亮度降至约一半',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });
  s.addText('窄河上的泊船、纤道与黄墙', { x: 7.15, y: 4.9, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '难点二：一套屋顶函数，长出寺、桥、关、市', '07 / 产品技术');
  s.addImage({ data: img('06-pagoda.png'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  bullets(s, [
    '坡面反曲用 t 与 √t 混合；四角起翘随角梁方向增长；庑殿折痕以 max(dzN, dxN) 精确落在角梁上',
    '同一函数按宽高比与脊长比例覆盖廊顶 / 桥亭 / 重檐大殿 / 门楼 / 塔檐 / 墙头压顶 / 民居两坡水',
    '新增梵钟 Lathe：外壁 + 内缩膛口 + 两道弦纹 + 蒲牢钮，口沿读起来是一圈壁厚',
    '乌篷船按站位剖面放样 + 三段半圆竹篷；券门与桥身用带孔洞的挤出体',
    '立柱、枫树、远景屋脊、人群、落叶、栖鸦全部实例化；梁枋斗拱按材质合并',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.6 });
  s.addText('方形五层楼阁式塔，逐层收分、檐角悬铃', { x: 7.15, y: 4.9, w: 5.5, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '难点三：让"月落"决定整套光照', '08 / 产品技术');
  bullets(s, [
    '月光方向常量压到约 10° 仰角，天空晕、水面月光窄带、投影平行光三处共用同一向量',
    '低月使屋脊几乎接不到月光 → 补一盏来自城侧的暖色平行光，只作形体塑造不参与投影',
    '半球光承担冷调环境光，七组点光（山门 / 钟楼 / 大殿 / 渔火 / 河市 / 桥心）提供暖色溢出',
    '后期 UnrealBloom + 统一输出通道：材质阶段不做色调映射，灯具颜色才能超过 1.0 成为真高光',
    '指数平方冷雾 + 9 层贴水拉丝雾共同承担"霜满天"，随时间缓移与呼吸',
    '阴影只渲染一次后关闭自动更新，把静态阴影开销摊薄为零',
  ], { x: 0.7, y: 1.8, w: 12, h: 3.5 });
  s.addTable([
    headTable(['规模', '数值'])[0],
    ['机位 / 固定灯具', '9 处 / 196 盏'],
    ['水面光柱 / 泊船与行船', '69 根 / 3 + 3 艘'],
    ['每帧绘制调用 / 三角面数', '609 次 / 约 24.8 万'],
    ['着色器程序 / 纹理 / 网格', '48 个 / 49 张 / 889 个（其中 15 个实例化）'],
  ], { x: 0.7, y: 5.5, w: 12, fontFace: CJK, fontSize: 12.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.34, colW: [4.4, 7.6] });

  s = base(pptx.addSlide(), '零构建、零依赖、可离线交付', '09 / 运行环境');
  bullets(s, [
    '原生 ES Module + importmap，three.js（MIT）与附加模块随仓库 vendor，无运行时依赖',
    '开发：仓库自带 Node 零依赖静态服务（禁用缓存），npm run dev，默认端口 8790',
    '交付：npm run build 压成 1.48 MB 单文件 HTML，file:// 双击即运行，已离线验证',
    '打包要点：每个模块编译为独立工厂函数，避免顶层标识符冲突',
    '画质自适应：持续低帧依次降分辨率、关倒影，并提示手动下调渔火寺灯密度',
    '输入：鼠标 / 触屏（单指环视、双指捏合）/ 全键位键盘（含 B·N·E 三个钟声与穿越键）',
  ], { x: 0.7, y: 1.8, w: 12, h: 3.6 });
  s.addTable([
    headTable(['运行环境', '说明'])[0],
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），源码即运行码'],
    ['浏览器', '支持 WebGL2 与现代 ES Module 的桌面 / 移动浏览器'],
    ['音频条件', '首次敲击需用户手势触发（浏览器自动播放策略）；无音频文件与外部服务'],
    ['推荐配置', '独显或较新核显、1920×1080；移动端建议开启画质自适应'],
  ], { x: 0.7, y: 5.55, w: 12, fontFace: CJK, fontSize: 12.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.34, colW: [2.6, 9.4] });

  s = base(pptx.addSlide(), '创新点小结', '10 / 创新点');
  work.innovations.forEach(([title], i) => {
    const y = 1.66 + i * 0.79;
    s.addShape('roundRect', { x: 0.7, y, w: 12, h: 0.66, fill: { color: NAVY2 }, line: { color: '2A3550', width: 0.75 }, rectRadius: 0.06 });
    s.addText(String(i + 1).padStart(2, '0'), { x: 0.85, y: y + 0.08, w: 0.7, h: 0.5, fontFace: CJK, fontSize: 17, bold: true, color: MAPLE });
    s.addText(title, { x: 1.55, y: y + 0.1, w: 11, h: 0.5, fontFace: CJK, fontSize: 13.5, bold: true, color: WHITE });
  });
  s.addText('展开说明见申报报告第六章', { x: 0.7, y: 7.05, w: 8, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '实测与验证', '11 / 实测');
  s.addImage({ data: img('03-shanmen.png'), x: 7.15, y: 1.75, w: 5.5, h: 3.09 });
  s.addTable([
    headTable(['指标', '数值'])[0],
    ...work.measurements.slice(0, 5),
  ], { x: 0.7, y: 1.8, w: 6.2, fontFace: CJK, fontSize: 11.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.46, colW: [2.1, 4.1] });
  bullets(s, [
    '九处机位逐一无头截图复核构图与遮挡，修正六处实际缺陷',
    '钟声模式经页面内探针确认：计数递增、波环入队、钟体与撞木枢轴摆动',
    '灯火归零时灯具与水面光柱同步熄灭，参数与画面严格联动',
    '渲染层无 WebGL 报错、无着色器编译失败；单文件离线渲染通过',
  ], { x: 7.15, y: 5.0, w: 5.5, h: 1.9 });

  s = base(pptx.addSlide(), '应用价值与推广', '12 / 价值');
  work.value.forEach(([title, text], i) => {
    const x = 0.7 + (i % 2) * 6.2, y = 1.75 + Math.floor(i / 2) * 1.9;
    s.addShape('roundRect', { x, y, w: 5.8, h: 1.7, fill: { color: NAVY2 }, line: { color: '2A3550', width: 0.75 }, rectRadius: 0.08 });
    s.addText(title, { x: x + 0.22, y: y + 0.14, w: 5.4, h: 0.35, fontFace: CJK, fontSize: 14.5, bold: true, color: FROST });
    s.addText(text, { x: x + 0.22, y: y + 0.52, w: 5.4, h: 1.1, fontFace: CJK, fontSize: 11.5, color: DIM, lineSpacing: 16 });
  });

  s = base(pptx.addSlide(), '人工智能工具使用说明', '13 / AI 使用披露');
  const ai = work.aiUsage;
  s.addTable([
    headTable(['项目', '说明'])[0],
    ['工具名称', ai.tools],
    ['应用环节', ai.stages],
    ['生成流程', ai.workflow],
    ['人工筛选与修改', ai.humanReview],
    ['团队原创贡献', ai.contribution],
    ['版权与数据合规', ai.compliance],
  ], { x: 0.7, y: 1.7, w: 12, fontFace: CJK, fontSize: 10.5, color: DIM, border: { pt: 0.5, color: '2A3550' }, rowH: 0.62, colW: [2.3, 9.7] });
  s.addText('完整条目（含代表性提示词）见申报报告第十一章', { x: 0.7, y: 7.0, w: 12, h: 0.3, fontFace: CJK, fontSize: 11, color: '8E9AB8' });

  s = base(pptx.addSlide(), '局限、下一步与声明', '14 / 反思');
  bullets(s, [
    '写意重建而非测绘模型：比例、灯位与树位经过艺术化处理，不用于工程或保护规划',
    '已标注的添加：山门朝向、钟楼层数与梵钟尺寸、桥与关的距离、枫树与船只密度',
    '钟声为合成近似而非现场录音；除钟声外不含其他环境音',
    '下一步：接入倾斜摄影 · 补一年之期与一夜之序 · 封装 WebXR 沉浸式听钟 · 沉淀为可配置场景模板',
    `原创声明：${work.originality}`,
  ], { x: 0.7, y: 1.8, w: 12, h: 4.2 });
  s.addText(`${work.team.school} ${work.team.college}　|　${work.team.leader}　|　指导：${work.team.teachers}　|　${work.team.date}`,
    { x: 0.7, y: 6.6, w: 12, h: 0.4, fontFace: CJK, fontSize: 12, color: FROST });

  return pptx;
}

/* ------------------------------------------------------------------ run */
const { writeFile } = await import('node:fs/promises');
const report = await Packer.toBuffer(buildReport());
await writeFile(join(OUT, '枫桥夜泊-作品申报报告.docx'), report);
await buildDeck().writeFile({ fileName: join(OUT, '枫桥夜泊-路演.pptx') });
console.log('已生成：');
console.log('  docs/枫桥夜泊-作品申报报告.docx');
console.log('  docs/枫桥夜泊-路演.pptx');
