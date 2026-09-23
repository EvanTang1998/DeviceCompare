# 数据采集工具

给 DeviceCompare 补机型数据用。**一个数据源一个目录**，各自独立、互不引用 —— 要加新品牌就在 `sources/` 下新开一个目录，坏一个不影响另一个。

## 先读这段：三个数据源，三种玩法

目前有三个源，玩法**完全不同**，命令和产物也不通用：

|  | 苹果 `sources/apple/` | 一加 `sources/oneplus/` | vivo `sources/vivo/` |
|---|---|---|---|
| 数据源 | apple.com.cn 的 iPhone 对比页 | oneplus.com/cn/&lt;slug&gt;/specs | vivo.com.cn/vivo/param/&lt;slug&gt; |
| 采集方式 | Playwright 开真页面，**监听它自己发出的图片请求** | 直接 `fetch` 页面 HTML，解析内嵌的 `window.pageDsl` JSON | 直接 `fetch` 页面 HTML，解码内嵌的 `__NUXT_DATA__`（Nuxt/devalue） |
| 拿到什么 | **只有图片** | **参数 JSON + 图片** | **参数 JSON + 图片** |
| 流程形态 | 两阶段：先抓图落 `out/`，再 `promote` 入库 | 一步：直接写 `src/data/` | 一步：直接写 `src/data/` |
| 参数 JSON | **手工维护**（工具不碰） | 自动生成 | 自动生成 |
| 色值来源 | 图片取色 | 图片取色 | **官网直接给** `colorCode` |
| 配色 slug | 官网图片文件名 | 官网图片文件名 | **拼音**（官网没有英文名） |
| 需要 Chrome | 必须 | 仅旧模板页面需要（如 13） | **不需要** |
| 需要 Python | 不需要 | 需要（Pillow，做图片归一化与取色） | 需要（Pillow，只做归一化） |
| 命令 | `images` / `promote` / `list` | `oneplus` | `vivo` |
| 输出目录 | `tools/scraper/out/`（gitignore） | 直接落 `src/data/`（入库） | 直接落 `src/data/`（入库） |

**为什么不合成一个脚本**：采集机制、产物契约、流程形态三样都不一样，硬合只会到处 `if (brand === ...)`。真正共用的只有「启动系统 Chrome」这一小段，放在 `lib/browser.mjs`，两边都调它。

---

## 前置条件

- **Node**：本机 `/opt/homebrew/bin/node`（v26）
- **Google Chrome**：工具复用系统已装的 Chrome，不下载 Playwright 自带的 Chromium（那个包约 300MB，国内网络经常超时）。也可以用 Edge。
- **Python + Pillow**：**一加和 vivo 需要**。取色脚本优先用 `$PYTHON` 环境变量指定的解释器，其次找 `~/.workbuddy/binaries/python/envs/default/bin/python3`，最后退回 `python3`。手动装：`pip install pillow`
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
├── recon/
│   └── picker.cjs               验收：机型选择弹框的「最近发布」浏览态与系列分组（跨数据源）
├── out/                         苹果抓图产物（gitignore）
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

已知 `oneplus-ace-6.json` 是人工增强过的（`camera[].sensor` = 索尼 IMX906、`sensor_size_inch`、`pixel_size_um`），而 `sensor_size_inch` / `pixel_size_um` **脚本不产出**。所以要重抓它之前，先把这两类字段抄回去。判断方法：`sensor` 不是「未公开」、或出现 `sensor_size_inch`，就是人工补的。

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
| 传感器型号 | 官网多数机型不写，写了就是有效信息（Ace 5 前置写「SONY IMX480」）。只认 `SONY/索尼 + IMX 编号`这种无歧义写法，其余回落「未公开」——**别放宽正则**，会把规格描述里的数字抓成型号 |
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

JSON 顶层的 `series` 字段（如「iPhone 17 系列」「X 系列」「Turbo 系列」）驱动弹框分组。弹框默认 chip 是「最近发布」：按品牌分组，每组只铺**最新的 4 台** + 组尾「查看更多」卡片（点击进入该品牌完整列表）。不能按「最新系列」取精选——vivo 全部 X 机型共用一个 series，会把 18 台全放进来。选了品牌或开始搜索后退回完整的「品牌 → 系列」分组列表。这个弹框是点击后才挂载的，`ssr-check` 的整树渲染碰不到，所以要跑浏览器校验（前置同上）：

```bash
node recon/picker.cjs
```

它做三件事，期望值直接从浏览器里的 `src/data.js` 取，不另维护一份：

| 检查项 | 抓的是什么问题 |
|---|---|
| 浏览态 = 品牌顺序 × 每品牌最新 4 台，组尾「查看更多」提示的剩余台数正确 | 精选口径算错、跳转卡缺失或提示错 |
| 逐品牌进完整列表，「全量」每张卡按 DOM 顺序与数据比对品牌/系列/新角标，系列标题无缺无重 | **分组错位**（机型掉进错误系列、系列标题漏渲染） |
| 搜索结果仍带分组 | 分组逻辑与搜索叠加时崩掉 |

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

# 四、改了选择器怎么办（侦察脚本）

苹果、一加都会改版。选择器失效时先用侦察脚本看页面现在长什么样，再回去改对应的 `sources/<源>/` 主流程：

```bash
node cli.mjs recon          # 列出所有侦察脚本

# 苹果
node sources/apple/recon/page.mjs [机型列表]         # 页面请求了哪些图、色板/表格结构
node sources/apple/recon/swatches.mjs [机型] [dpr]   # 深挖色板 DOM 与 2x 图

# 一加
node sources/oneplus/recon/dom.mjs                   # 旧模板 specs 页的分区结构
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
