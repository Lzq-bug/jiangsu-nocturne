# 架构说明 · ARCHITECTURE

> 本文档描述 vNext 基线的游戏状态、卡牌数据、抽取逻辑、存档、UI 与可选服务适配层。

## 1. 总览

```
┌────────────────────────── 浏览器 ──────────────────────────┐
│  React SPA（react-router v7 路由）                          │
│   pages/  ──只读渲染──▶  game/store.ts (zustand)           │
│      │                        │  唯一状态写入口              │
│      │                        ▼                             │
│      │                 game/*（纯函数引擎）                  │
│      │        rng · economy · draw · collection · save      │
│      │                        │                              │
│      ▼                        ▼ debounce 250ms              │
│   ui/（卡牌 SVG）            localStorage save v1           │
│                                                             │
│   services/ai（可选）     services/capabilities（stub）      │
│   audio/AudioService（程序化三总线）                         │
└──────────────────────────────────────────────────────────────┘
```

原则：**引擎无 DOM**（全部纯函数、可单测）；**store 是唯一写入口**；**外部服务永不持有游戏状态写权限**。

## 2. 游戏状态（store）

`src/game/store.ts`（zustand）持有：

| 字段 | 说明 |
| --- | --- |
| `stardust` | 星屑（唯一消耗资源），初始 60 |
| `totalDraws` / `sinceLastNew` | 累计启封次数 / 距上次新卡的次数（保底计数） |
| `collection` | `Record<cardId, { count, firstAt, lastAt }>` |
| `stats` | 观星台统计（局数 / 累计捕星 / 单局最佳） |
| `settings` | 音量三总线、静音、减少动效、星语 AI 配置 |
| `lastUnseal` | 最近一次启封结果（供仪式动画展示） |

写操作：`unseal()`、`finishStarCatch()`、`updateSettings()`、`importSaveJson()`、`resetSave()`。
每次写后 250ms 防抖持久化到 localStorage。

## 3. 卡牌数据

- `src/tarot/types.ts`：`MajorCardData` / `MinorCardData` 判别联合；大牌含轮廓变奏参数 `MajorShapeSpec`。
- `src/tarot/data/majors.ts`：22 张月章手写全文案（oracle / interpretation / note 三层，长度经单测约束 80–220 字）。
- `src/tarot/data/minorSource.ts`：花色元数据 + 每花色 14 等级关键词（数据迁移自旧 Demo `deck.ts` 的纯数据资产）+ 宫廷牌手工批注。
- `src/tarot/data/minors.ts`：由素材源生成 56 张星签。
- `src/tarot/data/index.ts`：总集 `ALL_CARDS`（78）与查询；`deck.test.ts` 保证数量/唯一性/命名/文案完整性。

## 4. 抽取逻辑（draw）

`src/game/draw.ts` — 纯函数 `rollDraw(rng, { owned, sinceLastNew })`：

1. **收集保护（保底）**：`sinceLastNew + 1 ≥ 10` 且存在未拥有卡 → 强制从未拥有池按权重抽取，`pityTriggered = true`；
2. 否则按 **月章 25 / 星签 75** 决定级别；
3. 级内按权重抽取：未拥有卡权重 ×2（`unownedBoost`，缓解后期死重复）；
4. 重复卡由 store 层补偿 `+8 星屑`。

随机性：`mulberry32` 种子化 RNG（`src/game/rng.ts`），同种子结果确定、可测试；运行期种子来自时间与 `Math.random` 异或。**概率与 UI 动画、LLM 完全无关**：结果在动画开始前即由引擎生成并已写入存档，扇形翻牌只是揭晓仪式。

## 5. 经济（economy）

`src/game/economy.ts` 集中所有数值：启封 30 ✦ / 重复补偿 8 ✦ / 保底阈值 10 / 权重 25:75（级内未拥有 ×2）/ 观星结算（星屑星 2、金星 6、单局满 20 颗 +10）。调平衡只改这一个文件，单测同步覆盖。

## 6. 观星台小游戏（starcatch）

`src/game/minigame/starcatch.ts` 为纯逻辑（生成 / 漂移 / 过期 / 结算）；页面 `StarCatchPage` 负责表现：

- 星星是真实 `<button>`（可聚焦），位置由 rAF 直接写 transform（不走 React 重渲染）；
- **模拟与渲染分离**：`setInterval(300ms)` 心跳兜底执行生成/计时/结算——即使 rAF 被暂停（切标签页、省电、自动化环境），一局也会在真实时间到达后正确结束并入账；
- `settings.reducedMotion` 时切换为静立星阵（固定坐标），键盘可达。

## 7. 存档（save）

`src/game/save.ts`：

- `SAVE_VERSION = 1`；`parseSave()` 永不抛错——损坏 JSON / 非法字段逐项 sanitize 回落默认；
- `migrateV0()` 演示版本迁移路径，后续版本在 `parseSave` 内续写 migration 链；
- 导出 = `JSON.stringify`；导入 = `parseSave` + 版本校验。
- 测试覆盖：roundtrip / 损坏回退 / 字段修补 / v0 迁移 / persist+load。

## 8. UI 与视觉系统

- 路由页：`/`（主厅）`/starcatch` `/unseal` `/collection` `/card/:id` `/starwhisper` `/settings` `/about`。
- 卡牌全部为程序化 SVG（零图片素材）：
  - `ui/cardShapes.ts`：月芒尖碑参数化路径（tilt / steps / wing / side / inverted / 环带）+ 四花色异形（火熜 / 圣爵 / 剑锋 / 环璧）；
  - `ui/motifs.tsx`：22 张月章纹章母题（每张独立绘制）；
  - `ui/CardArt.tsx`：月章 / 星签 / 封缄三种渲染；月窗铭号、星轨饰带、真名带、火漆星印均在牌内。
- 设计令牌集中在 `styles/global.css` `:root`（玄夜靛 / 旧银 / 月金限量 / 花色四色 / 羊皮纸 / 火漆红）。
- 去原神化要点：框体哑光（发光只在牌面叙事光源）、无星云渐变背景、未获得=火漆封缄空匣、文案区为双栏手记而非左竖线诗体。详见《宵月秘藏》设计文档第六章。

## 9. 可选服务适配层

| 能力 | 状态 | 契约 |
| --- | --- | --- |
| 星语 AI | 已接（可选） | `services/ai/oracle.ts`：`localReading()` 本地解读 + `whisperWithAI()` DeepSeek 兼容 chat/completions；失败自动降级本地。LLM 只产文本，无任何游戏状态写权限 |
| 语音 ASR/TTS | stub | `services/capabilities.ts#VoiceCapability`；旧实现（阿里云百炼 + 本地代理）归档于 Git 历史与 mingrate，后续按契约回归 |
| Web3 NFT | stub | `services/capabilities.ts#Web3Capability`；合约与脚本归档于 `mingrate/monad-nft-card-demo/` |

星语页的指引抽牌**免费且不写图鉴**（避免刷取漏洞）；启封仪式的抽牌才消耗星屑并入阁。

## 10. 音频

`audio/AudioService.ts`：master/bgm/sfx 三总线，全部 Web Audio 程序化合成（无素材文件）；首个用户手势解锁；音量持久化于存档 `settings`；氛围音为双失谐正弦垫 + LFO 呼吸。

## 11. 构建与质量门禁

- `pnpm build` = `tsc --noEmit`（strict 全开）+ `vite build`；
- `pnpm test` = Vitest（node 环境，jsdom 按文件切换），22 用例覆盖数据完整性、抽牌确定性/权重/保底、图鉴、结算公式、存档 roundtrip/损坏/迁移、store 集成；
- 生产包：JS ≈ 266KB（gzip 91KB）、CSS ≈ 14KB（gzip 4KB），无 >500KB 警告。

## 12. 生产部署

纯静态 SPA：`dist/` 可托管于任意静态服务器 / CDN / Nginx。若启用星语 AI，需在同源配置 `/__api/*` → `https://api.deepseek.com/*` 的反向代理（带 Key 的请求由浏览器发起，代理只做转发与 CORS 规避）。
