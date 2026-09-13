# SHOWCASE CAPTURE GUIDE · 最终展示截图拍摄说明

> 本文件记录 `.showcase/` 截图包的**拍摄口径**，保证任何人（或未来的我）都能复现同一批图。
> `.showcase/` 已加入 `.gitignore`，**不入库**——它是一次性展示产物，不是源码。

---

## 1. 推荐视口

| 代号 | 尺寸 | deviceScaleFactor | 用途 |
| --- | --- | --- | --- |
| `DESKTOP` | 1440 × 900 | 1 | README、比赛、manual、软著候选的默认视口 |
| `WIDE` | 1280 × 720 | 1 | 兼容性核查（投影仪 / 教室常见分辨率） |
| `MOBILE` | 390 × 844 | 2 | iPhone 12/13/14 逻辑分辨率，2× 便于印刷 |

超过 1440 宽度时，环境背景会露出更多左右边缘（书架 / 高窗），属预期行为。
低于 1200 宽度时，右侧高窗可能被裁出画面，夜空与桌面仍在——**不视为缺陷**。

---

## 2. 推荐页面与取景

| 文件名 | 路由 | 视口 | 状态 | 取景要点 |
| --- | --- | --- | --- | --- |
| `readme/README-01-ARCHIVE-78.png` | `/collection` | DESKTOP，整页 | 78 / 78 | **整页长图**，78 封全部启封 |
| `readme/README-02-MAJOR-DETAIL.png` | `/card/major-18` | DESKTOP | 已启封 | 月章手记完整三层（卜辞 / 解读 / 魔女手记） |
| `readme/README-03-UNSEAL-FAN.png` | `/unseal` → 点封缄匣 | DESKTOP | 扇形展开 | 12 枚封缄扇形，未翻牌 |
| `readme/README-04-FOUR-SUITS.png` | `/collection` → 筛选「星签」 | DESKTOP，整页 | 78 / 78 | 权杖 → 圣杯 → 宝剑 → 星币 四花色连续可见 |
| `readme/README-05-MOBILE.png` | `/collection` | MOBILE | 78 / 78 | 手机三列网格 + 筛选器 |
| `competition/competition-01-main.png` | `/` | DESKTOP | 进度中 | 主厅 + 玩法速览 |
| `competition/competition-02-observatory.png` | `/starcatch` → 开始观星 | DESKTOP | 对局中 | 有星星在漂 |
| `competition/competition-03-unseal.png` | `/unseal` | DESKTOP | 未开始 | 封缄匣静止态 |
| `competition/competition-04-reveal.png` | `/unseal` → 匣 → 翻牌 | DESKTOP | 揭示 | 「新牌入阁」+ 卡面 + 卜辞 + 三个下一步 |
| `competition/competition-05-archive.png` | `/collection` | DESKTOP | 进度中（含封缄位） | 已启封与封缄同框 |
| `competition/competition-06-detail.png` | `/card/major-18` | DESKTOP | 已启封 | 魔女手记 |
| `manual/manual-01..10-*.png` | 见 §3 | DESKTOP / MOBILE | 见 §3 | 干净实机图，逐功能一张 |
| `software-copyright/SC-01..07-*.png` | 见 §3 | DESKTOP | 见 §3 | 软著**候选**素材 |

---

## 3. 各包明细

### Manual（软件使用说明，10 张，全部为实机干净截图）

| 文件 | 路由 / 状态 |
| --- | --- |
| `manual-01-main.png` | `/`，进度中 |
| `manual-02-observatory.png` | `/starcatch`，对局中 |
| `manual-03-unseal.png` | `/unseal`，封缄匣静止 |
| `manual-04-reveal.png` | `/unseal`，已揭示 |
| `manual-05-archive.png` | `/collection`，进度中 |
| `manual-06-filter.png` | `/collection`，已点选「权杖」筛选 |
| `manual-07-major-detail.png` | `/card/major-18`（月章） |
| `manual-08-minor-detail.png` | `/card/minor-cups-8`（星签数字牌） |
| `manual-09-court-detail.png` | `/card/minor-swords-14`（宫廷牌） |
| `manual-10-mobile.png` | `/collection`，MOBILE |

### 软著候选（7 张，仅为素材）

`SC-01-MAIN` / `SC-02-OBSERVATORY` / `SC-03-UNSEAL` / `SC-04-ARCHIVE` /
`SC-05-MAJOR-DETAIL` / `SC-06-MINOR-DETAIL` / `SC-07-COURT-DETAIL`

> 本轮**只生成候选素材**：不提交软著、不写「保证不侵权」、不写「软著一定通过」。

---

## 4. 如何获得 78/78 测试展示状态

**只用 localStorage fixture，绝不修改生产初始存档。**

- 生产默认存档（`src/game/save.ts` → `defaultSave()`）仍然是
  `stardust: 60`、`collection: {}`、`totalDraws: 0`，**本轮零修改**；
- 展示状态通过 CDP 在浏览器里写 `localStorage['veiled-moon.save.v1']` 得到，
  三档 fixture 定义在 `.tools/gen.mjs`：

| fixture | 收藏 | 星屑 | 用途 |
| --- | --- | --- | --- |
| `full` | 78 / 78 | 320 | README-01、详情页、mobile、软著详情候选 |
| `mid` | 68 / 78（10 个封缄位） | 150 | 主厅 / 观星台 / 魔女阁 / 筛选 |
| `early` | 18 / 78 | 240 | 启封揭示（保证大概率抽到新牌，「新牌入阁」可见） |

`mid` 特意保留 10 个封缄位——展示图里「已启封 + 封缄」同框，
才能体现「78 个牌位的收藏系统」而不是「一次性全开」。

重现命令：

```bash
node .tools/gen.mjs readme        # 生成任务清单
node .tools/shots.mjs .tools/jobs-readme.json
```

---

## 5. 截图后如何清理

1. **不删 `.showcase/`**：它是本轮交付物，但已在 `.gitignore` 中，不进仓库。
2. **fixture 不残留**：`shots.mjs` 每次运行都新建一个临时 Chrome profile
   （`--user-data-dir=<tmp>/vmr-shot-*`），浏览器关闭即随之销毁；
   本机日常浏览器（你自己的 Chrome / Edge）**完全不接触**，localStorage 无污染。
3. **`.audit-art/` 与 `.tools/` 已在 `.gitignore`**，审计图与本地工具链都不入库。
4. 拍摄完成后执行 `git status` 必须为 **clean**（只允许出现 gitignore 覆盖的目录）。

---

## 6. Animation 等待时间

| 场景 | 等待 | 原因 |
| --- | --- | --- |
| 通用页面 | 1400–1800 ms | 等 `.fade-in`（400ms）与字体稳定 |
| 魔女阁（含 78 张 SVG） | 2200–2600 ms | 78 张 SVG 解码 |
| 观星台对局中 | 点击「开始观星」后 **6500 ms** | 让星星入场并漂到画面中段 |
| 启封扇形 | 点击封缄匣后 1000 ms | 等 `transform .5s` 展开到位 |
| 揭示结果 | 点击某枚封缄后 **1900 ms** | 等 950ms 延迟 + `card-arrive` 0.7s 动画 |
| 软著 / manual 详情页 | 1700 ms | 等卡面 SVG 与羊皮纸渲染 |

**动效期间截图会拍到中间帧**——所有等待都留了余量，不依赖 `prefers-reduced-motion`。

---

## 7. 不允许出现在截图里的元素

- DevTools、Console、任何调试面板
- fixture / test / debug 标签、水印、「测试」角标
- 假功能、灰掉之后再说的占位按钮
- 浏览器默认错误页、Vite 错误覆盖层
- 破碎字符 / 缺字方框（emoji 字体缺失时会出现在无 emoji 字体的浏览器上）

本项目在拍摄前已把不对位的符号改为文字（观星台 HUD 的计时前缀改为「剩余」字样），
确保在无彩色 emoji 字体的环境下也不出现缺字方框。

---

## 8. 顺序（README）

1. `README-01-ARCHIVE-78`（**必须第一张**：78 张全收集魔女阁——证明这是完整资产 + 收藏系统，不是抽卡 Demo）
2. `README-02-MAJOR-DETAIL`
3. `README-03-UNSEAL-FAN`
4. `README-04-FOUR-SUITS`
5. `README-05-MOBILE`

## 9. 顺序（比赛）

1. `competition-01-main`
2. `competition-02-observatory`
3. `competition-03-unseal`
4. `competition-04-reveal`
5. `competition-05-archive`
6. `competition-06-detail`

（对应的现场演示脚本见 `docs/COMPETITION_DEMO_FLOW.md`）

## 10. 顺序（Manual）

`manual-01-main` → `02-observatory` → `03-unseal` → `04-reveal` → `05-archive` →
`06-filter` → `07-major-detail` → `08-minor-detail` → `09-court-detail` → `10-mobile`

（严格按「打开 → 玩 → 攒 → 启封 → 收藏 → 筛选 → 看详情 → 手机」的使用链路排序）

## 11. 顺序（软件材料候选）

`SC-01-MAIN` → `SC-02-OBSERVATORY` → `SC-03-UNSEAL` → `SC-04-ARCHIVE` →
`SC-05-MAJOR-DETAIL` → `SC-06-MINOR-DETAIL` → `SC-07-COURT-DETAIL`

（覆盖：主界面 / 核心玩法 / 核心功能 / 数据列表 / 三类数据详情——满足「界面 + 功能」举证需要）

---

## 12. 本批次的实际技术口径

| 项 | 值 |
| --- | --- |
| 浏览器 | 本机 Google Chrome，`--headless=new` |
| 驱动 | 自研 CDP 脚本 `.tools/shots.mjs`（零第三方依赖） |
| 色彩配置 | `--force-color-profile=srgb` |
| 滚动条 | `--hide-scrollbars` |
| 音频 | `--autoplay-policy=no-user-gesture-required`（避免手势解锁影响状态） |
| 无 DevTools / 无扩展 | `--disable-extensions`，独立临时 profile |

> 之所以不用 Playwright：本机 Playwright 浏览器下载未成功（见 `pw-install.log`）。
> CDP 方案零依赖、可控性更高，且能直接采集 console error 做门禁。
>
> 工具链脚本位于 `.tools/`（**已入库**，供后续展示维护 / 截图复拍复现），
> 其产出的图片与任务清单不入库。用法见 `.tools/README.md`。
