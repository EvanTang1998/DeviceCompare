# 数据采集工具

用 UI 自动化打开苹果官网对比页，**监听页面自己发出的图片请求**，把产品图抓下来并按项目命名规范落盘，再入库到 `src/data/images/`。

## 为什么是"监听请求"而不是"拼 URL"

图片地址形如：

```
https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone_18_pro_black__f7t3q1k8wfiq_large_2x.jpg
                                                              └── 机型 ──┘ └配色┘ └─ 哈希 ─┘
```

中间那段哈希是苹果构建时生成的指纹，**没法预测**。但它一定会被页面自己请求，所以监听即可全部拿到。

机型 → 配色的归属关系来自 DOM（`.colornav-wrapper` / `.colornav-swatch` / `.colornav-label`），不是从文件名反推的，因此中文色名和归属都可靠。

## 前置条件

- **Node 22**（本机已有）
- **系统安装 Google Chrome**（工具复用系统 Chrome，不下载几百 MB 的 Chromium）
- 首次使用装一次依赖：`cd tools/scraper && npm install`（只会装 `playwright-core` 一个包）

## 三步走

```bash
cd tools/scraper

# 1. 抓图 → 产物落到 out/<时间戳>/
node cli.mjs images --models iphone-18-pro,iphone-17,iphone-duo

# 2. 看产物（图片 + 报告 + 原始 URL 记录）
open out/            # 或直接看最新的 out/<时间戳>/report.md

# 3. 入库到 src/data/images/（先预览，确认后再写入）
node cli.mjs promote --dry-run
node cli.mjs promote
```

## 命令一览

| 命令 | 作用 |
|---|---|
| `node cli.mjs images --models <机型列表>` | 抓图到 `out/` |
| `node cli.mjs promote` | 把最新一次抓取入库到 `src/data/images/` |
| `node cli.mjs list` | 列出 `src/data/images/` 现状（文件名 + 大小） |
| `node cli.mjs recon` | 侦察页面的请求与 DOM 结构（改选择器时用） |
| `node cli.mjs help` | 完整参数 |

也可以用 `npm run images` / `npm run promote` / `npm run list`，等价。

## `--models` 该填什么

**必须填苹果对比页认的 slug**——就是你在对比页网址里看到的那个写法：

```
https://www.apple.com.cn/iphone/compare/?modelList=iphone-18-pro,iphone-17,iphone-duo
                                                     └──────── 这一串 ────────┘
```

填错的话**页面不会报错**，只是完全抓不到图（页面认为没有这个机型）。所以拿不准时，先在浏览器里打开对比页确认能看到那台手机。

机型名与配色的对应关系会做归一化处理（`iphone_18_pro` / `iphone-18-pro` / `iPhone 18 Pro` 视为同一个），按「最长匹配」切分，避免 `iphone-17` 把 `iphone-17-pro` 的图抢走。

## 产物长什么样

```
out/2026-09-17T09-36-13-513Z/
├── images/
│   ├── iphone-18-pro__burgundy__large_2x.jpg
│   ├── iphone-18-pro__black__large_2x.jpg
│   ├── iphone-17__sage__large_2x.jpg
│   └── ...
├── index.json    每张图的原始 URL、机型、配色、字节数（可追溯来源）
└── report.md     自动生成的配色清单（含中文色名与页面默认色）
```

`out/` 已加入 `.gitignore`，属于可再生产物，不进版本库。

## 入库后的命名规则

| 情况 | 文件名 |
|---|---|
| 每个配色 | `<机型id>.<配色slug>.jpg`，如 `iphone-18-pro.burgundy.jpg` |
| 没有配色维度的机型 | `<机型id>.jpg`，如 `iphone-13-pro.jpg`（第三方来源的单图） |

**所有配色一律带颜色后缀，没有例外。** 「哪一色是页面上初始显示的」不进文件名——它由 `src/data/devices/<id>.json` 的 `colors[].is_default` 决定。原因是页面默认色会随抓取时机变化（实测同一机型两次抓取，默认色从黑色变成勃艮第酒红），一旦把它写进文件名，同一个文件名就会被不同内容静默替换，Git 里只显示「二进制文件已修改」。改默认色现在只需改一行 JSON，不动任何图片。

裸名 `<机型id>.jpg` 的语义被收窄为「这个机型没有配色维度」，不代表「默认色」。

**必须遵守**：扩展名小写；同一机型不要同时存在同名的不同扩展（如 `.png` 和 `.jpg`），否则会互相覆盖。`promote` 会自动清理这类同名不同扩展的旧文件。

前端 `src/data.js` 通过 `import.meta.glob` 扫描该目录，**文件名（去扩展名）= 机型 id**，与 `src/data/devices/<id>.json` 自动配对。

## images 选项

| 选项 | 默认 | 说明 |
|---|---|---|
| `--models` | 必填 | 逗号分隔的机型 slug |
| `--url` | — | 直接指定完整对比页 URL，覆盖 `--models` |
| `--dpr` | `2` | 设备像素比。**必须是 2 才能拿到 `_large_2x` 高清图**，dpr=1 只有 `_large` |
| `--out` | `tools/scraper/out` | 输出根目录 |
| `--batch-size` | `3` | 每批对比的机型数（苹果对比页上限就是 3），`0` 表示不分批 |
| `--no-click-swatches` | — | 不逐个点击配色按钮，更快，但可能漏掉非默认配色 |
| `--headed` | — | 显示浏览器窗口，方便盯着跑 |
| `--channel` | 自动探测 | 浏览器通道（`chrome` / `msedge`） |
| `--chrome-path` | — | 指定 Chrome 可执行文件路径 |
| `--timeout` | `60000` | 单次导航超时（毫秒） |

## promote 选项

| 选项 | 说明 |
|---|---|
| `--from` | 指定产物目录，默认取 `out/` 下最新的一次 |
| `--target` | 目标目录，默认 `src/data/images` |
| `--devices` | 只入库指定机型，逗号分隔（**推荐**，避免动到已有图片） |
| `--dry-run` | 只预览不写入 |
| `--overwrite` | 覆盖已存在的图（默认跳过） |

## 自检

解析逻辑（从 URL 切出机型/配色）有独立测试，改完代码跑一下：

```bash
node test/parse.test.mjs
```

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 一张图都没抓到 | `--models` 不是苹果认的 slug。加 `--headed` 看浏览器里到底显示了什么 |
| 拿到的图偏小 | `--dpr` 不是 2。dpr=1 只有 `_large`，2 才有 `_large_2x` |
| 报告里"默认色"不对 | 已在点击色板**之前**先读一次配色表修正；若苹果改版需复查 `sources/apple-compare.mjs` |
| 想抓的机型少于 3 台 | 正常，`--batch-size` 会自动分批 |
| 入库时提示跳过 | 目标已存在同名文件。确认要替换就加 `--overwrite` |
| 提示 `libnspr4`/`chrome` 找不到 | 本机没装 Chrome，或用 `--chrome-path` 指定 |

## 边界与已知限制

- **目前只有一个数据源**：`sources/apple-compare.mjs`（苹果中国官网对比页）。加新源就在 `sources/` 下新增一个适配器，坏了不影响其他源。
- **只抓图，不抓参数**：参数 JSON 仍在 `src/data/devices/` 手工维护。要抓参数需要新增 `sources/` 适配器 + 输出到 `out/`，人工 diff 后再入库。
- **苹果改版会失效**：选择器（`.colornav-*`）和 URL 规律都依赖苹果现有实现，改版后需要更新 `sources/apple-compare.mjs`，`node cli.mjs recon` 可用来重新侦察结构。
- **依赖隔离**：本目录有独立的 `package.json`，依赖不进根目录，不参与 vite 构建，也不会被 GitHub Actions 的 `npm ci` 安装。

## 目录结构

```
tools/scraper/
├── cli.mjs              命令行入口（images / promote / list / recon / help）
├── package.json         独立依赖：只有 playwright-core
├── sources/
│   └── apple-compare.mjs   苹果对比页适配器（主流程）
├── lib/
│   ├── browser.mjs      启动浏览器（复用系统 Chrome）、建页面、自动滚动
│   ├── apple-images.mjs URL 解析与机型索引（最长匹配）
│   ├── naming.mjs       命名归一化：机型 id / 配色 slug
│   └── promote.mjs      入库：写文件、清理同名不同扩展、跳过已存在
├── recon/
│   ├── apple-compare.mjs   侦察页面请求的图与配色结构
│   └── color-swatches.mjs  深挖色板 DOM 与 2x 图
├── test/
│   └── parse.test.mjs   解析逻辑自检
└── out/                 抓取产物（gitignore）
```
