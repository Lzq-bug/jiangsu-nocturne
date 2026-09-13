# FINAL ART FREEZE · 正式卡面美术冻结记录

> 本文件记录《宵月秘藏》78 张正式卡面美术的**冻结事实**。
> 冻结后，正式卡面不再日常修改。

## 1. 冻结结论

| 项 | 值 |
| --- | --- |
| ARTWORK_COUNT | **78 / 78** |
| Major Arcana（月章） | **22 / 22** |
| Minor Arcana（星签） | **56 / 56** |
| Court Cards（宫廷） | **16 / 16** |
| Final Art Audit | **PASS** |
| Gate | **A** |
| FINAL_ART_FREEZE | **YES** |
| Final HEAD（冻结前缀） | **`bdd36ab`** |
| 冻结日期 | 2026-09-13 |

## 2. 冻结内容

冻结范围 = **78 个正式卡面 SVG 资产** + 卡面渲染层：

- `src/assets/cards/major/*.svg`（22）
- `src/assets/cards/minor/*.svg`（56）
- `src/tarot/artwork.ts`（78 张登记表）
- `src/ui/CardArt.tsx`（牌框 / 月窗铭号 / 真名带 / 火漆星印 / 台座）
- `src/ui/cardShapes.ts`（月章与星签的外轮廓、台座、双环璧、世界环）
- `src/ui/motifs.tsx`（无正式插画时的程序化纹章兜底）

## 3. 冻结后的修改红线

**允许**（必须同时满足「真实缺陷 + 最小改动」）：

1. 真实渲染 Bug（牌面被裁切、路径损坏、SVG 解析错误）
2. 错误资源（错牌、错文件、错登记）
3. 资源损坏 / 加载失败
4. 浏览器兼容问题（Safari / Chromium 渲染差异导致的不可读）

**禁止**：

- 为了视觉收口重新绘制任何一张牌
- 因「更好看一点」修改卡面构图、明度、配色、纹样
- 执行 `docs/FINAL_ART_POLISH_BACKLOG.md` 中的任何条目（那 8 张为 OPTIONAL / NON-BLOCKING / POST-v1）
- 借卡面修改之机改动卡牌结构或抽牌表现

## 4. 冻结的验证方式

```bash
git rev-parse HEAD            # 应以 bdd36ab 为冻结基线（其后仅允许文档 / 环境层提交）
npm run typecheck             # 卡面登记表类型一致性
npm test                      # src/tarot/artwork.test.ts：登记表 = 78、逐张资产存在、无多余登记
npm run build                 # dist 下独立发射 78 个卡面 SVG（assetsInlineLimit: 0）
```

`src/tarot/artwork.test.ts` 是资产完整性的机器门禁：任何漏登记、错文件、多余条目都会让测试变红。

## 5. 与后续窗口的关系

- 本文件是 `docs/FINAL_ART_ASSET_MANIFEST.md` 的冻结声明，
  manifest 是同一批资产的逐张明细。
- 历史审计过程见 `docs/ART_AUDIT_INDEX.md`。
- 原创性过程事实见 `docs/VISUAL_ORIGINALITY_RECORD.md`。
- 2026-09-13 的 `FINAL PRODUCT POLISH & DEVELOPMENT FREEZE` 窗口**零修改** 78 张正式 SVG，
  仅整合了页面级环境视觉（`docs/ENVIRONMENT_VISUAL_SYSTEM.md`）。
