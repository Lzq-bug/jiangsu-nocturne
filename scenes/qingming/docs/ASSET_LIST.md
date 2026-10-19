# 素材清单 · 清名桥 运河灯河

**结论：本作品没有任何外部素材。** 仓库里没有模型文件（`.glb/.fbx/.obj`）、没有贴图文件（`.png/.jpg/.hdr`）、没有字体文件（`.woff/.ttf`）、没有音视频、没有从网络加载的任何东西。场景里每一个可见元素都是代码在运行时生成的：几何由 `THREE` 基本体、参数化曲面与 2D 轮廓挤出组合而成；所有"贴图"由 `src/textures.js` 在 `<canvas>` 上现画；所有文字（石额、楹联、解说）由 canvas 2D `fillText` 用系统字体排上去。唯一的第三方代码是仓库内置的 three.js r160（`vendor/`，MIT）。

自检方法：按资产扩展名在 `src/` 下检索为空（没有任何 `.png/.jpg/.svg/.woff/.glb/.json` 文件）；`index.html` 除 `styles.css` 与 `src/main.js` 外没有任何外链，页面运行期也不发网络请求。`tools/serve.mjs` 的 MIME 表里之所以还留着 `.png/.jpg/.svg`，只是为了让你能把 `shots/` 目录当静态站翻着看，与场景资源无关。

## 1. 可见元素 → 生成方式

### 清名桥（`src/architecture.js`）

| 画面里看到的 | 怎么来的 |
| --- | --- |
| 桥身（含两端各 17 级台阶、八字落地的坡脚、挖出的半圆孔） | `bridgeShape()` 用 `THREE.Shape` 顺 `deckY()` 采样桥面弧线、`absarc()` 挖拱券，得到一张 2D 轮廓，再 `new THREE.ExtrudeGeometry(shape, { depth: 5.5, curveSegments: 26 })` 挤出桥宽；材质 `M.granite`（花岗岩 = `T.stone()` 现画，`repeat 0.14`） |
| 券脸（孔口外凸的一圈半圆环带） | `archFaceGeo()` 同法挤出，内外半径差 0.26 m、厚度比桥宽多 0.34 m，使两面的券边都凸出来；`M.graniteDark` |
| 桥面石栏与望柱 | `kit.railingGeo()`（地栿 + 上下扶手 + 望柱 + 柱头）按桥面斜率**逐段**生成并 `rotateZ(atan(slope))` 贴合弧面，约每 6.6 m 补一根望柱；同材质全部 `mergeGeometries` 成一个 mesh |
| 券面上「清名桥」石额（正反两面）与两侧拟联「一虹收尽千家火 / 双岸分开万里船」 | `kit.plaqueMesh()` = `PlaneGeometry` + `T.plaque()` 现写的 canvas 匾面 + 一圈 `M.gilt` 描金框。**文字为拟作** |
| 桥洞内壁的 7 盏券腹灯 | `SphereGeometry(0.13,8,6)` + `kit.glow(PAL.lanternWarm, 2.4)`（`toneMapped:false`，专喂辉光） |
| 桥洞那团暖黄 | 1 盏 `PointLight(0xffb066, 150, 30, 1.7)` 悬在拱腹中央 |
| 桥头的石灯杆 | `kit.pillarGeo(1.5,…)` 合并成一组，灯位注册进 `anchors.bridgeLamps` 交给灯火系统 |

### 两岸街区（`src/architecture.js`）

| 元素 | 生成方式 |
| --- | --- |
| 驳岸壁（两侧，厚 1.4 m × 长 340 m，自 `y = -3.6` 到岸顶 2.0） | `box()` + `M.canalWall`（`T.stone()` 深色） |
| 岸顶压顶石、石栏、系船石柱 | `box()` + `kit.railingGeo(seg-0.5,{height:0.9})` + `kit.pillarGeo()`，逐段 5.4 m、随机省略 |
| 河埠头石阶（西岸 7 处、东岸 6 处，`WHARF_W/WHARF_E` 给点号） | 每处 5 级逐步降高的 `box` + 一块台面，材质 `M.paving` |
| 探出水面的临水挑灯（每 7.6 m 一盏，桥走廊段避让） | 两个 `box`（横杆 + 灯座）+ `anchors.waterLamps` 灯位；全场最长的光柱挂在这一排上 |
| 河沿灯柱（每 15.5 m） | `kit.pillarGeo(4.0,0.11)` + 挑臂 `box`，`castShadow` |
| 枕河房（4 排 `houseRow`：西岸临水 + 街西铺面、东岸临水 + 街东铺面） | 墙 = `box` + `M.wall`（`T.plaster()` 粉墙）；石脚、挑楼、撑木、美人靠、门、檐口都是 `box`；**屋顶 = `kit.chineseRoof()`** 之后 `rotateY(90°)`，让正脊与河道平行；约 22% 的屋顶再加 `kit.ridgeOrnament()`（正脊 + 两端的鸱吻） |
| 亮着灯的窗 | 4 组共享的 `MeshBasicMaterial`，贴图为 `T.lattice()` 窗棂（5/6 列 × 3/4 行），色相在 `0xf3c98d / 0xffdca6 / 0xe08a4c / 0xbfd8e8` 之间轮换；不成窗的位置用 `M.dark` 压黑 |
| 东岸的围墙宅门与漏窗 | `kind:'mix'` 分支：薄墙 `box` + 墙头压瓦 `box`（`M.tileCap`）+ 门洞石框 + 漏窗 |
| 横巷（西岸 3 条、东岸 3 条，`ALLEY_W/ALLEY_E`） | 两道粉墙 + 青石铺面 + 巷口门洞柱 + 3×2 组漏窗 + 台阶 + 尽头 `glow` 球与 `anchors.alleyLamps` |
| 石牌坊（西岸主街，题额「水弄堂」） | 立柱/基座/额坊 `box` + 顶上的迷你 `chineseRoof` + `plaqueMesh`，注册为近景遮挡物 |
| 御码头（下游 `LANDING`，z = −58） | 石埠面与两侧石阶 `box` + 四柱亭（`pillarGeo` ×4 + 额枋 + `chineseRoof(ridgeRatio:0.16)` 近攒尖 + 宝顶）+ 4 根灯杆 + `plaqueMesh('御码头')`；题额与位置均为写意 |
| 东岸人家檐下的晾衣绳（26 组） | `box` 绳 + 3 片 `box` 布，夜间只剩剪影（`M.dark` / `M.silk`） |
| 主街外侧的远排屋（每侧 4 排） | `box` 体积 + `chineseRoof`，`M.ink` / `M.roofGreen`，供鸟瞰机位的"一层压一层" |
| 远处天际线（90 段屋脊）与西南一笔塔影（7 层） | `box` 环形布置 + `chineseRoof(hip:true)` 逐层收分；**不指实某座古塔** |

### 水（`src/water.js`）

| 元素 | 生成方式 |
| --- | --- |
| 运河水面 | `PlaneGeometry(25, 340, 40, 160)` 转平 + 自写 `ShaderMaterial`（顶点三重正弦、片元解析法线 + Fresnel + `skyAt()` 反射 + 月华窄带 + 噪声调制 + 靠岸压暗）；噪声取自 `T.noise()` |
| 街区在水中的倒影 | `Reflections.add(quarter.group)` 把整个街区 `clone(true)` 一份挂到 `scale(1,-1,1)` 的镜像组下；材质换成 `Wobble` 生成的 `MeshBasicMaterial`（顶点扰动 + 按世界 `y` 淡出），**不是 render-target 镜面** |
| 每一盏岸灯拖到水上的那条光带 | `LightColumns`：一个 `InstancedMesh(PlaneGeometry(1,1), 1500)`，朝向在顶点着色器里按相机 right 向量现算，纹理 `T.columnFade()`（32×128 竖直渐变），加法混合 |
| 河灯（荷灯）88 只 | `Points` + 顶点着色器里沿 −Z 漂移并回绕，贴图 `T.softGlow()`；CPU 端不更新 buffer |

### 灯火、船、人（`src/lanterns.js` + `src/props.js`）

| 元素 | 生成方式 |
| --- | --- |
| 固定灯笼（檐下、门口、窗内、巷尾、桥头、埠头，共数百盏） | 2 张 `InstancedMesh`：圆灯 = 压扁的 `SphereGeometry(0.42,12,9)`、六角灯 = `CylinderGeometry(…,6)`，加一张灯盖实例表；灯体贴图 `T.lanternPaper()`，`toneMapped:false` |
| 每盏灯的柔光团 | 一张 `Points`（自定义属性 `aSize/aCol/aPhase`，加法混合），`gl_PointSize` 按距离衰减，贴图 `T.softGlow('255,190,120')` |
| 跨街灯串 | `kit.stringPath()` 生成 34 点悬链 → `LineSegments`（深色线）+ 每隔一点取灯泡 → `Points`（暖 / 红 / 玉三色按索引轮转，`T.softGlow('255,205,150')`），串中点另注册一根光柱 |
| 灯船（7 条航行 + 3 条系泊） | 船体 `kit.loftHull(profile, 6 stations)`（8 点截面 × 6 站位放样）+ 甲板 `box` + 船头 `ConeGeometry` + 艉楼 `box`；舱体 = `box` + 两层 `kit.chineseRoof()`（`curve/eaveLift` 给反曲与起翘）；两侧 6 片 + 前脸 1 片窗棂 `PlaneGeometry`；船娘 `kit.figureGeo()` + 橹 `box` + 旗 `PlaneGeometry` + 桅 `box`；前后各 1 盏圆灯、篷顶 2 盏六角灯（都是 `glow()` 球体）；船尾泡沫 = `PlaneGeometry(2.8,10)` + `T.softGlow('210,230,255')` 加法混合 |
| 街上的人（≤320） | `InstancedMesh(figureGeo(1.0), MeshStandardMaterial #161a25)`：身体是 tapered `Cylinder`、头是 `Sphere`、臂是一小段 `Cylinder`，合并成一个剪影几何；约三分之一手里另挂一盏 `Points` 小灯 |

### 天空（`src/environment.js`）

| 元素 | 生成方式 |
| --- | --- |
| 夜空底色与地平线上的暖雾 | `SphereGeometry(496,32,20)` + `BackSide` 自写着色器，暖雾用 `hash(floor(uv*90))` 打散避免带状 |
| 星 1500 颗 | `Points`，位置在半球上按 `pow(rand,0.6)` 抬向天顶分布，闪烁在顶点着色器里 |
| 月与月华 | `CircleGeometry(11,32)` + `glow('#f4f1e2',1.5)`，外加一张 `Sprite`（`T.softGlow('232,238,255')`，`scale 150`，加法混合） |
| 远处城里回上来的光雾 7 片 | `PlaneGeometry(190,60)` × 7，环绕在半径 300 处，贴图 `T.cloudPuff()`，加法混合 |

### 界面（零图片资源）

热点环是 `src/hotspots.js` 里 `ringTexture()` 现画的 256² canvas 同心环（Sprite，`sizeAttenuation:false`）；热点标签、HUD、参数面板、景点条、解说卡、加载幕全部是 DOM + CSS；罗盘是 `index.html` 里的内联 `<svg>`；胶片颗粒与暗角是 CSS 渐变；加载动画的那盏灯与左上角「清」字印章是 CSS 形状与渐变。

## 2. 程序化贴图清单（`src/textures.js`，另有一处在 `hotspots.js`）

| 函数 | 画布 | 画的是什么 | 用在哪 |
| --- | --- | --- | --- |
| `softGlow(hue, hard)` | 128² | 径向柔光衰减（可按色相与硬度参数化，多个实例分别缓存） | 灯笼光晕、跨街灯泡、河灯、人群手里灯、月华、船尾泡沫 |
| `roofTiles(base, ridge, highlight)` | 256² | 16 条瓦垄的横向渐变 + 20 道横向瓦口 | `M.roof`（黛瓦）、`M.roofGreen`（远排屋青瓦）、`M.tileCap`（墙头压顶） |
| `wood(base, grain)` | 128² | 90 条贝塞尔木纹 + 12 处节疤 | `M.beam`、`M.pillar`、`M.pillarBright`（船体也复用） |
| `stone(base)` | 256² | 5200 个随机斑点 + 8 行砌缝（错缝） | 花岗岩桥身/券脸、驳岸、铺面、`M.stone*` 家族 |
| `plaster(base)` | 128² | 3000 个明暗颗粒的粉墙 | `M.wall`、`M.redWall` |
| `plaque(text, {dir,bg,fg,border,note})` | 512×190（横）／190×512（竖） | 匾底渐变 + 双线边框 + 楷书刻字（横匾自右向左） | 「清名桥」石额、两幅拟联、「御码头」、「水弄堂」 |
| `lanternPaper(core, edge)` | 256×128 | 上下压深、中间透亮的灯笼纸，14 道竹篾 + 一道书法带 | `LanternField` 三张实例表的灯体 |
| `lattice(cols, rows)` | 256² | 窗棂：外粗内细的经纬 + 每格一枚菱形，径向暖光底 | 4 组窗材质 + 船舱窗 `M.lattice` |
| `cloudPuff()` | 256×128 | 12 团随机径向渐变的云斑 | 远处城市回光薄片 |
| `columnFade()` | 32×128 | 竖直亮度包络 + `destination-in` 横向羽化 | `LightColumns` 的光柱纹理（注意 `flipY=false`） |
| `noise()` | 128²，`NoColorSpace` | 逐像素灰噪声 | 水面片元的亮度调制 |
| `ringTexture()`（`src/hotspots.js`） | 256² | 两圈描边 + 中心亮点 | 机位热点环 Sprite |

全部经 `memo(key, make)` 按参数字符串缓存，同参数不重复生成；`tex()` 统一设 `SRGBColorSpace`、`RepeatWrapping`、`anisotropy 8`。

## 3. 体量与实例上限（真值取自代码）

| 项目 | 数值 |
| --- | --- |
| 河道 | 面宽 22 m（`RIVER.halfWidth 11`，写意）、长 340 m、岸顶 `y = 2.0` |
| 桥 | 全长 43.2 m、宽 5.5 m、孔顶 8.5 m、桥头 2.2 m、跨径 13.1 m（半圆半径 6.55 m）、拱脚 1.0 m、桥面反穹弧半径 40.18 m |
| 灯体实例容量 | 圆灯 700 / 六角灯 700 / 灯盖 1400 |
| 光柱实例容量 | 1500（每条航行中的船每帧占用 3 根） |
| 人流实例上限 | 320（滑块上限同为 320，画质阶梯再夹到 `[300,240,170]`） |
| 灯船 | 航行 7 条 + 系泊 3 条 |
| 河灯 / 星 | 88 / 1500 |
| 跨街灯串 | 每个开间一对端点（`anchors.stringEnds`），34 段悬链 |
| 河埠 / 横巷 / 远排屋 | 13 处 / 6 条 / 每侧 4 排 |
| 阴影 | 全场仅 1 盏平行光投影，2048²，启动两帧预热后 `shadowMap.autoUpdate = false` |

## 4. 内置第三方文件（`vendor/`）

| 路径 | 字节 | 作用 |
| --- | --- | --- |
| `vendor/three.module.js` | 1,272,972 | three.js **r160**（文件头 `Copyright 2010-2023 Three.js Authors` / `SPDX-License-Identifier: MIT`），由 `index.html` 的 importmap 暴露为 `three` |
| `vendor/addons/postprocessing/EffectComposer.js` | 4,651 | 后期链容器 |
| `vendor/addons/postprocessing/RenderPass.js` | 1,915 | 主场景 pass |
| `vendor/addons/postprocessing/UnrealBloomPass.js` | 12,406 | 灯影辉光 |
| `vendor/addons/postprocessing/OutputPass.js` | 2,398 | 色调映射 + sRGB 输出 |
| `vendor/addons/postprocessing/Pass.js` | 1,706 | pass 基类（EffectComposer 依赖） |
| `vendor/addons/postprocessing/ShaderPass.js` | 1,576 | EffectComposer 依赖 |
| `vendor/addons/postprocessing/MaskPass.js` | 2,231 | EffectComposer 依赖 |
| `vendor/addons/shaders/CopyShader.js` | 571 | ShaderPass 默认着色器 |
| `vendor/addons/shaders/LuminosityHighPassShader.js` | 1,192 | UnrealBloomPass 的高通 |
| `vendor/addons/shaders/OutputShader.js` | 1,393 | OutputPass |
| `vendor/addons/utils/BufferGeometryUtils.js` | 31,906 | `mergeGeometries()`，同材质几何合并（倒影克隆代价压到可接受的关键） |

运行时不引用这三个目录之外的任何第三方；`node_modules/` 里那份 `docx`/`pptxgenjs` 等是系列申报文档工具链的依赖副本（ESM 不认 `NODE_PATH`，独立目录只能自带），**场景运行与 `npm run build` 都不读它**，删除也不影响页面。

## 5. 字体依赖

无内嵌字体文件，全部走系统 CJK 字体：

- CSS 衬线（标题、景点条、解说标题、数字读数）：`"Songti SC", "STSong", "SimSun", "KaiTi", "Noto Serif SC", serif`
- CSS 无衬线（正文与控件）：`"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif`
- canvas 匾额文字（`T.plaque`）：`"KaiTi", "STKaiti", "Songti SC", "SimSun", serif`，`600 weight`，缺字时回退 `serif`
- 热点标签（`hotspots.js` 内联样式）：`"Songti SC", "Microsoft YaHei", serif`

实际观感差异：Windows 走 SimSun/KaiTi/Microsoft YaHei，macOS 走 Songti SC/Kaiti ST/PingFang SC。因为刻字与正文都由系统字体承担，报告与路演建议在**同一台机器**上截图（`tools/shoot.mjs` 就是为此存在）。

## 6. 截图素材

两套图，文件名都直接是 `src/data.js` 里的机位 id（`tools/shoot.mjs` 按 id 命名，不产生 `qm-01…` 这类序号名）：

| 机位 id | 对应画面 | 校验图（`shots/`，1440×900 PNG） | 报告图（`docs/shots/`，1600×900 JPEG q90） |
| --- | --- | --- | --- |
| `nanchang` | 南长街 · 枕河人家 | `shots/nanchang.png` | `docs/shots/nanchang.jpg` |
| `shuibu` | 河埠头 · 一夜浣纱 | `shots/shuibu.png` | `docs/shots/shuibu.jpg` |
| `qiaodong` | 桥洞 · 灯船穿桥 | `shots/qiaodong.png` | `docs/shots/qiaodong.jpg` |
| `gongding` | 清名桥 · 拱顶 | `shots/gongding.png` | `docs/shots/gongding.jpg` |
| `xiang` | 南下塘 · 夜巷 | `shots/xiang.png` | `docs/shots/xiang.jpg` |
| `yunitou` | 御码头 · 灯船始发 | `shots/yunitou.png` | `docs/shots/yunitou.jpg` |
| `aerial` | 空中鸟瞰 · 一桥两岸 | `shots/aerial.png` | `docs/shots/aerial.jpg` |

`docs/shots/` 是 `tools/make-qingming-submission.mjs` 的输入，**必须入库**；`shots/` 是本地自检留痕，已被 `.gitignore` 排除。两套图都要在**同一台机器**上重出，保持光照与字体一致：

```sh
npm run dev                                                    # 另开一个终端，端口 8795
node tools/shoot.mjs                                           # → shots/<id>.png
node tools/shoot.mjs --fmt=jpg --size=1600,900 --out=docs/shots # → docs/shots/<id>.jpg
```

浏览器用户数据目录（仓库根的 `shots-profile/`、`docs/shots-profile/`）是 `tools/shoot.mjs` 跑无头 Edge 时产生的缓存，**不是素材，也不应入库**；`tools/cdp-probe.mjs` 只做单帧探针与读控制台，不落图。

## 7. 事实来源清单

只取公开资料的**文字事实**，未参考、未复制、未衍生任何受版权保护的照片、测绘数据、规划图纸或三维模型；全部几何、题刻文字、楹联与解说文案为本作品原创或拟作。

| 来源 | 取用的内容 |
| --- | --- |
| 搜狗百科「清名桥」词条 | 单孔花岗岩石拱桥的四项形制数据（全长 43.2 m、桥面宽 5.5 m、通高 8.5 m、桥孔跨度 13.1 m）；沿革——始建于明万历年间、初名「清宁桥」、清道光年间避宣宗旻宁讳改称「清名桥」、康熙八年由无锡县令吴兴祚主持重建 |
| 游乐旅游网「无锡清名桥古运河景区」 | 街区空间格局——运河在此近南北向，西岸南长街、东岸南下塘，「水陆并行、河街相邻」；清名桥为该段地标的单孔石拱桥 |
| 搜狐「美丽中国打卡点丨无锡南长街」 | 现状观感参照——运河夜游的灯船、枕河人家与河埠界面、"水弄堂"这一俗称的语源（牌坊题额借用此称，属写意） |

对应到工程里的落点：四项尺寸进 `src/data.js` 的 `BRIDGE`；沿革与格局进 `STATIONS.gongding.body` 与 `STATIONS.nanchang.body`，以及 `index.html` 帮助弹窗的免责段。

## 8. 写意添加（不属于考据，勿当实物现状）

本段运河取 22 m 面宽与 2 m 岸壁高 · 桥面台阶级数（两端各 17 级）与拱脚标高 · 拱券取半圆的做法 · 桥洞通航净高 · 桥面石栏与河埠头石阶的形制 · 券面「清名桥」石额与拟作楹联的文字 · 牌坊「水弄堂」与埠头「御码头」的题额及位置 · 灯船与荷灯 · 御码头埠头与等客亭 · 远处塔影天际线 · 两岸屋宇层数进深与横巷点号。

完整说明与判断依据见 `README.md` 的「已核实事实与写意边界」一节，页面内「操作说明」弹窗的最后一段是同一段话的面向观众版本。

## 9. 许可

- 场景代码与文档：仓库未附 LICENSE 文件，`package.json` 标 `"private": true` 且无 `license` 字段，按保留所有权利处理，仅授权用于本次参赛与教学展示。
- `vendor/three.module.js` 与 `vendor/addons/`：three.js r160，MIT，版权头 `Copyright 2010-2023 Three.js Authors`，随仓库原样分发并保留许可注释。
- 程序化贴图与几何：由本作品代码生成，不含任何第三方资产。
- 中文题刻与楹联：文字为拟作；历史数据来自第 7 节列出的公开资料。
