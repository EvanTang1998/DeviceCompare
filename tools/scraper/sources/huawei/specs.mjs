// 华为参数源：consumer.huawei.com 中国官网 specs 页（纯 SSR HTML，无需浏览器）
//
// 页面结构（实测 2026-09，Mate 80 系列 5 台结构一致）：
// - 参数在 <li class="large-accordion__item"> 手风琴分组里：
//     <span class="large-accordion__title large-accordion-title">分组名</span>
//     <div class="large-accordion__content">
//       <div class="large-accordion__inner">
//         <div class="large-accordion-subtitle">条目名</div>   ← 可选（整组无条目名时直接是 <p>）
//         <p>值</p>
//         <p class="large-accordion-subtext">*脚注</p>          ← 排除
//       </div>
// - 配色与分色图在同一页顶部：color-text 给「色名，色名，…」，
//   配色 <ul> 里每色一张透明 PNG（.../specs/<file>.png，alt=中文色名），第一张为默认色
// - 官网**不给**：网络频段、峰值亮度、HDR 格式、屏幕形态（直/曲）、PPI（由分辨率+尺寸计算）
// - 麒麟芯片按内存版本区分的（80 Pro：12GB→9030 / 16GB→9030 Pro）原样并入 chip 字段
// - Mate 70 系列（除 Air）**连「处理器」分组都没有** —— 官网对 60/70 两代口径就是不公布 SoC，
//   所以 chip 留 null 是合法态（见 validate），ssr-check 有对应白名单
// - Mate 60 系列官网参数页已下架（301 → /cn/phones/），走 legacy.mjs 的官方存档数据
//
// vmall 商城链接（用户给的参考）对本任务无用：参数页已含分色图，且 vmall 有 WAF 反爬
// （www ↔ item 302 乒乓，见 recon/vmall-probe.mjs）。

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { slugOf } from "./colors.mjs";
import { LEGACY, toSectionMap } from "./legacy.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BASE = "https://consumer.huawei.com";

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/scraper/sources/huawei
const PROJECT_ROOT = resolve(HERE, "../../../..");
const DEVICES_DIR = resolve(PROJECT_ROOT, "src/data/devices");
const IMAGES_DIR = resolve(PROJECT_ROOT, "src/data/images");

export const SPECS_URLS = {
  "huawei-mate80": `${BASE}/cn/phones/mate80/specs/`,
  "huawei-mate80-pro": `${BASE}/cn/phones/mate80-pro/specs/`,
  "huawei-mate80-pro-max": `${BASE}/cn/phones/mate80-pro-max/specs/`,
  "huawei-mate80-pro-max-fengchiban": `${BASE}/cn/phones/mate80-pro-max-fengchiban/specs/`,
  "huawei-mate80-rs": `${BASE}/cn/phones/mate80-rs-ultimate-design/specs/`,
  "huawei-mate70": `${BASE}/cn/phones/mate70/specs/`,
  "huawei-mate70-pro": `${BASE}/cn/phones/mate70-pro/specs/`,
  "huawei-mate70-pro-plus": `${BASE}/cn/phones/mate70-pro-plus/specs/`,
  "huawei-mate70-pro-youxiangban": `${BASE}/cn/phones/mate70-pro-youxiangban/specs/`,
  "huawei-mate70-air": `${BASE}/cn/phones/mate70-air/specs/`,
  "huawei-mate70-rs": `${BASE}/cn/phones/mate70-rs-ultimate-design/specs/`,
  "huawei-pura90": `${BASE}/cn/phones/pura90/specs/`,
  "huawei-pura90-pro": `${BASE}/cn/phones/pura90-pro/specs/`,
  "huawei-pura90-pro-max": `${BASE}/cn/phones/pura90-pro-max/specs/`,
  "huawei-pura80": `${BASE}/cn/phones/pura80/specs/`,
  "huawei-pura80-pro": `${BASE}/cn/phones/pura80-pro/specs/`,
  "huawei-pura80-pro-plus": `${BASE}/cn/phones/pura80-pro-plus/specs/`,
  "huawei-pura80-ultra": `${BASE}/cn/phones/pura80-ultra/specs/`,
  "huawei-pura-x-view": `${BASE}/cn/phones/pura-x-view/specs/`,
};

// series 用**产品线**（Mate 系列 / Pura 系列），不用代际（Mate 80 系列）——
// 弹框里同一产品线的历代机型归一组，代际靠 release_date 排序区分。
//
// release_date：官网参数页没有日期，取自发布会公开信息（2026-09 检索核实）
//   Mate 80 系列 2025-11-25 发布、11-28 开售；风驰版 2026-03-23 发布、03-27 开售
//   Mate 70 / Pro / Pro+ / RS 2024-11-26 发布、12-04 开售；优享版 2025-02 上市；Mate 70 Air 2025-11-06 发布
//   Mate 60 系列 2023-08-29 突然开售（见 legacy.mjs）
//   Pura 90 / 90 Pro / 90 Pro Max 2026-04-20 发布、04-29 开售（标准版 05-09 首销）
//   Pura 80 / 80 Pro / 80 Pro+ / 80 Ultra 2025-06-11 发布、06-20 开售
const META = {
  "huawei-mate80": { name: "HUAWEI Mate 80", series: "Mate 系列", release_date: "2025-11" },
  "huawei-mate80-pro": { name: "HUAWEI Mate 80 Pro", series: "Mate 系列", release_date: "2025-11" },
  "huawei-mate80-pro-max": { name: "HUAWEI Mate 80 Pro Max", series: "Mate 系列", release_date: "2025-11" },
  "huawei-mate80-pro-max-fengchiban": {
    name: "HUAWEI Mate 80 Pro Max 风驰版",
    series: "Mate 系列",
    release_date: "2026-03",
  },
  "huawei-mate80-rs": { name: "HUAWEI Mate 80 RS 非凡大师", series: "Mate 系列", release_date: "2025-11" },
  "huawei-mate70": { name: "HUAWEI Mate 70", series: "Mate 系列", release_date: "2024-11" },
  "huawei-mate70-pro": { name: "HUAWEI Mate 70 Pro", series: "Mate 系列", release_date: "2024-11" },
  "huawei-mate70-pro-plus": { name: "HUAWEI Mate 70 Pro+", series: "Mate 系列", release_date: "2024-11" },
  "huawei-mate70-pro-youxiangban": {
    name: "HUAWEI Mate 70 Pro 优享版",
    series: "Mate 系列",
    release_date: "2025-02",
  },
  "huawei-mate70-air": { name: "HUAWEI Mate 70 Air", series: "Mate 系列", release_date: "2025-11" },
  "huawei-mate70-rs": { name: "HUAWEI Mate 70 RS 非凡大师", series: "Mate 系列", release_date: "2024-11" },
  "huawei-pura90": { name: "HUAWEI Pura 90", series: "Pura 系列", release_date: "2026-04" },
  "huawei-pura90-pro": { name: "HUAWEI Pura 90 Pro", series: "Pura 系列", release_date: "2026-04" },
  "huawei-pura90-pro-max": { name: "HUAWEI Pura 90 Pro Max", series: "Pura 系列", release_date: "2026-04" },
  "huawei-pura80": { name: "HUAWEI Pura 80", series: "Pura 系列", release_date: "2025-06" },
  "huawei-pura80-pro": { name: "HUAWEI Pura 80 Pro", series: "Pura 系列", release_date: "2025-06" },
  "huawei-pura80-pro-plus": { name: "HUAWEI Pura 80 Pro+", series: "Pura 系列", release_date: "2025-06" },
  "huawei-pura80-ultra": { name: "HUAWEI Pura 80 Ultra", series: "Pura 系列", release_date: "2025-06" },
  "huawei-pura-x-view": { name: "HUAWEI Pura X View", series: "Pura 系列", release_date: "2026-09" },
};

const ID_BY_SLUG = Object.fromEntries(
  Object.entries(SPECS_URLS).map(([id, url]) => [url.match(/\/phones\/([^/]+)\/specs\//)[1], id])
);

// Mate 60 系列官网参数页已下架 → 走 legacy.mjs 的官方存档数据（同一套 builders，产物形状一致）
const LEGACY_META = Object.fromEntries(Object.entries(LEGACY).map(([id, e]) => [id, e.meta]));
const ALL_META = { ...META, ...LEGACY_META };

export async function scrapeHuaweiSpecs({ ids, dryRun = false }) {
  const jobs = [];
  for (const id of ids) {
    const meta = ALL_META[id];
    if (!meta) throw new Error(`未知华为机型：${id}（可选：${Object.keys(ALL_META).join(", ")}）`);
    console.log(`\n──── 华为 ${id} ────`);

    const entry = LEGACY[id];
    if (entry) {
      // 官网参数页已下架：参数用官方存档转录，图用官方 CDN 现存直链
      console.log(`  官网参数页已下架 → 走 legacy（官方存档转录）`);
      console.log(`  存档：${entry.archive}`);
      if (entry.note) console.log(`  ℹ ${entry.note}`);
      const device = buildLegacyDevice(id, entry);
      console.log(`  ${meta.name}：${device.colors.length} 个配色（图走官网 CDN）`);
      jobs.push({ id, device });
      continue;
    }

    const html = await fetchHtml(SPECS_URLS[id]);
    const sections = parseSections(html);
    const imgUrlByColor = parseColors(html);
    // 这里报的是 parseColors 的条数，含页面里那张「机型示意图」（alt 是机型名，不是配色）→ 会多 1
    console.log(`  ${meta.name}：${sections.size} 组参数，页面配色图 ${imgUrlByColor.size} 张（含机型示意图）`);

    const device = buildDevice(id, meta, sections, html, imgUrlByColor);
    jobs.push({ id, device });
  }

  // 下载分色图 → 归一化（Python/Pillow，顺带从背板取色值）
  const workDir = resolve(tmpdir(), `huawei-specs-${Date.now()}`);
  const downloads = [];
  for (const { id, device } of jobs) {
    const dir = join(workDir, id);
    mkdirSync(dir, { recursive: true });
    for (const color of device.colors) {
      const url = color._imgUrl;
      if (!url) throw new Error(`${id}: 配色「${color.name}」在页面配色选择器里没有对应图片`);
      delete color._imgUrl;
      downloads.push({
        color,
        rawImg: join(dir, `${id}.${color.slug}.raw.png`),
        url,
        outBase: id,
      });
    }
  }
  for (const d of downloads) {
    await download(d.url, d.rawImg);
    d.color._rawPath = d.rawImg;
  }

  const outDirForImages = dryRun ? join(workDir, "images") : IMAGES_DIR;
  if (dryRun) mkdirSync(outDirForImages, { recursive: true });
  const hexMap = await runNormalizer(downloads, outDirForImages);
  for (const { color } of downloads) {
    color.hex = hexMap[color._rawPath] ?? color.hex;
    delete color._rawPath;
  }

  const jsonDir = dryRun ? resolve(tmpdir(), "huawei-specs-json") : DEVICES_DIR;
  if (dryRun) mkdirSync(jsonDir, { recursive: true });
  const written = [];
  for (const { id, device } of jobs) {
    const jsonPath = join(jsonDir, `${id}.json`);
    writeFileSync(jsonPath, JSON.stringify(device, null, 2) + "\n");
    written.push(jsonPath);
    console.log(`  ✓ ${dryRun ? "[dry-run] " : ""}${jsonPath}`);
    console.log(`    ${device.name}：${device.colors.map((c) => c.name).join(" / ")}`);
  }
  return { written };
}

// ---------- 图片归一化（Python/Pillow） ----------

function pythonBin() {
  const candidates = [
    process.env.PYTHON,
    process.env.HOME + "/.workbuddy/binaries/python/envs/default/bin/python3",
    "python3",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      execFileSync(c, ["-c", "import PIL"], { stdio: "ignore" });
      return c;
    } catch { /* 下一个 */ }
  }
  throw new Error("找不到带 Pillow 的 python3（先 pip install pillow）");
}

async function runNormalizer(downloads, outDir) {
  const script = join(HERE, "normalize.py");
  const payload = downloads.map((d) => ({
    raw: d.rawImg,
    out: join(outDir, `${d.outBase}.${d.color.slug}.jpg`),
    hex: d.color.hex,
  }));
  const stdout = execFileSync(pythonBin(), [script, JSON.stringify(payload)], {
    encoding: "utf8",
    maxBuffer: 10 << 20,
  });
  const report = JSON.parse(stdout.trim().split("\n").pop());
  const hexMap = {};
  for (const [rawPath, info] of Object.entries(report)) {
    hexMap[rawPath] = info.hex;
    const d = downloads.find((x) => x.rawImg === rawPath);
    if (d) d._outPath = info.out;
  }
  for (const d of downloads) {
    if (!d._outPath || !existsSync(d._outPath)) throw new Error(`图片归一化失败：${d.rawImg}`);
  }
  return hexMap;
}

// ---------- 页面解析 ----------

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

async function download(url, to) {
  const full = url.startsWith("http") ? url : BASE + url;
  const res = await fetch(full, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`GET ${full} → ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

function clean(s) {
  return String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+$/, "")
    .trim();
}

/**
 * 手风琴参数 → Map<分组名, Array<{k: 条目名|null, v: string[]}>>
 * k 为 null 表示该组条目没有名字（如「处理器」直接一个 <p>麒麟9020</p>）。
 * large-accordion-subtext（*脚注）不收。
 */
export function parseSections(html) {
  const sections = new Map();
  for (const m of html.matchAll(/<li class="large-accordion__item">([\s\S]*?)<\/li>/g)) {
    const blob = m[1];
    const title = clean((blob.match(/large-accordion-title">([\s\S]*?)<\/span>/) || [])[1]);
    if (!title) continue;
    const rows = [];
    for (const inner of blob.matchAll(
      /<div class="large-accordion__inner[^"]*">([\s\S]*?)(?=<div class="large-accordion__inner|<!--Remarks|<div class="large-accordion-columns|$)/g
    )) {
      const sub = clean((inner[1].match(/large-accordion-subtitle">([\s\S]*?)<\/div>/) || [])[1]);
      const vals = [...inner[1].matchAll(/<p(?![^>]*large-accordion-subtext)[^>]*>([\s\S]*?)<\/p>/g)]
        .map((x) => clean(x[1]))
        .filter(Boolean);
      if (sub || vals.length) rows.push({ k: sub || null, v: vals });
    }
    sections.set(title, rows);
  }
  return sections;
}

/** 配色选择器：alt=中文色名、图在 /specs/ 目录下的 <img> → Map(色名 → 图片 URL) */
export function parseColors(html) {
  const map = new Map();
  for (const m of html.matchAll(/<img src="(\/content\/dam\/[^"]+\/specs\/[^"]+\.png)"\s+alt="([^"]+)"/g)) {
    const name = clean(m[2]);
    if (name && !map.has(name)) map.set(name, `${BASE}${m[1]}`);
  }
  return map;
}

// ---------- 取值辅助 ----------

/** 分组里按条目名取值（条目名允许「屏幕」前缀差异：屏幕尺寸/尺寸）；noKey 组直接取第一行 */
function rowOf(sections, group, keyRe) {
  const rows = sections.get(group) ?? [];
  if (!keyRe) return rows[0] ?? null;
  return rows.find((r) => r.k && keyRe.test(r.k)) ?? null;
}

const firstNum = (s) => {
  const m = String(s ?? "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
};

const capList = (s) => {
  const caps = String(s ?? "")
    .split(/[（(]/)[0]
    .split("/")
    .map((t) => t.replace(/\s+/g, "").replace(/RAM|ROM/gi, "").toUpperCase())
    .filter((t) => /^\d+(\.\d+)?(GB|TB)$/.test(t));
  const bytes = (c) => Number(c.replace(/[GT]B$/, "")) * (c.endsWith("TB") ? 1024 : 1);
  return [...new Set(caps)].sort((a, b) => bytes(a) - bytes(b));
};

const ppiOf = (w, h, inch) => (w && h && inch ? Math.round(Math.sqrt(w * w + h * h) / inch) : null);

// ---------- 构建 ----------

/**
 * legacy 机型（Mate 60 系列）：参数来自官方存档转录，图来自官方 CDN 直链。
 * 刻意复用 buildDevice —— 这样「焦段按镜头类型回填」「瓦数取脚注」等规则对 legacy 同样生效，
 * JSON 形状与 Mate 70/80 完全一致；sections 用 [条目名, 值数组] 的紧凑写法，这里转成 {k, v}。
 */
function buildLegacyDevice(id, entry) {
  const sections = toSectionMap(entry.sections);
  const html = `<div class="color-text">${entry.colors.map((c) => c.name).join("，")}</div>`;
  const imgUrlByColor = new Map(entry.colors.map((c) => [c.name, c.imgUrl]));
  const device = buildDevice(id, entry.meta, sections, html, imgUrlByColor);
  // 卫星通信：官网参数页当年就不列这一行，口径取自官网产品页（见 legacy.mjs 的核对记录）
  if (entry.satellite) device.cellular.satellite = entry.satellite;
  return device;
}

function buildDevice(id, meta, sections, html, imgUrlByColor) {
  const spec = {
    name: meta.name,
    brand: "华为",
    series: meta.series,
    release_year: Number(meta.release_date.slice(0, 4)),
    chipset: buildChipset(sections),
    body: buildBody(sections),
    display: buildDisplay(sections),
    display_secondary: null,
    battery: buildBattery(sections),
    camera: buildCameras(sections),
    os: (rowOf(sections, "操作系统")?.v ?? [])[0] ?? null,
    biometric: buildBiometric(sections),
    cellular: buildCellular(sections),
    nfc: (rowOf(sections, "NFC")?.v ?? []).join("\n") || null,
    colors: buildColors(id, html, imgUrlByColor),
    release_date: meta.release_date,
  };
  validate(spec, id);
  return spec;
}

function validate(spec, id) {
  const must = [
    [spec.chipset.ram.length, "运行内存"],
    [spec.chipset.rom.length, "机身存储"],
    [spec.body.dimensions_mm.height, "机身高度"],
    [spec.body.weight_g, "重量"],
    [spec.display.size_inch, "屏幕尺寸"],
    [spec.display.resolution, "分辨率"],
    [spec.battery.capacity_mah, "电池容量"],
    [spec.camera.length, "摄像头"],
    [spec.colors.length, "配色"],
  ];
  for (const [v, label] of must) {
    if (!v) throw new Error(`${id}: ${label}解析为空，页面结构可能变了，先跑 recon 检查`);
  }
  // 芯片**不**在上面：华为 Mate 60 / 70 系列官网就不公布 SoC（参数页连「处理器」分组都没有），
  // 留 null 是合法态（前端显示「—」，与网络频段同一口径），不当作解析失败。
  if (!spec.chipset.chip) console.log(`    ⚠ 官网未公布芯片（页面无「处理器」分组）→ chipset.chip 留 null`);
}

function buildChipset(sections) {
  // 芯片按内存版本区分时是多个 <p>（80 Pro：「麒麟9030 Pro（16 GB RAM 版本）」「麒麟9030（12 GB RAM 版本）」）；
  // Mate 70 Air 是一个 <p> 里两个型号换行（「麒麟 9020A」/「麒麟 9020B」）→ 换行归一成「 / 」，
  // 并去掉「麒麟 9020A」里那个空格，与「麒麟9030 Pro」保持同一写法（跨机型可比）。
  const chipVals = rowOf(sections, "处理器")?.v ?? [];
  const chip =
    chipVals
      .join(" / ")
      .replace(/\s*\n+\s*/g, " / ")
      .replace(/麒麟\s+(?=\d)/g, "麒麟")
      .trim() || null;
  const ram = capList((rowOf(sections, "存储", /运行内存/) ?? { v: [] }).v.join(" "));
  const rom = capList((rowOf(sections, "存储", /机身内存/) ?? { v: [] }).v.join(" "));
  return { chip, ram, rom };
}

function buildBody(sections) {
  // 尺寸与重量：两代写法都要吃 —— Mate 70/80 是一行三个 <p>（整行没有条目名），
  // Mate 60 存档页是「长度 / 宽度 / 厚度」三行；统一按出现顺序取前三个 mm 值
  const dimText = (sections.get("尺寸与重量") ?? [])
    .filter((r) => !r.k || /长度|宽度|厚度/.test(r.k))
    .map((r) => r.v.join(" "))
    .join(" ");
  const nums = (dimText.match(/([\d.]+)\s*mm/g) ?? []).map((s) => Number(s.match(/[\d.]+/)[0]));
  // 重量单位两代写法不同：Mate 60/70/80 写「约 211 g（含电池）」，Pura 80 系列写「约 211 克（含电池）」
  const weight = (rowOf(sections, "尺寸与重量", /重量/) ?? { v: [] }).v.join(" ").match(/([\d.]+)\s*(?:g\b|克)/);
  // RS 独有的「中框」分组（高亮钛）
  const frame = (rowOf(sections, "中框")?.v ?? [])[0] ?? null;
  const ip = (rowOf(sections, "防尘抗水")?.v ?? [])[0] ?? null;
  const ipGrade = ip ? (ip.match(/IP\d+/g) ?? []).join("/") : null;
  return {
    dimensions_mm: { height: nums[0] ?? null, width: nums[1] ?? null, depth: nums[2] ?? null },
    weight_g: weight ? Number(weight[1]) : null,
    frame_material: frame,
    back_material: null,
    front_material: null,
    water_resistance: ipGrade,
  };
}

function buildDisplay(sections) {
  const size = firstNum((rowOf(sections, "屏幕", /尺寸/) ?? { v: [] }).v.join(" "));
  const resRaw = (rowOf(sections, "屏幕", /分辨率/) ?? { v: [] }).v.join(" ");
  const resM = resRaw.match(/(\d{3,5})\s*[×xX]\s*(\d{3,5})/);
  // 长边在前（与全站口径一致；华为给的本来就是 2848 × 1320）
  const [a, b] = resM ? [Number(resM[1]), Number(resM[2])] : [0, 0];
  const resolution = resM ? `${Math.max(a, b)} x ${Math.min(a, b)}` : null;
  const type = (rowOf(sections, "屏幕", /类型/) ?? { v: [] }).v.join(" ");
  const refresh = (type.match(/([\d]+\s*-\s*\d+)\s*Hz|(\d+)\s*Hz(?:\s*LTPO)?\s*自适应刷新率/) || [])[1];
  const panel = /OLED/i.test(type) ? "OLED" : null;
  return {
    size_inch: size,
    resolution,
    ppi: ppiOf(Math.max(a, b), Math.min(a, b), size),
    refresh_rate: refresh ? `${refresh.replace(/\s+/g, "")}Hz` : null,
    panel,
    form: null, // 官网页面不写直屏/曲面
    max_brightness_nits: null, // 官网页面不写
    hdr_formats: null, // 官网页面不写
  };
}

function buildBattery(sections) {
  const cap = firstNum((rowOf(sections, "电池")?.v ?? []).join(" ").match(/([\d.]+)\s*mAh/i)?.[0]);
  const charge = sections.get("充电") ?? [];
  // 充电这一组的写法有两代：
  //   80/70 Pro 系：条目名是「有线充电：」「无线充电：」，瓦数在值里或**脚注**里（脚注是 k=null 的那一行）
  //   Mate 70 Air ：「有线充电：…」整句写在值里（没有条目名），且它本来就不支持无线充电
  const wiredRow = charge.find((r) => /有线/.test(r.k ?? ""));
  const wirelessRow = charge.find((r) => /无线/.test(r.k ?? ""));
  const allText = charge.map((r) => r.v.join(" ")).join(" ");
  const numIn = (text, re) => firstNum((text.match(re) || [])[0]);

  // 有线：先看「有线充电」行，没有瓦数就退回脚注（「最大支持 66 W 华为有线超级快充」）
  const wired =
    numIn(wiredRow ? wiredRow.v.join(" ") : "", /超级快充\s*([\d.]+)\s*W/) ??
    (wiredRow ? null : numIn(allText, /超级快充\s*([\d.]+)\s*W/)) ??
    numIn(allText, /最大支持\s*([\d.]+)\s*W\s*华为有线超级快充/);
  // 无线：只认「N W 华为无线超级快充」，否则会被「20 W 无线反向充电」抢走
  const wireless =
    numIn(wirelessRow ? wirelessRow.v.join(" ") : "", /([\d.]+)\s*W\s*华为无线超级快充/) ??
    (wirelessRow ? null : numIn(allText, /([\d.]+)\s*W\s*华为无线超级快充/));
  return { capacity_mah: cap, charging_watt: wired, wireless_charging_watt: wireless };
}

/** 镜头像素数 → 单位 MP。「5000 万像素」→ 50、「2 亿像素」→ 200、
 *  没有像素值的（「第二代红枫原色摄像头」「150 万多光谱通道红枫原色摄像头」）→ null */
function megapixels(seg) {
  const wan = seg.match(/([\d.]+)\s*万像素/);
  if (wan) return Number(wan[1]) / 100;
  const yi = seg.match(/([\d.]+)\s*亿/);
  if (yi) return Number(yi[1]) * 100;
  return null;
}

function buildCameras(sections) {
  const focal = (rowOf(sections, "后置摄像头", /变焦/) ?? { v: [] })
    .v.join(" ")
    .match(/镜头焦段分别为\s*([^）]+)/)?.[1]
    ?.split(/[，,]/)
    .map((t) => firstNum(t))
    .filter((n) => n != null) ?? [];

  const parseLens = (seg, type) => {
    const apM = seg.match(/F([\d.]+)(?:-F?([\d.]+))?\s*光圈/);
    return {
      type,
      sensor: null,
      resolution_mp: megapixels(seg),
      // F1.4-F4.0 → f/1.4-4.0（与全站 f/2.39-2.96 的写法一致）
      aperture: apM ? `f/${apM[1]}${apM[2] ? `-${apM[2]}` : ""}` : null,
      focal_length_mm: null, // 由调用方按焦段顺序回填
      image_stabilization: /OIS/i.test(seg) ? ["光学防抖"] : null,
    };
  };

  const rear = [];
  for (const seg of (rowOf(sections, "后置摄像头", /后置摄像头/) ?? { v: [] }).v) {
    if (megapixels(seg) == null) continue; // 「第二代红枫原色摄像头」无像素值，不入库
    const type = /超广角/.test(seg) ? "超广角" : /长焦/.test(seg) ? "长焦" : "主摄";
    rear.push(parseLens(seg, type));
  }
  // 焦段按**镜头类型**回填，不按出现顺序 —— 官方那句「镜头焦段分别为 …」的顺序与镜头排列顺序
  // 并不总是一致：Mate 80 是 24/13/90.5（恰等于页面顺序），Mate 70 Air 是 16/24/69 而页面顺序是
  // 主摄/长焦/超广角。规则：超广角拿最小焦段、主摄拿最接近 24 mm 的、长焦按页面顺序分剩下的。
  const pool = [...focal].sort((a, b) => a - b);
  const take = (v) => {
    const i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
    return v;
  };
  const wide = pool.length ? take(pool[0]) : null;
  const main = pool.length
    ? take(pool.reduce((best, v) => (Math.abs(v - 24) < Math.abs(best - 24) ? v : best), pool[0]))
    : null;
  const tele = [...pool]; // 余下的按升序给各长焦（Mate 80 Pro Max 双长焦 90.5 / 140）
  rear.forEach((cam) => {
    if (cam.type === "超广角") cam.focal_length_mm = wide;
    else if (cam.type === "主摄") cam.focal_length_mm = main;
    else cam.focal_length_mm = tele.shift() ?? null;
  });

  const frontSeg = ((rowOf(sections, "前置摄像头", /前置摄像头/) ?? { v: [] }).v ?? []).find(
    (s) => megapixels(s) != null
  );
  const front = frontSeg ? parseLens(frontSeg, "前置") : null;
  return front ? [...rear, front] : rear;
}

function buildBiometric(sections) {
  const sensors = (rowOf(sections, "感应器")?.v ?? []).join(" ");
  // 「屏下指纹」（70/80 系）与「屏内指纹」（60 系）是同一件事，统一成屏下指纹，跨机型可比
  const fingerprint = /侧边指纹|屏下指纹|屏内指纹|屏幕指纹/.test(sensors)
    ? /屏下|屏内|屏幕/.test(sensors)
      ? "屏下指纹"
      : "侧边指纹"
    : null;
  const face = /人脸|面部/.test(sensors) ? "支持" : null;
  return { fingerprint, face_unlock: face };
}

function buildCellular(sections) {
  const simRow = rowOf(sections, "SIM 卡类型");
  const simCount = (simRow?.v ?? []).length;
  const sim = simCount >= 2 ? "双 Nano-SIM 卡" : simCount === 1 ? "单 Nano-SIM 卡" : null;
  const esimText = (rowOf(sections, "eSIM")?.v ?? [])[0] ?? "";
  // 注意先判「不支持」——「不支持」本身包含「支持」
  const esim = /不支持/.test(esimText) ? false : /支持/.test(esimText) ? true : null;
  const satellite = (rowOf(sections, "数据连接", /卫星/) ?? { v: [] }).v.join(" ") || null;
  // 华为官网不公布网络频段 → null（前端显示「—」，README 有说明）
  return { sim, esim, bands: null, satellite };
}

function buildColors(id, html, imgUrlByColor) {
  // 色名以页面 color-text 为准（顺序即官网展示顺序、第一个为默认色），
  // 分色图 URL 用色名回查 parseColors 的 Map（不按序号配对，防止两处顺序不一致）
  const textOrder = (clean((html.match(/<div class="color-text">([^<]*)<\/div>/) || [])[1]) || "")
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const used = new Set();
  const colors = textOrder.map((name, i) => {
    const slug = slugOf(name);
    if (!slug) throw new Error(`${id}: 配色「${name}」没有 slug 映射，请在 colors.mjs 的 COLOR_SLUGS 里补`);
    if (used.has(slug)) throw new Error(`${id}: 配色 slug 重复：${slug}`);
    used.add(slug);
    const imgUrl = imgUrlByColor.get(name) ?? null;
    if (!imgUrl) throw new Error(`${id}: 配色「${name}」在页面配色选择器里没有对应图片`);
    return { slug, name, hex: null, is_default: i === 0, _imgUrl: imgUrl };
  });
  if (!colors.length) throw new Error(`${id}: 页面没解析到配色`);
  return colors;
}
