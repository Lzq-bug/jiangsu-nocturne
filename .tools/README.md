# .tools · 展示与 QA 工具链

> 本目录的 `*.mjs` 脚本**入库**，供后续「比赛展示维护 / 截图复拍」（DEVELOPMENT_FREEZE 白名单第 2 项）复现。
> 脚本产出的图片与任务清单**不入库**（`.tools/qa/`、`.tools/jobs-*.json`、`.tools/_data.mjs` 已在 `.gitignore`）。
>
> 截图包的拍摄口径见 `docs/SHOWCASE_CAPTURE_GUIDE.md`；
> 现场演示脚本见 `docs/COMPETITION_DEMO_FLOW.md`。

## 为什么不是 Playwright

本机 Playwright 浏览器下载未成功（见仓库根目录 `pw-install.log`）。
因此改用**自研 CDP 驱动**（Chrome DevTools Protocol，Node 内置 `WebSocket` + `fetch`，**零第三方依赖**）。
副作用是可控性更高，并且能直接采集 console error 做门禁。

前置：本机装有 Google Chrome。默认路径
`C:\Program Files\Google\Chrome\Application\chrome.exe`，可用 `CHROME_PATH` 覆盖。

## 启动开发服务器

```bash
npx vite --port 5174 --host 127.0.0.1 --strictPort
```

## 脚本

| 脚本 | 用途 |
| --- | --- |
| `gen.mjs` | 生成截图任务清单 `jobs-<batch>.json`。`node .tools/gen.mjs <batch>` |
| `shots.mjs` | 执行任务清单并落图。`node .tools/shots.mjs .tools/jobs-<batch>.json` |
| `qa-probe.mjs` | 产品级 QA 探针：横向溢出 / 焦点 / 环境层语义 / 对比度 / FPS / reduced-motion / 捕星可玩性 |
| `manifest.mjs` | 重新生成 `docs/FINAL_ART_ASSET_MANIFEST.md`（78 张逐张资产清单） |
| `probe-stars.mjs` | 排查观星台星星的实际屏幕位置（回归守卫） |
| `probe-fan.mjs` | 测量启封扇形在窄屏下的外扩宽度 |
| `probe-focus.mjs` | 键盘 Tab 遍历，检查 `:focus-visible` 描边是否可见 |
| `probe-overflow.mjs` | 定位横向溢出的具体元素 |

### gen.mjs 的 batch

| batch | 内容 |
| --- | --- |
| `qa` | 内部 QA 多视口截图 + 筛选/封缄/quiet 场景 |
| `ritual` | 启封仪式真实交互（封缄匣 → 扇形 → 揭示，含移动端） |
| `play` | 观星台对局中 |
| `readme` | `.showcase/readme/` 5 张 |
| `competition` | `.showcase/competition/` 6 张 |
| `manual` | `.showcase/manual/` 10 张 |
| `sc` | `.showcase/software-copyright/` 7 张（软著**候选**素材） |
| `beforeafter` | `.audit-art/environment-before-after/` 8 张（环境改造前后对照，本地审计用） |
| `routes` | 14 条路由遍历 + 逐条 console error 门禁 |

## 展示用 fixture

截图使用 localStorage fixture（三档：`full` 78/78 / `mid` 68/78 / `early` 18/78），
由 `shots.mjs` 通过 CDP 写入。**生产初始存档零修改**，且每次运行使用独立临时 Chrome profile，
本机日常浏览器的 localStorage 不会被接触。三档定义见 `gen.mjs` 的 `FIX`。

## 一条完整复现

```bash
npx vite --port 5174 --host 127.0.0.1 --strictPort   # 另开一个终端
node .tools/gen.mjs readme && node .tools/shots.mjs .tools/jobs-readme.json
node .tools/qa-probe.mjs
```
