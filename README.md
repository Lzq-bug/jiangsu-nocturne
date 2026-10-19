<div align="center">

# 夜泊江苏 · Jiangsu Nocturne

**装在浏览器里的江苏夜色收藏册。**
在观星台收集星屑，举行启封仪式，把 78 帧水韵江苏的夜色收进你的「夜泊阁」，
再走进 360° 全景，云夜游这方「月落乌啼霜满天」的土地。

**78 帧江苏夜景 · 3D 视差卡牌 · 30 座程序化 3D 场景 · 360° 全景夜游 · Local-first · React + TypeScript + Three.js + Vite**

</div>

---

## 项目简介

《夜泊江苏》是一款以 **江苏景点夜景 + VR 效果卡牌 + 收集玩法** 为核心的 Web 小游戏。

核心循环很简单：

**观星台捕星 → 获得星屑 → 启封一帧夜色 → 新帧入阁 / 重复补偿 → 推进 78 帧收藏 → 全景夜游**

项目不要求注册账号、不依赖任何 API Key、不联网也能完整游玩；存档保存在浏览器本地。

## 特色

- **78 帧江苏夜景**：22 张「城章」收录全省最具代表性的夜景地标（夫子庙秦淮画舫、拙政园夜园、瘦西湖五亭桥、金鸡湖东方之门、寒山寺枫桥、云龙湖苏公塔影……），56 张「夜签」按 **灯影 / 水岸 / 山寺 / 城垣** 四大夜色系列铺开，覆盖江苏 13 个设区市。
- **程序化夜景引擎**：每帧卡面与全景画面由 `src/ui/nightScene.ts` 实时生成——夜空渐变、月相、星野、十六种剪影母题（画舫、瓮城、宝塔、拱桥、灯塔、大佛、天际线……）、水面光晕与倒影，全部原创算法，无任何外部素材。
- **真实景点照片 + 程序化夜景双引擎**：已收录 22 处景点的真实夜景照片（加夜色调和层，与异形卡框融为一体），其余卡面由程序化夜景引擎实时生成兜底；照片按卡牌 id 命名存放于 `src/assets/photos/`，替换同名 jpg 即可换成你自己的旅行照片，来源清单见同目录 `CREDITS.tsv`。
- **VR 效果 · 三层呈现**：
  - **真 3D 卡牌**：投影 / 光晕 / 卡面 / 眩光多层空间视差，桌面指针倾斜跟随、移动端陀螺仪倾斜设备即转动视线，光影随视角实时变化；详情页点按卡牌可 3D 翻面，背面是羊皮纸「夜航手记」；
  - **360° 全景夜游**：详情页与「夜泊画廊」基于 Three.js 实时 3D 建模——按景点母题生成建筑体块、地标构筑物、灯笼光晕、水面倒影与星空月色的微城场景，透视相机立于场景中心，拖动/陀螺仪环顾四周，可全屏、可自动环游；
  - **28 座可走入的独立 3D 场景**：重点卡牌直接嵌入完整的独立 Three.js 夜景场景（源码见 [`scenes/`](scenes/)）——每个场景 6–12 个解说机位、热点导航、参数面板，还有敲钟、起灯、花信风、塔铃、推潮等专属互动，详见下文场景清单。
- **夜泊画廊**：22 张城章免费开放预览与全景夜游，点开即游——演示零门槛。
- **原创异形卡牌体系**：城章采用「月芒尖碑」轮廓，四系列夜签各自拥有独立外形语言。
- **启封仪式**：消耗星屑，在 12 枚封缄中亲手选择并点亮一帧夜色；概率先于动画确定，诚实可信。
- **Local-first**：核心玩法、抽牌、收藏、存档、导入导出均可在本地完成，无任何在线依赖。
- **响应式与无障碍**：Desktop / Mobile 均适配，支持 `prefers-reduced-motion` 与系统「减少动态效果」自动降级。

## 快速开始

```bash
npm install        # 或 pnpm install
npm run dev        # 开发预览 http://localhost:5173
npm run build      # 产出纯静态 dist/，可部署到任意静态服务器
npm run test       # vitest 单元测试
```

运行环境：现代浏览器（Chrome / Edge / Firefox / Safari 最新版），Node.js ≥ 18（推荐 22 LTS）。无插件、无后端、无 API Key。

## 3D 场景源码（`scenes/`）

[`scenes/`](scenes/) 收录全部 30+ 座独立 3D 夜景场景的完整源码：每座场景都是一个零运行时依赖的 Three.js 程序化重建项目——建筑、水体、灯火、星空全部用基础几何体与原创着色实时生成，构建后是单个可直接离线打开的 HTML 文件。场景内含多解说机位、热点导航、参数面板与专属互动（敲钟、起灯、廿四番花信风、慈寿塔风铎、串场河推潮、四季月色换挡等）。

### 场景清单

**主应用已嵌入**（详情页点开即游）：

| 场景 | 目录 / 入口 | 嵌入卡牌 |
|---|---|---|
| 夫子庙 · 秦淮画廊 | `scenes/`（根项目 `npm run build`） | major-0 |
| 平江路 · 灯河夜巷 | `scenes/`（`npm run build:pingjiang`） | major-3 |
| 瘦西湖 · 五亭桥月 | `scenes/src/sxh/`（`npm run build:sxh`） | major-6 |
| 金鸡湖 · 湖光门影 | `scenes/gate/`（`npm run build:gate`） | major-4 |
| 台城明城墙 · 湖山入城 | `scenes/src/tc/`（`npm run build:taicheng`） | minor-pentacles-1 |
| 寒山寺 · 枫桥夜泊 | `scenes/hanshan/` | major-5 |
| 中华门 · 瓮城灯阵 | `scenes/zhonghua/` | major-1 |
| 金山寺 · 江天灯火 | `scenes/jinshan/` | major-11 |
| 连岛 · 开渔夏夜 | `scenes/liandao/` | major-15 |
| 朝天宫 · 金陵文庙 | `scenes/zhonghua/chaotian-palace/` | minor-pentacles-3 |
| 沧浪亭 · 清风明月 | `scenes/canglang/` | minor-pentacles-5 |
| 二分明月楼 · 一园明月 | `scenes/mingyue/` | minor-pentacles-10 |
| 海春轩塔 · 一塔两朝 | `scenes/haichun/` | minor-swords-14 |
| 篦箕巷 · 运河灯巷 | `scenes/biji/` | minor-pentacles-7 |
| 大报恩寺 · 琉璃塔夜必灯 | `scenes/baoen/` | minor-swords-12 |
| 惠山古镇 · 二泉灯影 | `scenes/huishan/` | minor-pentacles-2 |
| 小娄巷 · 一巷明月 | `scenes/xiaolou/` | minor-pentacles-6 |
| 梦溪园巷 · 泉声灯影 | `scenes/mengxi/` | minor-pentacles-8 |
| 盘门三景 · 运河夜阑 | `scenes/panmen/` | minor-pentacles-4 |
| 清名桥 · 运河灯河 | `scenes/qingming/` | major-8 |
| 东关街 · 灯火长街 | `scenes/dongguan/` | major-7 |
| 个园 · 一园四季 | `scenes/geyuan/` | minor-pentacles-9 |
| 南通博物苑 · 濠河夜月 | `scenes/nantong/` | minor-pentacles-12 |
| 三台山 · 衲田花信 | `scenes/santai/` | minor-swords-13 |
| 安丰古镇 · 串场河夜潮 | `scenes/anfeng/` | minor-pentacles-14 |

**仅随主应用分发构建产物、源码暂缺**：镇淮楼 · 谯楼更鼓（`public/pano/zhenhuailou.html`，minor-pentacles-13）、网师园 · 夜花园（`wangshiyuan.html`，minor-pentacles-11）、鼋头渚 · 太湖灯塔（`taihu.html`，major-9）。

**持续接入中**（源码已就绪，尚未挂入卡牌）：北固山 `scenes/beigu/`、花果山 `scenes/huaguo/`、狼山 `scenes/langshan/`、甪直 `scenes/luzhi/`、周庄 `scenes/zhouzhuang/`、同里 `scenes/tongli/`、茅山 `scenes/maoshan/`、云龙山 `scenes/yunlong/`、文笔塔 `scenes/wenbi/`、南京长江大桥 `scenes/njbridge/`。

### 场景构建

每个子目录都是独立项目（含本地 `vendor/` Three.js，离线可构建）：

```bash
cd scenes/haichun
npm install        # 多数场景零依赖,可跳过
node tools/build-single.mjs 或按各项目 package.json 的 build 脚本
# 产出 dist/单个 HTML 文件,双击即可离线游览
```

根项目（夫子庙/平江路/瘦西湖/金鸡湖/台城五入口共用构建系统）：

```bash
cd scenes
npm run build        # 夫子庙
npm run build:sxh    # 瘦西湖
npm run build:gate   # 金鸡湖
# 全部入口:npm run build:all
```

## 仓库结构

```
├── src/                  # 主应用:页面/卡牌/收藏/启封/3D 全景引擎
│   ├── assets/photos/    # 22 处景点真实夜景照片(+ CREDITS.tsv 来源清单)
│   └── ui/               # VrCard 真 3D 卡牌 / PanoView 全景 / nightScene 程序化夜景
├── public/pano/          # 嵌入主应用的场景单文件(构建产物)
├── scenes/               # 30+ 座独立 3D 场景完整源码(见上)
├── docs/                 # 参赛材料
└── .tools/               # 截图与 QA 脚本(可复现视觉验证)
```

## 技术栈

React 18 · TypeScript · Vite 6 · zustand · Three.js（30+ 座程序化夜景场景）· CSS 3D（视差卡牌与全景圆柱投影）· Web Audio（程序化音效）· Vitest

## 参赛材料

本作品参加「全国大学生数字媒体科技作品及创意竞赛」，材料见 [docs/参赛材料.md](docs/参赛材料.md)。

## 许可

仅供学习与竞赛展示使用。
