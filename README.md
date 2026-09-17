# 灵眸 · 手机对比网站

仿 Apple iPhone Compare 风格的手机参数对比网站，React + Vite 纯前端实现，机型数据为本地 JSON。设计需求与规划见 [designer-document/设计说明.md](designer-document/设计说明.md)。

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
│   ├── App.jsx                   # Compare 页面（选择器 + 四列参数表）
│   ├── data.js                   # 数据装载层：扫描数据目录，按 id 配对参数与图片
│   ├── index.css                 # 样式（含响应式）
│   └── data/
│       ├── devices/              # ★ 参数数据：每台手机一个 JSON
│       │   ├── iphone-13-pro.json
│       │   ├── iphone-17.json
│       │   ├── iphone-17-pro.json
│       │   └── oneplus-ace-6.json
│       └── images/               # ★ 产品图：文件名 = 对应 JSON 的文件名
│           ├── iphone-13-pro.jpg
│           ├── iphone-17.png
│           ├── iphone-17-pro.png
│           └── oneplus-ace-6.jpg
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
  "release_year": 2025,
  "chipset": { "chip": "", "ram": [], "rom": [] },
  "body":    { "dimensions_mm": {}, "weight_g": 0, "frame_material": "", "...": "" },
  "display": { "size_inch": 0, "resolution": "", "ppi": 0, "...": "" },
  "battery": { "capacity_mah": 0, "charging_watt": 0, "wireless_charging_watt": 0 },
  "camera":  [ { "type": "主摄", "sensor": "", "resolution_mp": 0, "...": "" } ]
}
```

约定：字段名全英文 snake_case，带单位后缀（`_mm` / `_g` / `_mah` / `_watt` / `_inch` / `_mp` / `_nits` / `_um` / `_deg`）；取值统一用纯中文；多值字段一律用数组（如 `ram`、`rom`、`image_stabilization`）。

## 新增机型（3 步，不用改代码）

1. 在 `src/data/devices/` 新建 `<id>.json`（文件名即机型 id：小写、连字符，如 `xiaomi-15.json`），内容复制现有文件、按上面结构填写
2. 在 `src/data/images/` 放**同名**图片（如 `xiaomi-15.png`），支持 png / jpg / jpeg / webp；没有图会显示占位卡
3. `git push`，线上自动更新

机型 id 决定三件事：页面选择器里的取值、图片的配对、默认排序（按 id 字母序）。

## 当前状态

- 已实现：四列对比、品牌→型号两级选择（带搜索）、参数分类显示、差异行高亮、移动端横滑、产品图与占位回退
- 未实现（后续阶段）：次要参数（扬声器/网络/解锁等）、差异 Winner 点评、首页、机型详情页
