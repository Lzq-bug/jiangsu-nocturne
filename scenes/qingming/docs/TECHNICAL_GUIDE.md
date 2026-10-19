# 技术说明 · 清名桥 运河灯河

面向接手这个仓库的评委或同学：读完这份能知道每个模块干什么、画面是怎么出来的、改一处要连带改哪几处、以及如何在不打开浏览器的情况下确认自己没有把场景改坏。行数为写作时 `wc -l` 的实测值。

## 1. 模块职责

| 文件 | 行数 | 职责 | 对外接口 |
| --- | --- | --- | --- |
| `index.html` | 140 | DOM 骨架 + `importmap`（`three` → `vendor/three.module.js`，`three/addons/` → `vendor/addons/`） | — |
| `styles.css` | 357 | 系列共用界面样式，本场景主题块 `body.qm`；`body.bare` 隐藏所有 HUD 供截图 | — |
| `src/data.js` | 155 | 唯一的数据源：实尺常量 `RIVER/BRIDGE/BANK/LANDING/BRIDGE_CORRIDOR`、桥面与拱腹标高函数 `deckY()/soffitY()`、7 处 `STATIONS`、参数默认值 `DEFAULTS` | 常量 + 两个标高函数 |
| `src/main.js` | 267 | renderer/composer 建立、resize、启动时序与加载幕、参数分发、渲染循环、画质阶梯、深链解析、截图、`window.qingming` 调试句柄 | `boot()` |
| `src/architecture.js` | 614 | 桥与两岸的全部静态几何：`bridgeShape()` 2D 轮廓挤出、券脸、栏板、石额楹联、驳岸与河埠、灯柱、枕河房、横巷、远排屋、天际线、御码头、石牌坊；产出 `anchors` 灯位表 | `initQMMaterials()`、`buildQuarter(scene)` |
| `src/props.js` | 108 | 只读 `anchors` 来填灯，定义人流路径 `WALK_PATHS` 与桥面走法 `deckWalk()`、灯船系泊点、晾衣绳 | `buildProps(scene, columns, anchors)` |
| `src/lanterns.js` | 503 | 活动体：`LanternField`（实例化灯笼+光晕点云）、`overheadStrings`（跨街灯串）、`Fleet`（灯船）、`Crowd`（人流剪影）、`lotusLanterns`（河灯） | 五个类/工厂 |
| `src/water.js` | 297 | `buildWater()` 水面着色器、`Reflections`（街区镜像克隆）、`LightColumns`（加法混合光柱实例表）、`Wobble`（倒影扰动材质） | 三个类 + 一个工厂 |
| `src/environment.js` | 161 | 天穹/星/月/城市回光 + 灯光配置（半球光、月光平行光唯一投影、下游冷补光、三盏暖底光）与 `FogExp2` | `buildEnvironment(scene)`、`MOON_DIR` |
| `src/kit.js` | 312 | 共享工具箱：调色板 `PAL`、确定性随机 `rand()/rr()`、材质表 `M` 与 `lit()/glow()`、`chineseRoof()`、`ridgeOrnament()`、`pillarGeo()`、`railingGeo()`、`plaqueMesh()`、`stringPath()`、`figureGeo()`、`loftHull()`、`box()/mesh()`、近景遮挡剔除 `registerOccluder()/declutter()` | 见左 |
| `src/textures.js` | 239 | 全部 canvas 程序化贴图，`memo()` 按参数缓存，同图不重复生成 | 11 个工厂函数 |
| `src/controls.js` | 244 | `CameraRig`：`pano`（眼位+yaw/pitch+FOV）与 `free`（target/dist/theta/phi）两种行为，指针/滚轮/双指/键盘、走位缓动、轻点判定 `onTap` | `CameraRig` |
| `src/hotspots.js` | 119 | 热点环 Sprite（`sizeAttenuation:false`）+ DOM 胶囊标签 + `Raycaster` 拾取 + 当前机位自隐藏 | `Hotspots` |
| `src/ui.js` | 136 | 5 滑块/4 开关/景点条/模式页签/解说卡/罗盘/加载条/快捷键，全部 `onChange(key, scaled)` 回主循环 | `createUI(deps)` |
| `tools/serve.mjs` | 66 | 零依赖静态服务（默认 8765，第二参数可换站点根目录如 `dist`，`no-store`，路径限制在项目根内） | `node tools/serve.mjs [port] [root]` |
| `tools/build-single.mjs` | 149 | ESM→单文件打包器（见第 11 节硬约束） | `node tools/build-single.mjs page entry out` |
| `tools/shoot.mjs` | 132 | 无头 Edge 单会话连拍全部机位，输出 `shots/<id>.<fmt>` | `node tools/shoot.mjs [id…]` |
| `tools/cdp-probe.mjs` | 58 | 连接已开调试端口的 Edge，打印异常/console 并求值表达式，附 `renderer.info` | `node tools/cdp-probe.mjs <port> "<expr>"` |

启动依赖顺序（`main.js`）：`createUI` → `initMaterials()` + `initQMMaterials()` → `buildEnvironment()` → `buildQuarter()` → `new LightColumns()` + `buildProps()` → `buildWater()` + `new Reflections().add(quarter.group)` → `new Hotspots()` → 深链落位 → 两次预热渲染 → 幕布退场 → `requestAnimationFrame(frame)`。每一步之间 `await nextFrame()` 让加载条真的会动；`nextFrame` 里同时挂了 60 ms 的 `setTimeout` 兜底，因为后台标签页会冻结 rAF，没有兜底的话切走标签就会把启动卡死。

## 2. 渲染管线

```
WebGLRenderer(antialias, high-performance)
  outputColorSpace = SRGBColorSpace
  toneMapping = ACESFilmicToneMapping, exposure = 1.14
  shadowMap.enabled = true, type = PCFSoftShadowMap
EffectComposer
  ├─ RenderPass(scene, camera)
  ├─ UnrealBloomPass(1024×1024, strength 0.5, radius 0.55, threshold 1.02)
  └─ OutputPass()
camera = PerspectiveCamera(60, aspect, near 0.12, far 1200)
```

`threshold 1.02` 是关键：只有 HDR 值超过 1 的表面才会泛开，而 `kit.js` 的 `glow(color, intensity)` 用 `MeshBasicMaterial` 把颜色乘到 1 以上并设 `toneMapped = false`，所以辉光精确地只落在灯球、券腹灯泡、巷灯这些「自己发光」的物件上，不会把粉墙一起糊掉。水面与光柱着色器末尾手动 `#include <tonemapping_fragment>`，保证它们和标准材质走同一条色调曲线。

**阴影的两帧预热。** 全场只有一盏平行光投影（`environment.js` 的月光 `DirectionLight`，2048²，正交盒 ±125，`bias -0.0012`、`normalBias 0.42`）。启动末尾：

```js
composer.render();                       // 1) 编译全部 program
renderer.shadowMap.needsUpdate = true;   // 2) 强制重画一次阴影图
composer.render();                       // 3) 阴影图填好
renderer.shadowMap.autoUpdate = false;   // 4) 之后不再逐帧重算
```

场景是静态的（会动的只有船、人、灯、水），而会动的东西几乎都不需要阴影；关掉 `autoUpdate` 后每帧省下整场 2048² 的阴影 pass，这是软渲染下能不能跑起来的分水岭。代价：后续任何新增的 `castShadow` 几何都不会进阴影图，需要手动再设一次 `needsUpdate = true`。

`resize()` 会同时改 `camera.aspect`、`renderer.setSize(w,h,false)`、`composer.setSize()` 与 `bloom.setSize()`——漏掉后两者会让辉光和最终输出停留在旧分辨率上，画面糊或错位。

## 3. 水面与倒影

三套机制叠出来，都不是 render-target 镜面。

**`buildWater()`（水面本体）。** 一块 `(22+3) × 340`、40×160 段的平面，`ShaderMaterial`（`transparent`、`depthWrite:false`、`DoubleSide`、`renderOrder = 3`）。顶点做三重正弦位移；片元里用**同一组波的解析导数**重建法线（不是 `dFdx/dFdy`，省一次偏导也避免段数不足时的假棱），再走 Fresnel：`mix(uDeep,uShallow,…)` → 按 `fres` 混入程序化的 `skyAt(reflect(-V,n))` 天空色 → 月面高光用 `pow(ndh,420)` 收成一条**沿月光方位角的窄带**（`lane` 项），而不是整条河泛银 → 叠加细碎波光、噪声纹理调制、以及靠岸 `smoothstep` 的“油污”压暗。高频小波按距离衰减（`det = 1 - distance/130`），因为从鸟瞰机位看过去它会闪成摩尔纹。`main.js` 建好之后把 `uDeep/uShallow` 覆盖成 `#08182c`/`#10283f`：河面宽 22 m，沿用窄巷的水色会整条读成黑槽。

**`Reflections` + `Wobble`（街区倒影）。** `reflections.add(quarter.group)` 对 `clone(true)` 出来的整份街区，遍历把 `isMesh` 的材质换成 `Wobble.material(src)`：一张 `MeshBasicMaterial`（`opacity 0.46`、基色乘 0.46、保留原 `map`、`depthWrite:false`、`DoubleSide`、`toneMapped:false`），`onBeforeCompile` 注入 `uTime/uRipple` 在顶点阶段扰动 `x/z`，并把片元 alpha 按世界坐标 `y` 用 `smoothstep(-26,-1, y)` 压到 0——倒影越往下沉越淡，于是远处不会出现一条生硬的镜像边界。所有替换材质共用 `customProgramCacheKey = 'qinhuai-wobble'`，一次编译全场复用。镜像组挂在 `scale(1,-1,1)`、`position.y = 2*WATER_Y` 的父节点下。

这条路子的两个代价必须知道：
1. `clone(true)` 会**把整份街区几何再实例化一遍**，draw call 与显存翻倍；`architecture.js` 之所以坚持「同材质一律 `mergeGeometries` 成少量 mesh」，就是为了让这份拷贝只有几十次绘制而不是几千次。
2. `Points`（灯笼光晕、河灯、人群手里灯）**不参与倒影**——`Wobble` 只换 `isMesh` 材质，点云在水下不出现。这是刻意的取舍，靠 `LightColumns` 补出水的亮度。
3. 克隆体与原物体不同步材质以外的状态：`sync()` 每帧复制 `position/rotation/scale`，并按 `traverse` 顺序把 `visible` 镜像过去（依赖 `clone(true)` 与遍历顺序一致这一前提）。`Reflections.enabled` 就是 `root.visible`。

**`LightColumns`（灯柱）。** 一个容量 1500 的 `InstancedMesh`（1×1 平面），加法混合、`depthWrite:false`、`renderOrder = 4`。朝向在顶点着色器里算：从 `viewMatrix` 取相机 right 向量，把 quad 展成一张永远面向相机的竖直薄板，宽度随 `uv.y` 张开（`0.42 + 0.9*t`），高度 = 实例 `scale.y`（即“光柱伸到水下多深”），再按 `uRipple` 加两道正弦摆动。纹理是 `textures.columnFade()` 的 32×128 竖直渐变（`flipY = false`），片元再乘一次 `smoothstep(1,0.1,vUv.y)` 与逐灯闪烁项。`add()/setPos()/setOn()` 只改 CPU 侧数据并置 `dirty`，`flush()` 才写实例矩阵，所以静止的几百盏灯每帧零开销；只有 `Fleet` 的船（每船 3 根柱）会每帧触发一次全量 `flush()`。灯柱的“亮”是 `color × intensity`（`add()` 的第 5 参）与全局 `uStrength = 1.5 + 0.8*min(1, lantern)` 相乘。

一个实例化坑：着色器读 `instanceColor`，而 `InstancedMesh` 只有在调用过 `setColorAt` 后才有这个属性，于是构造时先手动挂一个 `InstancedBufferAttribute(1500*3)`，否则 program 编译期拿不到 attribute、整片光柱不显示。

## 4. 灯火与人群

**`LanternField`（固定灯）。** 三张实例表：圆灯笼 `SphereGeometry(0.42,12,9)` 压扁（容量 700）、六角灯 `CylinderGeometry(0.34,0.34,0.72,6)`（700）、灯盖 `capGeo`（1400，每盏灯配一个）。灯体贴图来自 `T.lanternPaper()`，`toneMapped:false` 让它进辉光阈值。另有一张 `Points` 光晕（`aSize/aCol/aPhase` 三个自定义属性 + `softGlow` 贴图，`gl_PointSize = min(58, aSize*300/distance)`）负责远距离的“一团暖”。

密度滑块的实现是这套代码里最省钱的一招：`add()` 给每盏灯一个随机 `rank`，`build()` 按 `rank` 排序后记录 `prefix.round/hex`（实例下标 → 排序后的灯序），`setDensity(fraction)` 只做三件事——二分算出前 `lit` 盏里有多少张圆灯/六角灯，改 `mesh.count`，`haloGeo.setDrawRange(0, lit)`，再对参与光柱的灯 `columns.setOn(i, i < lit)`。因此拖动滑块是**从尾部一批批熄灯**，不重建任何 buffer，0→1.5 全程零分配。`fraction > 1` 被 `Math.min(1, …)` 截断，滑块 100–200 那段只是给“再亮一点”留的余量错觉（真正生效的是 `strings.uOn` 与光柱 `uStrength`）。

**`overheadStrings`（跨街灯串）。** `anchors.stringEnds` 每对端点用 `kit.stringPath(from,to,sag)` 生成 34 点悬链（`y -= sin(t·π)*sag`），一份进 `LineSegments`（深色、`fog:false`），隔点取灯泡进一张 `Points`（暖/红/玉三色按索引轮转），串中点额外注册一根光柱。它不受 `setDensity` 管，只随 `lantern` 改整体 `uOn`。

**`Crowd`（人流）。** `InstancedMesh(figureGeo(1.0), MeshStandardMaterial(#161a25, rough .92), 320)`——只有剪影，没有脸，夜里这样最划算也最难看穿。`props.js` 传入 7 条 `WALK_PATHS`（两侧河沿步道 ×2、主街 ×2、东岸双排、御码头），按路径长度加权抽样分配 agent；`bridgeEvery: 21` 表示每 21 个人里有一个走桥面，走法由 `deckWalk(u, off)` 给：`x` 从 −21.6 扫到 +21.6，`y = deckY(x) + 0.04`（直接吃 `data.js` 的那条反穹圆弧，所以台阶改了她也会跟着改），`z` 夹在桥面宽 ±0.8 内。步态是 `sin(t*5.4+phase)` 驱动的微 bob 与侧倾。两个细节：眼位 8 m 内的 agent 把 `scale` 设成 0（否则镜头一贴脸就是一个黑色巨人）；`lanternRate: 0.34` 的人手里另挂一张加法 `Points` 小灯。实例上限 320 与滑块上限一致（`crowd` 0–320，实际还要被画质阶梯的 `[300,240,170]` 上限夹住）。

**`Fleet`（灯船）。** 7 条航行的 + 3 条系泊的（`props.js` 给 `mooredAt = [[9.4,-52],[8.2,-64],[10.2,96]]` 与 `moorYaw`，分别泊在御码头上下游与上游河道）。船体几何 `loftHull(profile, stations)`：8 点截面 × 6 站位放样出 hull，再接甲板、船头锥与尾楼，全部 `mergeGeometries` 成 1 个 mesh；舱与两层 `chineseRoof`（`curve/eaveLift` 给出反曲与起翘）另成 1 个 mesh；两侧 6 片 + 前脸 1 片窗棂 `PlaneGeometry`；前后各一盏圆灯、篷顶两盏六角灯、船娘 `figureGeo` + 橹 + 旗；船尾一片加法混合泡沫面。航向沿 Z 往复：`z = (t-0.5)*2*164`，`lane = (i%2 ? 4.8 : -5.0)*laneScale`，`sway` 给横向摆动与 `rotation.y/z/x` 三重微摇，`speed ∈ [0.0052, 0.009]`。船头/舱/船尾三根光柱每帧 `setPos`，所以船过桥洞时水面上拖出的是会拐弯的两条暖带。`Fleet.moored()` 是系列共用的接口（本场景还没接“登船”交互），目前无人调用。

**`lotusLanterns`（河灯）。** 88 个 `Points`，分布在 `|x| < 8.5`、`y = WATER_Y + 0.12`、整条 340 m 河道；顶点着色器里 `p.z = mod(z + 170 - uTime*0.8*uFlow, 340) - 170` 把它们**沿 −Z（下游）漂**并自动回绕，横向再叠一道 `sin` 摆动，`uFlow = 0.6 + boat*0.8` 让它跟着灯船航速滑块的节奏走。位置计算完全在 GPU，CPU 端一次都不更新 buffer。

## 5. 街区装配（architecture.js）

- 桥身是**一张 2D 轮廓 + `ExtrudeGeometry(depth = 5.5, curveSegments 26)`**：`bridgeShape()` 依次走西半跨的 17 级台阶、`deckY(x)` 采样出的弧形桥面、东台阶、拱脚以下的实体，最后 `absarc(0, springerY, 6.55, 0, π)` 挖出半圆孔。券脸（`archFaceGeo`）是一条内外差 0.26 m 的半圆环带，挤出厚度略大于桥宽，让两面的“券边”都凸出来。桥洞里的 `PointLight(0xffb066, 150, 30, 1.7)` + 券腹 7 盏 `glow` 球，就是「灯船穿桥」那一张的背光。
- 栏板沿桥面斜率**逐段**铺（`railingGeo(len,…)` 后 `rotateZ(atan(slope))`），所以栏杆贴合弧面而不是穿进桥面；每隔约 6.6 m 补一根望柱。
- `anchors` 是这整个文件与灯光系统之间唯一的契约（键：`lampPosts / eaves / windows / bridgeLamps / archLamps / quayLamps / alleyLamps / streetLamps / ferryLamps / moorLamps / stringEnds / gate / waterLamps / paifangLamps`）。房子只负责“这里该有灯”，`props.js` 决定“这盏灯多大、什么色、要不要往水里拖一根柱”。加房子不用改灯，改灯不用改房子。
- 两岸分带来自 `BANK.west/east`（`quay → rail → walk → face → alley → street → sign`），`houseRow()` 沿 `z` 步进随机开间，并且**先让开桥的走廊（`|zc| < CORRIDOR + w/2`）与横巷口**再落屋，否则山墙会插进巷道口或台阶上。东岸 `kind: 'mix'`，随机把一部分开间换成「围墙夹宅门 + 漏窗」，这就是南下塘“围墙多、店铺少”的实现。
- 临水一侧的窗是 4 组 `MeshBasicMaterial` 窗棂（不同暖色相 + `toneMapped:false`），非窗位置用 `M.dark` 板子压黑，保证没有灯的窗是真黑。
- `waterLamps` 那一排是从石栏外侧挑出来的灯，`props.js` 给了全场最长的光柱（`columnDepth: 15, columnWidth: 1.35`，每第 5 盏改红）——只有这一排的光是真的落在河面上。
- `buildBackRows()` 与 `buildFarSkyline()`（90 段环形屋脊 + 一笔 7 层塔影，坐标 `(-186, ·, -210)`）只为鸟瞰机位服务；塔影**不指实某座古塔**。
- 近景遮挡：牌坊与「御码头」石额通过 `kit.registerOccluder()` 注册，`main.js` 每帧 `declutter(camera.position)`，人贴到跟前时物件直接隐掉，避免一块匾糊满整个画面。

## 6. 几何与贴图工具箱（kit.js / textures.js）

`chineseRoof()` 是参数化屋顶：`ridgeRatio` 收脊、`curve` 控制反曲（`s = t*(1-curve) + √t*curve`）、`eaveLift` 让角沿脊线翘起；关键一行是 `t = min(1, max(dzN, dxN))`——用 `max` 才能把折痕精确留在脊线上（庑殿），用加法在长条屋顶上会把整片坡面压平。`loftHull()`、`pillarGeo()`（柱+鼓镜础+柱顶环）、`railingGeo()`（地栿+上中扶手+望柱+柱头）、`figureGeo()`、`stringPath()`、`plaqueMesh()`（canvas 现画匾 + 一圈 `M.gilt` 描金框）都在这一层。

贴图全部来自 canvas，`memo()` 按参数字符串缓存。一条容易踩的规则：**`map.repeat` 是共享对象上的状态**，`T.stone('#98a0ae')` 会把同一张纹理给多个材质，改 repeat 前必须 `.clone()`（`initQMMaterials()` 里的 `rep()` 就是为此）。同理 `M.stoneDressed.map` 建好后立刻克隆再改 repeat。

随机源 `rand()` 是 `seed = 20240921` 起步的 xorshift 流，`rr(a,b)` 是其线性区间包装。全场只用这一个流，因此布局逐帧可复现：改任何一处 `rand()` 调用次数，下游所有随机数会全部平移——画面“看起来变了但没改错”多半是这个原因。

## 7. 相机、机位与热点的数据契约

一个机位在 `data.js` 里是**三个坐标**：

- `pos` — 眼位（全景模式直接放 eye，自由模式作为 orbit 起点）；
- `look` — 注视点（`CameraRig.poseFor()` 换出 yaw/pitch；自由模式换成 `target/dist/theta/phi`）；
- `mark` — 热点在世界里的锚点（`hotspots.js` 的 Sprite 位置 + DOM 标签投影位置）。

**三者必须一起改。** 只挪 `pos/look` 的话，热点环会留在原地，标签飘在错误的建筑上；只改 `mark` 的话点击跳转会落到旧机位。`aerial` 的 `mark: null` 是合法的：`Hotspots` 构造函数会 `continue` 跳过，既不生成 Sprite 也不生成 DOM 标签。改机位的正确顺序：先在页面上用 `#eye=&at=` 试构图（见第 12 节），满意后回填 `pos/look`，再把 `mark` 挪到新视野里那个真正想让人点的物件上，最后 `node tools/shoot.mjs <那个id>` 出图复核。

另外几处会跟着机位走的东西：`ui.js` 底部景点条按 `STATIONS` 顺序生成 chip，`main.js` 的 `goToStation()` 取模循环（自动巡览会经过 `aerial`），`shoot.mjs` 里有一份**硬编码的 id 列表** `['nanchang','shuibu','qiaodong','gongding','xiang','yunitou','aerial']`，新增机位要同步补这一行。

`CameraRig` 的两种行为共用一套输入处理：`pano` 下左键改 `vYaw/vPitch`（滚轮改 FOV，夹在 22–96°），右键/Shift 走 `nudge()` 沿地平面滑眼（`y` 夹 1.6–60、`x` 夹 ±72、`z` 夹 ±140）；`free` 下左键转 `theta/phi`（`phi` 夹 0.12–1.52，不让相机钻到地下），右键平移 `target`，滚轮改 `dist`（6–460）。走位缓动 `goTo/goToOrbit` 用同一个 `travel` 结构，`easeInOut` 三次曲线，转角走 `shortestAngle` 避免绕远；轻点判定为 `moved < 9 px && 时长 < 600 ms`，交给 `hotspots.pick()`。`autoRotate`（自动巡览）只在 `idle > 1.2 s` 时以 0.045 rad/s 慢转，用户一动就停。

## 8. 参数与画质阶梯

`DEFAULTS`（`data.js`）→ `index.html` 的 `value` → `ui.js` 缩放 → `main.js` 的 `onParam()`：

| 控件 | 原始范围 | 送进场景的值 | 落点 |
| --- | --- | --- | --- |
| 两岸灯火 | 0–200（步 5） | `v/100` | `field.setDensity(f)` + `strings.uOn = min(1, 0.3+f)` + 光柱 `uStrength` |
| 街巷人流量 | 0–320（步 10） | 原值 | `crowd.update()` 的实例数，再被画质上限 `[300,240,170]` 夹 |
| 水面波纹 | 0–250（步 5） | `v/100` | 水面 `uRipple`、倒影 `uRipple`、光柱 `uRipple` |
| 灯船航速 | 0–250（步 5） | `v/100` | `fleet.update()` 的 `speedScale` 与河灯 `uFlow` |
| 灯影辉光 | 0–180（步 5） | `v/100` | `bloom.strength`（初值 0.5） |
| 水中倒影 / 热点标签 / 自动巡览 / 画质自适应 | 开关 | 布尔 | `reflections.enabled` / `hotspots.labelsVisible` / `rig.autoRotate` / `autoQuality` |

画质阶梯只有一个方向（只降不升）：每 0.75 s 统计一次 fps，`t > 5 s` 后 fps<20 使 `lowStreak++`、否则 `lowStreak -= 2`；连累到 8 次就 `applyQuality(level+1)`，最多到 2。Level 1 把 `pixelRatio` 从 `min(devicePixelRatio, 1.35)` 降到 1；Level 2 追加关倒影并压人流上限；每级给面板底部写一句人话提示（`ui.perfHint`）。关掉「画质自适应」只停止继续降级并清空提示，**不会**把已经降掉的等级抬回去——想恢复要重载页面。DPR 上限 1.35 是量出来的：4K 屏上 2.0 与 1.35 的夜景观感差别远小于它带来的 2.2 倍填充率。

## 9. vendor 与零依赖策略

`index.html` 的 importmap 把 `three` 与 `three/addons/` 指到 `vendor/`，因此运行时**零第三方依赖、零网络请求、零外部美术资产**：不装 `node_modules` 也能开，断网也能开，`npm run build` 之后连 `vendor/` 都不需要（three.js 被折进单文件）。`node_modules/` 里那份 `docx`/`pptxgenjs` 等是系列共用的申报文档依赖副本，场景运行与打包都不读它。

## 10. 界面（ui.js / hotspots.js / styles.css）

`ui.js` 只做 DOM 绑定，不认识 three.js；它把滑块原始值按上表缩放后回调，并在「恢复默认」时逐个 `onChange(key, value, params, true)` 回放一遍，保证场景状态与控件状态一致。快捷键：`Esc` 关解说与帮助、`H` 帮助、`P` 切模式、`F` 全屏、`Space` 点自动巡览、`A`/`D` 前后景点；输入框内不拦截。窗口宽 <1180 px 时参数面板自动折叠，<900 px 走 `styles.css` 的移动排版。罗盘每帧 `setCompass(radToDeg(rig.yaw))`，指北针随头转。加载幕的百分比与文案在 `main.js` 里逐步给出（0.05 铺开粉墙黛瓦 → 0.2 升起运河上的月 → 0.42 跨河架起一虹 → 0.62 点亮两岸灯火 → 0.78 放下一河春水 → 0.9 安顿灯影与归人 → 1 运河灯河），`.done` 类同时被 `tools/shoot.mjs` 当就绪信号。`#btn-shot` 走 `canvas.toDataURL('image/png')` 下载 `清名桥夜景-<机位短名>.png`。

## 11. `tools/build-single.mjs` 的硬约束

打包器不引任何 bundler：把每个 ES Module 的顶层改写成一个 `__def(id, function(__req){…})` 工厂，正则重写 import/export，按依赖后序拼接，再把 `<script type="module" src>` 换成内联 IIFE 注册表、`<link rel=stylesheet>` 换成 `<style>`、删掉 importmap。它能跑起来的前提是源代码遵守下面这些规则，违反任何一条都会得到**语法上合法但运行时无语**的产物：

1. **只认行首的静态 `import` / `export`。** 四条正则都锚定 `^[ \t]*`。`import {x} from 'y'` 写在同一行、且行首除了空格/tab 不能有别的；被注释掉的、或者写在括号里的 import 会被无视——前者无害，后者会在运行时 `__req` 找不到定义。
2. **不支持 `export default`。** 没有对应的重写规则，`export default` 会原样留在 IIFE 里造成语法错误。本仓库全部用具名导出。
3. **不支持动态 `import()`，也不处理顶层 `await`。** 每个模块的函数体外面是 `function (__req) { … }`（非 async），所以任何需要 await 的启动流程都必须自己包进 `async function`：`main.js` 的全部装配都写在 `boot()` 里，最外层是 `boot().then(bindTap).catch(err => …)`，而不是裸的顶层 await。
4. **bare specifier 只允许 `three` 与 `three/addons/`**，其余一律 `./` 或 `../`；否则 `resolveId()` 抛 `cannot resolve "…" (bare specifier with no alias)`。别名匹配**按长度降序**，否则 `three` 会把 `three/addons/…` 吞成 `vendor/three.module.js/…`。
5. **依赖图不得有环。** DFS 检环，发现就抛 `import cycle through <id>`：环形依赖会拿到半填的 namespace 对象。当前图的无环关键点是 `props.js → lanterns.js → water.js`（只为 `WATER_Y`）与 `lanterns.js → textures.js`，而 `water.js` 只往回引 `data.js` 与 `environment.js`（`environment.js` 不引 `water.js`）。想加环的话，把常量抽到 `data.js` 里是代价最低的解法。
6. **`export const/let/var/function/class/async function 名字` 才收集得到**，`export {a, b as c}` 形式也支持；`export {default as X} from '…'` 这类混合写法不支持。
7. **替换必须来自函数。** three.js 源码里有 `$`，`String.replace` 会把 `'$'` 当特殊模式展开，所以内联注入处全部写成 `() => …`。
8. 输出的默认文件名沿用系列早期场景，本项目靠 `package.json` 的第三个参数覆盖成 `dist/清名桥运河灯河-3D夜景.html`。
9. 校验方式：产物双击能开、控制台无红字，再用 `msedge --headless=new --use-angle=swiftshader --screenshot=<绝对路径.png> file:///…/dist/….html#bare&station=aerial` 出一张图确认不是黑屏。

## 12. 调试深链与无头工具

`main.js` 在装配完热点之后解析 `location.hash`（在启动末尾，因此任何 hash 都能生效）：

| 深链 | 作用 |
| --- | --- |
| `#station=<id>` | 直接把 `stationIndex` 定位到该机位（找不到 id 时回落到 0） |
| `#bare` | 给 `<body>` 加 `.bare` 类，`styles.css` 隐藏 HUD/面板/景点条/罗盘/解说卡/标签层，并 `hotspots.exteriorShown = false` 关掉热点环——出干净静帧用 |
| `#eye=x,y,z&at=x,y,z` | 覆盖机位姿态，试构图用（不必先改 `data.js`） |

组合例：`http://127.0.0.1:8795/index.html#bare&station=qiaodong`、`…#eye=-4.4,2.05,-27&at=1,6.2,6`。

**`tools/shoot.mjs`** —— 连拍 5 张以上时的正解。它启动一次 `msedge --headless=new --disable-gpu --use-angle=swiftshader --remote-debugging-port=9334 --user-data-dir=<repo>/shots-profile`，用 Node 自带的 `fetch`/`WebSocket`（需 Node 21+，实测在 Node 24 下跑）连 CDP，`Target.createTarget` + `attachToTarget(flatten:true)` 之后循环 `Page.navigate` → 每 3 s 轮询 `!!(window.qingming && #loader.done)`（上限 240 s）→ 固定 `--settle`（默认 12000 ms）等走位与序列安定 → `Page.captureScreenshot` 落 `shots/<id>.<fmt>`，并把每机的 `renderer.info.render`（calls/triangles）打在终端上。**前提是先起 `node tools/serve.mjs 8795`**（`BASE` 里硬编码了 8795）。

```sh
node tools/serve.mjs 8795 &
node tools/shoot.mjs                                  # 全部 7 个机位，PNG 1440×900
node tools/shoot.mjs qiaodong aerial --fmt=jpg        # 报告/PPT 用图
node tools/shoot.mjs --out=docs/shots --fmt=jpg       # 直接出到报告目录
```

**`tools/cdp-probe.mjs`** —— 定位画面 bug 用。深链只能看“结果”，探针能问“为什么”：先自己起带调试端口的 Edge（`msedge --headless=new --remote-debugging-port=9333 "http://127.0.0.1:8795/index.html#station=gongding"`），再

```sh
node tools/cdp-probe.mjs 9333 "window.qingming.renderer.info.render.calls"
node tools/cdp-probe.mjs 9333 "'#'+window.qingming.STATIONS.length" 8795   # 第 4 参按 URL 子串挑 target
```

12 s 后自动求值表达式并附一份 `{calls,tris,geo,tex,programs}`，期间收到的 `Runtime.exceptionThrown` / `console` / `Log.entryAdded(error|warning)` 全部实时打印。要逐项排查谁画了那条亮带，就在表达式里 `object.visible=false`；注意在 `Runtime.evaluate` 里读相机前先 `camera.updateMatrixWorld(true)`，否则拿到的是上一次 render 的姿态。

## 13. 踩过的坑（都在这份代码里留了痕）

1. **three r160 的灯光已经是物理单位。** 场景里 `PointLight` 的强度要写 150–400 这个量级（`environment.js` 三盏暖底光 320/300/150，`architecture.js` 券腹光 150），照老习惯写 `1` 会得到一间黑屋。同时别急着补灯：`decay` 取 1.7–1.9、`distance` 给到 30–300 才能压住衰减范围。整场投影光只有一盏，其余是 `HemisphereLight` + 一盏不打阴影的冷补光，因为整份街区还要被倒影克隆一遍，灯光是直接吃帧时间的。
2. **ESM 不认 `NODE_PATH`。** 申报文档用的 `docx`/`pptxgenjs` 装在 `D:\3D\node_modules`，从独立目录里 `import` 一律失败（`Cannot find package`），而且没有报错提示会指向环境变量。解法是把 `node_modules` 整份复制进本目录——这也是为什么 `package.json` 里没有 `dependencies` 字段却存在一个 `node_modules/`。three.js 走的是另一条路：不装包，`vendor/` + importmap。
3. **无头截图必须给 `--user-data-dir` 一个可写、唯一、不在 `Program Files` 里的目录。** 不给的话 Edge 会拒绝启动或复用已有会话（调试端口连不上、`/json/version` 404），而失败信息在 `stdio: 'ignore'` 下完全看不见——`shoot.mjs` 因此固定用 `<repo>/shots-profile`，并且把 `--headless=new`、`--disable-gpu --use-angle=swiftshader`、`--no-sandbox --disable-dev-shm-usage` 一起给全。软渲染下 WebGL 才出图，不然报 `Framebuffer is incomplete: attachment has zero size`。
4. **别用 `--virtual-time-budget` 等加载。** 虚拟时间与实际帧数在 SwiftShader 下严重脱钩（帧率极低，而循环里是 `dt = min(0.05, clock.getDelta())`，场景时间远慢于预算时间），加大 budget 只会把 rAF 驱动的加载幕冻在半路，截到的是加载页而不是场景。正解：轮询页面自己报的就绪标志（本场景是 `window.qingming && #loader.done`），再固定 sleep 十几秒等相机走位与船/灯序列安定。同理，靠时间推进的效果（船穿桥、河灯漂移）在静帧里未必在你要的那一帧，需要在页面里预置状态。
5. **只有 hash 不同时，`Page.navigate` 不会重载文档。** 浏览器只更新 fragment，场景根本不重建，于是七张机位图长得一模一样，看起来像“改了参数没生效”。解法是在 URL 上挂一个每次不同的 query 破缓存：`?r=${Date.now()}#bare&station=<id>`（`shoot.mjs` 第 87 行）。这也说明任何“只改 hash 就期待场景重建”的假设都是错的——所以本场景的深链解析放在启动末尾，而不是 `hashchange` 监听里。
6. **`msedge --screenshot=` 的目标路径要写正斜杠的绝对路径。** `D:\…\shots\x.png` 会报“系统找不到指定的路径”且不落盘；在双引号里 `\$` 还会被转义成字面量，循环连拍时文件名全撞在一起。
7. **实例化材质读 `instanceColor` 要先造出这个属性**，否则 program 编译期 attribute 缺失、整批实例不显示（`LightColumns` 构造函数里那行 `this.mesh.instanceColor = new THREE.InstancedBufferAttribute(…)`）。
8. **贴图 `repeat` 是共享状态**：`textures.js` 的 `memo()` 会把同一张 `CanvasTexture` 交给多个材质，直接 `map.repeat.set(…)` 会串改别的材质。`architecture.js` 顶部的 `rep()` 先 `clone()` 再改。
9. **桥面与台阶只有一份真值**：`bridgeShape()`（轮廓）与 `deckY()`（标高函数，供人流、桥灯、栏板采样）都来自 `BRIDGE` 常量。手改轮廓里的 `x0 = 9.2` 或 `n = 17` 而不动 `deckY()` 的 `deckR`，人和灯会浮在桥面上方。
10. **雾的开关要按材质类型分开看**：所有自定义着色器都不参与雾（`ShaderMaterial` 默认 `fog: false`，`environment.js`/`lanterns.js`/`water.js` 里还各自显式标注了），而 `Wobble` 的倒影 `MeshBasicMaterial` 反倒写了 `fog: true`——倒影必须跟着场景一起被 `FogExp2(0x0a1020, 0.0046)` 吃掉，否则下游几十米外的镜像屋宇会亮得不合常理。改任何一处的 fog 设置，天际线、月与两岸灯火衰减的相对关系都会整体变掉。
11. **`FrustumCulled = false` 是给点云和实例表用的**（`Points` 的包围球按原始位置算，河灯在顶点着色器里漂走、光柱实例在 CPU 侧改矩阵，不关掉剔除就会整批在某个视角突然消失）。关掉之后靠 `renderOrder` 排透明度：天穹 −2 → 场景 0 → 水面 3 → 光柱 4 → 各类光晕 5 → 热点环 20。

## 14. 改动指引（最常用四类）

- **加/改机位**：`src/data.js` 的 `STATIONS`（`pos/look/mark` 三组同步）→ 如需进连拍，补 `tools/shoot.mjs` 的 `STATIONS` 数组 → `node tools/shoot.mjs <id>` 复核 → 界面文案（`index.html` 帮助里“6 处机位 + 空中鸟瞰”的说法）要跟着数对。
- **改桥的实尺**：只动 `src/data.js` 的 `BRIDGE`（`length/width/span/crownY/endY/archR/springerY/deckR`），桥身轮廓、券脸、栏板、桥灯、人流走道会自动跟上；`deckR/deckYc` 与 `crownY/endY` 是几何关系（反穹圆弧半径由孔顶与两岸标高定），别单独改。
- **调灯火密度或加一盏灯**：先在 `architecture.js` 找对应的 `anchors` 键 push 坐标，再到 `props.js` 的 `fillLanterns()` 给它尺寸/色/是否带光柱——不要在 `lanterns.js` 里硬写坐标。
- **改水面或倒影的观感**：水色在 `main.js`（`uDeep/uShallow` 覆盖处），波形在 `water.js` 顶点与片元的波数组合，倒影淡出范围在 `Wobble` 的 `smoothstep(-26,-1,·)`，光柱长度在 `props.js` 的 `columnDepth`。
