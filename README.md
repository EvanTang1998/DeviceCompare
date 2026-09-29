# 灵眸 · 手机对比网站

仿 Apple iPhone Compare 风格的手机参数对比网站，React + Vite 纯前端实现，机型数据为本地 JSON。
入口是**首页**（大标题「灵眸 手机对比」+ 搜索框 + 热门机型网格：每品牌最新 `HOT_PER_BRAND` 台按品牌轮转、首屏铺 `HOT_ROWS` 行、一行**最多 6 列**；底部的「显示更多」一次再铺 `HOT_ROWS` 行，热门池取空后按钮自己消失）。点机型卡片任意处打开**参数浮窗**（左图右参数，从点击处放大、关闭缩回原处，点空白或按 Esc 也能关）。鼠标进卡片时**卡片原地放大**约 3%（只放大不位移，hover 不会丢）并浮起投影；底部浮出「添加对比」**小胶囊（浅灰底），光标压上去才长大到满宽的 81%、40px 高**（横向不用对准）—— 配色只有两档且**只由"加没加"决定**（未加 = 浅灰底深色字，已加 = 淡蓝底蓝字），所以按钮从小长大时颜色一动不动，只是安静地把尺寸换一档。加进右下角的**暂存区**，点浮标进对比页，对比页顶栏的「返回首页」退回来。已加入对比的卡片**卡面保持留白、四周加强**（蓝描边 + 光晕）、「已添加」按钮常驻显示，一眼能看出哪几台在表里；暂存区**空态也常显**（计数 0），此时点它不跳转、改为图标震一下示意。**地址栏会跟着状态走**（见下方「地址栏参数」），所以链接可以直接分享、浏览器后退键可用、刷新也不丢状态。机型选择弹框按「品牌 → 系列」两级分组（系列来自 JSON 的 `series` 字段）。设计需求与规划见 [designer-document/设计说明.md](designer-document/设计说明.md)。

## 快速开始

```bash
npm install        # 首次安装依赖
npm run dev        # 开发模式（热更新，http://localhost:5173/DeviceCompare/）
npm run build      # 构建生产包到 dist/
npm run preview    # 本地预览构建产物（http://localhost:4173/DeviceCompare/）
```

## 在线访问（GitHub Pages）

推送到 `main` 后 GitHub Actions 自动构建并部署到：
**https://evantang1998.github.io/DeviceCompare/**

首次使用需在仓库 Settings → Pages → Source 选择「GitHub Actions」启用一次。

## 目录结构

```
├── index.html                    # 入口 HTML
├── vite.config.js                # Vite 配置（base 路径、插件）
├── package.json                  # 依赖与脚本定义
├── src/
│   ├── main.jsx                  # React 入口
│   ├── App.jsx                   # 视图切换（首页 ↔ 对比页）+ 四列参数表 + 各类弹框 + 地址栏同步
│   ├── Home.jsx                  # 首页：大标题 + 搜索框 + 热门机型网格（每品牌最新 HOT_PER_BRAND 台、首屏 HOT_ROWS 行、「显示更多」按批追加）
│   ├── PhoneDetailOverlay.jsx    # 参数浮窗：左图（轮播 + 配色）右参数，从点击处放大/收回
│   ├── CompareDock.jsx           # 暂存区浮标：右下角（1.5 倍尺寸），悬停摊开已添加机型、可清空，点击进对比页；空态常显（计数 0，点击只震动不跳转）
│   ├── urlState.js               # 地址栏参数的纯转换（buildSearch / readFromSearch / sameState）
│   ├── useGallery.js             # 配色 / 多角度轮播 / 加载态 / 空闲预取（表头与浮窗共用）
│   ├── GalleryControls.jsx       # 轮播控件（箭头 + 圆点），单图时不渲染
│   ├── format.js                 # 参数值呈现：空值/占位文案统一显示「—」
│   ├── search.js                 # 模糊匹配（忽略空格与连字符）
│   ├── data.js                   # 数据装载层：扫描数据目录，按 id 配对参数与图片
│   ├── index.css                 # 样式（含响应式）
│   └── data/
│       ├── devices/              # ★ 参数数据：每台手机一个 JSON
│       │   ├── iphone-13-pro.json
│       │   ├── iphone-17.json
│       │   └── oneplus-15.json
│       └── images/               # ★ 产品图：文件名 = 对应 JSON 的文件名（+ 可选的配色段）
│           ├── iphone-17.sage.jpg
│           ├── iphone-13-pro.jpg
│           └── oneplus-15.gold.jpg
├── tools/scraper/                # 数据采集工具（独立依赖，不参与构建）
│   ├── sources/apple/            #   苹果官网：只抓产品图
│   ├── sources/oneplus/          #   一加官网：参数 + 图片一步入库
│   ├── sources/vivo/             #   vivo 官网：参数 + 图片一步入库
│   ├── sources/oppo/             #   OPPO 官网：参数；官方商城接口：每色一张正背组合图（无商城源的机型用参数页多色图）
│   ├── sources/xiaomi/           #   小米官网：参数；官方商城接口：分色图（老机型用官方多色全家福）
│   └── sources/huawei/           #   华为官网：参数 + 分色图（同一页；Mate 60 系列参数页已下架，走官方存档）
├── designer-document/            # 设计说明（需求、参数范围、术语表）
└── scripts/
    └── ssr-check.mjs             # 无浏览器渲染验证（node scripts/ssr-check.mjs）
```

## 数据格式

一个机型一个文件，顶层直接是机型对象：

```jsonc
{
  "name": "iPhone 17 Pro",        // 页面显示名
  "brand": "苹果",                 // 用于品牌筛选
  "series": "iPhone 17 系列",      // 用于机型选择弹框的系列分组（缺失归入「其他」）
                                   // 组内顺序按 data.js 的 SERIES_ORDER：主流旗舰高端 → 低端
  "release_year": 2025,
  "chipset": { "chip": "", "ram": [], "rom": [] },
  "body":    { "dimensions_mm": {}, "weight_g": 0, "frame_material": "", "...": "" },
  "display": { "size_inch": 0, "resolution": "", "ppi": 0, "...": "" },
  "battery": { "capacity_mah": 0, "charging_watt": 0, "wireless_charging_watt": 0 },
  "camera":  [ { "type": "主摄", "sensor": "", "resolution_mp": 0, "...": "" } ],
  "os": "ColorOS 17.0",           // 可选：操作系统
  "biometric": { "fingerprint": "屏下指纹", "face_unlock": "支持" },   // 可选：生物识别
  "cellular": { "sim": "", "esim": null, "bands": [], "satellite": "" }, // 可选：蜂窝网络
  "nfc": "",                       // 可选：NFC 官网原文
  "display_secondary": { }         // 可选：折叠屏副屏（结构同 display），直板机省略
}
```

官网查不到的参数一律 `null`（页面显示「—」），**不要写「未公开」之类的占位文案**。

约定：字段名全英文 snake_case，带单位后缀（`_mm` / `_g` / `_mah` / `_watt` / `_inch` / `_mp` / `_nits` / `_um` / `_deg`）；取值统一用纯中文；多值字段一律用数组（如 `ram`、`rom`、`image_stabilization`）。

## 新增机型（3 步，不用改代码）

1. 在 `src/data/devices/` 新建 `<id>.json`（文件名即机型 id：小写、连字符，如 `xiaomi-15.json`），内容复制现有文件、按上面结构填写
2. 在 `src/data/images/` 放**同名**图片（如 `xiaomi-15.png`），支持 png / jpg / jpeg / webp；没有图会显示占位卡
3. `git push`，线上自动更新

机型 id 决定三件事：页面选择器里的取值、图片的配对、默认排序（按 id 字母序）。

## 图片和参数可以从官网自动抓

第 1、2 步里最费事的部分（下载产品图、抄参数）有现成工具，见 **[tools/scraper/README.md](tools/scraper/README.md)**。六个数据源玩法不同：

| 数据源 | 能自动拿到什么 | 命令 |
|---|---|---|
| 苹果官网 | **只有产品图**，参数 JSON 仍需手工维护 | `node cli.mjs images --models ...` → `node cli.mjs promote` |
| 一加官网 | **参数 JSON + 产品图**，一步入库 | `node cli.mjs oneplus --models ...` |
| vivo 官网 | **参数 JSON + 产品图**，一步入库 | `node cli.mjs vivo --models ...` |
| OPPO 官网 | **参数 JSON + 产品图**（分色多角度），一步入库 | `node cli.mjs oppo --models ...` |
| 小米官网 | **参数 JSON + 产品图**（新机型分色双面；12/11/10 系列用官方多色全家福），一步入库 | `node cli.mjs xiaomi --models ...` |
| 华为官网 | **参数 JSON + 产品图**（每配色一张，参数页直出），一步入库；Mate 60 系列参数页已下架，参数取官方存档、图走官网 CDN | `node cli.mjs huawei --models ...` |

产品图文件名约定：`<机型id>.<配色slug>.jpg`（每个配色各一份）；同一配色有多张图（角度/正背面）时用 `<机型id>.<配色slug>.<角度n>.jpg`（n 从 1 开始，对比页图片区会出左右箭头手动轮播）；没有配色维度的机型用 `<机型id>.jpg`（裸名图 —— 若机型同时有分色图和裸名图，裸名图会追加进每个配色的轮播末尾，如华为的 vmall 正背组合图）。

## 当前状态

- **数据**：164 台机型（苹果 29 台 / 一加 12 台 / vivo 30 台 / OPPO 38 台 / 小米 32 台 / 华为 23 台），627 张产品图
- 已实现：首页（大标题「灵眸 手机对比」+ 全局搜索 + 热门机型网格，首屏 `HOT_ROWS` 行、一行最多 6 列、按品牌轮转保证每行六家都有，底部「显示更多」按 `HOT_ROWS` 行一批往下加）、参数浮窗（左图右参数、从点击处放大/收回、点空白或 Esc 关闭）、暂存区浮标（1.5 倍放大、悬停摊开、可清空、满 4 台；**空态常显**，点击改为图标震动示意）、**地址栏同步**（后退/前进可用、链接可分享、刷新不丢状态）、四列对比、品牌→型号两级选择（带搜索，系列按旗舰→入门排序）、参数分类显示、差异行高亮、移动端横滑、产品图与占位回退、同配色多角度图手动轮播
- 未实现（后续阶段）：次要参数（扬声器等）、差异 Winner 点评、构建期预渲染（SEO）、数据分层（按品牌拆分按需加载）

## 地址栏参数

状态全部写在查询参数里，顺序固定（`cart` → `view` → `phone`），同一个状态永远得到同一个地址：

| 地址 | 含义 |
| --- | --- |
| `/` | 首页 |
| `?cart=iphone-18-pro,oppo-find-x9` | 首页，暂存区里有两台 |
| `?cart=…&view=compare` | 对比页（**这条链接可以直接分享**） |
| `?cart=…&phone=iphone-18-pro` | 首页 + 该机型的参数浮窗 |

用查询参数而不是 `/compare` 这种路径，是因为 GitHub Pages 是纯静态托管、没有服务端 rewrite，直接访问 `/compare` 会 404；查询参数永远指向同一个 `index.html`，刷新与分享都不会 404。

写入策略：换页（首页↔对比页、浮窗开合）用 `pushState`，所以后退键真的能用；增删对比机型用 `replaceState`，否则每加一台就多一条历史，后退会变成"一台一台往下撤"。关浮窗走 `history.back()`（带 `history.state.dcModal` 标记判断），避免在开/关之间来回弹。
