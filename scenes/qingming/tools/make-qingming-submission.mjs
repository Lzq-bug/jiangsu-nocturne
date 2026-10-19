/**
 * Generates the CMIT submission pack for 「清名桥 · 运河灯河」 — a standalone
 * work with its own report .docx and pitch .pptx, built from one shared content
 * source so that editing the text and re-running rebuilds both:
 *   node tools/make-qingming-submission.mjs
 *
 * 机位文案不在这里重写：站名、年代、导语、正文与标签一律从 src/data.js 读，
 * 那才是这个场景唯一的解说来源（报告、路演与页面内的解说卡因此不会走偏）。
 *
 * Kept separate from the sibling generators on purpose: 每一座城的形制、事实边界
 * 与措辞都不同，共用一个脚本只会让某一座城的说法渗进另一座城的申报书里。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow,
  TableCell, WidthType, AlignmentType, PageBreak, BorderStyle,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import { STATIONS, RIVER, BRIDGE, BANK, LANDING, deckY, soffitY } from '../src/data.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'docs', 'shots');
const OUT = join(ROOT, 'docs');
const CJK = 'Microsoft YaHei';

const m = (n, d = 1) => n.toFixed(d).replace(/\.0$/, '');
const SINGLE = join(ROOT, 'dist', '清名桥运河灯河-3D夜景.html');
const distBytes = existsSync(SINGLE) ? statSync(SINGLE).size : 0;
const MB = distBytes ? `${(distBytes / 1024 / 1024).toFixed(2)} MB` : '约 1.4 MB';
const SRC = join(ROOT, 'src');
const srcFiles = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith('.js')) : [];
const srcLines = srcFiles.reduce((n, f) => n + readFileSync(join(SRC, f), 'utf8').split('\n').length, 0);
const SRC_STAT = `${srcFiles.length} 个模块 ${srcLines.toLocaleString('en-US')} 行`;
const shotFor = (id) => `${id}.jpg`;
// 1600×900 的夜景 JPEG 正常在 100 KB 以上；小于此值的多半是白帧 / 未加载完的占位帧，
// 不能进申报书，按"缺图"处理并留一行说明，重跑 tools/shoot.mjs 后再出即可。
const MIN_JPEG = 20 * 1024;
const shotPath = (id) => join(SHOTS, shotFor(id));
const hasShot = (id) => existsSync(shotPath(id));
const blankShot = (id) => hasShot(id) && statSync(shotPath(id)).size < MIN_JPEG;
const usable = (id) => hasShot(id) && !blankShot(id);
const MISSING = STATIONS.filter((s) => !usable(s.id)).map((s) => s.id);

/* ------------------------------------------------------------------ content */

const work = {
  title: '运河灯河',
  subtitle: '清名桥 · 无锡古运河 3D 夜景全景漫游系统',
  track: '数字文旅（赛道细分以通知附件 2 为准）',
  contest: '2026 年第十四届全国大学生数字媒体科技作品及创意竞赛（CMIT）',
  deadline: '作品提交截止 2026 年 10 月 23 日',
  slogan: '把无锡清名桥的一夜——一桥、两岸、穿桥而过的灯船——重建为可自由站定环视的夜',
  team: {
    school: '【学校名称】', college: '【学院 / 系】', major: '【专业班级】',
    leader: '【负责人姓名 / 学号】', members: '【队员姓名 / 学号】',
    teachers: '【指导老师 1 / 指导老师 2】', contact: '【联系人 / 电话 / 邮箱】',
    date: '2026 年 10 月',
  },
  overview: `作品以无锡古运河清名桥段为对象，用程序化三维重建复现其一桥两岸的夜间形象：跨河的单孔花岗岩石拱桥按公开资料取实尺（全长 ${m(BRIDGE.length)} 米、桥面宽 ${m(BRIDGE.width)} 米、通高 ${m(BRIDGE.crownY)} 米、桥孔跨度 ${m(BRIDGE.span)} 米），西岸南长街的枕河人家与河埠、东岸南下塘的粉墙黛瓦与横巷沿河排开，檐下灯、窗里灯、巷灯、桥灯与临水灯把整条街点亮，灯船从桥洞里穿出，荷灯顺水漂向下游，运河把这一切接住并重新铺一遍。使用者可站在${STATIONS.length}处机位之一原地环视 360°，也可脱离机位自由绕场；全部几何、贴图与灯光由代码生成，不引用任何摄影素材与网络资源，最终交付为一个约 ${MB} 的单文件 HTML，双击即可运行。`,
  metrics: [
    ['机位与解说', `${STATIONS.length} 处（${STATIONS.map((s) => s.short).join(' / ')}），热点锚定实体地标，解说文案取自 src/data.js 同一来源`],
    ['桥的形制（实尺）', `单孔花岗岩石拱桥：全长 ${m(BRIDGE.length)} m、桥面宽 ${m(BRIDGE.width)} m、通高 ${m(BRIDGE.crownY)} m、桥孔跨度 ${m(BRIDGE.span)} m；拱券取半圆（半径 ${m(BRIDGE.archR, 2)} m）、拱脚设计标高 ${m(BRIDGE.springerY)} m，桥面为半径 ${m(BRIDGE.deckR, 2)} m 的反穹圆弧，两端落到两岸 ${m(BRIDGE.endY)} m`],
    ['河道与两岸分带', `本段取面宽 ${m(RIVER.halfWidth * 2)} m（写意取景）、岸壁高 ${m(RIVER.quayY)} m、展现河段长 ${m(RIVER.length)} m；两岸按驳岸—河沿步道—枕河房—横巷—主街分带（西岸 x<${m(-RIVER.halfWidth - 0.5)}、东岸 x>+${m(RIVER.halfWidth + 0.5)}）`],
    ['灯火', '檐下灯 / 窗灯 / 巷灯 / 河埠灯 / 灯柱 / 桥灯 / 券洞灯 / 埠头灯 / 临水灯九类灯位全部实例化，一个"两岸灯火"滑杆即可整街调灯，无需重建几何'],
    ['动态元素', '灯船船队 7 艘（含御码头与上游系泊 3 艘）穿桥往返，荷灯 88 盏顺水漂流，人流沿 7 条路径与桥面行走（画质档位上限 300 / 240 / 170）'],
    ['水面与倒影', '水面为着色器波浪 + 菲涅尔天空反射；街区整组克隆到 scale(1,−1,1) 的镜像组并替换为带波纹的共享材质；临水光柱为加法混合的实例化面片（单网格容量 1,500）'],
    ['渲染管线', 'WebGLRenderer + ACESFilmic 色调映射（曝光 1.14）+ PCFSoft 阴影 + EffectComposer / UnrealBloomPass（strength 0.5 / radius 0.55 / threshold 1.02）/ OutputPass'],
    ['工程形态', `运行时零第三方依赖、零网络请求、零外部美术资产；src ${SRC_STAT}；单文件产物 ${MB}，可离线双击打开或任意静态托管`],
  ],
  creative: [
    ['「灯河」：先把河读成一条街', '这段运河不是景区的背景，而是这条街的中缝——出门是河沿，转身是铺面，被褥和腌菜晾在临水一侧。作品的第一个决定因此不是建模一栋房子，而是让灯沿着水走：檐下、窗口、巷口、河埠、桥头各有一套灯位，最后由一排探出水面的临水灯把光真的接进水里。河亮了，街才读得出来。'],
    ['画面主线是"穿桥"这一动作', '一桥两岸是静态的格局，灯船穿桥才是这条河在夜里真正发生的事。作品因此把船队做成主线：船头灯、篷顶灯与船梢风灯排成一串，穿过半圆券洞时把券面照亮又带走，水面把这一串重新铺一遍。机位顺序也按这条线排——从西岸街面下到河埠石阶、贴水看船穿桥、上到拱顶四望、过河东进横巷、到下游御码头看船起头，最后抬到空中。'],
    ['弱光的古城恰好落在常规数字化手段的盲区', '摄影测量在弱光与高反光下失效，全景照片视点固定且无法表现水面把灯拖长的过程，短视频有画面却没有"我可以自己转头看"的在场感。作品延续团队在夜景数字化上的一贯路径：不做逐层逐樘的测绘复制，而是把最可识别的形式规律——一条近南北向的河、一孔半圆拱、两岸各自成带的街——写成常量与函数，再用代码重建可信的夜。'],
    ['写意不是含糊，而是要把取舍写清', '这一段河宽、台阶级数、拱脚标高、石栏与河埠的形制、券面石额与楹联的文字，都是为夜景构图做的处理。作品把这些边界同时写进页面内的「操作说明」、申报报告与路演文稿里，让观展的人分得清哪一句是公开资料、哪一句是画家的手。这份诚实本身是作品的一部分。'],
    ['只做强夜', '作品不提供昼夜切换。夜是这段街区被观看的方式，也是本件唯一要还原的观看条件：白天它只是普通的马路与房子，夜里灯把轮廓、纵深和尺度一起交还给人眼。把工程留给一件事，画面才够密。'],
    [`公共性：一个 ${MB} 的 HTML`, '最终产物不需要 GPU 服务器、不需要安装、不需要网络，景区公众号、展馆一体机、学生平板都能直接打开。城市夜景的数字化成果因此不必停留在一段演示视频里，它可以被任何人随时走进去。'],
  ],
  innovations: [
    [`把一座实尺的石拱桥写成两个函数`, `桥不是一张手工模型，而是 src/data.js 里的一组常量加两条函数：拱腹 soffitY(x) 取半径 ${m(BRIDGE.archR, 2)} m 的半圆自 ${m(BRIDGE.springerY)} m 拱脚起拱，桥面 deckY(x) 取半径 ${m(BRIDGE.deckR, 2)} m 的反穹弧、在跨中 ${m(BRIDGE.crownY)} m 落到两岸 ${m(BRIDGE.endY)} m。两条函数被桥身、石栏、灯位、过桥人流与机位标高共同复用——改一个数字，整座桥连同它的灯和人一起跟着变，这是手工模型做不到的。`],
    ['倒影不用 render-target 镜面', `水面倒影不是把场景渲到反射纹理上，而是把整个街区组克隆一份挂到 scale(1,−1,1) 的镜像组里，材质统一替换为注入同一时间 uniform 的共享波纹材质，并按入水深度淡出。相比反射渲染目标，这省掉一整遍场景绘制；而波纹与真实水面共用一套波函数，倒影因此"在水里"，不是"贴在图上"。`],
    ['加法混合的实例化光柱', '每一盏探出水面的临水灯都登记一根朝向相机的光柱面片，由单个 InstancedMesh 一次绘制（容量 1,500），随波纹摆动、按闪烁调制强度。灯位与光柱同源，所以调"两岸灯火"这一根滑杆时，街上少几盏灯，水里也就少几道光。'],
    ['灯火密度是一个参数，不是一次重建', '沿街灯位从建筑模块的 anchors 取（"改房子不用改灯，改灯也不用改房子"），全部烘进实例化网格；密度滑杆改的是 uniform 与实例可见性，而不是几何。于是"整街调灯"与"零依赖、零资产"可以同时成立，船队与人流的开关也一样。'],
    ['同材质几何一律合并成少量 mesh', `因为整个街区会被倒影系统克隆一份，mesh 数量在画面里其实是双份：石作、木作、瓦作按材质合并、变换烘进几何体，跨 ${m(LANDING.z)} m 下游的御码头与两岸 ${m(RIVER.length / 2)} m 的屋脊都走同一条路径。这是本件在没有 LOD、没有实例化 GPU 剔除的前提下跑得动的原因。`],
    ['零构建、零依赖、可离线交付，外加一条无头自检链', `原生 ES Module + importmap 直跑，three.js r160（MIT）随仓库 vendor；自研打包器 tools/build-single.mjs 把模块图编译为 ${MB} 单文件 HTML。tools/shoot.mjs 用一条 CDP 会话逐机位截图（--fmt=jpg --size=1600,900），同时捕获页面异常与 renderer.info，报告与路演里的每一张图都出自这条回归链，可重跑、可核对。`],
  ],
  modules: [
    ['src/data.js', `机位坐标与解说文案（名称 / 年代 / 导语 / 正文 / 标签）、桥与河道的实尺常量、deckY 与 soffitY 两条标高函数、两岸分带与御码头位置、参数默认值`],
    ['src/architecture.js', '清名桥与一桥两岸：拱券与桥面、石栏与台阶、八字墙与金刚墙、券面石额与拟联、河埠、枕河房与横巷、牌坊、御码头、远处屋脊与写意塔影；同材质几何合并'],
    ['src/kit.js', '色板与材质注册表、盒体 / 屋顶 / 脊饰 / 栏杆 / 立柱 / 额匾等几何工具、灯位与遮挡注册'],
    ['src/textures.js', '全部贴图在 canvas 上现画：瓦面、粉墙、石板、木纹、纸灯光晕、光柱衰减与噪声，无一张外部图片'],
    ['src/environment.js', '夜空、月、星与灯雾；只有一盏月光平行光投影，暖色补光用点光源——整个场景还要被倒影系统克隆一份'],
    ['src/water.js', '水面着色器（波形 + 菲涅尔天空反射 + 月光滑轨 + 距离雾）、共享波纹材质与镜像倒影组、实例化水面光柱'],
    ['src/lanterns.js', 'LanternField 实例化灯火与密度控制、跨街灯串、Fleet 灯船船队（穿桥 / 系泊）、Crowd 人流、lotusLanterns 荷灯'],
    ['src/props.js', '活动体装配：灯位取自 architecture 的 anchors，船队 7 艘、荷灯 88 盏、人流路径与桥面过桥、东岸晾衣绳剪影'],
    ['src/controls.js', '双相机行为共用一套代码路径：全景模式钉在机位转头 360°、自由模式环绕推拉，机位补间与自动巡览'],
    ['src/hotspots.js', '地标锚定的发光热点与投影标签，点击即飞行前往并展开解说'],
    ['src/ui.js', '参数面板、底部机位条、解说卡、罗盘、加载进度与截图导出'],
    ['src/main.js', '装配与渲染管线、参数联动、三档画质自适应、机位深链与调试句柄 window.qingming'],
    ['tools/build-single.mjs · serve.mjs · shoot.mjs · cdp-probe.mjs', '自研单文件打包器、零依赖本地服务、CDP 单会话逐机位无头截图、调试探针'],
  ],
  verification: [
    ['构图回归', `${STATIONS.length} 处机位由 tools/shoot.mjs 在无头 Edge 中以 1600×900 逐台出图，报告与路演所用配图即这批产物；每台同时打印 renderer.info 的绘制调用与三角面数`],
    ['异常与着色器', 'CDP 会话监听 Runtime.exceptionThrown 与页面 error，逐机位记录；本轮渲染层无 WebGL 报错与着色器编译失败'],
    ['参数联动', '两岸灯火归零时沿街灯与水面光柱同步熄灭；灯船航速归零时船队停泊、荷灯漂流随之静止；关闭水中倒影时镜像组整体隐藏'],
    ['机位与热点', '热点点击传送并展开解说、底部机位条切换、A / D 逐台、Space 自动巡览（9 秒一台）、P 切换视角模式、视角复位与恢复默认均逐项验证'],
    ['离线运行', 'npm run build 产出的单文件在无网络条件下双击可运行，运行期不产生任何网络请求'],
    ['性能口径', '本作品不在文中引用软件渲染帧率：无 GPU 的 SwiftShader 数值只反映下限，容易被误读为真实性能，改以复现命令交付'],
  ],
  runtime: [
    ['开发环境', 'Windows 11 + Node.js v24（要求 ≥ 18），无构建步骤，源码即运行码'],
    ['运行时依赖', '零 npm 运行时依赖。three.js r160（MIT）与其附加模块随仓库 vendor 在本地，运行期不产生任何网络请求'],
    ['浏览器要求', '支持 WebGL2 与现代 ES Module 的桌面 / 移动浏览器（Chrome、Edge、Firefox、Safari 均可）'],
    ['在线预览', 'npm run dev 启动仓库自带的零依赖静态服务（禁用缓存），默认 http://127.0.0.1:8765/index.html；逐机位截图脚本按 8795 端口约定运行'],
    ['离线展示', `npm run build 生成 dist/清名桥运河灯河-3D夜景.html（${MB}），双击即可运行，无需网络与服务`],
    ['直达链接', '#station=qiaodong 等机位深链、#eye=x,y,z&at=x,y,z 自由视点试构图、#bare 隐藏界面用于出图'],
    ['推荐配置', '独显或较新核显、1920×1080 窗口；移动端 SoC 建议开启画质自适应，或手动下调两岸灯火与灯影辉光'],
    ['输入方式', '鼠标拖拽环视 / 右键两指平移 / 滚轮变焦、触屏单指环视与双指捏合、键盘 A·D·Space·P·F·H·Esc 全键位'],
    ['复现与度量', 'node tools/make-qingming-submission.mjs 由同一内容源重产报告与路演；node tools/shoot.mjs --fmt=jpg --size=1600,900 重跑逐机位截图与统计'],
  ],
  value: [
    ['文旅目的地的轻量分发', '单文件 HTML 可直接嵌入景区公众号、小程序 webview 与官网，不需要 GPU 服务器，弱网与离线可用；展馆一体机与平板同样能跑。'],
    ['夜游与灯位方案的沟通工具', '两岸灯火、人流量、水面波纹、灯船航速与灯影辉光都是实时参数，可与夜游动线、灯位布置和游船班次对图讨论，不必先施工再验收。'],
    ['摄影与短视频的机位预演', `${STATIONS.length} 处机位与深链等价于${STATIONS.length}个可复现的取景方案，踩点、构图与灯火配比能在开工前于浏览器里定稿。`],
    ['世界遗产展示端的"可读的写意"示范', '作品把可核实的形制与为构图所做的取舍分列陈述，随作品一同分发，为遗产类数字展陈提供一条既不冒充测绘、也不放弃观感的中间路径。'],
    ['参数化历史街区建模的教学样例', '实尺常量 + 两条标高函数 + 分带避让 + 实例化灯火 + 镜像倒影，是可以直接拆解讲授的计算设计案例，代码量与依赖都在一节课内读完。'],
    ['与前作共用的迁移方法', '本件沿用团队同一套夜景引擎与工程形态：新增一座城主要重写形制常量、机位与文案，渲染层不动，边际成本递减。'],
  ],
  facts: [
    `桥的形制（公开资料核实）：单孔花岗岩石拱桥，全长 ${m(BRIDGE.length)} m、桥面宽 ${m(BRIDGE.width)} m、通高 ${m(BRIDGE.crownY)} m、桥孔跨度 ${m(BRIDGE.span)} m；始建于明万历年间，初名「清宁桥」，清道光年间避宣宗旻宁讳改称「清名桥」，康熙八年由无锡县令吴兴祚主持重建。`,
    '格局（公开资料核实）：运河在这一带近南北向，西岸南长街、东岸南下塘，「水陆并行、河街相邻」；街区是大运河世界文化遗产（2014 年列入）无锡段的重要组成部分，素有「江南水弄堂，运河绝版地」「千里运河独此一环」之誉。',
    `画面主线（本作品的组织方式）：一桥两岸 · 灯船穿桥，${STATIONS.length} 处机位（六处沿街与水上 + 空中鸟瞰）。`,
  ],
  limits: [
    `这一段运河取 ${m(RIVER.halfWidth * 2)} m 面宽，是为夜景构图做的取景选择，不是实测河宽，也不代表这一带各处的河面尺度。`,
    `桥面台阶级数与拱脚标高（本作为 ${m(BRIDGE.springerY)} m）、桥洞通航净高都按画面需要调整过；拱券取半圆、半径 ${m(BRIDGE.archR, 2)} m 是形制简化，不代表券的实际线脚与砌法。`,
    '桥面两侧石栏与河埠头的形制、券面上那块写着「清名桥」的石额与两侧拟作楹联的文字，均为写意添加：石额与楹联是拟作，不代表实物题刻。',
    '灯船与荷灯、下游的御码头埠头、远处压着屋脊的塔影天际线都是为夜景构图做的处理；塔影不指实某座古塔，灯船与河灯参考的是运河夜游的今昔观感，不是考据复原。',
    '两岸屋宇的层数与进深、横巷的走向与间距、街区肌理未按现状核实，只按"驳岸—河沿步道—枕河房—横巷—主街"的分带生成。',
    '作品不含音频与旁白讲解，解说以文字卡片给出；夜里灯火的颜色与密度按观感调参，不对应任何真实的照明方案或节能指标。',
    '本件为写意重建而非测绘模型，不能用于工程、产权、保护规划或修缮设计用途。',
  ],
  next: [
    '接入倾斜摄影或激光点云，把写意几何替换为测绘模型，保留同一套灯火、水面、船队与交互。',
    '把河宽、台阶级数与拱脚标高按实测资料替换；券面石额与楹联换成经核实的实物题刻，未核实的部分继续明确标注。',
    '补雨夜与霜夜：雨水覆在水面上会改变整幅画面的反射结构，荷灯与灯船的拖影也随之不同，值得单独做一版状态。',
    `加语音讲解与多语言字幕，并把 ${STATIONS.length} 处机位导出为带时间轴的导览片；封装 WebXR 会话，进头显站到桥头与船舱里看这一河灯。`,
    '沉淀为可配置的历史街区模板：新增一座城只需填写形制参数与机位文案两张表。',
  ],
  originality: `本作品全部源代码、程序化贴图与文案由团队自行创作生成，未使用任何第三方受版权保护的模型、贴图、字体位图或音频素材，仓库内不含任何图片素材文件——瓦面、粉墙、石板、灯光晕与光柱衰减全部在 canvas 上现画。渲染基于 three.js r160（MIT 许可，已随源码保留版权声明），后处理的泛光与输出通道同样取自 three.js 官方示例并保留原始许可头。关于桥与街区的背景描述基于公开资料，其中写意与虚构的部分已在报告、路演文稿、以及页面内置的「操作说明」里逐条标注。本件为独立作品，与团队其他参赛作品不重复申报。`,
};

/* ------------------------------------------------------------------ helpers */

const shot = (id) => readFileSync(shotPath(id));
const img = (id) => `image/jpeg;base64,${shot(id).toString('base64')}`;
const coverId = () => (usable('aerial') ? 'aerial' : STATIONS.find((s) => usable(s.id))?.id);
const mainId = () => (usable('qiaodong') ? 'qiaodong' : coverId());

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 300 },
  alignment: opts.align,
  children: [new TextRun({ text, font: CJK, size: opts.size ?? 21, bold: opts.bold, italics: opts.italics, color: opts.color })],
});
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 140 }, children: [new TextRun({ text: t, font: CJK, bold: true, size: 28, color: '8A4B22' })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 100 }, children: [new TextRun({ text: t, font: CJK, bold: true, size: 23, color: '4A3B2C' })] });
const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, font: CJK, size: 21 })] });
const caption = (t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 }, children: [new TextRun({ text: t, font: CJK, size: 18, color: '6B6157' })] });
const picture = (id, w, h) => new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new ImageRun({ type: 'jpeg', data: shot(id), transformation: { width: w, height: h } })],
});
const noShot = (id) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 60, after: 160 },
  children: [new TextRun({
    text: blankShot(id)
      ? `（本图位未采用：docs/shots/${shotFor(id)} 为空白帧，重跑 node tools/shoot.mjs ${id} --fmt=jpg --size=1600,900 后自动纳入）`
      : `（配图待补：docs/shots/${shotFor(id)} 尚未生成）`,
    font: CJK, size: 18, color: 'A0522D',
  })],
});
const table = (rows, widths) => new Table({
  columnWidths: widths,
  rows: rows.map((r, i) => new TableRow({
    children: r.map((cell, k) => new TableCell({
      width: { size: widths[k], type: WidthType.DXA },
      shading: i === 0 ? { fill: 'F6E7D5' } : undefined,
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: 'D8C4AC' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D8C4AC' }, left: { style: BorderStyle.SINGLE, size: 2, color: 'D8C4AC' }, right: { style: BorderStyle.SINGLE, size: 2, color: 'D8C4AC' } },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: CJK, size: 20, bold: i === 0 })] })],
    })),
  })),
});

/* ------------------------------------------------------------------ report */

function buildReport() {
  const t = work.team;
  let fig = 0;
  const kids = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1500, after: 120 }, children: [new TextRun({ text: work.title, font: CJK, bold: true, size: 60 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [new TextRun({ text: work.subtitle, font: CJK, size: 28, color: '8A4B22' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [new TextRun({ text: work.slogan, font: CJK, size: 22, italics: true, color: '5A5248' })] }),
    h1('作品基本信息'),
    table([
      ['竞赛名称', work.contest],
      ['申报方向', work.track],
      ['提交截止', work.deadline],
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

    h1('二、创作背景与立意'),
    p('清名桥一带的夜间形象是由三样东西共同构成的：一孔被灯照亮的石拱、两岸各自成带的街、以及一条把这两样都接住的水面。这三样都是转瞬的、依赖光照的，因而恰好落在常规数字化手段的盲区里——摄影测量在弱光与高反光下失效，全景照片视点固定且无法表现水面把灯拖长的过程，短视频有画面却没有"我可以自己转头看"的在场感。'),
    p('作品因此不做逐层逐樘的测绘复制，而是把这一带最可识别的形式规律抽象成可写的东西：一条近南北向的河、一孔半径为跨径之半的半圆拱、一条反穹的桥面弧、两岸"驳岸—河沿步道—枕河房—横巷—主街"的分带。桥的形制按公开资料取实尺，其余为夜景构图做写意处理，并且把这些取舍逐条写清——写意不是含糊。'),
    p(`立意的另一层是公共性。作品的最终产物是一个约 ${MB} 的 HTML 文件：不需要 GPU 服务器、不需要安装、不需要网络，景区公众号、展馆一体机、学生平板都能直接打开。城市夜景的数字化成果因此不必停留在一段演示视频里，它可以被任何人随时走进去。`),

    h1('三、创意来源'),
    ...work.creative.flatMap(([title, text]) => [h2(title), p(text)]),

    h1('四、作品说明与机位走读'),
    p(`机位既是观展路线，也是解说结构。${STATIONS.length}处机位按"西岸街面—河埠石阶—贴水看船穿桥—上拱顶四望—东岸横巷—下游御码头—空中鸟瞰"排布，走的是灯船的这一条航线，也是这条街从水边到屋顶的层次。以下解说文字与场景内解说卡同源，均取自 src/data.js。`),
    ...STATIONS.flatMap((s) => {
      fig += 1;
      const block = [h2(`${fig}. ${s.name}　〔${s.era}〕`)];
      block.push(usable(s.id) ? picture(s.id, 600, 338) : noShot(s.id));
      block.push(caption(`图 ${fig}　${s.name}机位实时渲染画面（1600×900，无头逐机位截图）`));
      block.push(p(s.lead, { italics: true, color: '6B4A2B' }));
      block.push(p(s.body));
      block.push(p(`关键词：${s.tags.join(' · ')}`, { size: 18, color: '6B6157', after: 220 }));
      return block;
    }),
  ];

  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(h2('交互界面'));
  kids.push(p('界面遵循"少遮挡"原则：顶部是视角模式（全景 360° / 自由环绕）与帧率读数，右侧参数面板在小屏下默认收起，底部机位条直接列出全部机位，右下罗盘实时指示朝向，便于导览时口头定位"再往桥头转一点"。开场十余秒后解说卡自动让位给画面。参数面板共五根滑杆与四个开关：两岸灯火、街巷人流量、水面波纹、灯船航速、灯影辉光，以及水中倒影、热点标签、自动巡览、画质自适应。配色按江南夜色定：粉墙黛瓦的冷灰青、灯火的暖金与朱，界面只在灯与招牌处用暖色，不与画面争亮度。'));

  kids.push(h1('五、关键技术与实现'));
  kids.push(h2('5.1 模块划分'));
  kids.push(table([['模块', '职责'], ...work.modules], [3400, 5900]));
  kids.push(h2('5.2 桥：把实尺写成两条标高函数'));
  const crownEye = STATIONS.find((s) => s.id === 'gongding')?.pos?.[1];
  kids.push(p(`清名桥按公开资料的实尺生成：全长 ${m(BRIDGE.length)} m、桥面宽 ${m(BRIDGE.width)} m、通高 ${m(BRIDGE.crownY)} m、桥孔跨度 ${m(BRIDGE.span)} m。拱券取半圆，半径即跨径之半 ${m(BRIDGE.archR, 2)} m，自 ${m(BRIDGE.springerY)} m 的拱脚设计标高起拱（本作的拱顶内缘标高即 soffitY(0) = ${m(soffitY(0), 2)} m）；桥面是一条半径 ${m(BRIDGE.deckR, 2)} m 的反穹圆弧，从跨中 deckY(0) = ${m(deckY(0))} m 落到两岸 ${m(BRIDGE.endY)} m，两端以台阶与八字墙落地。这两条曲线以 deckY(x) 与 soffitY(x) 两个纯函数导出，桥身、石栏、桥灯、过桥人流的落脚高度${crownEye ? `、以及拱顶机位的视高（${m(crownEye)} m）` : ''}都由它们算出，因此不存在"改了桥忘了灯"的可能。`));
  kids.push(p('券面之上压一块写着「清名桥」的石额，金刚墙上挂一副拟作楹联，文字由 canvas 现画后贴到面上。这一步是画面可读性的需要，也是本件最需要说清边界的地方：石额与联语都是拟作，不代表实物题刻，报告第七节与页面内的「操作说明」都对此作了标注。'));
  kids.push(h2('5.3 一河两岸：分带、避让与远景'));
  kids.push(p(`河道取面宽 ${m(RIVER.halfWidth * 2)} m、岸壁高 ${m(RIVER.quayY)} m、展现河段长 ${m(RIVER.length)} m，镜头几乎贴着水面。两岸按驳岸—河沿步道—枕河房—横巷—主街分带排布（西岸南长街自 x=${m(BANK.west.quay)} 到 x=${m(BANK.west.street)}，东岸南下塘自 x=${m(BANK.east.quay)} 到 x=${m(BANK.east.street)}），跨河的桥身走廊段两侧不布房，让台阶与八字墙真的落到地上；东岸另设横巷插进城里，把大块宅第切成梳齿。下游 ${m(LANDING.z)} m 处是写意的御码头埠头，灯船在此系泊起头。远景由一圈压着的屋脊与一笔写意的塔影闭合天际线，塔影刻意不指实某座古塔。全部石作、木作、瓦作按材质合并成少量 mesh——因为整个街区还要被倒影系统克隆一份。`));
  kids.push(h2('5.4 水面、倒影与光柱'));
  kids.push(p('水面是一层着色器：顶点做波纹，片元用与顶点同源的波函数求法线，按菲涅尔项混合深水色与天空反射色，叠一个月光高光与一层和场景同参的距离雾。运河面宽，水色比窄河提亮一档，否则整条河在画面里读成一个黑槽。倒影不用 render-target：把街区整组克隆到 scale(1,−1,1) 的镜像组，材质替换为共享的波纹材质，按入水深度淡出，并与真实水面共用同一套时间 uniform——所以波纹一动，水里那份跟着动。第三层是加法混合的实例化光柱：探出水面的临水灯各自登记一根朝向相机的光柱面片，由单个 InstancedMesh 一次绘制，随波纹摆动与闪烁。'));
  kids.push(h2('5.5 灯火、船队与人流'));
  kids.push(p(`沿街灯位不在建筑模块里硬编码，而是由 architecture 输出 anchors（檐下、窗口、巷口、河埠、灯柱、桥上、券洞、埠头、临水九类），灯火模块只负责把这些点烘成实例化发光体。因此"改房子不用改灯，改灯也不用改房子"，而"两岸灯火"这根滑杆改的是 uniform 与实例可见性、不触发任何重建——一根滑杆就能整街调灯。船队 7 艘沿河道往复，穿过桥洞时把券面照亮又带走，其中 3 艘系泊在御码头与上游；荷灯 88 盏顺水漂向下游；人流沿两岸步道与主街的 7 条路径行走，并按固定间隔上桥过桥，人数上限随画质档位收拢（300 / 240 / 170）。`));
  kids.push(h2('5.6 光照、后期与画质自适应'));
  kids.push(p('全场景只有一轮月亮作为带投影的平行光（PCFSoft 阴影），暖色补光用点光源；阴影贴图在两遍预热渲染后置为不自动更新，因为夜里的轮廓由灯火而不是由阴影承担。后期为 EffectComposer + UnrealBloomPass + OutputPass，渲染进入半浮点离屏缓冲、材质阶段不做色调映射，色调与色彩空间转换统一在输出通道完成，灯具颜色因此可以超过 1.0 成为真正的高光，泛光阈值 1.02 也才稳定；曝光 1.14。设备像素比上限 1.35，帧率按 0.75 秒窗口采样，持续低于 20 fps 时逐级降档：先降渲染分辨率，再关闭水中倒影，并在面板下给出提示；人群数量同步收拢。'));
  kids.push(h2('5.7 零依赖的工程形态与自检链'));
  kids.push(p(`源码是原生 ES Module，由 importmap 解析 three.js 与附加模块，两者都 vendor 在仓库里，运行期不产生任何网络请求，也不引用任何图片、模型、字体位图或音频文件——所有贴图在 canvas 上现画。交付期由自研打包器 tools/build-single.mjs 把整张模块图编译为 ${MB} 单文件 HTML，双击即运行。开发期提供机位深链（#station= / #eye=&at= / #bare），既用于构图自检，也可作为展陈与导览的直达链接。tools/shoot.mjs 用一条 CDP 会话在无头 Edge 里逐机位出图，同时捕获页面异常与 renderer.info，本报告的 ${STATIONS.length - MISSING.length} 张配图（共 ${STATIONS.length} 处机位）即由这条链产出。`));

  kids.push(h1('六、创新点'));
  work.innovations.forEach(([title, text], i) => {
    kids.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${String(i + 1).padStart(2, '0')}　${title}`, font: CJK, bold: true, size: 21, color: '4A3B2C' })] }));
    kids.push(p(text));
  });

  kids.push(h1('七、实测与验证'));
  kids.push(p('以下为本轮已完成的功能与构图核对。逐机位的绘制调用与三角面数由 tools/shoot.mjs 随截图一并打印，可随时复现。'));
  kids.push(table([['项目', '结果'], ...work.verification], [2600, 6700]));
  kids.push(p('复现命令：', { after: 60 }));
  kids.push(p('　node tools/serve.mjs 8795　（另开终端）', { size: 18, color: '555555', after: 40 }));
  kids.push(p('　node tools/shoot.mjs --fmt=jpg --size=1600,900　→ docs/shots/<机位>.jpg', { size: 18, color: '555555', after: 40 }));
  kids.push(p('　浏览器控制台亦可执行：qingming.renderer.info.render.calls / .triangles（需先置 renderer.info.autoReset = false）', { size: 18, color: '555555', after: 200 }));

  kids.push(h1('八、事实与写意的边界'));
  kids.push(p('这一段运河的记载与实物状况，本件只到"读得懂"为止，不到"测得准"为止。为避免把艺术处理误读为测绘成果，先把可核实的背景列明，再把为构图所做的处理逐条列明：'));
  kids.push(h2('可核实的公开背景'));
  work.facts.forEach((f) => kids.push(bullet(f)));
  kids.push(h2('为夜景构图所做的写意处理'));
  work.limits.forEach((l) => kids.push(bullet(l)));
  kids.push(p('本作品对上述背景的呈现方式是"读法"而非"尺寸"：真正被复现的是那一孔半圆、那条反穹的桥面弧、以及两岸把灯交给水面的那套层次；河宽、台阶级数、拱脚标高、灯位密度都经过取景与观感调整。同样的边界说明也写进了页面内的「操作说明」面板，随作品一起分发。'));

  kids.push(h1('九、应用价值与推广'));
  work.value.forEach(([title, text]) => kids.push(bullet(`${title}：${text}`)));

  kids.push(h1('十、不足与后续计划'));
  kids.push(p('本件为单届独立作品，尚有明显不足：几何仍为写意而非测绘；解说只有文字，没有语音与字幕；灯火与船队的编排是手工调参的结果，没有可编排的时间轴；移动端 SoC 在高灯火密度下会明显发热，需借助画质自适应或手动下调两岸灯火。'));
  kids.push(h2('下一步'));
  work.next.forEach((n) => kids.push(bullet(n)));

  kids.push(h1('十一、原创性与素材声明'));
  kids.push(p(work.originality));

  kids.push(h1('十二、团队与分工'));
  kids.push(table([
    ['成员', '角色', '主要工作'],
    [t.leader, '负责人 / 技术与设计', '总体方案、桥与街区的实尺建模、水面与倒影实现、性能调优'],
    [t.members, '成员', '街区与桥的资料核实、机位与构图、解说文案'],
    [t.members, '成员', '视觉风格与配色、无头逐机位测试与提交材料'],
    [t.teachers, '指导老师', '选题指导与内容审订'],
  ], [2600, 2400, 4300]));

  kids.push(h1('附录 A　运行环境与复现'));
  kids.push(table([['项目', '说明'], ...work.runtime], [2600, 6700]));
  kids.push(h2('操作键位'));
  kids.push(p('左键拖拽环视（全景模式转头 360°，自由模式环绕）/ 右键或两指拖动平移 / 滚轮或双指捏合变焦 / 点击发光热点传送 / 底部景点条切换机位 / A·D 上一与下一景点 / Space 自动巡览 / P 切换视角模式 / F 全屏 / H 操作说明 / Esc 关闭面板。'));

  kids.push(h1('附录 B　制作信息'));
  kids.push(table([
    ['命令', '作用'],
    ['npm run dev', '启动仓库自带的零依赖静态服务（禁用缓存），默认 http://127.0.0.1:8765/index.html'],
    ['npm run build', `由 tools/build-single.mjs 打包单文件到 dist/清名桥运河灯河-3D夜景.html（${MB}）`],
    ['node tools/shoot.mjs --fmt=jpg --size=1600,900', '无头 Edge 单会话逐机位截图，产出 docs/shots/<机位>.jpg 并打印每帧统计'],
    ['node tools/make-qingming-submission.mjs', '由本脚本从同一份内容源重新生成申报报告与路演文稿（幂等，自动建 docs/）'],
  ], [4200, 5100]));
  kids.push(h2('工具链'));
  kids.push(p('建模与渲染：three.js r160（MIT，随仓库 vendor）+ 原生 WebGL2；贴图全部由 Canvas 2D 现画。开发：Node.js ≥ 18，无构建步骤。测试：Microsoft Edge 无头模式 + Chrome DevTools Protocol 自研脚本。文稿：docx 与 pptxgenjs 两个开发期依赖，由本脚本产出报告与路演，运行作品时不需要。'));
  kids.push(p(`统计口径：src ${SRC_STAT}；单文件产物 ${distBytes ? `${distBytes.toLocaleString('en-US')} 字节` : '未打包（先跑 npm run build）'}；配图 ${STATIONS.length - MISSING.length} / ${STATIONS.length} 张。`, { color: '6B6157', size: 18 }));

  return new Document({
    creator: work.team.school,
    title: `${work.title}${work.subtitle} 作品申报报告`,
    description: work.contest,
    styles: { default: { document: { run: { font: CJK, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } }, children: kids }],
  });
}

/* ------------------------------------------------------------------ slides */

const INK = '050D16', GOLD = 'EFC083', CREAM = 'F7F0E3', DIM = 'BAC3D0', ROOF = '7FA3B8';

function buildDeck() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: 13.333, height: 7.5 });
  pptx.layout = 'W16x9';
  pptx.author = work.team.school;
  pptx.title = `${work.title} ${work.subtitle}`;

  const base = (s, title, kicker) => {
    s.background = { color: INK };
    s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: GOLD } });
    if (kicker) s.addText(kicker, { x: 0.7, y: 0.42, w: 12, h: 0.3, fontFace: CJK, fontSize: 12, color: GOLD, charSpacing: 3 });
    if (title) s.addText(title, { x: 0.68, y: 0.72, w: 12, h: 0.7, fontFace: CJK, fontSize: 27, bold: true, color: CREAM });
    return s;
  };
  const bullets = (s, items, opt) => s.addText(items.map((t, i) => ({
    text: t, options: { bullet: { code: '25AA', indent: 14 }, color: DIM, breakLine: i < items.length - 1, paraSpaceAfter: 10 },
  })), { fontFace: CJK, fontSize: 15, valign: 'top', ...opt });
  const pic = (s, id, x, y, w, h, label) => {
    if (!usable(id)) {
      s.addText(`（${blankShot(id) ? '空白帧未采用' : '配图待补'}：${shotFor(id)}）`, { x, y, w, h: 0.3, fontFace: CJK, fontSize: 11, color: GOLD });
      return;
    }
    s.addImage({ data: img(id), x, y, w, h });
    if (label) s.addText(label, { x, y: y + h + 0.03, w, h: 0.3, fontFace: CJK, fontSize: 11, color: ROOF });
  };
  const grid = (s, files, y0) => {
    files.forEach(([id, label], i) => {
      const x = 0.55 + (i % 3) * 4.28, y = y0 + Math.floor(i / 3) * 2.72;
      pic(s, id, x, y, 4.0, 2.25, label);
    });
  };

  /* 封面 */
  let s = pptx.addSlide();
  s.background = { color: INK };
  const cv = coverId();
  if (cv) s.addImage({ data: img(cv), x: 0, y: 0, w: 13.333, h: 7.5, transparency: 26 });
  s.addShape('rect', { x: 0, y: 4.0, w: 13.333, h: 3.5, fill: { color: '03080F', transparency: 22 } });
  s.addText(work.title, { x: 0.9, y: 4.16, w: 11.5, h: 1.1, fontFace: CJK, fontSize: 48, bold: true, color: CREAM, charSpacing: 10 });
  s.addText(work.subtitle, { x: 0.95, y: 5.26, w: 11.5, h: 0.5, fontFace: CJK, fontSize: 20, color: GOLD, charSpacing: 2 });
  s.addText(work.slogan, { x: 0.95, y: 5.82, w: 11.6, h: 0.4, fontFace: CJK, fontSize: 13.5, italic: true, color: DIM });
  s.addText(`${work.contest}　|　申报方向：${work.track}　|　${work.deadline}\n${work.team.school} ${work.team.college}　团队负责人：${work.team.leader}　指导教师：${work.team.teachers}`,
    { x: 0.95, y: 6.32, w: 11.7, h: 0.8, fontFace: CJK, fontSize: 12.5, color: 'D7DCE6', lineSpacing: 19 });

  /* 一句话立意 */
  s = base(pptx.addSlide(), '一句话立意', '01 / 立意');
  s.addText('「一河、一桥、两岸：灯从桥上落到水里，又从水里捞起来。」', {
    x: 0.7, y: 1.7, w: 12, h: 0.9, fontFace: CJK, fontSize: 24, bold: true, italic: true, color: GOLD,
  });
  s.addText('—— 场景内空中鸟瞰机位的解说，与本报告同源（src/data.js）', { x: 0.72, y: 2.6, w: 12, h: 0.3, fontFace: CJK, fontSize: 12, color: ROOF });
  bullets(s, [
    '这段运河不是景区的背景，而是这条街的中缝：出门是河沿，转身是铺面，河亮了街才读得出来',
    '一桥两岸是静态格局，灯船穿桥才是这条河在夜里真正发生的事——画面主线因此是一个动作，不是一张风景',
    '弱光与高反光恰好在常规数字化手段的盲区里：摄影测量失效、全景照片视点固定、短视频没有在场感',
    '作品的回答：把最可识别的形式规律写成常量与函数，再用代码重建可信的夜',
    '写意不是含糊：哪些是公开资料、哪些是为构图做的处理，逐条写进报告、路演与页面内的「操作说明」',
    `成果形态：一个 ${MB} 的单文件，无需服务器、网络与安装`,
  ], { x: 0.7, y: 3.15, w: 12, h: 4.0 });

  /* 主线机位大图 */
  s = base(pptx.addSlide(), '画面主线：一桥两岸 · 灯船穿桥', '02 / 作品呈现');
  const mn = mainId();
  if (mn) {
    s.addImage({ data: img(mn), x: 5.55, y: 1.62, w: 7.3, h: 4.11 });
    s.addText('桥洞 · 灯船穿桥机位实时渲染（1600×900，无头逐机位截图）', { x: 5.55, y: 5.76, w: 7.3, h: 0.3, fontFace: CJK, fontSize: 11, color: ROOF });
  }
  bullets(s, [
    '一孔半圆，跨 13.1 m，两岸的暖光都收进这一个圆里',
    '船头灯、篷顶灯、船梢风灯排成一串，穿过桥洞时把券面照亮又带走',
    '水面把这一串重新铺一遍，铺成一条会晃的河',
    '灯船 7 艘往复，荷灯 88 盏顺水，人流沿 7 条路径与桥面行走',
    '石栏、台阶、河埠与券面石额皆为写意处理（见 09 / 事实边界）',
  ], { x: 0.7, y: 1.8, w: 4.6, h: 4.4 });
  s.addText(`${STATIONS.length} 处机位走的是这条航线：西岸街面 → 河埠石阶 → 贴水看船穿桥 → 上拱顶四望 → 东岸横巷 → 下游御码头 → 空中鸟瞰`,
    { x: 0.7, y: 6.35, w: 12.2, h: 0.7, fontFace: CJK, fontSize: 13, color: CREAM, lineSpacing: 19 });

  /* 机位走读 */
  s = base(pptx.addSlide(), '机位走读：从水边到屋顶', '03 / 机位走读');
  grid(s, STATIONS.filter((x) => x.id !== 'aerial').map((x) => [x.id, `${x.short} · ${x.era}`]), 1.62);
  s.addText('另有空中鸟瞰机位（见下页）　·　热点锚定实体地标，点击即飞行前往并展开解说；解说文字与本报告同源',
    { x: 0.68, y: 7.02, w: 12.2, h: 0.35, fontFace: CJK, fontSize: 12, color: DIM });

  /* 鸟瞰 + 界面 */
  s = base(pptx.addSlide(), '核心体验：站定环视 360°，或自由绕场', '04 / 交互与界面');
  pic(s, 'aerial', 7.15, 1.75, 5.5, 3.09, '空中鸟瞰：一河、一桥、两岸');
  bullets(s, [
    '双相机行为共用一套代码路径：全景模式钉在机位转头，自由模式环绕推拉',
    '拖拽带惯性，滚轮调视野角，触屏支持单指环视与双指捏合',
    `参数面板五根滑杆：两岸灯火 / 街巷人流量 / 水面波纹 / 灯船航速 / 灯影辉光；四个开关：水中倒影 / 热点标签 / 自动巡览 / 画质自适应`,
    '画质自适应：持续低于 20 fps 先降分辨率、再关倒影，并提示可手动下调灯火',
    '界面少遮挡：顶部模式与帧率、底部机位条、右下罗盘，解说卡十余秒后自动让位',
    '配色按江南夜色定：粉墙黛瓦的冷灰青 + 灯火暖金与朱',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  /* 技术架构 */
  s = base(pptx.addSlide(), '技术架构：零依赖 · 程序化 · 单文件', '05 / 技术架构');
  bullets(s, [
    '原生 ES Module + importmap，three.js r160（MIT）与附加模块随仓库 vendor，运行期零第三方依赖',
    '零网络请求、零外部美术资产：几何全部程序化生成，贴图在 canvas 上现画，仓库内不含任何图片文件',
    '渲染管线：WebGLRenderer + ACESFilmic（曝光 1.14）+ PCFSoft 阴影 + EffectComposer / UnrealBloomPass / OutputPass',
    'DPR 上限 1.35 + 帧率采样自动降档（先降分辨率，再关水中倒影，人群上限同步收拢）',
    `自研打包器 tools/build-single.mjs 把模块图编译为 ${MB} 单文件 HTML，双击即运行`,
    'tools/shoot.mjs + CDP 无头自检链：逐机位回归截图，同时捕获异常与每帧统计',
  ], { x: 0.7, y: 1.75, w: 12, h: 3.5 });
  s.addTable([
    [{ text: '规模', options: { bold: true, color: INK, fill: { color: GOLD } } }, { text: '数值', options: { bold: true, color: INK, fill: { color: GOLD } } }, { text: '规模', options: { bold: true, color: INK, fill: { color: GOLD } } }, { text: '数值', options: { bold: true, color: INK, fill: { color: GOLD } } }],
    ['机位 / 源码模块', `${STATIONS.length} 处 / ${SRC_STAT}`, '单文件产物', MB],
    ['桥：全长 / 面宽 / 通高 / 跨度', `${m(BRIDGE.length)} / ${m(BRIDGE.width)} / ${m(BRIDGE.crownY)} / ${m(BRIDGE.span)} m`, '本段河面宽 / 展现河段长', `${m(RIVER.halfWidth * 2)} m / ${m(RIVER.length)} m`],
    ['灯船 / 荷灯 / 人流上限', '7 艘 / 88 盏 / 300 人', '水面光柱实例容量', '1,500'],
  ], { x: 0.7, y: 5.35, w: 12, fontFace: CJK, fontSize: 12, color: DIM, border: { pt: 0.5, color: '2C3A4A' }, rowH: 0.36, colW: [3.0, 3.0, 3.0, 3.0] });

  /* 难点一：桥 */
  s = base(pptx.addSlide(), '难点一：把一座实尺的石拱桥写成两条函数', '06 / 产品技术');
  pic(s, 'gongding', 7.15, 1.75, 5.5, 3.09, '拱顶机位：脚下是运河，两边是街');
  bullets(s, [
    `实尺按公开资料：全长 ${m(BRIDGE.length)} m、面宽 ${m(BRIDGE.width)} m、通高 ${m(BRIDGE.crownY)} m、桥孔跨度 ${m(BRIDGE.span)} m`,
    `拱腹 soffitY(x)：半径 ${m(BRIDGE.archR, 2)} m 的半圆，自 ${m(BRIDGE.springerY)} m 拱脚标高起拱`,
    `桥面 deckY(x)：半径 ${m(BRIDGE.deckR, 2)} m 的反穹弧，跨中 ${m(BRIDGE.crownY)} m 落到两岸 ${m(BRIDGE.endY)} m`,
    '两条纯函数被桥身、石栏、桥灯、过桥人流与机位视高共同复用：改一个数字，桥连同它的灯和人一起跟着变',
    '台阶与八字墙落地，跨河走廊段两岸不布房',
    '券面石额与楹联文字由 canvas 现画——但它们是拟作，不代表实物题刻',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  /* 难点二：水面 */
  s = base(pptx.addSlide(), '难点二：倒影要"在水里"，不是"贴在图上"', '07 / 产品技术');
  pic(s, 'nanchang', 7.15, 1.75, 5.5, 3.09, '南长街 · 枕河人家：灯从门缝与檐下漏出来');
  bullets(s, [
    '不用 render-target 镜面：把街区整组克隆到 scale(1,−1,1) 的镜像组，省掉一整遍场景绘制',
    '镜像材质统一替换为带波纹的共享材质，注入与真实水面同一套时间 uniform，按入水深度淡出',
    '水面本体：顶点波纹 + 与顶点同源的波函数求法线 + 菲涅尔天空反射 + 月光滑轨 + 距离雾',
    '运河面宽，水色比窄河提亮一档，否则整条河在画面里读成一个黑槽',
    '加法混合的实例化光柱把临水灯"接"进水里，单个 InstancedMesh 一次绘制，随波纹摆动闪烁',
    '代价与对策：整个街区会被克隆一份，所以同材质几何一律合并成少量 mesh',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  /* 难点三：灯火 */
  s = base(pptx.addSlide(), '难点三：一根滑杆整街调灯', '08 / 产品技术');
  pic(s, 'yunitou', 7.15, 1.75, 5.5, 3.09, '御码头 · 灯船始发：船泊一排，荷灯已下水');
  bullets(s, [
    '灯位不硬编码在建筑里：architecture 输出九类 anchors（檐下 / 窗口 / 巷口 / 河埠 / 灯柱 / 桥上 / 券洞 / 埠头 / 临水）',
    '「改房子不用改灯，改灯也不用改房子」——灯位与几何解耦',
    '灯火密度滑杆改的是 uniform 与实例可见性，不触发任何几何重建，因此调灯与零依赖可以同时成立',
    '船队 7 艘穿桥往复、3 艘系泊；荷灯 88 盏顺水；人流沿 7 条路径并按固定间隔上桥过桥',
    '人群上限随画质档位收拢（300 / 240 / 170），移动端 SoC 因此可维持可用帧率',
    '泛光阈值 1.02 + 材质阶段不做色调映射：灯色可以超过 1.0 成为真正的高光',
  ], { x: 0.7, y: 1.8, w: 6.2, h: 4.8 });

  /* 事实边界 */
  s = base(pptx.addSlide(), '事实与写意的边界：把哪一句是资料说清楚', '09 / 事实边界');
  pic(s, 'xiang', 8.35, 1.75, 4.3, 2.42, '南下塘 · 夜巷：巷灯与窗灯隔着一段黑');
  s.addText('可核实的公开背景', { x: 0.7, y: 1.62, w: 7.4, h: 0.3, fontFace: CJK, fontSize: 14, bold: true, color: GOLD });
  bullets(s, [
    `单孔花岗岩石拱桥：全长 ${m(BRIDGE.length)} m、桥面宽 ${m(BRIDGE.width)} m、通高 ${m(BRIDGE.crownY)} m、桥孔跨度 ${m(BRIDGE.span)} m`,
    '始建于明万历年间，初名「清宁桥」；清道光年间避宣宗旻宁讳改称「清名桥」；康熙八年由无锡县令吴兴祚主持重建',
    '运河在此近南北向，西岸南长街、东岸南下塘，「水陆并行、河街相邻」',
    '大运河世界文化遗产（2014 年列入）无锡段的重要组成部分；「江南水弄堂，运河绝版地」「千里运河独此一环」',
  ], { x: 0.7, y: 1.98, w: 7.5, h: 2.6 });
  s.addText('为夜景构图所做的写意处理（不是测绘，不代表实物现状）', { x: 0.7, y: 4.6, w: 12, h: 0.3, fontFace: CJK, fontSize: 14, bold: true, color: GOLD });
  bullets(s, [
    `本段取 ${m(RIVER.halfWidth * 2)} m 面宽；桥面台阶级数与拱脚标高、桥洞通航净高均按画面需要调整，拱券取半圆是形制简化`,
    '石栏与河埠形制、券面「清名桥」石额与楹联文字（拟作）、灯船与荷灯、御码头、远处塔影天际线皆为写意添加；塔影不指实某座古塔',
    '灯船与河灯参考的是运河夜游的今昔观感，不是考据复原；作品不含音频与旁白，灯火密度与色温按观感调参',
    '本件为写意重建而非测绘模型，不用于工程、产权、保护规划或修缮设计用途；同一段边界说明也写在页面内的「操作说明」里',
  ], { x: 0.7, y: 4.95, w: 12, h: 2.3 });

  /* 应用与展望 */
  s = base(pptx.addSlide(), '应用价值与推广', '10 / 价值');
  work.value.forEach(([title, text], i) => {
    const x = 0.7 + (i % 2) * 6.2, y = 1.6 + Math.floor(i / 2) * 1.92;
    s.addShape('roundRect', { x, y, w: 5.8, h: 1.72, fill: { color: '0C1622' }, line: { color: '2C3A4A', width: 0.75 }, rectRadius: 0.06 });
    s.addText(title, { x: x + 0.22, y: y + 0.14, w: 5.4, h: 0.35, fontFace: CJK, fontSize: 14, bold: true, color: GOLD });
    s.addText(text, { x: x + 0.22, y: y + 0.52, w: 5.4, h: 1.12, fontFace: CJK, fontSize: 11, color: DIM, lineSpacing: 15 });
  });

  /* 结尾 */
  s = base(pptx.addSlide(), '下一步与声明', '11 / 结尾');
  bullets(s, [
    '接入倾斜摄影或激光点云，把写意几何替换为测绘模型，保留同一套灯火、水面、船队与交互',
    '河宽、台阶级数与拱脚标高按实测资料替换；石额与楹联换成经核实的实物题刻，未核实者继续标注',
    '补雨夜与霜夜、语音讲解与多语言字幕、WebXR 头显里的桥头与船舱视点',
    '沉淀为可配置的历史街区模板：新增一座城只需填写形制参数与机位文案两张表',
    `原创声明：${work.originality}`,
  ], { x: 0.7, y: 1.8, w: 12, h: 4.2 });
  s.addText(`${work.team.school} ${work.team.college}　|　${work.team.leader}　|　指导：${work.team.teachers}　|　${work.team.date}`,
    { x: 0.7, y: 6.55, w: 12, h: 0.4, fontFace: CJK, fontSize: 12, color: GOLD });
  s.addText('一河、一桥、两岸：灯从桥上落到水里，又从水里捞起来。',
    { x: 0.7, y: 6.95, w: 12, h: 0.4, fontFace: CJK, fontSize: 12, italic: true, color: ROOF });

  return pptx;
}

/* ------------------------------------------------------------------ run */

const REPORT = '清名桥运河灯河-作品申报报告.docx';
const DECK = '清名桥运河灯河-路演.pptx';

await mkdir(OUT, { recursive: true });
const report = await Packer.toBuffer(buildReport());
await writeFile(join(OUT, REPORT), report);
await buildDeck().writeFile({ fileName: join(OUT, DECK) });

console.log('已生成：');
console.log(`  docs/${REPORT}　${report.length.toLocaleString('en-US')} 字节`);
console.log(`  docs/${DECK}　${statSync(join(OUT, DECK)).size.toLocaleString('en-US')} 字节`);
console.log(`  配图 ${STATIONS.length - MISSING.length}/${STATIONS.length} 张（docs/shots/*.jpg）`);
if (MISSING.length) {
  console.log(`  未采用：${MISSING.map((id) => `${shotFor(id)}（${blankShot(id) ? '空白帧' : '文件缺失'}）`).join('、')}`);
  console.log('  相应图位已留占位说明；重跑 node tools/shoot.mjs --fmt=jpg --size=1600,900 后再执行本脚本即可自动纳入');
}
