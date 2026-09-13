# 宵月秘藏 · The Veiled Moon Reliquary

一册可以玩的魔女档案：**78 封「星之遗言」**（22 张月章大牌 + 56 张星签小牌）封存在旧银圣物匣中。在观星台攒下星屑，在启封仪式上亲手破开火漆，把每一张牌连同它的神谕、象征与魔女批注，收进只属于你的**魔女阁**。

> 本项目前身为一次 5.5 小时黑客松 Demo（「星月占卜」）。vNext 版本按《仓库代码接管审计报告》与《宵月秘藏原创卡牌视觉体系设计文档》完成重构：**保留产品资产，重写工程骨架**。

---

## 它是什么

- 一个**无需任何账号、密钥、联网服务即可完整游玩**的塔罗收藏小游戏；
- 一个**去原神化**的原创视觉体系（月芒尖碑轮廓 / 四花色异形 / 旧银掐丝 + 火漆 + 羊皮手记）；
- AI 占卜、语音、链上铸造全部为**可选能力**，缺席时优雅降级。

核心循环：**观星台捕星 → 攒星屑 → 启封仪式（扇形封缄亲手翻开）→ 新牌入阁 / 重复补偿 → 图鉴推进**。

## 快速开始

```bash
pnpm install      # 或 npm install
pnpm dev          # 开发模式 → http://localhost:5173
pnpm test         # 单元测试（数据完整性 / 抽牌引擎 / 存档 / 结算）
pnpm build        # 类型检查 + 生产构建 → dist/
pnpm preview      # 预览生产构建
```

环境要求：Node.js ≥ 20。包管理器使用 pnpm（仓库含 pnpm-lock.yaml；npm 亦可安装）。

## 不配置任何 API 时能玩什么

**全部核心内容**：观星台小游戏、启封抽牌、概率与保底、78 张牌图鉴、卡牌详情三层文案、本地星语解读、存档与导入导出。什么都不配置，游戏 100% 可玩。

## 如何启用 AI（完全可选）

「星语」页面默认使用本地牌义解读。若想获得个性化 AI 解读：

1. 前往 [DeepSeek 开放平台](https://platform.deepseek.com) 创建 API Key；
2. 打开应用「设置」页，填入 Key（仅保存在本机浏览器 localStorage）；
3. 回到「星语」提问即可。开发模式下 `/__api` 由 Vite 代理转发；生产部署需自行配置同源反向代理（见下）。

也可复制 `.env.example` 为 `.env.local` 预填 `VITE_DEEPSEEK_API_KEY`（可选）。

## 语音与 Web3 是否可用

- **语音（ASR/TTS）**：本轮保留接口契约（`src/services/capabilities.ts`），未接入运行时。原实现的阿里云百炼代理依赖本地进程与密钥，将在后续版本按 `VoiceCapability` 契约回归。
- **链上收藏（Monad NFT）**：实验性可选能力。ERC-721 合约、Hardhat 测试与部署脚本完整归档于 `mingrate/monad-nft-card-demo/`（原样保留、未参与前端构建）。核心玩法永不依赖钱包。

## 项目目录

```
├─ index.html
├─ public/favicon.svg
├─ src/
│  ├─ main.tsx / app/            # 入口与路由（React 18 + react-router v7）
│  ├─ pages/                     # 主厅 / 观星台 / 启封 / 魔女阁 / 详情 / 星语 / 设置 / 关于
│  ├─ components → ui/           # 卡牌 SVG 视觉系统（CardArt / motifs / cardShapes）
│  ├─ tarot/
│  │  ├─ types.ts                # 卡牌类型
│  │  └─ data/                   # 78 张牌数据源（22 月章全文案 + 56 星签生成）
│  ├─ game/                      # 纯逻辑引擎：rng / economy / draw / collection / save / minigame
│  │  └─ store.ts                # zustand 全局状态（唯一写入口，自动持久化）
│  ├─ services/
│  │  ├─ ai/oracle.ts            # 可选星语 AI（DeepSeek 兼容）+ 本地解读
│  │  └─ capabilities.ts         # 语音 / Web3 能力契约（本轮为 stub）
│  ├─ audio/AudioService.ts      # 程序化音频三总线（master/bgm/sfx）
│  └─ styles/global.css          # 设计令牌与全局样式
├─ docs/
│  ├─ ARCHITECTURE.md            # 架构说明
│  └─ AUTONOMOUS_DEVELOPMENT_REPORT.md
└─ mingrate/                     # 旧黑客松子项目归档（不参与构建，供追溯与未来接入）
```

## 存档

- 位置：浏览器 `localStorage`，键 `veiled-moon.save.v1`；
- 内容：星屑、图鉴（每张牌的获得次数与首末时间）、保底计数、观星统计、设置；
- 带版本号可迁移；损坏时自动回退默认档，绝不崩溃；
- 「设置」页支持**导出 / 导入 JSON 存档**与一键重置。

## 78 张牌体系

- **月章（22）**：愚者 0 — 世界 XXI，名称沿用传统大阿卡纳；每张拥有独立的轮廓变奏、主光色、纹章母题与三层原创文案（神谕句 / 象征解读 / 魔女手记）。
- **星签（56）**：权杖·火 / 圣杯·水 / 宝剑·风 / 星币·土 × (A, 2–10, 侍从, 骑士, 王后, 国王)；数字牌以「星座连线 pip」呈现，四花色各有异形轮廓（火熜 / 圣爵 / 剑锋 / 环璧）。

## 原创性声明

卡牌名称体系属于公共领域的传统塔罗；轮廓系统、边框与装饰语言、全部卡面图形（程序化 SVG）、文案、配色与界面均为本项目原创，不含任何第三方游戏的可视资产，不构成对任何现有 IP 的换皮复刻（详见「关于」页与设计文档的《去原神化审查》章节）。

## 主要依赖

运行时：`react` / `react-dom` / `react-router-dom` / `zustand`（合计 gzip 后约 91KB）。
开发：`vite` / `typescript`(strict) / `vitest` / `jsdom` / `@vitejs/plugin-react`。无 UI 框架库、无图表库、无付费服务 SDK。
