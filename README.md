# 火眸 · 手机对比网站

仿 Apple iPhone Compare 风格的手机参数对比网站，React + Vite 纯前端实现，静态 JSON 作为数据源。设计需求与规划见 [designer-document/设计说明.md](designer-document/设计说明.md)。

## 快速开始

```bash
npm install        # 首次安装依赖
npm run build      # 构建生产包
npm run preview    # 启动预览服务（http://localhost:4173）
```

## 目录结构

```
├── index.html              # 入口 HTML
├── vite.config.js          # Vite 配置
├── package.json            # 项目依赖与脚本定义
├── src/
│   ├── main.jsx            # React 入口
│   ├── App.jsx             # Compare 页面（选择器 + 四列参数表）
│   ├── data.js             # 汇总 static/ 下所有机型 JSON
│   └── index.css           # 样式
├── static/                 # 数据源：每个机型一个 JSON 文件
│   ├── iphone13pro_specs.json
│   ├── iphone17_specs.json
│   ├── iphone17pro_specs.json
│   └── oneplus_ace6_specs.json
├── designer-document/      # 设计说明（需求、参数范围、术语表）
└── scripts/
    └── ssr-check.mjs       # 无浏览器渲染验证脚本（node scripts/ssr-check.mjs）
```

## 新增机型

1. 在 `static/` 下新建 `<机型名>_specs.json`，复制现有文件保持相同字段结构（顶层 key 为机型名）
2. 在 `src/data.js` 中加一行 import 并注册到列表
3. 重新 `npm run build` 后即可在页面选择

## 当前状态

- 已实现：四列对比、品牌→型号两级选择（带搜索）、参数分类显示、差异行高亮、移动端横滑
- 未实现（待后续阶段）：手机图片（JSON 已预留 `image` 字段）、次要参数（扬声器/网络/解锁等）、差异 Winner 点评
