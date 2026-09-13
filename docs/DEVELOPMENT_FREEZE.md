# DEVELOPMENT FREEZE · 开发冻结声明

> **DEVELOPMENT_FREEZE = TRUE**
>
> 生效时间：2026-09-13
> 冻结判定窗口：`FINAL PRODUCT POLISH & DEVELOPMENT FREEZE`
> 冻结依据版本（FINAL_HEAD）：**`ce178a4`**
> 窗口起点（START_HEAD）：**`bdd36ab`**（正式美术封板点）

---

## 1. 当前版本状态

| 项 | 值 |
| --- | --- |
| 项目 | 《宵月秘藏 · The Veiled Moon Reliquary》 |
| 版本 | 0.1.0（package.json） |
| START_HEAD | `bdd36ab` |
| FINAL_HEAD（产品代码冻结点） | `ce178a4` |
| 冻结记录提交 | `274185b`（本声明 + 最终报告）、`dc03cff`（展示/QA 工具链入库） |
| 正式卡面 | **78 / 78**（月章 22 · 星签 56 · 宫廷 16） |
| Final Art Audit | **PASS** / Gate **A** |
| FINAL_ART_FREEZE | **YES** |
| 环境视觉系统 | **已完成**（`docs/ENVIRONMENT_VISUAL_SYSTEM.md`） |
| 核心流程 | 观星台 → 星屑 → 启封 → 魔女阁 → 详情，**全部完成且可玩** |
| PC / Mobile QA | 通过（1440×900 / 1280×720 / 390×844） |
| typecheck | 通过（`tsc --noEmit` 零错误） |
| tests | **27 / 27** 通过 |
| build | 通过（JS 291,067 B / gzip 97.81 KB；CSS 20,740 B / gzip 5.61 KB；78 张 SVG 独立发射） |
| Console | **0 error**（14 条路由 × 零错误） |
| Git | **clean** |

---

## 2. 冻结范围

冻结的是**产品行为与视觉基线**：

- 78 张正式卡面 SVG 及其渲染层（`CardArt` / `cardShapes` / `motifs` / `artwork` 登记表）
- 环境视觉系统（`environment.css` / `EnvironmentScene.tsx`）
- 全部页面布局与信息架构（主厅 / 观星台 / 启封 / 魔女阁 / 详情 / 星语 / 设置 / 关于）
- 游戏引擎与经济（`rng` / `economy` / `draw` / `collection` / `save` / `store`）
- 存档 schema v1

---

## 3. 冻结后允许的工作（白名单）

1. **P0 / P1 真实 Bug 修复** —— 崩溃、不可玩、数据损坏、可读性失效、真实兼容性问题
2. **比赛展示维护** —— 演示脚本、展示截图复拍、现场环境适配
3. **文档与说明材料** —— README、使用说明、架构说明、审计与原创性记录
4. **软著 / 展示材料制作** —— 截图候选素材、材料整理（不含「保证通过」类表述）
5. **必要兼容性修复** —— 浏览器 / 操作系统 / 分辨率导致的失效
6. **明确单独立项的未来版本** —— 必须重新立项、重走 STYLE_LOCK 与独立审计

---

## 4. 冻结后禁止的工作（黑名单）

不再接受「想到什么加什么」。以下一律不做：

- 加新小游戏 / 新卡池 / 第二套牌 / 卡牌升级 / 装备 / 战斗
- 加剧情 / 成就 / 任务 / 商店 / 养成 / 更多货币
- 加 PvP / 社交 / 排行榜 / 登录 / 云同步
- 加 NFT 新玩法 / 复杂 Web3 / 更多 AI 功能
- 重构既有架构、更换技术栈、调整抽牌概率与经济
- 修改 78 张正式卡面（`docs/FINAL_ART_FREEZE.md` 的红线）
- 执行 `docs/FINAL_ART_POLISH_BACKLOG.md` 中的任何条目（POST-v1）
- 公开部署 / 发布 Release / 提交软著 / 操作外部账号（需人工明确授权）

---

## 5. 这个项目的价值定位（冻结原因）

> 《宵月秘藏》的价值是
> **「完整、好玩、好懂、适合游园会展示的原创收藏小游戏」**，
> 不是长期 MMO。

因此：**完成度比功能数量重要。**
78 张原创卡面 + 一条闭环可玩链路 + 一套自洽的世界观环境，
已经构成一个完整作品；继续加功能的边际收益远低于它带来的风险。

---

## 6. 冻结的自检方式

任何人可独立复核本声明：

```bash
git log --oneline -3          # 应看到 ce178a4 为冻结提交
git status                    # 应 clean
npm run typecheck             # 零错误
npm test                      # 27/27
npm run build                 # 通过；dist 下 78 个卡面 SVG 独立发射
node .tools/qa-probe.mjs      # 横向溢出 / 焦点 / 环境层语义 / 对比度 / FPS 全绿
```

截图包复现方式见 `docs/SHOWCASE_CAPTURE_GUIDE.md`；
现场演示脚本见 `docs/COMPETITION_DEMO_FLOW.md`。

---

## 7. 完整的冻结凭证清单

| 凭证 | 文件 |
| --- | --- |
| 美术冻结 | `docs/FINAL_ART_FREEZE.md` |
| 资产清单（78 张逐张） | `docs/FINAL_ART_ASSET_MANIFEST.md` |
| 视觉审计索引 | `docs/ART_AUDIT_INDEX.md` |
| 原创性过程记录 | `docs/VISUAL_ORIGINALITY_RECORD.md` |
| 环境视觉规范 | `docs/ENVIRONMENT_VISUAL_SYSTEM.md` |
| 截图拍摄说明 | `docs/SHOWCASE_CAPTURE_GUIDE.md` |
| 比赛演示流程 | `docs/COMPETITION_DEMO_FLOW.md` |
| 可选打磨待办（不执行） | `docs/FINAL_ART_POLISH_BACKLOG.md` |
| 本窗口最终报告 | `docs/FINAL_PRODUCT_FREEZE_REPORT.md` |

---

**从此刻起，《宵月秘藏》进入只维护、不扩张的阶段。**
