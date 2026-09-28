// OPPO 参数源：oppo.com 中国官网 specs 页（纯 SSR HTML，无需浏览器）
//
// 页面结构（实测 2026-09）：
// - 参数组件 id="ch-product-param"，分组标题 data-labeKey（官网拼写笔误，少了个 b），
//   条目 data-labelKey + p.key（中文标签）/ p.value（值）
// - **labelKey 与中文标签/内容存在错位**（同一含义两台机器用不同 key），解析只信
//   「中文标签 + 值特征」，labelKey 仅用于分组归属
// - 配色顺序：color-list-name 的 DOM 顺序 = 官网展示顺序，第一个为默认色
//   （注意：与商城接口 attributesColorParams 的顺序恰好相反，别混用）
// - 分色产品图不在本页（只有一张多色拼图），图片走官方商城接口，见 shop.mjs
//
// schema 扩展（2026-09-23，用户要求补充的字段；已有 71 台这些字段为 null/缺失）：
//   os                 操作系统，如 "ColorOS 17.0"
//   biometric          { fingerprint, face_unlock }
//   cellular           { sim, esim, bands[], satellite }  bands 保持官网顺序（2G→5G）
//   nfc                官网 NFC 条目原文
//   display_secondary  折叠屏副屏，结构与 display 相同；直板机为 null
//   body.dimensions_folded_mm  折叠态尺寸；直板机为 null

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchOppoColors, scrapeOppoShop, hasShopEntry } from "./shop.mjs";
import { slugOf, normColor } from "./colors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEVICES_DIR = resolve(HERE, "../../../../src/data/devices");

const SPECS_URLS = {
  // Find X 系列
  "oppo-find-x10": "https://www.oppo.com/cn/smartphones/series-find-x/find-x10/specs/",
  "oppo-find-x10-pro-max": "https://www.oppo.com/cn/smartphones/series-find-x/find-x10-pro-max/specs/",
  "oppo-find-x10-e": "https://www.oppo.com/cn/smartphones/series-find-x/find-x10-e/specs/",
  "oppo-find-x9": "https://www.oppo.com/cn/smartphones/series-find-x/find-x9/specs/",
  "oppo-find-x9-pro": "https://www.oppo.com/cn/smartphones/series-find-x/find-x9-pro/specs/",
  "oppo-find-x9-pro-satellite": "https://www.oppo.com/cn/smartphones/series-find-x/find-x9-pro-satellite/specs/",
  "oppo-find-x9-ultra": "https://www.oppo.com/cn/smartphones/series-find-x/find-x9-ultra/specs/",
  "oppo-find-x9s-pro": "https://www.oppo.com/cn/smartphones/series-find-x/find-x9s-pro/specs/",
  "oppo-find-x8": "https://www.oppo.com/cn/smartphones/series-find-x/find-x8/specs/",
  "oppo-find-x8-pro": "https://www.oppo.com/cn/smartphones/series-find-x/find-x8-pro/specs/",
  "oppo-find-x8-pro-satellite": "https://www.oppo.com/cn/smartphones/series-find-x/find-x8-pro-satellite/specs/",
  "oppo-find-x8-ultra": "https://www.oppo.com/cn/smartphones/series-find-x/find-x8-ultra/specs/",
  "oppo-find-x8s": "https://www.oppo.com/cn/smartphones/series-find-x/find-x8s/specs/",
  "oppo-find-x8s-plus": "https://www.oppo.com/cn/smartphones/series-find-x/find-x8s-plus/specs/",
  "oppo-find-x7": "https://www.oppo.com/cn/smartphones/series-find-x/find-x7/specs/",
  "oppo-find-x7-ultra": "https://www.oppo.com/cn/smartphones/series-find-x/find-x7-ultra/specs/",
  "oppo-find-x6": "https://www.oppo.com/cn/smartphones/series-find-x/find-x6/specs/",
  "oppo-find-x6-pro": "https://www.oppo.com/cn/smartphones/series-find-x/find-x6-pro/specs/",
  // Find N 系列
  "oppo-find-n6": "https://www.oppo.com/cn/smartphones/series-find-n/find-n6/specs/",
  "oppo-find-n5": "https://www.oppo.com/cn/smartphones/series-find-n/find-n5/specs/",
  // Reno 系列
  "oppo-reno16": "https://www.oppo.com/cn/smartphones/series-reno/reno16/specs/",
  "oppo-reno16-pro": "https://www.oppo.com/cn/smartphones/series-reno/reno16-pro/specs/",
  "oppo-reno15": "https://www.oppo.com/cn/smartphones/series-reno/reno15/specs/",
  "oppo-reno15-pro": "https://www.oppo.com/cn/smartphones/series-reno/reno15-pro/specs/",
  "oppo-reno15c": "https://www.oppo.com/cn/smartphones/series-reno/reno15c/specs/",
  // K 系列
  "oppo-k15-pro": "https://www.oppo.com/cn/smartphones/series-k/k15-pro/specs/",
  "oppo-k15-pro-plus": "https://www.oppo.com/cn/smartphones/series-k/k15-pro-plus/specs/",
  "oppo-k13-turbo": "https://www.oppo.com/cn/smartphones/series-k/k13-turbo/specs/",
  "oppo-k13-turbo-pro": "https://www.oppo.com/cn/smartphones/series-k/k13-turbo-pro/specs/",
  // A 系列
  "oppo-a7-pro": "https://www.oppo.com/cn/smartphones/series-a/a7-pro/specs/",
  "oppo-a7-pro-max": "https://www.oppo.com/cn/smartphones/series-a/a7-pro-max/specs/",
  "oppo-a6": "https://www.oppo.com/cn/smartphones/series-a/a6/specs/",
  "oppo-a6-pro": "https://www.oppo.com/cn/smartphones/series-a/a6-pro/specs/",
  "oppo-a6k": "https://www.oppo.com/cn/smartphones/series-a/a6k/specs/",
  "oppo-a6m": "https://www.oppo.com/cn/smartphones/series-a/a6m/specs/",
  "oppo-a6s-pro": "https://www.oppo.com/cn/smartphones/series-a/a6s-pro/specs/",
  "oppo-a6t": "https://www.oppo.com/cn/smartphones/series-a/a6t/specs/",
  "oppo-a6x": "https://www.oppo.com/cn/smartphones/series-a/a6x/specs/",
};

// release_date 官网参数页没有，取自发布会公开信息（2026-09 检索核实）
const META = {
  // Find X 系列
  "oppo-find-x10": { name: "OPPO Find X10", series: "Find X 系列", release_date: "2026-09" },
  "oppo-find-x10-pro-max": { name: "OPPO Find X10 Pro Max", series: "Find X 系列", release_date: "2026-09" },
  "oppo-find-x10-e": { name: "OPPO Find X10e", series: "Find X 系列", release_date: "2026-09" },
  "oppo-find-x9": { name: "OPPO Find X9", series: "Find X 系列", release_date: "2025-10" },
  "oppo-find-x9-pro": { name: "OPPO Find X9 Pro", series: "Find X 系列", release_date: "2025-10" },
  "oppo-find-x9-pro-satellite": { name: "OPPO Find X9 Pro 卫星通信版", series: "Find X 系列", release_date: "2025-11" },
  "oppo-find-x9-ultra": { name: "OPPO Find X9 Ultra", series: "Find X 系列", release_date: "2026-04" },
  "oppo-find-x9s-pro": { name: "OPPO Find X9s Pro", series: "Find X 系列", release_date: "2026-04" },
  "oppo-find-x8": { name: "OPPO Find X8", series: "Find X 系列", release_date: "2024-10" },
  "oppo-find-x8-pro": { name: "OPPO Find X8 Pro", series: "Find X 系列", release_date: "2024-10" },
  "oppo-find-x8-pro-satellite": { name: "OPPO Find X8 Pro 卫星通信版", series: "Find X 系列", release_date: "2025-06" },
  "oppo-find-x8-ultra": { name: "OPPO Find X8 Ultra", series: "Find X 系列", release_date: "2025-04" },
  "oppo-find-x8s": { name: "OPPO Find X8s", series: "Find X 系列", release_date: "2025-04" },
  "oppo-find-x8s-plus": { name: "OPPO Find X8s+", series: "Find X 系列", release_date: "2025-04" },
  "oppo-find-x7": { name: "OPPO Find X7", series: "Find X 系列", release_date: "2024-01" },
  "oppo-find-x7-ultra": { name: "OPPO Find X7 Ultra", series: "Find X 系列", release_date: "2024-01" },
  "oppo-find-x6": { name: "OPPO Find X6", series: "Find X 系列", release_date: "2023-03" },
  "oppo-find-x6-pro": { name: "OPPO Find X6 Pro", series: "Find X 系列", release_date: "2023-03" },
  // Find N 系列
  "oppo-find-n6": { name: "OPPO Find N6", series: "Find N 系列", release_date: "2026-03" },
  "oppo-find-n5": { name: "OPPO Find N5", series: "Find N 系列", release_date: "2025-02" },
  // Reno 系列
  "oppo-reno16": { name: "OPPO Reno16", series: "Reno 系列", release_date: "2026-05" },
  "oppo-reno16-pro": { name: "OPPO Reno16 Pro", series: "Reno 系列", release_date: "2026-05" },
  "oppo-reno15": { name: "OPPO Reno15", series: "Reno 系列", release_date: "2025-11" },
  "oppo-reno15-pro": { name: "OPPO Reno15 Pro", series: "Reno 系列", release_date: "2025-11" },
  "oppo-reno15c": { name: "OPPO Reno15c", series: "Reno 系列", release_date: "2025-12" },
  // K 系列
  "oppo-k15-pro": { name: "OPPO K15 Pro", series: "K 系列", release_date: "2026-04" },
  "oppo-k15-pro-plus": { name: "OPPO K15 Pro+", series: "K 系列", release_date: "2026-04" },
  "oppo-k13-turbo": { name: "OPPO K13 Turbo", series: "K 系列", release_date: "2025-07" },
  "oppo-k13-turbo-pro": { name: "OPPO K13 Turbo Pro", series: "K 系列", release_date: "2025-07" },
  // A 系列
  "oppo-a7-pro": { name: "OPPO A7 Pro", series: "A 系列", release_date: "2026-09" },
  "oppo-a7-pro-max": { name: "OPPO A7 Pro Max", series: "A 系列", release_date: "2026-08" },
  "oppo-a6": { name: "OPPO A6", series: "A 系列", release_date: "2026-03" },
  "oppo-a6-pro": { name: "OPPO A6 Pro", series: "A 系列", release_date: "2025-09" },
  "oppo-a6k": { name: "OPPO A6k", series: "A 系列", release_date: "2026-04" },
  "oppo-a6m": { name: "OPPO A6m", series: "A 系列", release_date: "2026-03" },
  "oppo-a6s-pro": { name: "OPPO A6s Pro", series: "A 系列", release_date: "2026-04" },
  "oppo-a6t": { name: "OPPO A6t", series: "A 系列", release_date: "2026-03" },
  "oppo-a6x": { name: "OPPO A6x", series: "A 系列", release_date: "2026-03" },
};

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36" };

// ---------- HTML 解析 ----------

function clean(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/<!---->/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** 把参数区解析成 [{label, items:[{key,val}]}]，分组与条目保持 DOM 顺序 */
export function parseSections(html) {
  const start = html.indexOf('id="ch-product-param"');
  const end = html.indexOf("ch-product-footer", start);
  const seg = html.slice(start, end > 0 ? end : undefined);
  if (!seg) throw new Error("页面里找不到参数组件 ch-product-param（官网可能改版了）");

  const marks = [];
  // 分组标题：<div ... data-labeKey="size-and-weight"><span>尺寸与重量</span><span ...>1</span></div>
  // m[1] 是英文 key（与内容错位，不可信），m[2] 里才是中文标签
  for (const m of seg.matchAll(/data-labeKey="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
    marks.push({ at: m.index, kind: "group", label: clean(m[2]) });
  }
  for (const m of seg.matchAll(/data-labelKey="([^"]+)"[^>]*>([\s\S]*?)<\/div><\/div><\/div>/g)) {
    const blob = m[2];
    const key = clean((blob.match(/class="[^"]*key"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
    const val = clean((blob.match(/class="[^"]*value[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
    marks.push({ at: m.index, kind: "item", key, val });
  }
  marks.sort((a, b) => a.at - b.at);

  const sections = [];
  let cur = null;
  for (const mk of marks) {
    if (mk.kind === "group") {
      cur = { label: mk.label.replace(/\d+$/, "").trim(), items: [] };
      sections.push(cur);
    } else if (cur) {
      cur.items.push({ key: mk.key.replace(/\d+$/, "").trim(), val: mk.val });
    }
  }
  return sections;
}

/** 取某分组下某中文标签的值；item 传 "" 匹配无标签条目（如 os、传感器） */
export function findVal(sections, group, item) {
  const g = sections.find((s) => s.label === group);
  if (!g) return null;
  const it = g.items.find((i) => i.key === item);
  return it ? it.val : null;
}

const firstNum = (s) => {
  const m = String(s ?? "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
};

/** "展开：约 159.87 毫米\n折叠：约 74.12 毫米" → 按前缀取数；无前缀直接取第一个数 */
function numByPrefix(s, prefix) {
  if (!s) return null;
  if (!s.includes(prefix)) return firstNum(s);
  const m = String(s).match(new RegExp(`${prefix}[:：]\\s*约?\\s*([\\d.]+)`));
  return m ? Number(m[1]) : null;
}

// ---------- 各区块构建 ----------

function buildChipset(sections) {
  const cpu = findVal(sections, "芯片", "移动平台") ?? "";
  let chip = cpu.split("，")[0].trim();
  chip = chip
    .replace(/^MediaTek\s*/, "")
    .replace(/移动平台$/, "")
    .replace(/骁龙®\s*8\s*至尊版/, "骁龙 8 至尊版")
    .replace(/第五代骁龙 8 至尊版/, "第五代骁龙 8 至尊版");
  if (!chip.startsWith("第五代") && /骁龙 8 至尊版/.test(chip)) chip = `第五代${chip}`;

  const storage = buildStorage(sections);
  return { chip, ram: storage.ram, rom: storage.rom };
}

function buildStorage(sections) {
  const cap = findVal(sections, "存储", "运行内存容量 + 机身存储容量") ?? "";
  const ramType = findVal(sections, "存储", "RAM 规格");
  const romType = findVal(sections, "存储", "ROM 规格");
  const combos = cap.split("，").map((s) => s.trim()).filter((s) => s.includes("+"));
  const rams = [...new Set(combos.map((c) => c.split("+")[0]))];
  const roms = [...new Set(combos.map((c) => c.split("+")[1]))];
  return {
    ram: rams.map((r) => (ramType ? `${r} ${ramType}` : r)),
    rom: roms.map((r) => (romType ? `${r} ${romType}` : r)),
  };
}

function buildBody(sections) {
  const h = findVal(sections, "尺寸与重量", "高");
  const w = findVal(sections, "尺寸与重量", "宽");
  const t = findVal(sections, "尺寸与重量", "厚");
  const wt = findVal(sections, "尺寸与重量", "重量");

  const isFold = [h, w, t].some((s) => s && s.includes("折叠"));
  const body = {
    dimensions_mm: {
      height: numByPrefix(h, "展开") ?? firstNum(h),
      width: numByPrefix(w, "展开") ?? firstNum(w),
      depth: numByPrefix(t, "展开") ?? firstNum(t),
    },
    weight_g: firstNum(wt),
    frame_material: null, // 官网参数页不提供
    back_material: null,
    front_material: null,
    water_resistance: null,
  };
  if (isFold) {
    body.dimensions_folded_mm = {
      height: numByPrefix(h, "折叠"),
      width: numByPrefix(w, "折叠"),
      depth: numByPrefix(t, "折叠"),
    };
  }
  return body;
}

/** 从「类型」条目里提刷新率：官网写法 "1-120Hz 智能切换，最高支持 144Hz" → "1-144Hz" */
function refreshRateOf(panelText) {
  if (!panelText) return null;
  const lo = panelText.match(/(\d+)\s*-\s*\d+\s*Hz/i);
  const hi = panelText.match(/最高(?:支持)?\s*(\d+)\s*Hz/i);
  if (hi) return `1-${hi[1]}Hz`;
  if (lo) return `1-${lo[1]}Hz`;
  return null;
}

function brightnessNits(text) {
  if (!text) return null;
  const hi = text.match(/激发最高亮度[:：]\s*(\d+)\s*尼特/);
  if (hi) return Number(hi[1]);
  const def = text.match(/默认最高亮度[:：]\s*(\d+)\s*尼特/);
  return def ? Number(def[1]) : null;
}

/** 单块屏幕参数。which: null（直板机）| "主屏" | "副屏" */
function buildDisplay(sections, which) {
  const pick = (val) => {
    if (!val || !which) return val;
    // 折叠机的值形如 "主屏：\nOLED 折叠屏\n1-120 Hz …\n副屏：\n…"，
    // 主/副屏标签独立成行，取该标签行到下一标签行之间的内容
    const lines = String(val).split("\n").map((l) => l.trim());
    const other = which === "主屏" ? "副屏" : "主屏";
    const start = lines.findIndex((l) => l.startsWith(`${which}：`));
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith(`${other}：`)) {
        end = i;
        break;
      }
    }
    return lines
      .slice(start, end)
      .join("\n")
      .replace(new RegExp(`^${which}[:：]\\s*`), "")
      .trim();
  };

  const sizeRaw = pick(findVal(sections, "显示", "尺寸"));
  if (!sizeRaw && which === "副屏") return null;

  const resRaw = pick(findVal(sections, "显示", "分辨率")) ?? "";
  const res = resRaw.match(/([\d+]+)\s*[×x]\s*([\d+]+)/);
  const ppi = resRaw.match(/(\d+)\s*PPI/i);
  // 类型/亮度是多行文本（直板机不带主/副屏前缀），取完整值而不是第一行
  const panelRaw = which ? pick(findVal(sections, "显示", "类型")) ?? "" : findVal(sections, "显示", "类型") ?? "";
  const brightnessRaw = which ? pick(findVal(sections, "显示", "亮度")) : findVal(sections, "显示", "亮度");

  // 面板类型：官网明说的才填（N6 主屏 "OLED 折叠屏"、副屏 "AMOLED 柬性屏"）；直板机只写形态
  let panel = null;
  let form = null;
  if (/OLED/i.test(panelRaw)) panel = panelRaw.match(/AMOLED/i) ? "AMOLED" : "OLED";
  if (/直面屏/.test(panelRaw)) form = "直屏";
  else if (/折叠屏/.test(panelRaw)) form = "折叠屏";

  return {
    size_inch: firstNum(sizeRaw),
    resolution: res ? `${res[1]} x ${res[2]}` : null,
    ppi: ppi ? Number(ppi[1]) : null,
    refresh_rate: refreshRateOf(panelRaw),
    panel,
    form,
    max_brightness_nits: brightnessNits(brightnessRaw),
    hdr_formats: null, // 官网参数页不提供
  };
}

function buildBattery(sections) {
  const cap = findVal(sections, "电池", "电池容量") ?? "";
  // 容量写法两代不同，统一取「典型值」那一行：
  //   新机型  "7025mAh/26.35Wh（典型值）"                                  → 7025
  //   老机型  "额定容量：2350mAh（等效于4700mAh）\n典型容量：2400mAh（等效于4800mAh）" → 4800
  //   折叠机  "2775+3225 mAh（典型值），等效 6000 mAh电池能量"               → 6000
  const typicalLine = cap.split("\n").find((l) => /典型/.test(l)) ?? cap;
  const eq = typicalLine.match(/等效[于]?\s*([\d.]+)\s*mAh/);
  const charge = findVal(sections, "电池", "快速充电") ?? "";
  return {
    capacity_mah: eq ? Number(eq[1]) : firstNum(typicalLine),
    // 充电功率：新机型写 "最大支持：80W超级闪充"，2023-2024 老机型直接 "80W超级闪充。兼容67W…"
    charging_watt: firstNum((charge.match(/最大支持[:：]?\s*([\d.]+)\s*W/) || charge.match(/([\d.]+)\s*W/) || [])[0] ?? ""),
    wireless_charging_watt: firstNum((charge.match(/([\d.]+)\s*W\s*无线闪充/) || [])[0] ?? ""),
  };
}

/** 相机条目正则：兼容两代写法
 *   光圈符号  新机型 "f/1.6"；2023-2024 老机型 "ƒ/1.8"（U+0192）
 *   镜头描述  新机型 "5000万像素广角摄像头：f/1.6"
 *             老机型 "5000万像素1英寸大底广角：ƒ/1.8"（没有「摄像头」二字）
 *   分隔符    "摄像头：f/2.4" 与 "摄像头，f/2.4" 都存在
 */
export const CAM_RE = /([\d.]+)\s*(亿|万)?像素([^：，,\n]{0,20})[:：,，]\s*[fƒ]\/([\d.]+)/g;

/** 像素数换算成年 MP（与项目既有 71 台一致）：
 *   "5000万像素" → 50   "1300万像素" → 13   "2亿像素" → 200   "5000像素"（无单位）→ 5000 */
export function toMegapixels(num, unit) {
  return Number(num) * (unit === "亿" ? 100 : unit === "万" ? 0.01 : 1);
}

/** 镜头归类：官网对同一类镜头有很多营销叫法，按「关键词优先、焦距兜底」归一到
 *  数据集既有取值（主摄 / 超广角 / 长焦 / 微距 / 景深 / 色彩还原 / 前置）。
 *  顺序不能乱：超广角必须先判（否则被「广角」吃掉）；长焦先于微距
 *  （「特写潜望长焦」同时含 特写 与 长焦，实为长焦）。
 *  实测 38 台 OPPO 的 desc 全集见 recon/camera-dump.mjs。
 */
export function classifyLens(desc, { isFront = false, focalMm = null } = {}) {
  const d = desc || "";
  if (isFront) return "前置";
  if (/超广角/.test(d)) return "超广角";
  if (/原彩|色彩还原|丹霞/.test(d)) return "色彩还原"; // X8 Ultra「丹霞原彩镜头」
  if (/潜望|长焦|望远/.test(d)) return "长焦";
  if (/微距/.test(d)) return "微距";
  if (/黑白|景深|虚化/.test(d)) return "景深"; // A/K 系列 200 万辅助镜头
  //「哈苏人像摄像头」是 73mm 潜望（X8 / X8 Pro），靠焦距区分人像长焦与人像主摄
  if (/人像/.test(d)) return focalMm !== null && focalMm >= 50 ? "长焦" : "主摄";
  if (/广角/.test(d)) return "主摄";
  if (focalMm !== null && focalMm >= 50) return "长焦";
  return "主摄";
}

function buildCameras(sections) {
  const cams = [];
  const parse = (text, isFront) => {
    if (!text) return;
    const ms = [...text.matchAll(CAM_RE)];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const chunk = text.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : undefined);
      const desc = m[3] || "";
      const focal = chunk.match(/等效焦距\s*([\d.]+)\s*毫米/);
      const focalMm = focal ? Number(focal[1]) : null;
      const type = classifyLens(desc, { isFront, focalMm });

      const stabilization = [];
      if (/OIS|光学防抖/.test(chunk)) stabilization.push("光学防抖");
      if (/EIS|电子防抖/.test(chunk)) stabilization.push("电子防抖");

      cams.push({
        type,
        sensor: null,
        resolution_mp: toMegapixels(m[1], m[2]),
        aperture: `f/${m[4]}`,
        focal_length_mm: focalMm,
        image_stabilization: stabilization.length ? stabilization : null,
      });
    }
  };
  parse(findVal(sections, "摄像头", "后置"), false);
  parse(findVal(sections, "摄像头", "前置"), true);
  // N6 前置按 主屏/副屏 写了两条完全相同的规格，去重
  const seen = new Set();
  return cams.filter((c) => {
    const k = `${c.type}|${c.resolution_mp}|${c.aperture}|${c.focal_length_mm}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildCellular(sections, id) {
  const sim = findVal(sections, "蜂窝网络", "SIM 卡类型");
  const bandsRaw = findVal(sections, "蜂窝网络", "网络频段") ?? "";
  const bands = bandsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\dG|^[2-5]G\s/.test(l));
  return {
    sim: sim ?? null,
    // 参数页多数机型不单列 eSIM，写了才取
    esim: findVal(sections, "蜂窝网络", "eSIM") ?? null,
    bands: bands.length ? bands : null,
    // 卫星通信：卫星通信版机型参数页会单列；N6 参数页没写，用商城在售版本的说明兜底
    satellite:
      findVal(sections, "蜂窝网络", "卫星") ??
      findVal(sections, "数据功能", "卫星") ??
      findVal(sections, "备注", "卫星") ??
      (id === "oppo-find-n6" ? "提供 16GB+1TB 卫星通信版" : null),
  };
}

/** 官网配色顺序：color-list-name 是一个 div，色名用 " | " 连接（第一个为默认色） */
function specsColorOrder(html) {
  const m = html.match(/color-list-name[^>]*>\s*<div>([^<]+)<\/div>/);
  if (!m) return [];
  return m[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- 主流程 ----------

export async function scrapeOppoSpecs({ ids, dryRun = false, withImages = true }) {
  const written = [];
  const specsHtml = new Map(); // id → 参数页 HTML，给 shop.mjs 的多色图兜底复用（不用二次抓取）
  for (const id of ids) {
    const meta = META[id];
    if (!meta) throw new Error(`未知 OPPO 机型：${id}（可选：${Object.keys(META).join(", ")}）`);

    const res = await fetch(SPECS_URLS[id], { headers: HEADERS });
    if (!res.ok) throw new Error(`${id}: specs 页 HTTP ${res.status}`);
    const html = await res.text();
    specsHtml.set(id, html);
    const sections = parseSections(html);

    // 配色：有商城源的机型以商城为准（色值准确、每个配色都保证有图）；
    // 无商城源的机型（商城已下架 / 官网没挂购买链接）退回参数页配色，hex 为 null、图片留空。
    const order = specsColorOrder(html).map(normColor).filter(Boolean);
    let colors;
    if (hasShopEntry(id)) {
      const shopColors = await fetchOppoColors(id);
      const rank = new Map(order.map((n, i) => [n, i])); // 官网展示顺序（第一个为默认色）
      colors = shopColors.colors
        .slice()
        .sort((a, b) => (rank.get(normColor(a.name)) ?? 999) - (rank.get(normColor(b.name)) ?? 999))
        .map((c, i) => ({ slug: c.slug, name: c.name, hex: c.hex, is_default: i === 0 }));
      const dropped = order.filter((n) => !shopColors.colors.some((c) => normColor(c.name) === n));
      if (dropped.length) console.log(`  ⚠ ${id}: 参数页配色「${dropped.join("、")}」在商城已不可购，未入库`);
    } else {
      colors = order.map((name, i) => {
        const slug = slugOf(id, name);
        if (!slug) throw new Error(`${id}: 参数页配色「${name}」没有 slug 映射，请在 colors.mjs 的 COLOR_SLUGS 里补`);
        return { slug, name, hex: null, is_default: i === 0 };
      });
      if (!colors.length) throw new Error(`${id}: 参数页没解析到配色，且该机型没有商城源`);
    }

    const display = buildDisplay(sections, null);
    // 折叠机：显示条目里带 主屏/副屏 前缀 → 主屏进 display，副屏进 display_secondary
    const isFoldable = (findVal(sections, "显示", "尺寸") ?? "").includes("主屏");
    const spec = {
      name: meta.name,
      brand: "OPPO",
      series: meta.series,
      release_year: Number(meta.release_date.slice(0, 4)),
      chipset: buildChipset(sections),
      body: buildBody(sections),
      display: isFoldable ? buildDisplay(sections, "主屏") : display,
      display_secondary: isFoldable ? buildDisplay(sections, "副屏") : null,
      battery: buildBattery(sections),
      camera: buildCameras(sections),
      os: findVal(sections, "操作系统", ""),
      biometric: {
        fingerprint: findVal(sections, "生物识别", "指纹"),
        face_unlock: findVal(sections, "生物识别", "面部识别"),
      },
      cellular: buildCellular(sections, id),
      nfc: findVal(sections, "数据功能", "NFC"),
      colors,
      release_date: meta.release_date,
    };

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

  if (withImages) {
    console.log("\n=== 商城分色图（无商城源的机型退回参数页多色图） ===");
    await scrapeOppoShop({ ids, dryRun, specsHtml });
  }

  return { written };
}
