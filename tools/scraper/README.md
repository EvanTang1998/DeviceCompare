# 数据采集工具

给 DeviceCompare 补机型数据用。**一个数据源一个目录**，各自独立、互不引用 —— 要加新品牌就在 `sources/` 下新开一个目录，坏一个不影响另一个。

## 先读这段：六个数据源，六种玩法

目前有六个源，玩法**完全不同**，命令和产物也不通用：

|  | 苹果 `sources/apple/` | 一加 `sources/oneplus/` | vivo `sources/vivo/` | OPPO `sources/oppo/` | 小米 `sources/xiaomi/` | 华为 `sources/huawei/` |
|---|---|---|---|---|---|---|
| 数据源 | apple.com.cn 的 iPhone 对比页 | oneplus.com/cn/&lt;slug&gt;/specs | vivo.com.cn/vivo/param/&lt;slug&gt; | **参数**：oppo.com/cn specs 页；**图片**：opposhop.cn 商城接口 | **参数**：mi.com/prod/&lt;slug&gt;/specs；**图片**：api2.order.mi.com 商城接口 | consumer.huawei.com/cn/phones/&lt;slug&gt;/specs（**参数与分色图在同一页**） |
| 采集方式 | Playwright 开真页面，**监听它自己发出的图片请求** | 直接 `fetch` 页面 HTML，解析内嵌的 `window.pageDsl` JSON | 直接 `fetch` 页面 HTML，解码内嵌的 `__NUXT_DATA__`（Nuxt/devalue） | 两处都直接 `fetch`：specs 页是纯 SSR HTML；商城走公开 JSON 接口 `cn/oapi/goods-detail/web/info/pc/sku` | **参数必须开浏览器渲染**（specs 页是 SPA 壳，静态 HTML 只有 SEO meta）；图片直接 `fetch` 商城接口 `product/view`（要带 `Referer: https://www.mi.com/`，否则 406） | 直接 `fetch` 页面 HTML（**纯 SSR，不需要浏览器**），解析手风琴分组；分色图 URL 同一页里就有 |
| 拿到什么 | **只有图片** | **参数 JSON + 图片** | **参数 JSON + 图片** | **参数 JSON + 图片** | **参数 JSON + 图片**（每个配色一张正反双面图） | **参数 JSON + 图片**（每个配色一张规格图） |
| 流程形态 | 两阶段：先抓图落 `out/`，再 `promote` 入库 | 一步：直接写 `src/data/` | 一步：直接写 `src/data/` | 一步：直接写 `src/data/`（原图备份在 `out/<run>/oppo-raw/`） | 一步：直接写 `src/data/`（原图备份在 `out/<run>/xiaomi-raw/`） | 一步：直接写 `src/data/` |
| 参数 JSON | **手工维护**（工具不碰） | 自动生成 | 自动生成 | 自动生成 | 自动生成 | 自动生成 |
| 色值来源 | 图片取色 | 图片取色 | **官网直接给** `colorCode` | **商城直接给** `colorValue`（渐变双值取第一个） | **图片取色**（商城不给色值；normalize.py 采样背板中值） | **图片取色**（官网不给色值；normalize.py 采样背板中值） |
| 配色 slug | 官网图片文件名 | 官网图片文件名 | **拼音**（官网没有英文名） | **人工映射表**：`colors.mjs` 的 `COLOR_SLUGS`，中文色名 → 英文（`漫步云端` → `cloudwalk`） | **人工映射表**：`colors.mjs` 的 `COLOR_SLUGS`，中文色名 → 英文（`冷烟紫` → `coolsmokepurple`） | **人工映射表**：`colors.mjs` 的 `COLOR_SLUGS`，中文色名 → 英文（`云杉绿` → `sprucegreen`） |
| 需要 Chrome | 必须 | 仅旧模板页面需要（如 13） | **不需要** | **不需要** | **必须**（参数页渲染） | **不需要** |
| 需要 Python | 不需要 | 需要（Pillow，做图片归一化与取色） | 需要（Pillow，只做归一化） | 需要（Pillow，只做归一化） | 需要（Pillow，归一化 + 取色） | 需要（Pillow，归一化 + 取色） |
| 命令 | `images` / `promote` / `list` | `oneplus` | `vivo` | `oppo` | `xiaomi` | `huawei` |
| 输出目录 | `tools/scraper/out/`（gitignore） | 直接落 `src/data/`（入库） | 直接落 `src/data/`（入库） | 直接落 `src/data/`（入库） | 直接落 `src/data/`（入库） | 直接落 `src/data/`（入库） |

**为什么不合成一个脚本**：采集机制、产物契约、流程形态三样都不一样，硬合只会到处 `if (brand === ...)`。真正共用的只有「启动系统 Chrome」这一小段，放在 `lib/browser.mjs`，两边都调它。

---

## 前置条件

- **Node**：本机 `/opt/homebrew/bin/node`（v26）
- **Google Chrome**：工具复用系统已装的 Chrome，不下载 Playwright 自带的 Chromium（那个包约 300MB，国内网络经常超时）。也可以用 Edge。
- **Python + Pillow**：**一加、vivo、OPPO、小米、华为需要**（图片归一化；一加、小米、华为还用它取色）。脚本优先用 `$PYTHON` 环境变量指定的解释器，其次找 `~/.workbuddy/binaries/python/envs/default/bin/python3`，最后退回 `python3`。手动装：`pip install pillow`
- 首次使用装一次依赖：

```bash
cd tools/scraper
npm install          # 只会装 playwright-core 一个包
```

> 本目录有独立的 `package.json`，依赖不进根目录、不参与 vite 构建、也不会被 GitHub Actions 的 `npm ci` 安装。

---

## 目录结构

```
tools/scraper/
├── cli.mjs                      命令入口（解析参数 → 派给对应数据源，不含抓取逻辑）
├── package.json                 独立依赖：只有 playwright-core
├── lib/
│   └── browser.mjs              ★ 唯一共享模块：启动系统 Chrome / 建页面 / 自动滚动
├── sources/
│   ├── apple/                   数据源：苹果官网对比页（只抓图）
│   │   ├── compare.mjs          主流程：监听图片请求并落盘
│   │   ├── images.mjs           URL → 机型/配色 解析、机型索引（最长匹配）
│   │   ├── naming.mjs           命名归一化：机型 id / 配色 slug
│   │   ├── promote.mjs          入库：写文件、清理同名不同扩展、跳过已存在
│   │   ├── recon/
│   │   │   ├── page.mjs         侦察：页面请求了哪些图、色板/表格结构
│   │   │   └── swatches.mjs     侦察：深挖色板 DOM 与 2x 图
│   │   └── test/
│   │       └── parse.test.mjs   解析逻辑自检（25 条用例）
│   ├── oneplus/                 数据源：一加官网 specs 页（参数 + 图片一步入库）
│       ├── specs.mjs            主流程：抓取 → 解析 → 生成 JSON → 图片入库
│       ├── normalize.py         图片归一化 + 取色（Pillow）
│       └── recon/
│           ├── dom.mjs          侦察：旧模板 specs 页的 DOM 分区结构
│           └── e2e.cjs          验收：入库后在真实页面上点一遍
│   └── vivo/                    数据源：vivo 官网参数页（参数 + 图片一步入库）
│       ├── specs.mjs            主流程：抓取 → 解码 __NUXT_DATA__ → 生成 JSON → 图片入库
│       ├── normalize.py         图片归一化（透明底铺白 + 裁剪缩放）
│       └── recon/
│           ├── dump.mjs         侦察：把解码后的参数结构与配色打出来
│           └── e2e.cjs          验收：vivo 机型逐台核对图-机型配对与色环切换
│   └── oppo/                    数据源：OPPO 官网 specs（参数）+ 官方商城接口（每色一张正背组合图）
│       ├── specs.mjs            主流程：解析 specs 页 → 生成 JSON（含 os/biometric/cellular/nfc/副屏）
│       │                        另导出可复用的解析件：parseSections / findVal / CAM_RE / toMegapixels / classifyLens
│       ├── shop.mjs             商城接口：入口 SKU → 分色 SKU → 逐色下载第 1 张（正背组合图）+ 原图备份（含 hasShopEntry）
│       ├── colors.mjs           ★ 配色 slug 人工映射表 COLOR_SLUGS（38 台机型的全部中文色名 → 英文）
│       ├── normalize.py         图片归一化（透明底铺白 + 裁剪缩放，不做任何切分）
│       └── recon/
│           ├── dump.cjs         侦察：specs 页分组结构与全部字段（最原始的那个，一直可用）
│           ├── camera-dump.mjs  巡检：打印各机型「后置/前置」原文 + 归类结果，查镜头漏抓或分错
│           ├── color-audit.mjs  巡检：参数页配色 vs 商城配色是否对齐（色名、slug、顺序）
│           ├── specs-probe.mjs  巡检：specs 页可用性（分组数、条目数、配色）
│           ├── shop-map.mjs     侦察：官网机型页 → 商城入口 SKU 的映射扫描
│           ├── shop-search.mjs  侦察：商城搜索（找新机型的入口 SKU id）
│           ├── shop-catalog.mjs 侦察：商城分类接口返回了什么
│           ├── shop-nav.mjs     侦察：商城导航/分类页可达性
│           └── shop-gallery.mjs 侦察：商城颜色切换器、图集与接口行为
│   └── xiaomi/                  数据源：小米官网 specs（参数，浏览器渲染）+ 官方商城接口（分色图）
│       ├── specs.mjs            主流程：浏览器渲染 specs 页 → 标题切分解析 → 生成 JSON → 图片入库
│       │                        另导出可复用的解析件：parseSections / classifyLens / buildCameras
│       ├── shop.mjs             商城接口：product/view（带 viewCache 记忆化）→ 配色 img_url 下载 + 原图备份
│       ├── colors.mjs           ★ 配色 slug 人工映射表 COLOR_SLUGS（小米全部中文色名 → 英文）
│       ├── normalize.py         图片归一化（透明底铺白 + 裁剪缩放）+ 背板取色回填 hex
│       └── recon/               侦察脚本（specs 页两套模板、商城接口、product_id 反查等 11 个）
│   └── huawei/                  数据源：华为官网 specs（参数 + 分色图同一页，纯 SSR）
│       ├── specs.mjs            主流程：fetch specs 页 → 手风琴分组解析 → 生成 JSON → 图片入库
│       │                        另导出可复用的解析件：parseSections / parseColors
│       ├── legacy.mjs           ★ Mate 60 系列：官网参数页已下架 → 官方存档转录 + CDN 现存图（人工维护）
│       ├── front.mjs            ★ vmall 正背组合图（正面图唯一官方源）：搜索 XHR 匹配商品 → CDN 原图 → 裸名图
│       ├── colors.mjs           ★ 配色 slug 人工映射表 COLOR_SLUGS（Mate 60/70/80 中文色名 → 英文）
│       ├── normalize.py         图片归一化（透明底铺白 + 裁剪缩放）+ 背板取色回填 hex（--bare 走组合图分支）
│       └── recon/
│           ├── vmall-probe.mjs  侦察：vmall 商城页可达性（curl，结论：有 WAF 反爬，参数页已含所需一切）
│           ├── vmall-browser.mjs 侦察：用真浏览器开 vmall（能过 WAF，但商城没有 Mate 60 系列商品）
│           ├── vmall-search-xhr.mjs / vmall-next-data.mjs  侦察：搜索接口 XHR / 详情页 NEXT_DATA（front.mjs 的链路依据）
│           ├── front-image-probe1..4.mjs  侦察：官网正面图排查（中文站 specs/产品页、英文站 specs，均无）
│           └── vmall-all.mjs    侦察：批量试 vmall 各机型详情接口（不采用）
├── recon/
│   ├── home-detail.mjs          验收：首页（大标题「灵眸 · 手机对比」/搜索/热门网格首屏 HOT_ROWS 行且一行最多 6 列/底部「显示更多」按批追加、池子取空即消失/「添加对比」三级：平时不显示→进卡片显浅灰小胶囊→压到按钮上才长大到满宽 81% × 40px 且配色不变/卡片 hover 原地放大但不位移/已添加态卡面留白 + 四周加强 + 按钮常显/跟随光标的「查看详情」提示）、参数浮窗（不铺满/从点击处放大/三种关闭）与暂存区浮标（1.5 倍尺寸/可清空/空态常显且点击只震动不跳转/「添加对比」的飞入动效：缩略图从卡片图沿抛物线飞进浮标、越飞越小、落地浮标回弹、移除与满员被拒不飞/对比页「返回首页」退出）
│   ├── picker.cjs               验收：机型选择弹框的「全部」浏览态、品牌→系列分组与全局搜索（跨数据源）
│   ├── sticky-bar.cjs           验收：置顶机型栏点击应弹出机型选择弹框（非就地下拉）
│   ├── image-fronts.mjs         验收：图片机位（华为轮播含正背组合图、OPPO 单图）与弹框系列折叠
│   ├── oppo-page.mjs            验收：OPPO 在对比页的配色切换（每色单图，无轮播）、副屏与系统连接分区
│   ├── ui-fixes.mjs             验收：移动端横滑、占位卡等 UI 修正
│   └── url-state.mjs            验收：地址栏同步（后退/前进、分享链接直接打开、刷新保持、脏链接清洗、关浮窗走 back 而非 push）
│
│   ※ 除 url-state.mjs 外，其余脚本默认停在首页，开头都会先「点卡片加满 4 台 → 进对比页」再跑断言；
│     对比表不再预填机型 —— 机型由用户从首页加进来（暂存区那份状态就是对比表的内容）。
│   ※ url-state.mjs 必须用真浏览器：ssr-check 只在 Node 里渲染一次树，碰不到 history / popstate，
│     而"后退键能不能用"恰恰是这个功能的核心。判断"关浮窗是退回还是新压一条"不能看 history.length
│     （后退不会让它变短，只是把游标往回挪），要看"前进键还能不能重新打开它"。
├── out/                         苹果抓图产物 + OPPO 原图备份 oppo-raw/（gitignore）
└── recon-out/                   侦察产物（gitignore）
```

---

# 一、苹果：只抓产品图

参数 JSON 仍手工维护，工具只负责把图抓下来入库。

## 为什么是「监听请求」而不是「拼 URL」

图片地址形如：

```
https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone_18_pro_black__f7t3q1k8wfiq_large_2x.jpg
                                                              └── 机型 ──┘ └配色┘ └─ 哈希 ─┘
```

中间那段哈希是苹果构建时生成的指纹，**没法预测**。但它一定会被页面自己请求，所以监听即可全部拿到。

机型 → 配色的归属关系来自 DOM（`.colornav-wrapper` / `.colornav-swatch` / `.colornav-label`），不是从文件名反推的，因此中文色名和归属都可靠。

## 三步走

```bash
cd tools/scraper

# 1. 抓图 → 产物落到 out/<时间戳>/
node cli.mjs images --models iphone-18-pro,iphone-17,iphone-duo

# 2. 看产物（图片 + 报告 + 原始 URL 记录）
open out/            # 或直接看最新的 out/<时间戳>/report.md

# 3. 入库到 src/data/images/（先预览，确认后再写入）
node cli.mjs promote --devices iphone-18-pro,iphone-17,iphone-duo --dry-run
node cli.mjs promote --devices iphone-18-pro,iphone-17,iphone-duo
```

`--devices` 是**强烈建议**加的：不加会把本次抓取的所有机型都入库一遍，可能动到你已经手工调过的旧图。

## `--models` 该填什么

**必须填苹果对比页认的 slug**——就是你在对比页网址里看到的那个写法：

```
https://www.apple.com.cn/iphone/compare/?modelList=iphone-18-pro,iphone-17,iphone-duo
                                                     └──────── 这一串 ────────┘
```

填错的话**页面不会报错**，只是完全抓不到图（页面认为没有这个机型）。所以拿不准时，先在浏览器里打开对比页确认能看到那台手机。

个别机型苹果的段名和我们的 id 不一致（如我们是 `iphone-16-e`、苹果写 `iphone-16e`），例外登记在 `sources/apple/compare.mjs` 的 `APPLE_URL_ALIASES`。

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

**必须遵守**：扩展名小写；同一机型不要同时存在同名的不同扩展（如 `.png` 和 `.jpg`），否则会互相覆盖。`promote` 会自动清理这类同名不同扩展的旧**源图** —— 派生的 `.webp` 不算冲突，也不会被删。

前端 `src/data.js` 通过 `import.meta.glob` 扫描该目录，**文件名（去扩展名）= 机型 id**，与 `src/data/devices/<id>.json` 自动配对。

入库的 `.jpg` 就是**原图**，不用手动处理格式：`predev` / `prebuild` 会自动派生出同名 `.webp`，网站实际引用的是后者。详见根目录 README 的「图片为什么是 WebP」。

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

## list

`node cli.mjs list` 列出 `src/data/images/` 现状（文件名 + 大小），用来核对入库结果。

---

# 二、一加：参数 + 图片一步入库

一条命令同时产出参数 JSON 和产品图，**不需要**再跑 promote。

## 用法

```bash
cd tools/scraper

# 先预览（强烈建议首次这么做）
node cli.mjs oneplus --models 15,15t,13,13t --dry-run

# 确认无误后正式入库
node cli.mjs oneplus --models 15,15t,13,13t

# 也可以直接贴官网 URL（Ace 5 至尊版的规格页路径不规律，这种最稳）
node cli.mjs oneplus --models https://www.oneplus.com/cn/ace-5-ultra-specs
```

`--models` 填**机型 slug 或完整 URL 都行**：

- 裸 slug（推荐）：`15` / `15t` / `13` / `13t` / `ace-6-ultra`，脚本自己拼成 `https://www.oneplus.com/cn/<slug>/specs`
- 完整 URL：从官网抄网址最省心，脚本从 URL 反推 slug

输出 id（决定 JSON 与图片文件名、`CURATED` 的键）是按 URL 归一化出来的：去掉 `/cn/` 前缀、去掉结尾的 `/specs` 或 `-specs`，所以各种写法都会收敛到同一个 id。

官网 URL 有两种坑，都已经处理掉、不用记：

| 情况 | 例子 | 处理 |
|---|---|---|
| 给的是**产品页**，不是规格页 | `https://www.oneplus.com/cn/ace-6-ultra` | 产品页也有 `pageDsl` 但没有参数组件 → 自动补一段 `/specs` 重试，日志会打印「该 URL 不是规格页，改用 …」 |
| 规格页**不带** `/specs` 段 | `https://www.oneplus.com/cn/ace-5-ultra-specs` | 页面里已有参数组件 → 原样使用，不会再补 `/specs` |

## 产出

| 产物 | 路径 |
|---|---|
| 参数 | `src/data/devices/oneplus-<slug>.json`（schema 对齐现有机型） |
| 图片 | `src/data/images/oneplus-<slug>.<配色slug>.jpg`，统一 612×760 白底画布 |

`--dry-run` 时两个产物都只落临时目录，不碰 `src/`，方便先检查：

- JSON → `$TMPDIR/oneplus-specs-json/`
- 图片 → `$TMPDIR/oneplus-specs-<时间戳>/images/`

## 加新机型前必做：先补 `CURATED`

`sources/oneplus/specs.mjs` 顶部的 `CURATED` 常量维护**官网 specs 页没有的字段**：

```js
const CURATED = {
  "15":  { release_date: "2025-10", hdr_formats: ["HDR10+", "杜比视界"] },
  "13":  { release_date: "2024-10", ..., water_resistance: "IP68/IP69" },
};
```

`release_date` 是必需的（脚本用它推 `release_year`，缺了会直接抛错）；`hdr_formats`、`water_resistance` 在 specs 页抓不到时才需要人工补。**新增机型的 slug 必须在这里有条目。**

`series`（如「数字系列」「Ace 系列」）不用填 —— 脚本按 slug 自动推导（含 `turbo` → Turbo 系列、含 `ace` → Ace 系列、其余 → 数字系列）；万一某机型的归属不符合这个规律，在 `CURATED` 里显式给 `series` 覆盖即可。这个字段供机型选择弹框按系列分组，vivo 源是从官网 `category.name` 直接取的。

两条实测结论：

- **`hdr_formats` 永远抓不到。** 逐页确认过：一加 specs 页里**没有任何机型**写 HDR10+ / 杜比视界（`grep -i hdr` 在 13 / 13t / 15 / 15t / Ace 5 / Ace 6T / Turbo 全系都是空）——所以它只能靠人工核对后写进 `CURATED`。没把握的机型就别写，前端会显示「—」，不要凭猜补。
- **`water_resistance` 优先信页面**：页面有「防水等级」/「防尘防水」就用页面的，`CURATED` 里的只在页面缺字段时才兜底。
   实测 Turbo 6X 页面写的确实是 `IP64`（比 6X Pro 的 `IP66/IP68/IP69/IP69K` 低），不是抓错。

### 哪里是人工补的，别被重新抓一遍覆盖

多数机型的 JSON 由脚本全量生成，重新抓一次不丢东西。但**少数机型的 JSON 含人工补充的字段**，脚本产物里没有对应来源，重抓会把这些字段抹掉：

```bash
# 只检查「脚本能不能重新生成」，别写盘
node cli.mjs oneplus --models <机型> --dry-run
```

已知 `oneplus-ace-6.json` 是人工增强过的（`camera[].sensor` = 索尼 IMX906、`sensor_size_inch`、`pixel_size_um`），而 `sensor_size_inch` / `pixel_size_um` **脚本不产出**。所以要重抓它之前，先把这两类字段抄回去。判断方法：`sensor` 不为 `null`、或出现 `sensor_size_inch`，就是人工补的。

## 实现要点（改代码前先读）

| 主题 | 说明 |
|---|---|
| 两种页面模板 | 新模板：HTML 内嵌 `window.pageDsl` JSON，直接解析；旧模板（13 / Ace 5）：规格正文**已经 SSR 在静态 HTML 里**，解析 `.spec-content` 分区即可，**不用开浏览器**（浏览器渲染只是「静态 HTML 里没有 `.spec-content`」时的兜底，目前用不到） |
| 值的三种形态 | ① 独立条目（15/15T）② `键：值` 内联文本（13T）③ 每镜头一个键（13 相机），`parseCamera` 都兼容 |
| 键名各页不统一 | 「机身长度（mm）」/「机身长度（毫米）」、「机身重量（g）」/「机身重量（克）」都出现过。`normKey()` 统一去掉空白与括号、把结尾的 `毫米→mm`、`克→g`，只处理**结尾**的单位以免误伤「麦克风个数」 |
| 无冒号的续行不能丢 | 旧模板里 `<p>` 可能没有「键：值」结构，例如 Ace 5 电池分区：<br>`电池：6285mAh/24.08Wh (额定值)`<br>`6415mAh/24.57Wh (典型值)（不可拆卸）`<br>第二行就是唯一能取到典型值的来源，`parseLegacyHtml` 会把它并进上一条的值 |
| 电池容量取典型值 | 官网常同时给额定值与典型值（Ace 5 的额定值还排在前面）。`typicalMah()` 先定位含「典型值」的那一行、再只在该行取 mAh —— 不能写成 `/(\d+)mAh[^\n]*?典型值/`，惰性匹配会从行首的额定值开始往后找而拿错 |
| 换行符坑 | pageDsl 值里是 `\r\r\n`，JS 正则 `.` 不匹配 `\r`，`clean()` 必须先去掉 |
| 配色对齐 | 两套机制：新模板靠「机身颜色」「产品图片」「色卡」三个列表**按下标**对应；旧模板官方 `#specs-color` 里每张产品图和色名本来就成对放在同一个滑块节点里，直接配对更可靠 |
| 色名分隔符各页不同 | `机身颜色` 用 `|` / `｜` / `、` 混着写（Ace 5 至尊版用 `、`），按 `/[|｜、,，/]+/` 统一拆 |
| 峰值亮度两处写法 | 新模板在一条里写「默认最高亮度：800…激发最高亮度：1800」；旧模板把激发亮度**单列成键**「全局激发最高亮度」，所以 `parseBrightness(s, hdrSource)` 收第二个来源参数 |
| 传感器型号 | 官网多数机型不写，写了就是有效信息（Ace 5 前置写「SONY IMX480」）。只认 `SONY/索尼 + IMX 编号`这种无歧义写法，其余回落 `null`（页面按空处理，不显示占位文案）——**别放宽正则**，会把规格描述里的数字抓成型号 |
| 配色 slug 别名 | slug 从产品图文件名末尾的英文词提取，个别机型文件名是简称（Ace 6 至尊版的「金属风暴」图名是 `OnePlus_Roadster_tai_...`，`tai` 是「钛」的拼音），`COLOR_SLUG_ALIAS` 把它折成 `titanium`，跟其它机型用词一致 |
| 黑底图 | 官网产品图是 1080×1080 纯黑底，`normalize.py` 从边缘洪泛转白再裁剪缩放 |
| hex 取色 | 优先「色卡」160×160 图中心中值；无色卡（13）取背板干净区中值 |
| 浏览器 | 旧模板路径复用 `lib/browser.mjs`，依次试 chrome / msedge / 常见安装路径 |

## 验收

入库后在真实页面上点一遍（**前置：dev server 已起在 5173**）：

```bash
cd ../.. && PATH="/opt/homebrew/bin:$PATH" npm run dev    # 另开一个终端
cd tools/scraper && node sources/oneplus/recon/e2e.cjs    # 逐台检查下拉里的全部一加机型
node sources/oneplus/recon/e2e.cjs "一加 Ace 6T" "一加 Turbo 6V"   # 只查指定机型
```

它会把每台一加机型依次选中，核对三件事：

| 检查项 | 抓的是什么问题 |
|---|---|
| 产品图文件名以该机型 id 开头 | **图和机型配错位**（抓到别家的图、或配色 slug 归一错了）——这是最容易被肉眼放过的问题 |
| 色环数量与 JSON 的 colors 一致 | 配色声明了但图没入库 |
| 切到第 2 个色环后图片跟着换 | 图片-配色绑定错 |

末尾的 `问题` 应为「无」，`页面报错` 应为「无」，退出码非 0 就是没过。截图落在 `/tmp/oneplus-e2e.png`。

## 验收：机型选择弹框的最近发布与分组

JSON 顶层的 `series` 字段（如「iPhone 17 系列」「X 系列」「Turbo 系列」）驱动弹框分组。弹框默认 chip 是「最近发布」：按品牌分组，每组只铺**最新的 4 台** + 组尾「查看更多」卡片（点击进入该品牌完整列表）。不能按「最新系列」取精选——vivo 全部 X 机型共用一个 series，会把 18 台全放进来。选了品牌或开始搜索后退回完整的「品牌 → 系列」分组列表。

**系列在组内按「主流旗舰高端 → 低端」排**（用户要求），依据是 `src/data.js` 导出的 `SERIES_ORDER` 产品线定位表：
OPPO `Find X → Find N → Reno → K → A`、一加 `数字 → Ace → Turbo`、vivo `X → S → Y`。
没配表的品牌（苹果）沿用「发布时间从近到远」—— 全系同属数字旗舰线，新一代即更高端，天然正确，
所以**新加系列要不要进表**看它的定位：属于独立产品线的（如以后加「Find N 系列」之外的新折叠线）就要补表。
没配到表里的系列会沉到该品牌末尾，内部仍按发布时间从近到远。

这个弹框是点击后才挂载的，`ssr-check` 的整树渲染碰不到，所以要跑浏览器校验（前置同上）：

```bash
node recon/picker.cjs
```

它做四件事，期望值直接从浏览器里的 `src/data.js` 取（含 `SERIES_ORDER`），不另维护一份：

| 检查项 | 抓的是什么问题 |
|---|---|
| 浏览态 = 品牌顺序 × 每品牌最新 4 台，组尾「查看更多」提示的剩余台数正确 | 精选口径算错、跳转卡缺失或提示错 |
| 逐品牌进完整列表，「全量」每张卡按 DOM 顺序与数据比对品牌/系列/新角标，系列标题无缺无重 | **分组错位**（机型掉进错误系列、系列标题漏渲染） |
| 每个品牌的系列标题顺序 = `SERIES_ORDER` 的定位优先级 | **系列排错**（新系列没进表、表顺序写反） |
| 搜索结果仍带分组、且系列顺序不变（用「oppo」这种跨 5 个系列的词实测） | 分组逻辑与搜索叠加时崩掉 |

截图落在 `/tmp/picker-groups.png`。

---

# 三、vivo：参数 + 图片一步入库

一条命令同时产出参数 JSON 和产品图，**不需要浏览器、不需要再跑 promote**。

## 用法

```bash
cd tools/scraper

# 先预览（强烈建议首次这么做）
node cli.mjs vivo --models x500pro,x300 --dry-run

# 确认无误后正式入库
node cli.mjs vivo --models x500pro,x300

# 也可以直接贴官网 URL
node cli.mjs vivo --models https://www.vivo.com.cn/vivo/param/x500pro
```

`--models` 填**机型 slug 或完整 URL 都行**。slug 就是官网参数页 URL `/vivo/param/<slug>` 里那段（`x500pro` / `x300` / `s20` / `y6`…），**大小写不敏感**（`y505G` 会归一成 `y505g`，JSON 与图片文件名都用小写）。

**怎么知道有哪些 slug**：官网导航的「X 系列 / S 系列 / Y 系列」页会列出当前在售机型，但页面是老架构、链接藏在 JS 里。最直接的办法是按系列规律试探 `https://www.vivo.com.cn/vivo/param/<slug>`——页面 200 且含 `productAttrs` 就是存在（侦察脚本 `recon/dump.mjs` 可以辅助确认）。

## 产出

| 产物 | 路径 |
|---|---|
| 参数 | `src/data/devices/vivo-<slug>.json`（schema 对齐现有机型） |
| 图片 | `src/data/images/vivo-<slug>.<配色slug>.jpg`，统一 612×760 白底画布 |

`--dry-run` 时两个产物都只落临时目录（`$TMPDIR/vivo-specs-json/` 与 `$TMPDIR/vivo-specs-<时间戳>/images/`），不碰 `src/`。

## 实现要点（改代码前先读）

| 主题 | 说明 |
|---|---|
| 数据在哪 | 页面是 Nuxt SSR，参数与配色全在 `<script id="__NUXT_DATA__">` 里（devalue 扁平化数组，按下标互相引用），`unflatten()` 解码。**全程不用浏览器** |
| 分组结构 | `productAttrs[]` = `{ masterAttr.attrName, slaveAttrs: [{attrName, attrValue}] }`，17 个分组（物理规格 / 处理器 / 存储 / 电池信息 / 屏幕显示 / 拍摄功能…）。30 台机型实测**字段名完全统一**，没有一加那种键名变体 |
| 机型名 | `product.name`（如 "X500 Pro"）+ `product.code`（= slug）；展示名 = `vivo ` + name。注意个别机型 name 带尾空格（"X500 "），要 trim |
| 发布时间 | `上市时间` = "2026年9月"，直接推 `release_date` / `release_year`，**不需要人工 CURATED**（这点比一加省事） |
| 系列 | `category.name` = "X系列"（官网 30 台全覆盖），统一成「X 系列」写入 `series`，供机型选择弹框分组 |
| 多值分隔 | 官网用 `<br>` 分隔多值（厚度分配色、多颗镜头），但也见过 `、`（X100 光圈）和 `+`（Y500 光圈）——光圈解析**不依赖分隔符**，直接按出现顺序抓 `f/数字` |
| 像素两种口径 | 「5000万像素」→ 50mp，「2亿像素」→ 200mp（亿要 ×100，别跟万一样 ÷100） |
| 双电芯电池 | X100 系列是双电芯串联，官网同时给电芯容量和「等效于 5000mAh」，取**等效值**口径才可比 |
| 充电功率 | 有线 = 第一个后面不跟「无线」的 `NNW`；无线 = 后面跟「无线」的那个。「手机支持的充电器最大输出功率90W&40W无线闪充」「44W闪充（支持…11V 4A），兼容33W…」都兼容 |
| RAM 类型 | 多数机型一条通用；Y500i 按容量分开写（`12GB：LPDDR4X…<br>8GB :LPDDR5X…`）→ 按容量配对 |
| 官网不写的字段 | **防水等级、HDR 格式、屏幕亮度、直屏/曲面、中框背板材质全都没有** → 留 null，前端显示「—」。别凭印象补 |
| 官网不写的像素 | 部分超广角只写「106° 超视野低畸变广角镜头」不给像素 → `resolution_mp` 为 null 是忠实于官网 |
| 焦距 | 只有 X200 Ultra / X300 Ultra 在镜头名里写了等效焦距（35mm / 85mm / 14mm），解析出来；其它机型为 null |
| 色值 | `imgList[].colorCode` 官网直接给（比取色准），归一化脚本优先用它 |
| 配色 slug | 官网**没有**英文名 → 拼音。内置 98 字的字表覆盖现有 62 个配色名（实测无多音字），新字原样保留。**与苹果 / 一加的英文 slug 风格不一致，是已知且接受的差异** |
| 默认配色 | 渲染 HTML 里有 `<li class="active color-button-item" aria-label="大地回声">`，据此标 `is_default`；抓不到就退回官网列表第一个 |
| 图片 | 640×640 **透明底 PNG** → 铺白 → 裁边 → 612×760 画布。和一加的黑底图处理不同，所以 `normalize.py` 各自独立 |

官网 URL 也有大小写坑：`/vivo/param/y505G` 里的 `G` 是大写（导航里就这么写），请求时保留原样、入库时归小写即可。

## 验收

入库后跑仓库根的全量数据完整性校验（同「自检」一节）：

```bash
cd ../.. && PATH="/opt/homebrew/bin:$PATH" node scripts/ssr-check.mjs
```

vivo 的浏览器端到端验收与一加同思路：`node sources/vivo/recon/e2e.cjs` 逐台检查下拉清单、图-机型配对与色环切换。跨品牌的弹框分组验收见 `recon/picker.cjs`（下节）。

---

# 四、OPPO：官网 specs（参数）+ 官方商城接口（分色图）

## 为什么要两个网站

oppo.com 参数页的「产品图」是一张**多色横排拼图**（`productColorImg`），没有分色独立图——不要试图切图。
分色产品图在官方商城 opposhop.cn，且有公开 JSON 接口（浏览器里切配色时抓包可见）：

```
GET https://www.opposhop.cn/cn/oapi/goods-detail/web/info/pc/sku?skuId=<id>
```

- `attributesColorParams[]`：配色名 + 官方色值（`colorValue`，渐变双值逗号分隔，取第一个入库）+ 色块图
- `attributes.skuItems[]`：每个配色的任一 SKU id
- 对每个配色再调一次接口：`galleryResource[]` 里 `type=img` 且 `.png` 的条目即该配色的产品图。
  **只取第 1 张** —— 它是「正面+背面」组合图；第 2 张起全是侧面/斜侧机位，不入库
  （2026-09-24 定的口径：对比表里不出现侧面图，见 recon/image-fronts.mjs 验收）。

## 用法

```bash
cd tools/scraper

# 先预览（强烈建议首次这么做）
node cli.mjs oppo --models oppo-find-x10,oppo-find-x10-pro-max,oppo-find-n6 --dry-run

# 确认无误后正式入库
node cli.mjs oppo --models oppo-find-x10,oppo-find-x10-pro-max,oppo-find-n6

# 只处理参数，跳过商城图片（改完解析逻辑后自查用，省掉重新下图）
node cli.mjs oppo --models oppo-find-x10 --no-images

# 一次跑完全部机型（ids 从 META 取）
node cli.mjs oppo --models "$(grep -oE '^  \"oppo-[a-z0-9-]+\":' sources/oppo/specs.mjs | sed 's/[\": ]//g' | sort -u | paste -sd, -)" --no-images
```

`--models` 填**本项目机型 id**（不是官网 slug），因为官网 URL 段、系列、发布日期都记在
`sources/oppo/specs.mjs` 的 `SPECS_URLS` / `META` 里。

## 加新机型（3 处，都必须补）

| 文件 | 补什么 | 漏了会怎样 |
|---|---|---|
| `specs.mjs` → `SPECS_URLS` | 官网 specs 页地址 | 报「未知 OPPO 机型」 |
| `specs.mjs` → `META` | `name` / `series` / `release_date` | 同上（`release_year` 由 `release_date` 推） |
| `colors.mjs` → `COLOR_SLUGS` | 每个中文色名 → 英文 slug | 该机型若**没有**商城源，会在抓取时直接抛错点名缺哪个色名 |
| `shop.mjs` → `DEVICES` | 入口 `skuId`（只要一个 SKU） | 不补则参数照常入库、**图片留空**，不报错 |

入口 `skuId` 怎么找：官网机型页购买区会挂商城商品页链接（形如
`opposhop.cn/cn/web/products/<id>.html`），拿 `<id>` 调一次
`https://www.opposhop.cn/cn/oapi/goods-detail/web/info/pc/sku?skuId=<id>` 能返回
`attributesColorParams` 就说明可用。**商城没有可用的搜索/列表/分类直达页**（都落 404 兜底 SPA），
所以只能走官网机型页 → 商城商品页这条路，扫描脚本见 `recon/shop-map.mjs`。

## 无商城源的机型：参数页多色图兜底

不是所有机型都有分色图，当前 38 台里 **26 台走商城分色图、12 台走参数页多色图兜底**（参数照常入库）。
兜底机型取 specs 页 `pageDsl` 里的 `productColorImg`（官方多色横排拼图）归一化为一张整机裸名图
`<id>.jpg`（画布跟随比例、最大 760×570，与小米 12/11/10 系列 `LEGACY_MODELS` 同口径），
`colors[]` 仍按参数页色名声明、hex 为 null，前端主图用裸名图、单色切换无图。

| 原因 | 机型 | 图片来源（均为 oppo.com 官方图） |
|---|---|---|
| 商城已下架（接口返回 `code 1000043`、0 个配色） | `oppo-reno16`、`oppo-find-x7-ultra` | specs 页 `productColorImg`（x7-ultra 的值带尾随 `?`，正则需容忍） |
| 官网机型页没挂商城购买链接（老机型 / 低端机） | `oppo-find-x8`、`oppo-find-x8s`、`oppo-find-x7`、`oppo-find-x6`、`oppo-find-x6-pro`、`oppo-a6`、`oppo-a6m`、`oppo-a6t`、`oppo-a6x`、`oppo-reno15c` | 同上；A6m/A6t/A6x 三兄弟共用一张 A6x 家族图（官网本身如此） |

实现：`scrapeOppoSpecs` 把已抓的参数页 HTML 以 `specsHtml` Map 传给 `scrapeOppoShop`，
后者对无商城源机型抽 `productColorImg` 下载、以 `bare: true` 交给 `normalize.py` 的裸名图分支。
**不要逐色切拼图**——机位互相遮挡，切出来不是完整产品图。

这类机型的 `colors[].hex` 为 `null`，前端渲染主图正常、单色切换为占位，不会报错。
**配色也照样入库**——取自 specs 页 `color-list-name` 的顺序，色名是官网原文。

另外有「部分配色不可购」的情况：`reno15`（星星粉）、`reno15-pro`（蜜糖金）参数页有、商城已下架，
抓取时会打印 `⚠ …在商城已不可购，未入库`，其余配色正常。

## 产出

- `src/data/devices/oppo-<name>.json`：项目 schema + 扩展字段 `os` / `biometric` / `cellular` / `nfc` /
  `display_secondary`（折叠屏副屏）/ `body.dimensions_folded_mm`（折叠态尺寸），直板机这些为 null
- `src/data/images/oppo-<name>.<配色slug>.jpg`：612×760 白底，每色一张（正面+背面组合图）
- 原图备份：`out/<run>/oppo-raw/`（官网 1440 透明 PNG，git 不跟踪）

## 实现要点（改代码前先读）

- specs 页解析**只信中文标签和值特征**：官网把 label 拼成 `data-labeKey`（少了个 b），且英文 key
  与中文标签/内容存在错位（同一含义两台机器用不同 key），不能当解析依据
- 配色默认值：specs 页 `color-list-name` 的顺序 = 官网展示顺序，第一个为默认色；
  注意它与商城接口 `attributesColorParams` 的顺序**恰好相反**（代码里按下标排序对齐，别混用）
- 图片归一化（`normalize.py`）不做任何切分：商城给的本就是独立分色图，裁紧 → 铺白 → 缩放即可
- 直板机的「类型/亮度」条目是多行文本，折叠机的值带 `主屏：/副屏：` 前缀且标签独立成行（见 `buildDisplay`）

### 相机条目：三代写法都要兼容

官网的相机写法**隔一两代就换一套**，`buildCameras` 里的正则与归类规则必须同时吃下这三种：

| 代际 | 例子 | 坑 |
|---|---|---|
| 新机型（X9/X10/Reno15+） | `5000万像素广角摄像头：f/1.6` | — |
| 2023-2024 老机型（X6/X7/X8） | `5000万像素1英寸大底广角：ƒ/1.8` | 光圈符号是 `ƒ`（U+0192）**不是** `f`；描述里**没有「摄像头」三个字** |
| 部分机型用逗号 | `3200万像素摄像头，f/2.4` | 分隔符是 `，` 不是 `：` |

对应的两条硬规则（**别删注释里的理由，容易改错**）：

- **像素单位要换算**：`分辨率` 统一存**百万像素**数值（与既有 71 台一致）。
  `5000万` → `50`（×0.01）、`2亿` → `200`（×100）、无单位 → 原值。写成 `万 → ×1` 会让 X6 变成 5000MP
- **电池容量取「典型值」那一行再取等效值**：老机型把**额定**写在**典型**前面
  （`额定容量：2350mAh（等效于4700mAh）\n典型容量：2400mAh（等效于4800mAh）`），
  直接 `firstNum()` 会拿到 2350 而不是 4800；折叠机写 `2775+3225 mAh（典型值），等效 6000 mAh`

### 镜头类型：按「关键词优先、焦距兜底」归一

官网对同类镜头有很多营销叫法（`哈苏人像`、`望远长焦`、`超光感潜望长焦`、`丹霞原彩`…），
统一归到数据集既有取值：**主摄 / 超广角 / 长焦 / 微距 / 景深 / 色彩还原 / 前置**，
规则在 `classifyLens()`。判定顺序不能乱：

| 顺序 | 规则 | 为什么必须在这一位 |
|---|---|---|
| 1 | 超广角 | 必须先判，否则被下面的「广角」吃掉 |
| 2 | 原彩 / 色彩还原 / 丹霞 → 色彩还原 | 只 X8 Ultra 有（200 万丹霞原彩镜头，做色彩校准） |
| 3 | 潜望 / 长焦 / 望远 → 长焦 | 要排在「微距」前：`特写潜望长焦` 同时含 特写 与 长焦，实为长焦 |
| 4 | 黑白 / 景深 / 虚化 → 景深 | A/K 系列的 200 万「黑白摄像头」实为虚化辅助，与 vivo Y500 口径一致 |
| 5 | 人像 → 看焦距（≥50mm 为长焦） | `哈苏人像摄像头` 是 X8 / X8 Pro 的 73mm 潜望，不是主摄 |
| 6 | 广角 → 主摄 | — |

改完归类规则后**必须跑一次巡检**，它会把「解析到的镜头数」和「官网原文里『XX像素』出现次数」对比：

```bash
cd sources/oppo
node recon/camera-dump.mjs            # 只列对不上的机型，正常应输出「0 台」
node recon/camera-dump.mjs --all      # 打印全部原文 + 归类结果
node recon/camera-dump.mjs oppo-find-x8-ultra   # 只看指定机型
```

同时它会把「同一台机出现多个主摄」标成可疑——正常机型应恰好 **1 个主摄 + 1 个前置**。

## 验收

```bash
cd tools/scraper

# 1. 抓完先对账（不需要 dev server，纯 fetch 官网）
node sources/oppo/recon/camera-dump.mjs   # 应为「镜头数对不上的机型：0 台」
node sources/oppo/recon/color-audit.mjs   # 参数页配色与商城配色应对得上

# 2. 浏览器端验收（前置：dev server 已起在 5173）
node recon/picker.cjs        # 弹框分组（含 OPPO 品牌与系列）
node recon/sticky-bar.cjs    # 置顶机型栏：点按钮应弹出选择弹框（不是就地下拉）、选机后列同步
node recon/oppo-page.mjs     # 对比页：轮播切换、副屏/系统与连接分区、折叠态尺寸行

# 3. 全量数据完整性 + 构建
cd ../.. && PATH="/opt/homebrew/bin:$PATH" node scripts/ssr-check.mjs
PATH="/opt/homebrew/bin:$PATH" npm run build
```

`ssr-check.mjs` 会逐台核对品牌、配图、配色声明与配图是否齐全、芯片、电池容量、摄像头、发布日期。
「整机留空」的机型（参数入库、图片留空）是**合法状态**，会单独列出来一行，不会算 FAIL；
要抓的异常是「部分配色有图、部分没图」—— 那说明配色 slug 和图片文件名对错了位。
当前基线：**164 台机型 / 1319 项 PASS / 0 FAIL（其中小米 15 台、OPPO 12 台为「裸名图」机型——
单色维度无图但整机有官方多色图，同算合法；华为 Mate 60 / 70 系列 + Pura 80 系列 13 台的芯片为 `null`，
是官网口径就不公布 SoC，ssr-check 有白名单）**。**输出里没有 `FAIL` 才算加成功。**

---

# 五、小米：官网 specs（参数）+ 官方商城接口（分色图）

## 为什么要浏览器 + 商城接口

- **参数**：`mi.com/prod/<slug>/specs` 是 SPA 壳，静态 HTML 只有 SEO meta，参数必须开浏览器渲染后取参数区（`[class*="_root_div"]`）的纯文本再切分。7 台实测存在**两套模板**（一小节一块 / 标题块+值块相邻），好在都能用「已知小节标题精确匹配全文切分」统一处理（`parseSections`）。
- **图片**：商城接口 `https://api2.order.mi.com/product/view?product_id=<id>&version=2`（**必须带 `Referer: https://www.mi.com/`，否则 406**）。`goods_list[]` 里每个 版本×配色 一条，`goods_info.img_url` 是**该配色的渲染图**（800×800 透明 PNG，正反双面构图）。`imgs[]` / `gallery_v3` 会随版本变或是全局共享，**都不是分色图，不能用**。

## 用法

```bash
cd tools/scraper

# 先预览（强烈建议首次这么做；--no-images 省掉重新下图）
node cli.mjs xiaomi --models xiaomi-17,xiaomi-17-ultra --dry-run --no-images

# 确认无误后正式入库
node cli.mjs xiaomi --models xiaomi-17,xiaomi-17-pro,xiaomi-17-pro-max,xiaomi-17-ultra,xiaomi-17-max,xiaomi-17t,xiaomi-17t-pro
```

`--models` 填**本项目机型 id**（`xiaomi-<slug>`），slug 与 product_id 都记在 `sources/xiaomi/specs.mjs` 的 `SPECS_URLS` 与 `shop.mjs` 的 `PRODUCT_IDS` 里。

product_id 怎么找：商城搜索接口直接 curl 会被拒（406「请求来源不合法」），用浏览器开真搜索页抓 DOM 卡片链接 `/shop/buy?product_id=XXX`（侦察脚本 `recon/search-cards.mjs`）。

## 加新机型（3 处，都必须补）

| 文件 | 补什么 | 漏了会怎样 |
|---|---|---|
| `specs.mjs` → `SPECS_URLS` | 官网 specs 页地址 | 报「未知小米机型」 |
| `specs.mjs` → `META` | `name` / `series` / `release_date`（参数页没有发布时间，发布会公开信息人工核对） | 同上 |
| `colors.mjs` → `COLOR_SLUGS` | 每个中文色名 → 英文 slug | 抓图时抛错点名缺哪个色名 |
| `shop.mjs` → `PRODUCT_IDS` | 商城 product_id | 参数照常入库、**图片留空**，不报错 |
| `shop.mjs` → `LEGACY_MODELS` | **12/11/10 系列这类商城接口已下线的老机型**：一张多色全家福图 URL + 色名数组（替代 `PRODUCT_IDS`） | 参数照常入库、**图片留空**，不报错 |

新色名先跑 `node sources/xiaomi/recon/shop-api.mjs <product_id>` 看商城返回的配色列表，确认色名后补映射。

## 参数页为空的机型：OVERRIDES 兜底

小米会先上架商品、后填参数页。**`xiaomi-17t` 的参数页就是空壳**（渲染后只有概述页内容），
这类机型在 `specs.mjs` 的 `OVERRIDES` 里登记缺的数据（来源：概述页 + 商城关键参数 `class_parameters`，
人工核对后写入），并在注释里说明来源。17T Pro 的电池容量、前置摄像头也用商城关键参数兜底。
**官网参数页补全后应删掉对应条目改走页面解析。**

## 13/14 系列的两套老页面（实测 2026-09-24）

| 机型 | 参数页 | 图片 |
|---|---|---|
| 14 / 14 Pro / 13 / 13 Pro / 13 Ultra | 老模板 `https://www.mi.com/<slug>/specs`（参数区挂 `component-content__<slug>`，不是 `_root_div`） | 商城在售（搜索卡片或 web 搜 product_id） |
| 14 Ultra | 老模板 URL 已 404，新模板页在 `/prod/xiaomi-14-ultra/specs` | 同上（1230801639） |
| 15 / 15 Pro / 15 Ultra / 15S Pro | 新模板 `/prod/<slug>/specs`（15 Pro/Ultra/S Pro 是「值在前、标题在后」变体，body 从全文兜底取） | 产品页「立即购买」链接里挖 product_id（`recon/buy-links.mjs`） |

老模板与 17 系列的解析差异（都已兼容，见 `specs.mjs` 注释）：长焦条目不写像素（`resolution_mp` 为 null，
忠实于官网）、「超低畸变广角」→ 超广角、频段带（上行/下行 MHz）括注、HDR 行是 `Dolby Vision` 英文、
指纹写在屏幕卖点行而非独立小节、13/13 Ultra 是 2022 年更老的相机条目格式（54MP 主摄那套，已兼容）。

## 12/11/10 系列：更老模板 + 国际站 + 裸名多色图（实测 2026-09-24）

15 台的参数页与图片来源都不再统一，逐类记一下：

| 机型 | 参数页 | 图片 |
|---|---|---|
| 12 / 12 Pro / 12X / 12S / 12S Pro / 12S Ultra | 国行老模板 `https://www.mi.com/<slug>/specs`（标题体系是「影像系统 / 充电续航」，NFC 小节写作 **NFC功能**） | 参数页多色全家福（`LEGACY_MODELS`，手动敲定） |
| 11 / 11 Pro / 11 Ultra / 11 青春版 | 同上；**11 Pro 的 slug 是大写 P**（`mi11Pro`），少一个字符就 404 | 同上 |
| 10 至尊纪念版 / 10S / 10 青春版 | 同上；10 至尊纪念版的标题顺序是「处理器 / 内存与容量 / 屏幕与指纹 / 后置相机 / 前置相机 / 充电与电池 / 网络与制式」 | 同上 |
| 10 / 10 Pro | 国行页已下架 → **UK 国际站** `https://www.mi.com/uk/mi-10/specs`（全英文标题） | 国际站 CDN 多色图 |

老模板的四个新坑（都已在 `specs.mjs` / `shop.mjs` 里兼容）：

1. **国际站标题跨行**：`Network &` / `Connectivity`、`Navigation &` / `positioning` 被页面拆成两行 → `joinSplitTitleLines()` 先把 `&` 收尾的行拼回去。
2. **国际站频段写裸数字**：`4G: FDD-LTE :1/2/3/…` 没有 `B` 前缀，TDD 段还缩写成 `TD-LTE`（国行是 `TDD-LTE`），且一条 `4G：` 里用 `；` 分两段 → `cleanBand()` 补 `B` 前缀、`seg()` 只在不接 `(F|T)DD?-LTE` 时才按分号截断。
3. **国际站内存段用英文标签**：`RAM: 8GB` / `ROM: 128GB / 256GB`，类型另起一行（`LPDDR5 memory`）→ `buildChipset()` 两种标签都认。
4. **老页面不写指纹/屏幕材质**：12/12X/12S/10S 页面通篇没有「指纹」二字，12/12X 只写卖点名「超视感屏」，10 青春版只写「180Hz 采样率」不写刷新率 → 这类「页面确实没写、但实机有」的字段记在 `OVERRIDES`（人工核对，注释里写来源），不影响页面解析。

老机型的**图片没有分色图**（商城接口早已下线），改在 `shop.mjs` 的 `LEGACY_MODELS` 里逐台登记一张官方**多色全家福**（`specs-product.png` 那类，横构图、多个配色并排），
配 `colors` 色名数组；`fetchLegacyColors()` 只出 name/slug，hex 与 imgUrl 恒为 null。
裸名图（`<机型id>.jpg`，无配色段）走 `normalize.py` 的 `bare: true` 分支：**画布跟随图片比例**（最大 760×570），不取色、不套 612×760 竖版画幅。
「配色有声明但一张图都没有」是**合法状态**，`ssr-check.mjs` 认这种 `imageless` 机型（同 OPPO 的 `oppo-a6`/`oppo-a6m`）。

## 商城配色口径

- `fetchXiaomiColors` 会剔除**套装**与**限量定制色**（非真配色，同 17 Ultra 徕卡版口径），
  以及挂了色名但商城无产品图的不可购配色（⚠ 打印后跳过，同 OPPO 源「不可购不入库」；
  15 Ultra 的樱花粉/微风蓝/鸢尾紫/金棕色即此情况）。
- 14 Ultra 的 `钛金属特别版`、15S Pro 的 `龙鳞纤维版` 是真配色，正常入库。

## 产出

- `src/data/devices/xiaomi-<slug>.json`：schema 对齐 OPPO 源（含 `os` / `biometric` / `cellular` / `nfc` / `display_secondary`）
- `src/data/images/xiaomi-<slug>.<配色slug>.jpg`：612×760 白底，每配色一张
- 原图备份：`out/<run>/xiaomi-raw/`

## 实现要点（改代码前先读）

| 主题 | 说明 |
|---|---|
| 渲染偶发不完整 | SPA 偶尔没渲染完就取了 DOM（实测 17 Pro 出现过一次）。`fetchSpecsTexts` 按「小节标题命中数 ≥3」判断成功，不足则重试最多 3 次；`OVERRIDES` 里的空壳机型不重试 |
| 参数 → 小节 | `parseSections()` 按 `TITLES` 精确匹配切分全文，不依赖 DOM 块位置（两套模板通吃） |
| 商城接口只打一次 | `specs.mjs` 一台机型会调 3 次商城数据（关键参数 / 在售版本 / 配色），`shop.mjs` 用 `viewCache` 记忆化，避免重复请求 |
| 有线/无线充电 | 用前瞻正则取：`([\d.]+)W(?=[^\d\n]*有线(?!反向))` / `无线(?!反向)`，避免把「50W 无线」误当有线 |
| HDR 认证 | 从整节文本里提 `HDR10+ / HDR Vivid / 杜比视界 / HLG`，竖线分隔的 token 兼容 |
| 防水等级 | 只写在页尾「特别说明」里（`IP(6[89])`）。**17 Pro / 17 Pro Max 页面与商城关键参数都没写** → `water_resistance` 为 null，忠实于源 |
| 频段尾巴 | 2G/3G 条目会把「未开通…络和业务部署」等说明折行拼进来，`cleanBand()` 截到最后一个频段 token |
| 相机解析 | 与 OPPO 同口径（`万 → ×0.01`、ƒ/f 两种光圈符号、`classifyLens` 关键词优先焦距兜底） |
| 图片取色 | 商城不给色值。`normalize.py` 采样背板干净区（小米构图背面在左，取左下 1/3）中值作 hex |
| 指纹 | 17/15/14/13 系列参数页写「屏下指纹」，12/11/10 系列多数不写（见上文 OVERRIDES），11 青春版是侧边指纹 |

## 验收

```bash
cd tools/scraper

# 1. dry-run 对账（省流量）
node cli.mjs xiaomi --models <机型列表> --dry-run --no-images

# 2. 全量数据完整性 + 构建
cd ../.. && PATH="/opt/homebrew/bin:$PATH" node scripts/ssr-check.mjs
PATH="/opt/homebrew/bin:$PATH" npm run build
```

跨品牌的弹框分组验收见 `recon/picker.cjs`（小米品牌加进 `SERIES_ORDER` 后自动纳入）。

---

# 六、华为：官网 specs（参数 + 分色图同一页）+ vmall 正背组合图

华为分两部分：参数与分色图来自官网 specs 页（不用商城接口、不用浏览器，`fetch` 一次就够）；
**正面图**来自 vmall 商品图（真浏览器抓，见下文「为什么还要 vmall」）。

## 为什么还要 vmall（正面图）

官网 specs 的分色图是**背面斜视图**，且官网全站没有正面渲染图（中文站 specs / 产品页 design、
英文站 specs 都排查过，见 `recon/front-image-probe*.mjs`）。唯一的官方正面图是 vmall 的商品图
—— 多色「背面+正面亮屏」组合图。抓取链路（`front.mjs`，每台约 5-6 秒）：

1. 真浏览器开 `www.vmall.com/search?keyword=<关键词>` 过 WAF，捕获搜索接口 XHR（`openapi.vmall.com/mcp/...`）
2. 从 `resultList[]` 里按型号词精确匹配（配件「保护套/壳/膜」直接丢弃；只有「官方翻新」在售时
   退回翻新机条目，商品图与新品相同），拿 `productId + photoPath + photoName`
3. 拼 CDN 原图 `res.vmallres.com/pimages<photoPath>800_800_<photoName>` 下载 →
   `normalize.py`（bare 模式，画幅上限 760×570）→ `src/data/images/<id>.jpg` 裸名图

前端把裸名图**追加进每个配色的图片轮播末尾**（`PhoneHeader`），分色图照常切色。
Mate 60 系列 vmall 已无手机商品 → 没有组合图，维持背面分色图（已知口径）。

```bash
node cli.mjs huawei-front --dry-run    # 先看每台命中哪个商品
node cli.mjs huawei-front              # 全量入库（23 台，Mate 60 系自动跳过）
node cli.mjs huawei-front --models huawei-pura90   # 单台重抓
```

## 用法

```bash
cd tools/scraper

# 先预览（强烈建议首次这么做）
node cli.mjs huawei --models huawei-mate80,huawei-mate80-pro-max --dry-run

# 确认无误后正式入库
node cli.mjs huawei --models huawei-mate80,huawei-mate80-pro,huawei-mate80-pro-max,huawei-mate80-pro-max-fengchiban,huawei-mate80-rs

# Mate 70 系列（官网在架，同一条链路）
node cli.mjs huawei --models huawei-mate70,huawei-mate70-pro,huawei-mate70-pro-plus,huawei-mate70-pro-youxiangban,huawei-mate70-air,huawei-mate70-rs

# Mate 60 系列（官网参数页已下架 → 自动走 legacy.mjs，见下文）
node cli.mjs huawei --models huawei-mate60,huawei-mate60-pro,huawei-mate60-pro-plus,huawei-mate60-rs
```

`--models` 填**本项目机型 id**（不是官网 slug），映射在 `sources/huawei/specs.mjs` 的 `SPECS_URLS`（在架机型）与 `sources/huawei/legacy.mjs`（Mate 60 系列）。

## 加新机型（3 处，都必须补）

1. `sources/huawei/specs.mjs` 的 `SPECS_URLS`：`<本项目 id>` → `https://consumer.huawei.com/cn/phones/<官网 slug>/specs/`
2. 同文件 `META`：中文名 / 系列（**产品线**：Mate 系列 / Pura 系列）/ `release_date`。**官网参数页没有发布日期**，得从发布会公开信息填，格式 `YYYY-MM`（Mate 80 系列 `2025-11`、风驰版 `2026-03`、Mate 70 系列 `2024-11`、Pura 90 系列 `2026-04`、Pura 80 系列 `2025-06`、Pura X View `2026-09`）
3. `sources/huawei/colors.mjs` 的 `COLOR_SLUGS`：该机型所有中文色名 → 英文 slug。缺一个会在解析时抛错并点名是哪个色名

新系列还要在 `src/data.js` 的 `SERIES_ORDER.华为` 里补系列名，弹框分组才有顺序（不补则沉底）。

## Mate 60 系列：官网参数页已下架 → legacy 通道

实测（2026-09）：`/cn/phones/mate60*/specs/` 全部 301 到机型列表页，CDN 上老路径的图被删，
vmall 也搜不到这几台手机的商品 —— **参数没有现成的官方在线源**。但两样东西活着：

- **官方 CDN 的分色图还在**，只是路径从 `…/specs/<color>.png` 变成了 `…/img/specs-img/<color>.png`（RS 是 `…/img/specs/`）
- **官网参数页的 Wayback 存档**内容完好（本机网络到 archive.org 不通，用 WebFetch 读，人工转录）

所以 Mate 60 系列走 `sources/huawei/legacy.mjs`：参数 = 官网存档原文**人工转录**（sections 紧凑表），
图 = 官网 CDN 直链，解析复用 `buildDevice()` —— 焦段按镜头类型回填、瓦数取脚注等规则全部同样生效，
JSON 形状与 70/80 系列完全一致。`cli.mjs huawei --models` 传 legacy 机型 id 时自动切这条路，不 fetch 页面。

**改 legacy 数据请直接改 `legacy.mjs`**，并更新文件头的核对记录；它不会被抓取结果覆盖。

几个口径决定（都写在 `legacy.mjs` 注释里）：

| 项 | 处理 |
|---|---|
| 卫星通信 | 当年参数页不列这一行 → 取官网**产品页**存档口径：Pro / Pro+ / RS「卫星通话、卫星消息」，标准版「双向北斗卫星消息」（无卫星通话） |
| `sim` / `esim` | 60 系参数页没有 SIM 卡类型 / eSIM 分组 → `null` |
| 芯片 | 60 / 70 两代官网都不公布 SoC → `chip: null`（见下） |
| Mate 60 RS 重量 | 官网按配色给两个值（玄黑 242 g / 瑞红 246 g），schema 单值 → 取默认色玄黑的 242 g |
| Mate 60 标准版人脸 | 官网感应器列表没有人脸识别、前置也没有 3D 深感 → `face_unlock: null` |

## 页面结构（实测 2026-09，Mate 80 系列 5 台一致）

纯 SSR，**不需要浏览器**。参数在 `<li class="large-accordion__item">` 手风琴里：

- 分组名：`<span class="large-accordion__title large-accordion-title">分组名</span>`
- 组内条目：`<div class="large-accordion__inner">` 里，条目名是 `<div class="large-accordion-subtitle">`（**可选** —— 处理器、电池这类组没有条目名，值直接是 `<p>`）
- 值：`<p>值</p>`；脚注是 `<p class="large-accordion-subtext">`，**必须排除**，否则会混进值里
- 配色：`<div class="color-text">色名，色名，…</div>` 给顺序（**第一个是默认色**），配色 `<ul>` 里每色一张 `<img src="/content/dam/…/specs/<file>.png" alt="中文色名">`

取色：官网不给色值 → `normalize.py` 从图片背板干净区（`BACK_BOX`，相对内容 bbox 的左下方）取中值。

## 官网确实不写的字段

这些留 `null` / 空，前端显示「—」，**不要硬凑**：

| 字段 | 处理 |
|---|---|
| `chipset.chip`（芯片） | **Mate 60 / 70 两代官网连「处理器」分组都没有**（华为对这两代不公布 SoC）→ `null`；Mate 70 Air 是例外（页面有「处理器」，麒麟 9020A / 9020B）。ssr-check 对这 9 台有白名单 |
| `cellular.bands`（网络频段） | 恒为 `null`（官网不公布） |
| `sim` / `esim` | Mate 70 系参数页没有「SIM 卡类型 / eSIM」分组 → `null`（Mate 80 系有） |
| `display.max_brightness_nits` / `hdr_formats` | 官网不写 |
| `display.form`（直屏 / 曲屏） | `null` |
| `display.refresh_rate` | Mate 70 Air 的「屏幕类型」行没写刷新率 → `null`（官网口径） |
| `ppi` | 官网不给，用「分辨率 + 屏幕尺寸」自算（`ppiOf()`） |

## 实现要点（改代码前先读）

- **取值靠「分组名 + 条目名」**：`rowOf(sections, group, keyRe)`；没有条目名的组传 `null`，直接取第一行
- **手风琴标题正则**：用 `/large-accordion-title">([\s\S]*?)<\/span>/`。**不要**写成 `class="large-accordion-title">` —— 实际 class 是 `large-accordion__title large-accordion-title`，写窄了 19 个分组会**全部无标题**
- **eSIM 必须先判「不支持」**：`/支持/.test("不支持")` 为 `true`，顺序写反会把「不支持」判成支持
- **容量解析先去掉空格**：华为写「16 GB RAM」，`capList()` 要先 `replace(/\s+/g,"")` 再匹配
- **颜色与图片用色名配对，不按序号**：`parseColors()` 返回 `Map(中文色名 → 图片 URL)`，`buildColors()` 用色名回查，缺了直接抛错
- **芯片按内存版本区分时原样并入**：Mate 80 Pro 12GB→麒麟 9030 / 16GB→麒麟 9030 Pro；Mate 70 Air 一个 `<p>` 里两型号换行（「麒麟 9020A\n\n麒麟 9020B」）→ 归一成「麒麟9020A / 麒麟9020B」（去「麒麟」后的空格，与「麒麟9030 Pro」同一写法）
- **焦段按镜头类型回填，不按出现顺序**：官方那句「镜头焦段分别为 …」的顺序和镜头排列顺序并不总是一致 —— Mate 80 是 24/13/90.5（恰等于页面顺序），Mate 70 Air 是 16/24/69 而页面顺序是 主摄/长焦/超广角。规则：超广角拿最小焦段、主摄拿最接近 24 mm 的、长焦按页面顺序分剩下的
- **有线瓦数可能只在脚注里**：Mate 70 / Mate 60 标准版的「有线充电」行只写「11V/6A」，瓦数（66 W）在脚注「最大支持 66 W 华为有线超级快充」→ `buildBattery` 有脚注兜底；无线只认「N W 华为无线超级快充」，不然会被「20 W 无线反向充电」抢走
- **「屏内指纹」（60 系）=「屏下指纹」（70/80 系）**，统一成屏下指纹，跨机型可比
- **重量单位两代写法不同**：Mate 系写「约 211 g（含电池）」，Pura 80 系写「约 211 克（含电池）」→ 正则 `([\d.]+)\s*(?:g\b|克)`
- **像素单位有「万」也有「亿」**：绝大多数写「5000 万像素」，Pura 90 Pro Max 的长焦写「超大底 2 亿长焦摄像头」（没有「像素」二字）→ `megapixels()` 两种都吃（「N 万像素」→ N/100，「N 亿」→ N×100）；没有像素值的（「第二代红枫原色摄像头」「150 万多光谱通道红枫原色摄像头」）不入库
- **手工侦察时 curl 必须加 `--compressed`**：`consumer.huawei.com` 的响应是 gzip，不加会拿到二进制乱码、所有正则全部 miss

## 产出

- `src/data/devices/huawei-*.json`（23 台：Mate 15 + Pura 8）
- `src/data/images/huawei-*.<色 slug>.jpg`（每配色一张，612×760 白底 JPEG，共 80 张）
- 原图不落盘备份（官网图不大，重抓成本低；Mate 60 系列图走官网 CDN 直链，一样不备份）

## 验收

```bash
cd tools/scraper
node cli.mjs huawei --models <机型列表> --dry-run    # 先对账

cd ../.. && PATH="/opt/homebrew/bin:$PATH" node scripts/ssr-check.mjs
PATH="/opt/homebrew/bin:$PATH" npm run build
cd tools/scraper && node recon/picker.cjs            # 弹框里应出现「华为 23 台、2 个系列：Mate 系列 → Pura 系列」
```

---

# 七、改了选择器怎么办（侦察脚本）

苹果、一加、OPPO 都会改版。选择器失效时先用侦察脚本看页面现在长什么样，再回去改对应的 `sources/<源>/` 主流程：

```bash
node cli.mjs recon          # 列出所有侦察脚本（这份清单是手写的，目录里以实际文件为准）

# 苹果
node sources/apple/recon/page.mjs [机型列表]         # 页面请求了哪些图、色板/表格结构
node sources/apple/recon/swatches.mjs [机型] [dpr]   # 深挖色板 DOM 与 2x 图

# 一加
node sources/oneplus/recon/dom.mjs                   # 旧模板 specs 页的分区结构

# vivo
node sources/vivo/recon/dump.mjs [slug]              # 参数分组、配色与 __NUXT_DATA__ 顶层形态

# OPPO —— 改解析逻辑后必跑 camera-dump，它拿官网原文对账
node sources/oppo/recon/dump.cjs                     # specs 页分组结构与全部字段
node sources/oppo/recon/camera-dump.mjs [--all|机型…] # 相机原文 + 归类结果，查漏抓/分错
node sources/oppo/recon/specs-probe.mjs              # 全部机型的 specs 页可用性
node sources/oppo/recon/color-audit.mjs              # 参数页配色 vs 商城配色是否对齐
node sources/oppo/recon/shop-gallery.mjs [skuId]     # 商城页颜色切换器、图集与接口行为
node sources/oppo/recon/shop-map.mjs                 # 官网机型页 → 商城入口 SKU 映射扫描

# 小米 —— 改解析逻辑后用 recon/ 下的脚本看页面现貌
node sources/xiaomi/recon/raw-text.mjs               # 渲染后参数区全文（切分逻辑的输入）
node sources/xiaomi/recon/blocks.mjs                 # 参数区 DOM 块结构（两套模板差异）
node sources/xiaomi/recon/shop-api.mjs [product_id]  # 商城 product/view 返回什么（配色/关键参数）
node sources/xiaomi/recon/search-cards.mjs           # 真搜索页 DOM 卡片（反查新机型 product_id）
node sources/xiaomi/recon/overview-text.mjs          # 概述页文本（OVERRIDES 相机数据的来源）

# 华为 —— 页面是纯 SSR，直接 curl 存下来看最快（记得加 --compressed，否则是 gzip 乱码）
curl -s --compressed https://consumer.huawei.com/cn/phones/mate80/specs/ -o /tmp/hw.html
node sources/huawei/recon/vmall-probe.mjs            # 侦察：vmall 商城页可达性（有 WAF，不采用）
```

也可以直接 `node cli.mjs recon --run page`。

## 自检

苹果的解析逻辑（从 URL 切出机型/配色）有独立测试，**改完代码跑一下**：

```bash
node sources/apple/test/parse.test.mjs    # 或 npm test
```

一加没有单测（解析正确性只能靠真实页面），入库后从仓库根跑一次**全量数据完整性校验**：

```bash
cd ../.. && PATH="/opt/homebrew/bin:$PATH" node scripts/ssr-check.mjs
```

它会逐台核对品牌、配图、配色声明与配图是否齐全、芯片、电池容量、摄像头、发布日期，并确认首屏 4 列（默认取最新的 4 台）渲染正常。**输出里没有 `FAIL` 才算加成功。**

---

# 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 一张图都没抓到 | `--models` 不是苹果认的 slug。加 `--headed` 看浏览器里到底显示了什么 |
| 拿到的图偏小 | `--dpr` 不是 2。dpr=1 只有 `_large`，2 才有 `_large_2x` |
| 报告里"默认色"不对 | 已在点击色板**之前**先读一次配色表修正；若苹果改版需复查 `sources/apple/compare.mjs` |
| 想抓的机型少于 3 台 | 正常，`--batch-size` 会自动分批 |
| 入库时提示跳过 | 目标已存在同名文件。确认要替换就加 `--overwrite` |
| 提示找不到 Chrome | 本机没装 Chrome/Edge，或用 `--chrome-path` 指定 |
| 一加报 `CURATED 里缺 <slug> 的 release_date` | 新机型的 slug 没进 `CURATED`。官网 specs 页不含发布时间，必须人工核对后补上 |
| 一加报找不到带 Pillow 的 python3 | `pip install pillow`，或用 `PYTHON=/path/to/python3` 指定 |

# 边界与已知限制

- **苹果只抓图，不抓参数**：参数 JSON 仍在 `src/data/devices/` 手工维护。要抓参数需要新增 `sources/` 适配器 + 输出到 `out/`，人工 diff 后再入库。
- **改版会失效**：苹果的选择器（`.colornav-*`）与 URL 规律、一加的 `pageDsl` 结构与 `.spec-content` 分区，都依赖对方现有实现，改版后需要更新对应 `sources/<源>/` 的主流程。侦察脚本就是为这个准备的。
- **`release_date` 等字段靠人工核对**：一加的发布时间、HDR 认证、部分防水等级不在 specs 页，维护在 `CURATED`。
- **加新品牌**：在 `sources/` 下新建目录放该品牌的解析代码，在 `cli.mjs` 加一个子命令，`lib/browser.mjs` 按需复用。**不要**把新品牌的逻辑塞进已有的源目录。
