# FINAL ART ASSET MANIFEST · 正式美术资产清单

> 本文件由 `src/tarot/data`（卡牌元数据）、`src/assets/cards`（正式 SVG 文件）
> 与 `src/tarot/artwork.ts`（卡面登记表）交叉核对生成，为唯一权威资产清单。

| 项 | 值 |
| --- | --- |
| ARTWORK_COUNT | **78** |
| Major Arcana | **22 / 22** |
| Minor Arcana | **56 / 56** |
| Court Cards | **16 / 16** |
| 资产总体积 | **367.0 KB**（375801 B） |
| 状态 | 全部 **FROZEN** |
| 缺失 / 未登记 | **0** |

- 所有卡面均为**原创程序化 SVG**（手写矢量指令，无位图、无外部素材、无 AI 生成图）。
- 构建期 `vite.config.ts` 设 `assetsInlineLimit: 0`，78 张 SVG **一律独立发射为文件**，
  不内联进 JS，保证可缓存与懒加载。
- 本清单标记的「生产阶段」对应 `docs/ART_PRODUCTION_SESSION_0*.md` 与 `src/tarot/artwork.ts` 中的批次注释。

## 78 张正式卡面

| # | id | 中文 | EN | Arcana | Suit | Rank | Court | SVG 文件 | 体积 | 生产阶段 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `major-0` | 愚者 | The Fool | Major | — | 第 1 席 | — | `major-00-the-fool.svg` | 5.7 KB | 正式试制 8 张 | FROZEN |
| 2 | `major-1` | 魔术师 | The Magician | Major | — | 第 2 席 | — | `major-01-the-magician.svg` | 5.1 KB | Batch 01 | FROZEN |
| 3 | `major-2` | 女祭司 | The High Priestess | Major | — | 第 3 席 | — | `major-02-the-high-priestess.svg` | 4.4 KB | Batch 01 | FROZEN |
| 4 | `major-3` | 女皇 | The Empress | Major | — | 第 4 席 | — | `major-03-the-empress.svg` | 4.1 KB | Batch 02 | FROZEN |
| 5 | `major-4` | 皇帝 | The Emperor | Major | — | 第 5 席 | — | `major-04-the-emperor.svg` | 4.0 KB | Batch 02 | FROZEN |
| 6 | `major-5` | 教皇 | The Hierophant | Major | — | 第 6 席 | — | `major-05-the-hierophant.svg` | 3.7 KB | Batch 03 | FROZEN |
| 7 | `major-6` | 恋人 | The Lovers | Major | — | 第 7 席 | — | `major-06-the-lovers.svg` | 5.4 KB | 正式试制 8 张 | FROZEN |
| 8 | `major-7` | 战车 | The Chariot | Major | — | 第 8 席 | — | `major-07-the-chariot.svg` | 4.4 KB | Batch 03 | FROZEN |
| 9 | `major-8` | 力量 | Strength | Major | — | 第 9 席 | — | `major-08-strength.svg` | 4.3 KB | Batch 04 | FROZEN |
| 10 | `major-9` | 隐士 | The Hermit | Major | — | 第 10 席 | — | `major-09-the-hermit.svg` | 3.9 KB | Batch 04 | FROZEN |
| 11 | `major-10` | 命运之轮 | Wheel of Fortune | Major | — | 第 11 席 | — | `major-10-wheel-of-fortune.svg` | 4.4 KB | Batch 05 | FROZEN |
| 12 | `major-11` | 正义 | Justice | Major | — | 第 12 席 | — | `major-11-justice.svg` | 3.5 KB | Batch 05 | FROZEN |
| 13 | `major-12` | 倒吊人 | The Hanged Man | Major | — | 第 13 席 | — | `major-12-the-hanged-man.svg` | 4.0 KB | Batch 06 | FROZEN |
| 14 | `major-13` | 死神 | Death | Major | — | 第 14 席 | — | `major-13-death.svg` | 6.0 KB | 正式试制 8 张 | FROZEN |
| 15 | `major-14` | 节制 | Temperance | Major | — | 第 15 席 | — | `major-14-temperance.svg` | 4.1 KB | Batch 06 | FROZEN |
| 16 | `major-15` | 恶魔 | The Devil | Major | — | 第 16 席 | — | `major-15-the-devil.svg` | 4.0 KB | Batch 07 | FROZEN |
| 17 | `major-16` | 高塔 | The Tower | Major | — | 第 17 席 | — | `major-16-the-tower.svg` | 4.1 KB | Batch 07 | FROZEN |
| 18 | `major-17` | 星星 | The Star | Major | — | 第 18 席 | — | `major-17-the-star.svg` | 3.9 KB | Batch 08 | FROZEN |
| 19 | `major-18` | 月亮 | The Moon | Major | — | 第 19 席 | — | `major-18-the-moon.svg` | 3.5 KB | Batch 08 | FROZEN |
| 20 | `major-19` | 太阳 | The Sun | Major | — | 第 20 席 | — | `major-19-the-sun.svg` | 5.7 KB | Batch 09 | FROZEN |
| 21 | `major-20` | 审判 | Judgement | Major | — | 第 21 席 | — | `major-20-judgement.svg` | 4.8 KB | Batch 09 | FROZEN |
| 22 | `major-21` | 世界 | The World | Major | — | 第 22 席 | — | `major-21-the-world.svg` | 6.2 KB | 正式试制 8 张 | FROZEN |
| 23 | `minor-wands-1` | 权杖王牌 | Ace of Wands | Minor | 权杖 | 王牌 | — | `minor-wands-1.svg` | 4.4 KB | 正式试制 8 张 | FROZEN |
| 24 | `minor-wands-2` | 权杖二 | Two of Wands | Minor | 权杖 | 数字 2 | — | `minor-wands-2.svg` | 3.9 KB | Batch 01 | FROZEN |
| 25 | `minor-wands-3` | 权杖三 | Three of Wands | Minor | 权杖 | 数字 3 | — | `minor-wands-3.svg` | 3.4 KB | Batch 03 | FROZEN |
| 26 | `minor-wands-4` | 权杖四 | Four of Wands | Minor | 权杖 | 数字 4 | — | `minor-wands-4.svg` | 4.3 KB | Batch 05 | FROZEN |
| 27 | `minor-wands-5` | 权杖五 | Five of Wands | Minor | 权杖 | 数字 5 | — | `minor-wands-5.svg` | 3.4 KB | Batch 07 | FROZEN |
| 28 | `minor-wands-6` | 权杖六 | Six of Wands | Minor | 权杖 | 数字 6 | — | `minor-wands-6.svg` | 4.8 KB | Batch 09 | FROZEN |
| 29 | `minor-wands-7` | 权杖七 | Seven of Wands | Minor | 权杖 | 数字 7 | — | `minor-wands-7.svg` | 4.4 KB | Batch 10 | FROZEN |
| 30 | `minor-wands-8` | 权杖八 | Eight of Wands | Minor | 权杖 | 数字 8 | — | `minor-wands-8.svg` | 3.7 KB | Batch 11 | FROZEN |
| 31 | `minor-wands-9` | 权杖九 | Nine of Wands | Minor | 权杖 | 数字 9 | — | `minor-wands-9.svg` | 4.6 KB | Batch 12 | FROZEN |
| 32 | `minor-wands-10` | 权杖十 | Ten of Wands | Minor | 权杖 | 数字 10 | — | `minor-wands-10.svg` | 4.7 KB | Batch 13 | FROZEN |
| 33 | `minor-wands-11` | 权杖侍从 | Page of Wands | Minor | 权杖 | 侍从 | Y | `minor-wands-11.svg` | 5.2 KB | Batch 15 | FROZEN |
| 34 | `minor-wands-12` | 权杖骑士 | Knight of Wands | Minor | 权杖 | 骑士 | Y | `minor-wands-12.svg` | 5.5 KB | Batch 16 | FROZEN |
| 35 | `minor-wands-13` | 权杖王后 | Queen of Wands | Minor | 权杖 | 王后 | Y | `minor-wands-13.svg` | 4.9 KB | Batch 17 | FROZEN |
| 36 | `minor-wands-14` | 权杖国王 | King of Wands | Minor | 权杖 | 国王 | Y | `minor-wands-14.svg` | 5.2 KB | Batch 18 | FROZEN |
| 37 | `minor-cups-1` | 圣杯王牌 | Ace of Cups | Minor | 圣杯 | 王牌 | — | `minor-cups-1.svg` | 3.9 KB | Batch 13 | FROZEN |
| 38 | `minor-cups-2` | 圣杯二 | Two of Cups | Minor | 圣杯 | 数字 2 | — | `minor-cups-2.svg` | 4.8 KB | 正式试制 8 张 | FROZEN |
| 39 | `minor-cups-3` | 圣杯三 | Three of Cups | Minor | 圣杯 | 数字 3 | — | `minor-cups-3.svg` | 4.3 KB | Batch 01 | FROZEN |
| 40 | `minor-cups-4` | 圣杯四 | Four of Cups | Minor | 圣杯 | 数字 4 | — | `minor-cups-4.svg` | 4.1 KB | Batch 03 | FROZEN |
| 41 | `minor-cups-5` | 圣杯五 | Five of Cups | Minor | 圣杯 | 数字 5 | — | `minor-cups-5.svg` | 4.3 KB | Batch 05 | FROZEN |
| 42 | `minor-cups-6` | 圣杯六 | Six of Cups | Minor | 圣杯 | 数字 6 | — | `minor-cups-6.svg` | 3.8 KB | Batch 07 | FROZEN |
| 43 | `minor-cups-7` | 圣杯七 | Seven of Cups | Minor | 圣杯 | 数字 7 | — | `minor-cups-7.svg` | 5.6 KB | Batch 09 | FROZEN |
| 44 | `minor-cups-8` | 圣杯八 | Eight of Cups | Minor | 圣杯 | 数字 8 | — | `minor-cups-8.svg` | 5.3 KB | Batch 10 | FROZEN |
| 45 | `minor-cups-9` | 圣杯九 | Nine of Cups | Minor | 圣杯 | 数字 9 | — | `minor-cups-9.svg` | 5.4 KB | Batch 11 | FROZEN |
| 46 | `minor-cups-10` | 圣杯十 | Ten of Cups | Minor | 圣杯 | 数字 10 | — | `minor-cups-10.svg` | 5.8 KB | Batch 12 | FROZEN |
| 47 | `minor-cups-11` | 圣杯侍从 | Page of Cups | Minor | 圣杯 | 侍从 | Y | `minor-cups-11.svg` | 5.5 KB | Batch 15 | FROZEN |
| 48 | `minor-cups-12` | 圣杯骑士 | Knight of Cups | Minor | 圣杯 | 骑士 | Y | `minor-cups-12.svg` | 5.3 KB | Batch 16 | FROZEN |
| 49 | `minor-cups-13` | 圣杯王后 | Queen of Cups | Minor | 圣杯 | 王后 | Y | `minor-cups-13.svg` | 5.3 KB | Batch 17 | FROZEN |
| 50 | `minor-cups-14` | 圣杯国王 | King of Cups | Minor | 圣杯 | 国王 | Y | `minor-cups-14.svg` | 5.3 KB | Batch 18 | FROZEN |
| 51 | `minor-swords-1` | 宝剑王牌 | Ace of Swords | Minor | 宝剑 | 王牌 | — | `minor-swords-1.svg` | 3.5 KB | Batch 13 | FROZEN |
| 52 | `minor-swords-2` | 宝剑二 | Two of Swords | Minor | 宝剑 | 数字 2 | — | `minor-swords-2.svg` | 3.8 KB | Batch 02 | FROZEN |
| 53 | `minor-swords-3` | 宝剑三 | Three of Swords | Minor | 宝剑 | 数字 3 | — | `minor-swords-3.svg` | 4.6 KB | 正式试制 8 张 | FROZEN |
| 54 | `minor-swords-4` | 宝剑四 | Four of Swords | Minor | 宝剑 | 数字 4 | — | `minor-swords-4.svg` | 3.5 KB | Batch 04 | FROZEN |
| 55 | `minor-swords-5` | 宝剑五 | Five of Swords | Minor | 宝剑 | 数字 5 | — | `minor-swords-5.svg` | 3.4 KB | Batch 06 | FROZEN |
| 56 | `minor-swords-6` | 宝剑六 | Six of Swords | Minor | 宝剑 | 数字 6 | — | `minor-swords-6.svg` | 2.8 KB | Batch 08 | FROZEN |
| 57 | `minor-swords-7` | 宝剑七 | Seven of Swords | Minor | 宝剑 | 数字 7 | — | `minor-swords-7.svg` | 4.7 KB | Batch 10 | FROZEN |
| 58 | `minor-swords-8` | 宝剑八 | Eight of Swords | Minor | 宝剑 | 数字 8 | — | `minor-swords-8.svg` | 3.7 KB | Batch 11 | FROZEN |
| 59 | `minor-swords-9` | 宝剑九 | Nine of Swords | Minor | 宝剑 | 数字 9 | — | `minor-swords-9.svg` | 4.4 KB | Batch 12 | FROZEN |
| 60 | `minor-swords-10` | 宝剑十 | Ten of Swords | Minor | 宝剑 | 数字 10 | — | `minor-swords-10.svg` | 7.2 KB | Batch 13 | FROZEN |
| 61 | `minor-swords-11` | 宝剑侍从 | Page of Swords | Minor | 宝剑 | 侍从 | Y | `minor-swords-11.svg` | 5.5 KB | Batch 15 | FROZEN |
| 62 | `minor-swords-12` | 宝剑骑士 | Knight of Swords | Minor | 宝剑 | 骑士 | Y | `minor-swords-12.svg` | 5.5 KB | Batch 16 | FROZEN |
| 63 | `minor-swords-13` | 宝剑王后 | Queen of Swords | Minor | 宝剑 | 王后 | Y | `minor-swords-13.svg` | 6.0 KB | Batch 17 | FROZEN |
| 64 | `minor-swords-14` | 宝剑国王 | King of Swords | Minor | 宝剑 | 国王 | Y | `minor-swords-14.svg` | 5.1 KB | Batch 18 | FROZEN |
| 65 | `minor-pentacles-1` | 星币王牌 | Ace of Pentacles | Minor | 星币 | 王牌 | — | `minor-pentacles-1.svg` | 4.6 KB | Batch 14 | FROZEN |
| 66 | `minor-pentacles-2` | 星币二 | Two of Pentacles | Minor | 星币 | 数字 2 | — | `minor-pentacles-2.svg` | 3.8 KB | Batch 02 | FROZEN |
| 67 | `minor-pentacles-3` | 星币三 | Three of Pentacles | Minor | 星币 | 数字 3 | — | `minor-pentacles-3.svg` | 3.7 KB | Batch 04 | FROZEN |
| 68 | `minor-pentacles-4` | 星币四 | Four of Pentacles | Minor | 星币 | 数字 4 | — | `minor-pentacles-4.svg` | 3.4 KB | Batch 06 | FROZEN |
| 69 | `minor-pentacles-5` | 星币五 | Five of Pentacles | Minor | 星币 | 数字 5 | — | `minor-pentacles-5.svg` | 3.8 KB | Batch 08 | FROZEN |
| 70 | `minor-pentacles-6` | 星币六 | Six of Pentacles | Minor | 星币 | 数字 6 | — | `minor-pentacles-6.svg` | 4.8 KB | Batch 10 | FROZEN |
| 71 | `minor-pentacles-7` | 星币七 | Seven of Pentacles | Minor | 星币 | 数字 7 | — | `minor-pentacles-7.svg` | 6.3 KB | Batch 11 | FROZEN |
| 72 | `minor-pentacles-8` | 星币八 | Eight of Pentacles | Minor | 星币 | 数字 8 | — | `minor-pentacles-8.svg` | 6.9 KB | Batch 12 | FROZEN |
| 73 | `minor-pentacles-9` | 星币九 | Nine of Pentacles | Minor | 星币 | 数字 9 | — | `minor-pentacles-9.svg` | 6.6 KB | Batch 14 | FROZEN |
| 74 | `minor-pentacles-10` | 星币十 | Ten of Pentacles | Minor | 星币 | 数字 10 | — | `minor-pentacles-10.svg` | 7.1 KB | Batch 14 | FROZEN |
| 75 | `minor-pentacles-11` | 星币侍从 | Page of Pentacles | Minor | 星币 | 侍从 | Y | `minor-pentacles-11.svg` | 5.5 KB | Batch 15 | FROZEN |
| 76 | `minor-pentacles-12` | 星币骑士 | Knight of Pentacles | Minor | 星币 | 骑士 | Y | `minor-pentacles-12.svg` | 6.2 KB | Batch 16 | FROZEN |
| 77 | `minor-pentacles-13` | 星币王后 | Queen of Pentacles | Minor | 星币 | 王后 | Y | `minor-pentacles-13.svg` | 5.2 KB | Batch 17 | FROZEN |
| 78 | `minor-pentacles-14` | 星币国王 | King of Pentacles | Minor | 星币 | 国王 | Y | `minor-pentacles-14.svg` | 5.1 KB | 正式试制 8 张 | FROZEN |

## 校验方式

```bash
npm run typecheck     # 卡面登记表与数据一致性
npm test              # src/tarot/artwork.test.ts：78 张登记完整性
```

`src/tarot/artwork.test.ts` 断言：登记表条目数 = 78、每张牌均有对应资产文件、无多余登记。
