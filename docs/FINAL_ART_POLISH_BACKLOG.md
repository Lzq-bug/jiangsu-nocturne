# FINAL ART POLISH BACKLOG · 正式卡面可选打磨候选

> **状态：OPTIONAL / NON-BLOCKING / POST-v1**
>
> 本清单仅记录「如果有未来版本再考虑」的候选，**当前不执行**。
> 78 张正式卡面已冻结（见 `docs/FINAL_ART_FREEZE.md`，`FINAL_ART_FREEZE = YES`）。
> 任何条目都不构成 Bug，也不阻塞发布、比赛展示、说明书与软著材料。

---

## 执行约束

| 约束 | 说明 |
| --- | --- |
| 本窗口执行数 | **0**（零修改） |
| 优先级 | 全部 OPTIONAL |
| 是否阻塞 | 全部 NON-BLOCKING |
| 目标版本 | POST-v1（若未来单独立项） |
| 前置条件 | 必须单独立项 + 重新走 STYLE_LOCK + 重新审计，不得顺手改 |

---

## 候选 8 张

| # | 牌 | cardId | 资产文件 | 观察 | 建议方向（若未来立项） |
| --- | --- | --- | --- | --- | --- |
| 1 | 圣杯侍从 | `minor-cups-11` | `minor-cups-11.svg` | 宫廷四侍从中最接近「常规构图」，识别锚略弱于其余三侍从 | 加强单一动作或道具指向性 |
| 2 | 圣杯王后 | `minor-cups-13` | `minor-cups-13.svg` | 与圣杯国王在 96px 缩略图下同族感偏强 | 拉开重心 / 光源方位差异 |
| 3 | 星币七 | `minor-pentacles-7` | `minor-pentacles-7.svg` | 画面元素密度偏高，缩略图下细节互相压暗 | 削减次级元素，强化唯一叙事锚 |
| 4 | 圣杯九 | `minor-cups-9` | `minor-cups-9.svg` | 主体（多杯聚合）在 96px 下边界不锐 | 提升杯体主笔画的冷白对比 |
| 5 | 宝剑侍从 | `minor-swords-11` | `minor-swords-11.svg` | 冷白锋线与背景风痕对比偏弱 | 提高锋线亮度或压低背景 |
| 6 | 星币六 | `minor-pentacles-6` | `minor-pentacles-6.svg` | 双人/多手关系在小尺寸下不易读出 | 拉开两人间距，明确朝向 |
| 7 | 星币国王 | `minor-pentacles-14` | `minor-pentacles-14.svg` | **Pilot 资产（最早 8 张之一）**，装饰纹样 + 拱龛风格与后续 70 张的「低照度秘仪场景」存在可感知代差（见 `ART_PRODUCTION_SESSION_04_REPORT.md` §172） | 若未来立项，按 STYLE_LOCK v1 重绘牌内画面 |
| 8 | 圣杯国王 | `minor-cups-14` | `minor-cups-14.svg` | 与圣杯王后为同族近邻，需与 #2 成对处理 | 与 #2 一并拉开差异 |

---

## 明确不做的事

- 不为这 8 张修改任何 SVG 文件；
- 不为它们重跑审计窗口；
- 不在「顺手」的借口下扩大范围；
- 不因本清单的存在而推迟 DEVELOPMENT_FREEZE。

如果未来确实立项，应先重新执行：

1. `docs/CARD_ART_STYLE_LOCK.md` 基线确认
2. `docs/CARD_ART_MOTIF_BUDGET.md` 母题配额复核
3. `docs/CARD_ART_COMPOSITION_LEDGER.md` 构图查重
4. `docs/COURT_CARD_ANTI_TEMPLATE_PROTOCOL.md`（涉及宫廷时）
5. 独立审计窗口（避免自我抄自己）

以上 5 步全部完成前，本清单条目保持 **未执行** 状态。
