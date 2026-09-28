// 小米参数源：mi.com 中国官网 specs 页（浏览器渲染后解析）
//
// 为什么必须开浏览器：/prod/<slug>/specs 是可视化编辑器生成的 SPA 壳，
// 参数区不在 HTML 里（实测 curl 拿到的只有 SEO meta），需要 Chrome 渲染。
//
// 页面结构（实测 2026-09，7 台 17 系机型）：
//   div.<slug>_<n>_root_div 下的每行文本 = 参数内容，小节以「标题行」开始：
//   外观尺寸 / 内存容量 / 移动平台 / 屏幕显示 / 指纹解锁 / 充电续航(或 续航与充电) /
//   影像系统 / 网络频段 / 数据传输 / 数据连接 / 多功能NFC / 导航定位 / 视频音频 /
//   传感器 / 操作系统 / 包装清单
//   有两套模板：
//     A. 一块一小节（17 Ultra / 17 Max / 17T Pro）：标题和值在同一个 DOM 块里
//     B. 两块一小节（17 / 17 Pro / 17 Pro Max）：标题块和值块相邻
//   两种模板都用「已知标题切分全文」处理，不依赖块的位置关系。
//
// 已知缺口（解析时的兜底策略）：
//   - Xiaomi 17T 的参数页是空壳（产品在售但参数页未填），参数全部来自
//     商城「关键参数」接口 + OVERRIDES 人工核对表（来源：概述页，2026-09-23）
//   - 17T Pro 参数页缺电池容量和前置摄像头 → 商城关键参数兜底
//   - 参数页不写 PPI → 用分辨率和尺寸换算
//
// schema 扩展（与 OPPO 源同一套）：
//   os / biometric / cellular / nfc / display_secondary（17 Pro·Pro Max 的妙享背屏）

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, newPage, autoScroll, sleep } from "../../lib/browser.mjs";
import { fetchXiaomiColors, fetchLegacyColors, fetchKeyParams, fetchVariants, scrapeXiaomiShop, isLegacyModel } from "./shop.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEVICES_DIR = resolve(HERE, "../../../../src/data/devices");

const SPECS_URLS = {
  "xiaomi-17": "https://www.mi.com/prod/xiaomi-17/specs",
  "xiaomi-17-pro": "https://www.mi.com/prod/xiaomi-17-pro/specs",
  "xiaomi-17-pro-max": "https://www.mi.com/prod/xiaomi-17-pro-max/specs",
  "xiaomi-17-ultra": "https://www.mi.com/prod/xiaomi-17-ultra/specs",
  "xiaomi-17-max": "https://www.mi.com/prod/xiaomi-17-max/specs",
  "xiaomi-17t": "https://www.mi.com/prod/xiaomi-17t/specs",
  "xiaomi-17t-pro": "https://www.mi.com/prod/xiaomi-17t-pro/specs",
  "xiaomi-15": "https://www.mi.com/prod/xiaomi-15/specs",
  "xiaomi-15-pro": "https://www.mi.com/prod/xiaomi-15-pro/specs",
  "xiaomi-15-ultra": "https://www.mi.com/prod/xiaomi-15-ultra/specs",
  "xiaomi-15s-pro": "https://www.mi.com/prod/xiaomi-15s-pro/specs",
  // 13/14 系列参数页还是老模板（产品页不在 /prod/ 下），URL 是 https://www.mi.com/<slug>/specs
  "xiaomi-14": "https://www.mi.com/xiaomi-14/specs",
  "xiaomi-14-pro": "https://www.mi.com/xiaomi-14-pro/specs",
  // 14 Ultra 的老 URL（/xiaomi-14-ultra/specs）已是 404 页，新模板页在 /prod/ 下
  "xiaomi-14-ultra": "https://www.mi.com/prod/xiaomi-14-ultra/specs",
  "xiaomi-13": "https://www.mi.com/xiaomi-13/specs",
  "xiaomi-13-pro": "https://www.mi.com/xiaomi-13-pro/specs",
  "xiaomi-13-ultra": "https://www.mi.com/xiaomi-13-ultra/specs",
  // 12/11/10 系列参数页是更老的模板（产品页不在 /prod/ 下），URL 是 https://www.mi.com/<slug>/specs
  // 注意 slug 大小写敏感：11 Pro 是 mi11Pro（大写 P），其余全小写；12S Pro 是 mi12s-pro（带连字符）
  "xiaomi-12": "https://www.mi.com/mi12/specs",
  "xiaomi-12-pro": "https://www.mi.com/mi12pro/specs",
  "xiaomi-12x": "https://www.mi.com/mi12x/specs",
  "xiaomi-12s": "https://www.mi.com/mi12s/specs",
  "xiaomi-12s-pro": "https://www.mi.com/mi12s-pro/specs",
  "xiaomi-12s-ultra": "https://www.mi.com/mi12s-ultra/specs",
  "xiaomi-11": "https://www.mi.com/mi11/specs",
  "xiaomi-11-pro": "https://www.mi.com/mi11Pro/specs",
  "xiaomi-11-ultra": "https://www.mi.com/mi11ultra/specs",
  "xiaomi-11-youth": "https://www.mi.com/mi11youth/specs",
  "xiaomi-10-ultra": "https://www.mi.com/mi10ultra/specs",
  "xiaomi-10s": "https://www.mi.com/mi10s/specs",
  "xiaomi-10-youth": "https://www.mi.com/mi10youth/specs",
  // 小米10 / 10 Pro 国行页面已下架（mi.com/mi10、/mi10pro 均 404，老商城页要求登录），
  // 参数取自国际官网 UK 站（同款机型的全球版页面，2026-09-24 确认可访问）：
  //   注意是全球版 ROM 的数据（频段/系统与国行略有差异），已在 JSON 的 os 等字段如实记录
  "xiaomi-10": "https://www.mi.com/uk/mi-10/specs",
  "xiaomi-10-pro": "https://www.mi.com/uk/mi-10-pro/specs",
};

// release_date 参数页没有，取自发布会公开信息（2026-09-24 检索核实）：
//   17 / 17 Pro / 17 Pro Max 2025-09-25 发布；17 Ultra 2025-12-25；
//   17 Max 2026-05-21；17T 系列 2026-06-08（国行）
//   15 / 15 Pro 2024-10-29；15 Ultra 2025-02-27；15S Pro 2025-05-22（玄戒 O1）
//   14 / 14 Pro 2023-10-26；14 Ultra 2024-02-22
//   13 / 13 Pro 2022-12-11；13 Ultra 2023-04-18
export const META = {
  "xiaomi-17": { name: "Xiaomi 17", series: "数字系列", release_date: "2025-09" },
  "xiaomi-17-pro": { name: "Xiaomi 17 Pro", series: "数字系列", release_date: "2025-09" },
  "xiaomi-17-pro-max": { name: "Xiaomi 17 Pro Max", series: "数字系列", release_date: "2025-09" },
  "xiaomi-17-ultra": { name: "Xiaomi 17 Ultra", series: "数字系列", release_date: "2025-12" },
  "xiaomi-17-max": { name: "Xiaomi 17 Max", series: "数字系列", release_date: "2026-05" },
  "xiaomi-17t": { name: "Xiaomi 17T", series: "数字系列", release_date: "2026-06" },
  "xiaomi-17t-pro": { name: "Xiaomi 17T Pro", series: "数字系列", release_date: "2026-06" },
  "xiaomi-15": { name: "Xiaomi 15", series: "数字系列", release_date: "2024-10" },
  "xiaomi-15-pro": { name: "Xiaomi 15 Pro", series: "数字系列", release_date: "2024-10" },
  "xiaomi-15-ultra": { name: "Xiaomi 15 Ultra", series: "数字系列", release_date: "2025-02" },
  "xiaomi-15s-pro": { name: "Xiaomi 15S Pro", series: "数字系列", release_date: "2025-05" },
  "xiaomi-14": { name: "Xiaomi 14", series: "数字系列", release_date: "2023-10" },
  "xiaomi-14-pro": { name: "Xiaomi 14 Pro", series: "数字系列", release_date: "2023-10" },
  "xiaomi-14-ultra": { name: "Xiaomi 14 Ultra", series: "数字系列", release_date: "2024-02" },
  "xiaomi-13": { name: "Xiaomi 13", series: "数字系列", release_date: "2022-12" },
  "xiaomi-13-pro": { name: "Xiaomi 13 Pro", series: "数字系列", release_date: "2022-12" },
  "xiaomi-13-ultra": { name: "Xiaomi 13 Ultra", series: "数字系列", release_date: "2023-04" },
  "xiaomi-12": { name: "Xiaomi 12", series: "数字系列", release_date: "2021-12" },
  "xiaomi-12-pro": { name: "Xiaomi 12 Pro", series: "数字系列", release_date: "2021-12" },
  "xiaomi-12x": { name: "Xiaomi 12X", series: "数字系列", release_date: "2021-12" },
  "xiaomi-12s": { name: "Xiaomi 12S", series: "数字系列", release_date: "2022-07" },
  "xiaomi-12s-pro": { name: "Xiaomi 12S Pro", series: "数字系列", release_date: "2022-07" },
  "xiaomi-12s-ultra": { name: "Xiaomi 12S Ultra", series: "数字系列", release_date: "2022-07" },
  "xiaomi-11": { name: "Xiaomi 11", series: "数字系列", release_date: "2020-12" },
  "xiaomi-11-pro": { name: "Xiaomi 11 Pro", series: "数字系列", release_date: "2021-03" },
  "xiaomi-11-ultra": { name: "Xiaomi 11 Ultra", series: "数字系列", release_date: "2021-03" },
  "xiaomi-11-youth": { name: "Xiaomi 11 青春版", series: "数字系列", release_date: "2021-04" },
  "xiaomi-10-ultra": { name: "Xiaomi 10 至尊纪念版", series: "数字系列", release_date: "2020-08" },
  "xiaomi-10s": { name: "Xiaomi 10S", series: "数字系列", release_date: "2021-03" },
  "xiaomi-10-youth": { name: "Xiaomi 10 青春版", series: "数字系列", release_date: "2020-04" },
  "xiaomi-10": { name: "Xiaomi 10", series: "数字系列", release_date: "2020-02" },
  "xiaomi-10-pro": { name: "Xiaomi 10 Pro", series: "数字系列", release_date: "2020-02" },
};

// 参数页为空 / 缺失字段的补充数据（来源：mi.com 概述页 + 商城在售版本，
// 2026-09-23 人工核对；官网参数页上架后应删掉对应条目改走页面解析）
const OVERRIDES = {
  "xiaomi-17t": {
    reason: "官网参数页为空（产品在售但参数未填）",
    camera: [
      // 概述页影像区：50MP ƒ/1.7 大光圈 OIS（光影猎人 800）/ 50MP ƒ/3.0（徕卡 5X 潜望）/
      // 12MP ƒ/2.2 等效 15mm；前置 32MP 来自商城关键参数
      { type: "主摄", resolution_mp: 50, aperture: "f/1.7", focal_length_mm: null, image_stabilization: ["光学防抖"] },
      { type: "长焦", resolution_mp: 50, aperture: "f/3.0", focal_length_mm: null, image_stabilization: null },
      { type: "超广角", resolution_mp: 12, aperture: "f/2.2", focal_length_mm: 15, image_stabilization: null },
    ],
  },

  // 12/11/10 系列参数页「没写但实机有」的字段（2026-09-24 人工核对，官网多语种站与实机一致）：
  // 屏幕材质：12/12X 页面只写卖点名「6.28″ 超视感屏」，材质见 mi.com 国际站（AMOLED）
  // 指纹：12/12X/12S/10S 页面完全没提，10/10 Pro 的 UK 页也没提；11 青春版是侧边指纹
  // 刷新率：10 青春版页面只写「180Hz 采样率」，实机 60Hz
  "xiaomi-12": { display: { panel: "AMOLED" }, fingerprint: "屏下指纹" },
  "xiaomi-12x": { display: { panel: "AMOLED" }, fingerprint: "屏下指纹" },
  "xiaomi-12s": { fingerprint: "屏下指纹" },
  "xiaomi-11-youth": { fingerprint: "侧边指纹" },
  "xiaomi-10s": { fingerprint: "屏下指纹" },
  "xiaomi-10-youth": { display: { refresh_rate: 60 } },
  // 小米10 / 10 Pro 的国行版是双卡双待，UK 页记录的是全球单卡版（Single Nano-SIM slot），
  // 本站以国行为准，所以用兜底表盖回国行口径
  "xiaomi-10": { fingerprint: "屏下指纹", sim: "双 Nano-SIM 卡" },
  "xiaomi-10-pro": { fingerprint: "屏下指纹", sim: "双 Nano-SIM 卡" },
};

// ---------- 页面抓取 ----------

/** 渲染参数页，取参数区（[class*="_root_div"]）的纯文本。
 *  页面渲染偶发不完整（小节没出来就取了 DOM），对解析不到小节标题的重试。
 *  已知空壳机型（OVERRIDES 里有条目）不重试，一次即收。 */
export async function fetchSpecsTexts(ids) {
  const looksParsed = (text) => {
    const lines = new Set(String(text).split("\n").map((l) => normTitle(l)));
    let n = 0;
    for (const t of CANONICAL_TITLES) if (lines.has(t)) n++;
    return n >= 3; // 至少命中 3 个小节标题才算渲染成功
  };

  const browser = await launchBrowser({ headless: true });
  const { page } = await newPage(browser);
  const out = {};
  for (const id of ids) {
    const maxAttempts = OVERRIDES[id] ? 1 : 3;
    let text = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 国际站（小米10 / 10 Pro 的 UK 页）有常驻长连接，"load" 事件永远不触发，
      // 但 DOM 早就可读了 → 超时不抛错，接着取文本；真没渲染出来还有下面的重试兜着
      await page.goto(SPECS_URLS[id], { waitUntil: "load", timeout: 25000 }).catch(() => {});
      await sleep(3500);
      await autoScroll(page, { step: 900, pause: 120 });
      await sleep(1200);
      text = await page.evaluate(() => {
        // 新模板：可视化编辑器页（17/15 系列），参数区挂 _root_div
        const root = document.querySelector('[class*="_root_div"]');
        if (root && root.innerText.trim()) return root.innerText;
        // 老模板：13/14 系列的产品页，参数区挂 component-content__<slug>
        const legacy = document.querySelector('[class*="component-content__"]');
        if (legacy && legacy.innerText.trim()) return legacy.innerText;
        return document.body.innerText;
      });
      if (looksParsed(text) || attempt === maxAttempts) break;
      console.log(`  ⚠ ${id}: 参数区未渲染完整（第 ${attempt} 次尝试），重试`);
      await sleep(2000);
    }
    out[id] = text;
  }
  await browser.close();
  return out;
}

// ---------- 文本 → 小节 ----------

// 小节标题别名 → 规范名。三代模板的标题写法不同：
//   17/15/14/13（新+老混合）：见 CANONICAL 本身
//   12/11 系列：续航充电（无「与」）、内存与容量（11 青春版）、外观尺寸*（10S 带星号）
//   10 系列（2020 老模板）：处理器 / 内存与容量 / 屏幕与指纹 / 后置相机 / 前置相机 /
//     充电与电池 / 网络与制式 / 网络与频段 / 音频播放 / 视频播放
// 「支持频段」「后置相机支持」这类子标题**故意不进表**——它们落在上一节内成为正文行，
// 由各 build* 自己过滤（如 buildCellular 跳过 /^支持/ 行）。
const CANONICAL_TITLES = [
  "外观尺寸", "内存容量", "移动平台", "屏幕显示", "指纹解锁",
  "充电续航", "续航与充电", "影像系统", "网络频段", "数据传输", "数据连接",
  "多功能NFC", "导航定位", "视频音频", "传感器", "操作系统", "包装清单",
];
const TITLE_ALIASES = {
  "续航充电": "充电续航",
  "充电与电池": "充电续航",
  "内存与容量": "内存容量",
  "处理器": "移动平台",
  "屏幕与指纹": "屏幕显示",
  "屏幕": "屏幕显示", // 10 青春版（标题最短的一版）
  "后置相机": "影像系统",
  "前置相机": "影像系统",
  "网络与频段": "网络频段",
  "网络与制式": "网络频段",
  "音频播放": "视频音频",
  "视频播放": "视频音频",
  "多功能 NFC": "多功能NFC", // 10 青春版（词组里带空格）
  "NFC功能": "多功能NFC", // 12/11 系列把 NFC 小节写成「NFC功能」
  // UK 站（小米10 / 10 Pro，国行页面已下架）的英文标题
  "Platform": "移动平台",
  "Storage and RAM": "内存容量",
  "Rear Camera": "影像系统",
  "Front Camera": "影像系统",
  "Display": "屏幕显示",
  "Charging and battery": "充电续航",
  "Supported network bands": "网络频段",
  "Dimensions": "外观尺寸",
  "Network & Connectivity": "数据连接", // 只为切断上一节；SIM 信息从全文找
  "Wireless network": "数据连接",
  "Navigation & positioning": "导航定位",
  "Audio": "视频音频",
  "Package contents": "包装清单",
  "NFC": "多功能NFC",
  "Audio playback": "视频音频",
  "Video playback": "视频音频",
  "Operating system": "操作系统",
};

/** 标题行归一化：去掉尾部星号（"外观尺寸*"）再查别名表 */
function normTitle(line) {
  const t = line.replace(/\*+$/, "").trim();
  return TITLE_ALIASES[t] ?? t;
}

const TITLES = [...CANONICAL_TITLES, ...Object.keys(TITLE_ALIASES)];

/** 标题被页面拆成两行（UK 站「Network &」/「Navigation &」）时先拼回来 */
function joinSplitTitleLines(lines) {
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (out.length && /&\s*$/.test(out[out.length - 1])) out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    else out.push(line);
  }
  return out;
}

/** 参数区全文 → Map(规范标题 → 行数组)。标题行归一化后精确匹配才认，正文里的同名子串不受影响 */
export function parseSections(rootText) {
  const sections = new Map();
  let cur = null;
  for (const line of joinSplitTitleLines(String(rootText).split("\n"))) {
    if (!line) continue;
    if (TITLES.includes(line.replace(/\*+$/, ""))) {
      cur = normTitle(line);
      if (!sections.has(cur)) sections.set(cur, []);
      continue;
    }
    if (cur) sections.get(cur).push(line);
  }
  return sections;
}

const linesOf = (sections, ...titles) => {
  for (const t of titles) {
    const lines = sections.get(t);
    if (lines?.length) return lines;
  }
  return [];
};

const firstNum = (s) => {
  const m = String(s ?? "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
};

/** "重量：玻璃版225g（…）" → 225（标签和数字之间可以隔着「玻璃版」这类前缀） */
const numLabeled = (text, label) => firstNum((String(text ?? "").match(new RegExp(`${label}[:：]\\D*?([\\d.]+)`)) || [])[0]);

/** 分辨率文本 → "2608 x 1200"（统一半角 x、单空格、长边在前）。
 *  UK 站写「1080 x 2340」，与全站长边在前的口径相反，这里统一换序 */
function normResolution(s) {
  const m = String(s ?? "").match(/(\d{3,5})\s*[×xX]\s*(\d{3,5})/);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a >= b ? `${a} x ${b}` : `${b} x ${a}`;
}

/** 由分辨率与尺寸换算 PPI（参数页不写 PPI） */
function calcPpi(resolution, sizeInch) {
  if (!resolution || !sizeInch) return null;
  const [w, h] = resolution.split(" x ").map(Number);
  if (!w || !h) return null;
  return Math.round(Math.hypot(w, h) / sizeInch);
}

/** 商城「关键参数」取值 */
const kpVal = (keyParams, name) => keyParams.find((x) => x.name === name)?.value ?? null;

/** 官网「1 亿像素」是对 1.08 亿（108MP，S5KHMX 那颗）主摄的约数写法，
 *  UK 页同一颗传感器写的是 "108MP" —— 按传感器实际值入库，保证跨机型可比 */
const YI_MP = { 1: 108 };

/** "3200万像素" → 32 / "1 亿像素" → 108 / "2 亿像素" → 200 / "50MP" → 50
 *  老页面（10/11/12 系列）主摄写「1 亿像素」，其它页面写「万」或「MP」 */
function mpFromText(s) {
  const yi = String(s ?? "").match(/([\d.]+)\s*亿/);
  if (yi) {
    const n = Number(yi[1]);
    return YI_MP[n] ?? n * 100;
  }
  const wan = String(s ?? "").match(/([\d.]+)\s*万/);
  if (wan) return Number(wan[1]) * 0.01;
  const mp = String(s ?? "").match(/([\d.]+)\s*MP/i);
  return mp ? Number(mp[1]) : null;
}

// ---------- 各区块构建 ----------

function cleanChip(raw) {
  return String(raw ?? "")
    .split("\n")[0]
    .replace(/[®™]/g, "")
    .replace(/(旗舰)?移动平台$/,"")
    .replace(/\s*5G处理器$/, "")
    .trim()
    .replace(/骁龙\s*(\d)/g, "骁龙 $1")
    .replace(/天玑\s*(\d)/g, "天玑 $1")
    .replace(/(\d)\s*-\s*Ultra/g, "$1 Ultra")
    .replace(/(\d)\s*(至尊版)/g, "$1 $2")
    // "玄戒 O1 3nm 旗舰处理器" → "玄戒 O1（3nm）"
    .replace(/\s*(\d+nm)\s*(旗舰)?处理器$/g, "（$1）");
}

/** "128GB"/"1TB" → 1024 进制容量，仅用于排序 */
const capGb = (s) => {
  const m = String(s).match(/(\d+)\s*(TB|GB)/i);
  if (!m) return Number.NaN;
  return m[2].toUpperCase() === "TB" ? Number(m[1]) * 1024 : Number(m[1]);
};
/** 内存/存储在 UI 里按容量升序排（与既有数据一致） */
const sortCap = (list) => [...list].sort((a, b) => capGb(a) - capGb(b));

export function buildChipset(sections, keyParams, variants, id) {
  const ov = OVERRIDES[id];
  const chip =
    cleanChip(linesOf(sections, "移动平台")[0] ?? "") ||
    cleanChip(kpVal(keyParams, "CPU型号")) ||
    ov?.chip;
  if (!chip) throw new Error(`${id}: 解析不到芯片（移动平台小节为空且无兜底）`);

  // 内存：优先参数页「运行内存：12GB / 16GB LPDDR5X 高速内存」；
  // 没有就用商城在售版本（goods_list 名称里的 12GB+256GB 等）拼。
  // UK 站（小米10 / 10 Pro）用英文标签「RAM: 8GB」「ROM: 128GB / 256GB」，
  // 内存类型另起一行（LPDDR5 memory / UFS3.0 flash storage），所以类型从整段找
  const memText = linesOf(sections, "内存容量").join("\n");
  let ram = [];
  let rom = [];
  const ramLine = memText.match(/运行内存[:：]([^\n]+)/) ?? memText.match(/\bRAM\s*[:：]\s*([^\n]+)/i);
  const romLine = memText.match(/机身存储[:：]([^\n]+)/) ?? memText.match(/\bROM\s*[:：]\s*([^\n]+)/i);
  if (ramLine) {
    const type = (ramLine[1].match(/(LPDDR\d*\w*|DDR\d*\w*)/) || memText.match(/(LPDDR\d*\w*)/) || [])[1];
    ram = [...ramLine[1].matchAll(/(\d+GB)/g)].map((m) => (type ? `${m[1]} ${type}` : m[1]));
  }
  if (romLine) {
    const type = (romLine[1].match(/(UFS[\d.]*)/) || memText.match(/(UFS[\d.]*)/) || [])[1];
    rom = [...romLine[1].matchAll(/(\d+GB|1TB)/g)].map((m) => (type ? `${m[1]} ${type}` : m[1]));
  }
  if ((!ram.length || !rom.length) && memText) {
    // 10 系列老模板不写「运行内存：」，只有一张组合清单（"8GB + 128GB	8GB + 256GB …"），
    // 且「最高可选」那行（"16GB + 512GB"）排在清单前面，所以要去重后按容量排序
    const pairs = [...memText.matchAll(/(\d+GB)\s*\+\s*(\d+GB|1TB)/g)];
    if (pairs.length) {
      if (!ram.length) ram = [...new Set(pairs.map((m) => m[1]))];
      if (!rom.length) rom = [...new Set(pairs.map((m) => m[2]))];
    }
  }
  if (!ram.length || !rom.length) {
    // 商城在售组合兜底（17T 走这里）
    const combos = variants.map((v) => v.split("+"));
    if (!ram.length) ram = [...new Set(combos.map((c) => c[0]))];
    if (!rom.length) rom = [...new Set(combos.map((c) => c[1]))];
  }
  return { chip, ram: sortCap(ram), rom: sortCap(rom) };
}

export function buildBody(sections, keyParams, rootText) {
  const text = linesOf(sections, "外观尺寸").join("\n");
  // 防水等级只写在页尾「特别说明」里（IP68 / IP69）
  const ip = rootText.match(/IP(6[89])/);
  // 15 系列新模板变体：长度/宽度/重量等行排在「外观尺寸」标题**前面**（值在前标题在后），
  // parseSections 会把它们归进上一节 —— 小节里没有就用全文兜底（这些标签全文唯一）。
  // UK 站（小米10 / 10 Pro）用英文标签（Height/Width/Thickness/Weight），一并兜底
  const src = (label, val) => val ?? numLabeled(text, label) ?? numLabeled(rootText, label);
  const enNum = (label) => {
    const m = text.match(new RegExp(`${label}\\s*[:：]\\s*([\\d.]+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const depth =
    numLabeled(text, "厚度") ??
    enNum("Thickness") ??
    firstNum(kpVal(keyParams, "机身厚度"));
  return {
    dimensions_mm: {
      // 10 至尊纪念版把「长度」写作「高度」
      height: src("长度", numLabeled(text, "长度") ?? numLabeled(text, "高度")) ?? enNum("Height"),
      width: src("宽度", numLabeled(text, "宽度")) ?? enNum("Width"),
      depth,
    },
    weight_g: src("重量", numLabeled(text, "重量")) ?? enNum("Weight"),
    frame_material: null,
    back_material: null,
    front_material: null,
    water_resistance: ip ? `IP${ip[1]}` : null,
  };
}

/** 屏幕小节按「正屏 / 背屏」拆分（17 Pro·Pro Max 有妙享背屏，其余机型只有主屏） */
function splitPanel(lines) {
  const idx = lines.findIndex((l) => /^背屏/.test(l));
  if (idx === -1) return { main: lines.filter((l) => !/^正屏/.test(l)), secondary: null };
  return {
    main: lines.slice(0, idx).filter((l) => !/^正屏/.test(l)),
    secondary: lines.slice(idx + 1).filter((l) => !/^正屏/.test(l)),
  };
}

function buildPanel(lines, { form = undefined, hdrText = null, fallbackText = null } = {}) {
  const text = lines.join("\n");
  // 尺寸：英寸 / ″ / ” / “"”（UK 站 6.67""）
  const size = firstNum((text.match(/([\d.]+)\s*(?:英寸|″|”|"|'')/) || [])[0]);
  // 分辨率：中文「分辨率：2400 x 1080」/ UK 站「Resolution: 1080 x 2340」
  const resolution = normResolution(
    (text.match(/(?:分辨率|Resolution)\s*[:：]?\s*([\d\s×xX]+)/i) || [])[0]
  );
  // 刷新率写法："显示帧率：最高 120Hz"（新）/ "90Hz 刷新率｜180Hz 采样率"（老，采样率不能误当刷新率）
  //   / UK 站 "90Hz refresh rate"
  const refresh =
    (text.match(/最高\s*(\d+)\s*Hz/) || [])[1] ??
    (text.match(/(\d+)\s*Hz(?=[^\n]{0,8}刷新率)/) || [])[1] ??
    (text.match(/(\d+)\s*Hz(?=[^\n]{0,12}refresh rate)/i) || [])[1];
  // 峰值亮度四种写法："峰值亮度: 1100nit" / "最大亮度： 1120nit" / "1120nit（峰值亮度）"（HBM 在前）
  //   / UK 站 "Brightness: 800nit HBM / 500nit(typ)" 或 "800 nit (HBM)/500 nit (typ)"
  const brightness =
    firstNum((text.match(/(?:多场景)?(?:峰值|最大)亮度[:：]\s*(\d{3,4})/) || [])[0]) ??
    firstNum((text.match(/(\d{3,4})\s*nit\s*[（(]?\s*峰值亮度/) || [])[0]) ??
    firstNum((text.match(/Brightness\s*[:：]?\s*(\d{3,4})\s*nit/i) || [])[0]) ??
    firstNum((text.match(/(\d{3,4})\s*nit/i) || [])[0]);
  // 面板类型：屏幕小节里写明的优先；12/12X/12S 这类只在卖点区写
  // 「6.28″ AMOLED屏幕」的，退回整页文本找（screenshot 小节只有营销名「超视感屏」）
  const panelSrc = /AMOLED|OLED/i.test(text) ? text : `${text}\n${fallbackText ?? ""}`;
  const panel = /AMOLED/i.test(panelSrc) ? "AMOLED" : /OLED/i.test(panelSrc) ? "OLED" : null;
  // HDR 认证：从竖线分隔的 token 里挑认证项（页面写法 HDR10+ / HDR Vivid / Dolby Vision / 支持Dolby Vision）
  const hdr = [];
  for (const line of String(hdrText ?? text).split("\n")) {
    for (const token of line.split(/[丨｜|、]/)) {
      const t = token.trim().replace(/\s+/g, "").replace(/^支持/, "");
      if (/^HDR10\+?$/i.test(t)) hdr.push("HDR10+");
      else if (/^HDRVivid$/i.test(t)) hdr.push("HDR Vivid");
      else if (/^DolbyVision$/i.test(t) || t === "杜比视界") hdr.push("杜比视界");
      else if (/^HLG$/i.test(t)) hdr.push("HLG");
    }
  }
  return {
    size_inch: size,
    resolution,
    ppi: calcPpi(resolution, size),
    refresh_rate: refresh ? `1-${refresh}Hz` : null,
    panel,
    form: form === undefined ? (/直屏|直面屏/.test(text) ? "直屏" : null) : form,
    max_brightness_nits: brightness,
    hdr_formats: [...new Set(hdr)].length ? [...new Set(hdr)] : null,
  };
}

export function buildDisplays(sections, keyParams, rootText) {
  const panelLines = linesOf(sections, "屏幕显示");
  const { main, secondary } = splitPanel(panelLines);
  const resFromKp = (which) => {
    const v = kpVal(keyParams, "屏幕分辨率") ?? "";
    const part = v.split("|").find((s) => s.trim().startsWith(which));
    return part ? normResolution(part.split(/[:：]/).pop()) : null;
  };
  // 「直屏」不一定写在屏幕小节里（写在页首卖点区），全文兜底
  const form = /直屏|直面屏/.test(`${main.join("\n")}\n${rootText}`) ? "直屏" : null;
  // HDR 认证行可能落在背屏块之后（Pro/Pro Max），主屏的 HDR 从整节找
  const display = buildPanel(main, { form, hdrText: panelLines.join("\n"), fallbackText: rootText });
  if (!display.resolution) display.resolution = resFromKp("正屏");

  let display_secondary = null;
  if (secondary) {
    // 副屏不挂 HDR 认证（认证行都属于正屏）
    display_secondary = buildPanel(secondary, { form: null, hdrText: "", fallbackText: "" });
    if (!display_secondary.resolution) display_secondary.resolution = resFromKp("背屏");
  }
  return { display, display_secondary };
}

/** 充电文本 → { wired, wireless }。
 *  各代页面写法差别很大，有的干脆不写「有线」两个字：
 *    "67W 有线秒充 / 50W 无线秒充 / 10W 无线反充"（12 / 12S / 11 系列）
 *    "67W 小米澎湃秒充 / 50W 无线快充 / 10W 无线反充"（12S Ultra / 12 Pro，有线段没「有线」）
 *    "标配有线 22.5W 充电器"（10 青春版，W 在「有线」后面）
 *    "30W wired fast charging , 30W wireless fast charging"（UK 站）
 *  所以按分隔符切段、逐段判归属：先找带 有线/wired 的段，再找 无线/wireless 的段，
 *  两类都没有时才退回「第一个带充电动词的段」当有线（反向充电两处都不认）。 */
function parseCharging(text) {
  const segs = String(text ?? "")
    .split(/[\/＋+、，,;；\n｜|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const watts = segs
    .map((s) => ({ s, w: firstNum((s.match(/([\d.]+)\s*W\b/i) || [])[0]) }))
    .filter((x) => x.w != null);
  const pick = (re) => watts.find((x) => re.test(x.s) && !/反向|reverse/i.test(x.s))?.w ?? null;
  const wired =
    pick(/有线|wired/i) ??
    watts.find(
      (x) => !/无线|wireless|反向|reverse/i.test(x.s) && /秒充|闪充|快充|charg/i.test(x.s)
    )?.w ??
    null;
  return { wired, wireless: pick(/无线|wireless/i) };
}

export function buildBattery(sections, keyParams, rootText) {
  const text = linesOf(sections, "续航与充电", "充电续航").join("\n");
  // 容量：第一处 "6800mAh(typ)" / "等效4500mAh（typ）"（typ 恒在前）
  const capacity = firstNum((text.match(/([\d.]+)\s*mAh/i) || [])[0]) ?? firstNum(kpVal(keyParams, "电池容量"));
  const { wired, wireless } = parseCharging(text);
  let wiredWatt = wired;
  // 11 青春版这类页面：「充电续航」小节只列快充协议，瓦数写在页面顶部的卖点行
  // （"4250mAh丨33W 有线闪充"）→ 兜底扫全文
  if (wiredWatt == null) wiredWatt = firstNum((String(rootText ?? "").match(/([\d.]+)\s*W\s*有线/) || [])[0]);
  if (capacity == null) throw new Error("解析不到电池容量（参数页与商城关键参数都没有）");
  return { capacity_mah: capacity, charging_watt: wiredWatt, wireless_charging_watt: wireless };
}

// ---------- 相机 ----------

// 镜头条目的起始行形态（四代模板实测；缺一都会漏镜头或多切）：
//   A "徕卡1英寸光影大师：50MP｜…"      名称：NMP（17 系列）
//   B "5000万 徕卡浮动长焦：ƒ/2.0 …"    N万 名称：…（像素写在「万」里）
//   C "200MP HP9｜…"                    NMP 打头，名称在上一行独立成行（徕卡主摄）
//   D "前置 5000 万高清相机"             前置头，规格在后续行（50MP | ƒ/2.2 …）
//   E "5000万像素超清主摄" / "1 亿像素超清主摄：…"
//     "2000 万超广角镜头" / "4800万 像素超清主摄"        N[万|亿] + 描述（12/11/10 系列）
//   F "前置3200万像素" / "2000万超清前置相机"             前置打头或前置收尾
//   G "景深镜头" / "微距镜头" / "独立微距镜头"（10S / 10 青春版，无像素）
//   H "潜望式长焦镜头：50倍潜望式变焦 | … | 8MP"          像素写在冒号后的规格里（11 Pro/Ultra）
//   边界行 "前置" / "后置相机支持" 等：只切分，不构成条目
//   组标题行 "5000万像素超清主摄："（12S，冒号收尾、后面才是真条目）：只切分
// 噪声行与真条目的区别：真条目的「描述段」（冒号前）里没有分隔符、
// 不含 三主摄/四摄/摄像头 这类计数词 —— "1亿像素丨四摄"、"5000万 超清三主摄" 靠这条挡掉
const BARE_BOUNDARY = /^(?:[前后]置(?:相机|摄像头)?(?:拍照|摄像)?支持|[前后]置)$/;
const CAM_NOISE_RE = /[丨｜|、]|(?:[三四五六双])主?摄|摄像头/;
const BARE_LENS_RE = /^(?:独立|超清|专业)?(?:超广角|广角|微距|景深|人像|长焦|潜望式?长焦|超长焦|主摄)(?:镜头|相机)?$/;
const COLON_LENS_RE = /镜头|相机/;
const COLON_LENS_EXCLUDE_RE = /视频|拍摄|帧率|慢动作|功能|支持/;
const CAM_MP_RE = /([\d.]+)\s*MP\b/;

/** 剥掉行首的「N 万/亿 [像素]」前缀，剩下的就是镜头描述 */
const stripMpPrefix = (s) => String(s ?? "").replace(/^[\d.]+\s*[万亿]\s*(?:像素)?\s*/, "").trim();

/** 下一行是不是镜头条目的起始（用来区分「三摄组标题」和「真主摄条目」，见 entryStartKind） */
function looksLikeLensStart(l) {
  if (!l) return false;
  if (/^前置\s*[\d.]+\s*[万亿]/.test(l)) return true;
  if (BARE_BOUNDARY.test(l)) return true;
  if (/^[\d.]+\s*[万亿]/.test(l)) return !CAM_NOISE_RE.test(l.split(/[:：]/)[0]);
  if (BARE_LENS_RE.test(l)) return true;
  if (/^[^：:]{1,20}[:：]/.test(l) && COLON_LENS_RE.test(l.split(/[:：]/)[0]) && !COLON_LENS_EXCLUDE_RE.test(l)) return true;
  if (/^[^：:]{1,28}[:：]\s*[\d.]+\s*MP\b/.test(l)) return true;
  if (/^[\d.]+\s*MP\b\s+[A-Za-z0-9]/.test(l)) return true;
  return false;
}

function entryStartKind(line, prevLine, nextLine) {
  if (/^前置\s*[\d.]+\s*[万亿]/.test(line)) return "front";
  if (BARE_BOUNDARY.test(line)) return "boundary";
  if (/^[\d.]+\s*[万亿]/.test(line)) {
    if (CAM_NOISE_RE.test(line.split(/[:：]/)[0])) return null;
    // 组标题 vs 真主摄条目：两者都写成「N万像素超清主摄：」。
    // 区别在下一行 —— 12S 的下一行还是镜头条目（「5000万像素 广角主摄：…」，三摄组），
    // 11 青春版的下一行是规格（「f/1.79 超大光圈、6P 镜头」，主摄本体）
    if (/[:：]\s*$/.test(line) && /^(?:超清)?主摄$/.test(stripMpPrefix(line.split(/[:：]/)[0]))) {
      return looksLikeLensStart(nextLine) ? "boundary" : "named";
    }
    return "named";
  }
  if (BARE_LENS_RE.test(line)) return "plain";
  // H 形态：「潜望式长焦镜头：…｜8MP」，像素藏在冒号后面的规格里；
  // 排除「主摄视频拍摄：」「后置视频拍摄帧率」这类帧率小标题
  if (
    /^[^：:]{1,20}[:：]/.test(line) &&
    COLON_LENS_RE.test(line.split(/[:：]/)[0]) &&
    !COLON_LENS_EXCLUDE_RE.test(line)
  ) {
    return "lensColon";
  }
  if (/^[^：:]{1,28}[:：]\s*[\d.]+\s*MP\b/.test(line)) return "named";
  // 老模板（13/14 系列）长焦不写像素："徕卡 75mm 浮动长焦*：f/2.0 大光圈｜…"
  // 光圈打头的条目也认作新条目（resolution_mp 会是 null，忠实于官网）
  if (/^[^：:]{1,30}[:：]\s*(?:f|ƒ)\s*\//.test(line)) return "aperture";
  // "200MP HP9｜…"：仅当上一行是独立镜头名（短、无数字、无冒号）才算新条目，
  // 否则是 "50MP丨ƒ/2.2…" 这种跟在前置头后面的规格行。
  //   UK 站（小米10 / 10 Pro）另有 "108MP ultra-clear primary sensor" 这种
  //   MP 打头 + 英文镜头名的写法 —— 上一行是组标题（带 | 的计数行）也要认。
  //   排除法：行首 MP 后必须紧跟字母/数字（挡掉 "108MP | AI rare quad camera" 这种组标题，
  //   但放进 "8MP 10x hybrid zoom lens"），且行内含英文镜头词 ——
  //   "48MP 超清丨AI 相机丨…"（中文功能清单）和 "32MP有效像素(拍照模式)" 都会被挡掉
  if (/^[\d.]+\s*MP\b\s+[A-Za-z0-9]/.test(line) && /primary|wide|macro|depth|telephoto|portrait|camera|sensor|lens|zoom/i.test(line)) {
    return "named";
  }
  if (/^[\d.]+\s*MP\b/.test(line)) {
    return prevLine && prevLine.length <= 12 && !/[:：\d]/.test(prevLine) && !BARE_BOUNDARY.test(prevLine)
      ? "named"
      : null;
  }
  return null;
}

/** 相机条目：{ isFront, desc, mp, aperture, focalMm, ois }；解析不到任何特征返回 null */
function parseCamEntry(kind, startLine, body, prevLine) {
  if (kind === "boundary") return null; // 边界/组标题只负责切分（哪怕行里带像素，如 12S 的组标题）
  const text = `${startLine}\n${body}`;
  // 像素优先取**起始行**：条目合并进来的「* 32MP有效像素(拍照模式)；50MP总像素…」
  // 这类说明行会污染全文首个 MP（小米 14 超广角因此差点变成 32MP）
  let mp = mpFromText(startLine) ?? firstNum((text.match(CAM_MP_RE) || [])[0]);
  let desc = "";
  if (kind === "named") desc = stripMpPrefix(startLine.split(/[:：]/)[0]);
  else if (kind === "aperture") desc = startLine.split(/[:：]/)[0].replace(/\*+$/, "").trim();
  else if (kind === "front") desc = startLine.replace(/^前置\s*/, "").replace(/[\d.]+\s*[万亿]\s*(?:像素)?\s*/, "").trim();
  else if (kind === "plain") desc = startLine.trim();
  else if (kind === "lensColon") desc = startLine.split(/[:：]/)[0].trim();
  else if (prevLine) desc = prevLine.trim();
  const ap = text.match(/(?:f|ƒ)\s*\/\s*([\d.]+(?:\s*-\s*[\d.]+)?)/);
  // f/2 → f/2.0（统一一位小数口径，与既有机型一致）
  const apStr = ap
    ? (ap[1].includes(".") || ap[1].includes("-") ? ap[1] : `${ap[1]}.0`).replace(/\s*-\s*/, "-")
    : null;
  // G 形态（纯镜头名独立成行）行本身就是镜头，没有像素/光圈也保留；
  // 其它形态没有特征就是噪声（边界行、规格续行）
  if (mp == null && !ap && kind !== "plain") return null;
  const focal = text.match(/等效\s*([\d.]+)\s*mm/);
  return {
    desc,
    // UK 站的前置头写 "20MP Ultra-clear Front Camera"
    isFront: kind === "front" || /前置|Front\s*camera/i.test(`${startLine}${desc}`),
    mp,
    aperture: apStr ? `f/${apStr}` : null,
    focalMm: focal ? Number(focal[1]) : null,
    ois: /OIS|光学防抖/.test(text),
  };
}

/** 镜头归类（与 OPPO 源同一套口径，另有四处老页面特有写法）：
 *  - 「人像主摄 / 人像镜头」是人像焦段（48-50mm 等效），归长焦而非主摄
 *  - 老页面（10/11 系列）的「广角镜头」不带「超」字时指的就是超广角（123°/128°），
 *    所以「主摄」必须先于「广角」判断，否则 1300万广角镜头 会被吃成主摄
 *  - 「超低畸变广角」是 14 Ultra 超广角的写法，必须落在超广角里
 *  - UK 站（小米10 / 10 Pro）的镜头名是英文，各分支都带英文关键词 */
export function classifyLens(desc, { isFront = false, focalMm = null } = {}) {
  const d = desc || "";
  if (isFront) return "前置";
  if (/超广角|超低畸变|ultra.?wide/i.test(d)) return "超广角";
  if (/人像|潜望|长焦|望远|变焦|telephoto|portrait|zoom/i.test(d)) return "长焦";
  if (/微距|macro/i.test(d)) return "微距";
  if (/黑白|景深|虚化|depth/i.test(d)) return "景深";
  if (/主摄|primary|main/i.test(d)) return "主摄";
  if (/广角|wide/i.test(d)) return "超广角";
  if (focalMm != null && focalMm >= 50) return "长焦";
  return "主摄";
}

export function buildCameras(camText, { frontFallbackMp = null } = {}) {
  const lines = String(camText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  // 切条目：遇到起始行开新条目，其余行并入当前条目
  const entries = [];
  let prevLine = null;
  for (const [i, line] of lines.entries()) {
    const kind = entryStartKind(line, prevLine, lines[i + 1] ?? null);
    if (kind) entries.push({ kind, startLine: line, body: [], prevLine });
    else if (entries.length) entries[entries.length - 1].body.push(line);
    prevLine = line;
  }

  // 前置分界：第一个起始行带「前置」的条目（前置头 / 前置独立行 / 边界行）
  const parsed = entries.map((e) => parseCamEntry(e.kind, e.startLine, e.body.join("\n"), e.prevLine));
  const frontIdx = entries.findIndex((e) => e.kind === "front" || /前置|Front\s*camera/i.test(e.startLine));

  const toCam = (p) => ({
    type: classifyLens(p.desc, { isFront: p.isFront, focalMm: p.focalMm }),
    sensor: null,
    resolution_mp: p.mp,
    aperture: p.aperture,
    focal_length_mm: p.focalMm,
    image_stabilization: p.ois ? ["光学防抖"] : null,
  });

  const cams = [];
  for (const [i, p] of parsed.entries()) {
    if (!p || (frontIdx !== -1 && i >= frontIdx)) continue; // 空边界条目 / 前置区单独处理
    cams.push(toCam(p));
  }
  // 前置：优先页面解析；参数页没写前置规格时（17T Pro）用商城关键参数兜底
  const frontEntries = frontIdx === -1 ? [] : parsed.slice(frontIdx).filter(Boolean);
  if (frontEntries.length) cams.push(toCam(frontEntries[0]));
  else if (frontFallbackMp != null) {
    cams.push({ type: "前置", sensor: null, resolution_mp: frontFallbackMp, aperture: null, focal_length_mm: null, image_stabilization: null });
  }
  return cams;
}

// ---------- 蜂窝 / NFC ----------

export function buildCellular(sections, keyParams, rootText) {
  const bandLines = linesOf(sections, "网络频段");
  // 合并折行：频段条目以 5G：/4G：/FDD-LTE：/TDD-LTE：/3G：/2G：打头，其余行并入上一条
  // UK 站把 TDD-LTE 缩写成 TD-LTE（"4G: TD-LTE: 38/40"），两版都要认
  const TD_LTE = /^(FDD|TDD?)-LTE\s*[:：]/;
  const merged = [];
  for (const raw of bandLines) {
    const line = raw.trim();
    if (/^(5G|4G|3G|2G)\s*[:：]/.test(line) || TD_LTE.test(line) || /^(CDMA|EVDO)/i.test(line)) {
      merged.push(line);
      continue;
    }
    if (/^注|^（|^\(/.test(line) || /^支持/.test(line)) continue; // 注释与 MIMO 说明不要
    if (merged.length) merged[merged.length - 1] += line;
  }
  const seg = (s) =>
    s
      .replace(/\s*\/\s*/g, "/")
      // 「4G：FDD-LTE : B1/…；TDD-LTE : B34/…」里分号后面还是同一条 4G 的第二段，不能当尾巴切；
      // 只有「…；未开通…」这类说明才切掉
      .replace(/[;；](?!\s*(?:F|T)DD?-LTE\s*[:：])[\s\S]*$/, "")
      .replace(/。.*$/, "")
      .trim();
  const stripTech = (s) => s.replace(/^(GSM|WCDMA|CDMA|FDD-LTE|TDD?-LTE|Sub6G)\s*[:：]?\s*/i, "").trim();
  // 兜底清洗：去掉残留的 GSM:/WCDMA: 前缀；截掉最后一个频段 token 之后的尾巴
  // （页面会把「未开通…络和业务部署」之类说明折行拼进 2G 条目）
  const cleanBand = (s) => {
    let t = s
      .replace(/（[^）]*）/g, "") // 频段括注：「n28a（上行:703MHz-…）」→ n28a
      .replace(/\([^)]*\)/g, "")
      .replace(/(GSM|WCDMA|CDMA)\s*[:：]\s*/gi, "")
      .trim();
    let last = -1;
    for (const m of t.matchAll(/[nB]\d+[ab]?/g)) last = m.index + m[0].length;
    if (last >= 0) t = t.slice(0, last);
    // UK 站频段写成裸数字（"4G: FDD-LTE :1/2/3/…"、"4G: TD-LTE: 38/40"）→ 补 B 前缀，与国行页口径一致
    return t
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (/^\d+[ab]?$/.test(x) ? `B${x}` : x))
      .join("/");
  };

  const bands = [];
  for (const raw of merged) {
    const line = seg(raw);
    // 老页面（12/11/10 系列）的段前缀带空格（"5G ：n1 / …"），所以 [:：] 前要有 \s*
    const cut = (re) => line.replace(re, "").trim();
    if (/^5G\s*[:：]/.test(line)) bands.push(`5G NR：${cleanBand(stripTech(cut(/^5G\s*[:：]\s*/)))}`);
    else if (/^FDD-LTE\s*[:：]/.test(line)) bands.push(`4G LTE FDD：${cleanBand(stripTech(line))}`);
    else if (/^TDD?-LTE\s*[:：]/i.test(line)) bands.push(`4G LTE TDD：${cleanBand(stripTech(line))}`);
    else if (/^3G\s*[:：]/.test(line)) bands.push(`3G WCDMA：${cleanBand(stripTech(cut(/^3G\s*[:：]\s*/)))}`);
    else if (/^2G\s*[:：]/.test(line)) bands.push(`2G GSM：${cleanBand(stripTech(cut(/^2G\s*[:：]\s*/)))}`);
    else if (/^4G\s*[:：]/.test(line)) {
      // "4G：FDD-LTE：B1/…TDD-LTE：B34/…"（一行双段）拆开；UK 站还有 "4G: TD-LTE: 38/40"
      for (const part of cut(/^4G\s*[:：]\s*/).split(/(?=(?:F|T)DD?-LTE)/i)) {
        const t = seg(part);
        if (/^FDD-LTE/i.test(t)) bands.push(`4G LTE FDD：${cleanBand(stripTech(t))}`);
        else if (/^TDD?-LTE/i.test(t)) bands.push(`4G LTE TDD：${cleanBand(stripTech(t))}`);
      }
    }
  }

  // SIM：老页面写在「网络与制式」，UK 站写在「Network & Connectivity」（都会落进别的小节），
  // 所以从全文找；UK 版 Mi 10 是单卡（Single Nano-SIM slot），不能一律写双卡。
  // 12X 写「支持双 Nano 卡槽」、11 青春版写「双Nano SIM+Micro SD」，都省了 SIM 字样
  const simLine = String(rootText ?? "")
    .split("\n")
    .find((l) => /Nano[\s-]*SIM|Nano\s*卡槽/i.test(l));
  const sim = simLine
    ? /Single|单\s*Nano|单卡/i.test(simLine)
      ? "单 Nano-SIM 卡"
      : "双 Nano-SIM 卡"
    : kpVal(keyParams, "网络模式");
  return {
    sim: sim ?? null,
    esim: null,
    bands: bands.length ? bands : null,
    satellite: /天通|卫星通信/.test(bandLines.join("\n")) ? "支持卫星通信" : null,
  };
}

// ---------- 主流程 ----------

export async function scrapeXiaomiSpecs({ ids, dryRun = false, withImages = true }) {
  const texts = await fetchSpecsTexts(ids);

  // 1. 逐台构建参数（配色先挂商城的，hex 等取色后回填）
  const built = [];
  for (const id of ids) {
    const meta = META[id];
    if (!meta) throw new Error(`未知小米机型：${id}（可选：${Object.keys(META).join(", ")}）`);

    const rootText = texts[id] ?? "";
    const sections = parseSections(rootText);
    const keyParams = await fetchKeyParams(id);
    const variants = await fetchVariants(id);
    if (!rootText) {
      console.log(`  ⚠ ${id}: 官网参数页为空，参数来自商城关键参数 + OVERRIDES（${OVERRIDES[id]?.reason ?? "无兜底表"}）`);
    }

    const spec = buildSpec(id, meta, sections, keyParams, variants, rootText);
    // 老机型（12/11/10 系列）没有商城接口，配色来自官网页面的手工核对表
    const { colors } = isLegacyModel(id) ? fetchLegacyColors(id) : await fetchXiaomiColors(id);
    spec.colors = colors.map(({ imgUrl, ...c }) => ({ ...c, hex: null }));
    built.push({ id, spec, colorImgUrls: new Map(colors.map((c) => [c.slug, c.imgUrl])) });
  }

  // 2. 一次性抓全部产品图并取色
  let hexMap = {};
  let report = {};
  if (withImages) {
    const res = await scrapeXiaomiShop({ ids, dryRun });
    hexMap = res.hexMap;
    report = res.report;
  }

  // 3. 回填 hex 并落盘
  const written = [];
  for (const { id, spec } of built) {
    for (const c of spec.colors) {
      const raw = report[id]?.colors.find((x) => x.slug === c.slug)?.raw;
      c.hex = (raw && hexMap[raw]?.hex) || null;
    }
    if (dryRun) {
      console.log(`\n===== ${id}（dry-run 预览） =====`);
      console.log(JSON.stringify(spec, null, 1));
    } else {
      mkdirSync(DEVICES_DIR, { recursive: true });
      const out = resolve(DEVICES_DIR, `${id}.json`);
      writeFileSync(out, JSON.stringify(spec, null, 1) + "\n");
      written.push(out);
      console.log(`✓ ${out}`);
    }
  }
  return { written };
}

/** 操作系统：老页面是「MIUI 12*」+「基于 Android 11」两行（还夹着升级公告），
 *  统一成「MIUI 12（基于 Android 11）」；只有一行时原样返回 */
export function buildOs(sections) {
  const lines = linesOf(sections, "操作系统").map((l) => l.replace(/\*+/g, "").trim()).filter(Boolean);
  if (!lines.length) return null;
  const android = lines.find((l) => /基于\s*Android/i.test(l));
  return android ? `${lines[0]}（${android}）` : lines[0];
}

export function buildSpec(id, meta, sections, keyParams, variants, rootText) {
  const ov = OVERRIDES[id] ?? {};

  const chipset = buildChipset(sections, keyParams, variants, id);
  const body = buildBody(sections, keyParams, rootText);
  const { display, display_secondary } = buildDisplays(sections, keyParams, rootText);
  // 17T 这类参数页为空的机型：屏幕关键项从商城关键参数补
  if (display.size_inch == null) display.size_inch = firstNum(kpVal(keyParams, "屏幕尺寸"));
  if (display.resolution == null) display.resolution = normResolution(kpVal(keyParams, "屏幕分辨率"));
  if (ov.display) for (const [k, v] of Object.entries(ov.display)) if (display[k] == null) display[k] = v;
  display.ppi = calcPpi(display.resolution, display.size_inch);

  const battery = buildBattery(sections, keyParams, rootText);

  const camText = linesOf(sections, "影像系统").join("\n");
  const camera = buildCameras(camText, { frontFallbackMp: mpFromText(kpVal(keyParams, "前置摄像头")) });
  if (!camera.some((c) => c.type !== "前置") && ov.camera) camera.unshift(...ov.camera);

  const fpRaw = linesOf(sections, "指纹解锁").join("") || kpVal(keyParams, "指纹识别") || "";
  // 13/14 系列没有「指纹解锁」小节，指纹写在屏幕卖点行（…｜屏下指纹｜暗光解锁）；
  // 10 青春版写「屏下光学指纹」、10 至尊纪念版写「超薄屏幕指纹识别」
  const fingerprint =
    (/屏下|超声波|光学/.test(fpRaw)
      ? "屏下指纹"
      : /屏下[^\n丨|｜，,]{0,8}指纹|屏幕指纹/.test(rootText)
        ? "屏下指纹"
        : fpRaw.trim() || null) ?? ov.fingerprint ?? null;
  const cellular = buildCellular(sections, keyParams, rootText);
  if (ov.sim) cellular.sim = ov.sim;

  return {
    name: meta.name,
    brand: "小米",
    series: meta.series,
    release_year: Number(meta.release_date.slice(0, 4)),
    chipset,
    body,
    display,
    display_secondary,
    battery,
    camera,
    os: buildOs(sections),
    biometric: { fingerprint, face_unlock: null },
    cellular,
    nfc: linesOf(sections, "多功能NFC").join("\n") || kpVal(keyParams, "NFC") || null,
    colors: [],
    release_date: meta.release_date,
  };
}
