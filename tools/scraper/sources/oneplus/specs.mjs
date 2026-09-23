// 一加官网 specs 页适配器
//
// 数据源：https://www.oneplus.com/cn/<slug>/specs（也接受完整 URL，见 resolveTarget）
// 两种页面模板：
//   A) 新模板：HTML 内嵌 window.pageDsl JSON（CmpParameterCn 组件）
//      - 15 / 15T / Ace 6 系列 / Turbo 系列：每个属性独立条目（propertyname / propertyvalue）
//      - 13T：部分条目 propertyname 为 null，值是「键：值」内联文本
//   B) 旧模板（13 / Ace 5）：无 pageDsl，但规格正文**已经 SSR 在 HTML 里**，
//      直接解析 .spec-content 分区即可，不需要开浏览器
//
// 产出：
//   - src/data/devices/oneplus-<slug>.json     参数（对齐现有 schema）
//   - src/data/images/oneplus-<slug>.<色>.jpg  产品图（统一 612×760 白底画布）
//
// 图片归一化与取色由同目录的 normalize.py（Pillow）完成。

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { launchBrowser, newPage } from "../../lib/browser.mjs"; // 仅模板 B 的兜底渲染用

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";
const BASE = "https://www.oneplus.com";

/**
 * 把 --models 的一项解析成 { slug, url }。
 *   - 裸 slug（15 / ace-6t / turbo-6x-pro）→ https://www.oneplus.com/cn/<slug>/specs
 *   - 完整 URL → 原样使用
 *
 * 之所以要支持完整 URL：官网并非所有规格页都遵循 /cn/<slug>/specs 的写法，
 * 例如 Ace 5 至尊版的规格页就是 /cn/ace-5-ultra-specs（没有 /specs 段），
 * 按裸 slug 去拼会拼成 /cn/ace-5-ultra-specs/specs 从而抓空。
 *
 * slug 是**输出 id**（决定 JSON 与图片文件名、CURATED 的键）：
 * 去掉 /cn/ 前缀、去掉结尾的 /specs 或 -specs，让各种写法收敛到同一个 id。
 */
function resolveTarget(target) {
  const t = String(target).trim();
  if (/^https?:\/\//i.test(t)) {
    const path = new URL(t).pathname.replace(/\/+$/, "");
    const slug = path
      .replace(/^\/[a-z]{2}\//i, "") // /cn/
      .replace(/\/specs$/i, "")
      .replace(/-specs$/i, "");
    if (!slug) throw new Error(`无法从 URL 解析出机型 id：${t}`);
    return { slug, url: t };
  }
  return { slug: t, url: `${BASE}/cn/${t}/specs` };
}

// 官网 specs 页不含发布时间与 HDR 认证，这两类是人工核对的官方公开信息
// （发布会/官方商城页），与抓取数据分开维护。 isNew 由 src/data.js 按 3 个月窗口动态判定。
// release_date 是必填项：脚本用它推 release_year，缺了会直接抛错。
const CURATED = {
  "15":  { release_date: "2025-10", hdr_formats: ["HDR10+", "杜比视界"] },
  "15t": { release_date: "2026-03", hdr_formats: ["HDR10+", "杜比视界"] },
  // 13 的 specs 页没有防水字段，IP68/IP69 来自官方商城页
  "13":  { release_date: "2024-10", hdr_formats: ["HDR10+", "杜比视界", "HDR Vivid"], water_resistance: "IP68/IP69" },
  "13t": { release_date: "2025-04", hdr_formats: ["HDR10+", "杜比视界"] },

  // —— Ace 系列 ——
  // 注意 Ace 5 至尊版的规格页路径是 /cn/ace-5-ultra-specs（无 /specs 段），
  // 调用时要直接给完整 URL 或让 resolveTarget 处理
  "ace-6":       { release_date: "2025-10", hdr_formats: ["HDR10+", "杜比视界", "HDR Vivid"] },
  "ace-6-ultra": { release_date: "2026-04", hdr_formats: ["HDR10+"] },
  "ace-6t":      { release_date: "2025-12", hdr_formats: ["HDR10+"] },
  "ace-5-ultra": { release_date: "2025-05", hdr_formats: ["HDR10+"] },
  // Ace 5 的 specs 页没有防水字段（只有一个「防尘防水」分区），IP65 来自官方商城页
  "ace-5":       { release_date: "2024-12", water_resistance: "IP65" },

  // —— Turbo 系列 ——
  // 6X / 6X Pro 同为 2026-06-10 发布、06-15 开售
  "turbo-6x-pro": { release_date: "2026-06" },
  "turbo-6x":     { release_date: "2026-06" },
  "turbo-6v":     { release_date: "2026-01" },
};

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/scraper/sources/oneplus
const PROJECT_ROOT = resolve(HERE, "../../../.."); // 项目根
const DEVICES_DIR = resolve(PROJECT_ROOT, "src/data/devices");
const IMAGES_DIR = resolve(PROJECT_ROOT, "src/data/images");

export async function scrapeOnePlusSpecs({ slugs, dryRun = false }) {
  const jobs = [];
  for (const target of slugs) {
    const { slug, url } = resolveTarget(target);
    console.log(`\n──── 一加 ${slug} ────`);
    const html = await fetchSpecHtml(url);
    let raw;
    if (html.includes("window.pageDsl=")) {
      raw = parsePageDsl(html);
      console.log(`  模板 A（pageDsl）：${raw.entries.length} 条参数，${raw.images.length} 张产品图`);
    } else {
      raw = parseLegacyHtml(html) ?? (await renderLegacy(url));
      console.log(`  模板 B（旧模板，静态 HTML）：${raw.entries.length} 条参数，${raw.images.length} 张产品图`);
    }
    const device = buildDevice(slug, raw);
    jobs.push({ slug, device, raw });
  }

  // 下载图片 → 归一化 + 取色（Python/Pillow）→ 回填 hex
  const workDir = resolve(tmpdir(), `oneplus-specs-${Date.now()}`);
  const downloads = [];
  for (const { slug, device, raw } of jobs) {
    const dir = join(workDir, slug);
    mkdirSync(dir, { recursive: true });
    for (const c of device.colors) {
      const rawImg = join(dir, `${slug}.${c.slug}.raw.png`);
      await download(c._imageUrl, rawImg);
      c._rawPath = rawImg;
      if (c._swatchUrl) {
        const sw = join(dir, `${slug}.${c.slug}.swatch.jpg`);
        await download(c._swatchUrl, sw);
        c._swatchPath = sw;
      }
      downloads.push(c);
    }
  }

  // dry-run 时归一化产物也只落暂存目录
  const outDirForImages = dryRun ? join(workDir, "images") : IMAGES_DIR;
  if (dryRun) mkdirSync(outDirForImages, { recursive: true });
  const hexMap = await runNormalizer(downloads, outDirForImages);
  for (const c of downloads) {
    c.hex = hexMap[c._rawPath] ?? null;
    delete c._imageUrl; delete c._swatchUrl; delete c._rawPath; delete c._swatchPath;
    delete c._idSlug; delete c._outPath;
  }

  // 写入（dry-run 时 JSON 落暂存目录，方便检查）
  const jsonDir = dryRun ? resolve(tmpdir(), "oneplus-specs-json") : DEVICES_DIR;
  if (dryRun) mkdirSync(jsonDir, { recursive: true });
  const written = [];
  for (const { slug, device } of jobs) {
    const jsonPath = join(jsonDir, `oneplus-${slug}.json`);
    writeFileSync(jsonPath, JSON.stringify(device, null, 2) + "\n");
    written.push(jsonPath);
    console.log(`  ✓ ${dryRun ? "[dry-run] " : ""}${jsonPath}`);
    console.log(`    ${device.name}：${device.colors.map((c) => c.name).join(" / ")}`);
  }
  return { written };
}

// ---------- 抓取 ----------

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

/**
 * 取规格页 HTML。官网的 URL 有两种写法容易踩坑：
 *   - 把产品页当规格页：/cn/ace-6-ultra 也有 pageDsl，但没有参数组件（规格页在 /cn/ace-6-ultra/specs）
 *   - 规格页不带 /specs：/cn/ace-5-ultra-specs（这种再补 /specs 反而是错的）
 * 所以只在「拿到的页面里没有参数组件、且 URL 本身不以 /specs 结尾」时，补一段 /specs 重试一次。
 */
async function fetchSpecHtml(url) {
  const html = await fetchHtml(url);
  if (html.includes("parameterCn") || /\/specs\/?$/i.test(url)) return html;
  const alt = `${url.replace(/\/+$/, "")}/specs`;
  console.log(`  该 URL 不是规格页，改用 ${alt}`);
  return fetchHtml(alt);
}

async function download(url, to) {
  const full = url.startsWith("http") ? url : BASE + url;
  const res = await fetch(full, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`GET ${full} → ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

// ---------- 模板 A：解析 window.pageDsl → 扁平 { key: value } ----------

export function parsePageDsl(html) {
  const i = html.indexOf("window.pageDsl=");
  let dsl;
  try {
    dsl = JSON.parse(html.slice(i + "window.pageDsl=".length).split("</script>")[0]);
  } catch {
    // JSON 内含未转义内容时退回流式解析
    dsl = streamingJson(html.slice(i + "window.pageDsl=".length));
  }
  let pc = null;
  for (const comp of Object.values(dsl.byId ?? {})) {
    if (comp && typeof comp === "object" && comp.attr?.parameterCn) {
      pc = comp.attr.parameterCn;
      if ((pc.parameterList ?? []).length > 2) break; // 取参数最全的那个组件
    }
  }
  if (!pc) throw new Error("pageDsl 里没找到 parameterCn");

  const entries = [];
  const images = [];
  const swatches = [];
  for (const blk of pc.parameterList ?? []) {
    for (const item of blk.list ?? []) {
      if (!item || typeof item !== "object") continue;
      const value = clean(item.propertyvalue ?? "");
      if (!item.propertyname) {
        // 「键：值」内联文本 → 拆成多条；一行都拆不出（如防水整句）→ 用块标题兜底
        const kvLines = value.split("\n").map((line) => line.match(/^([^：:]{1,14})[：:]\s*(.+)$/));
        const matched = kvLines.filter(Boolean);
        if (matched.length) {
          for (const m of matched) entries.push({ key: m[1].trim(), value: m[2].trim() });
        } else if (blk.title && value) {
          entries.push({ key: blk.title, value });
        }
      } else {
        const key = item.propertyname.trim();
        if (key === "产品图片") images.push(...value.split("\n").filter(Boolean));
        else if (key === "色卡") swatches.push(...value.split("\n").filter(Boolean));
        else entries.push({ key, value });
      }
    }
  }
  return { entries, images, swatches };
}

function streamingJson(text) {
  return JSON.parse(text.slice(0, balancedBraces(text)));
}
function balancedBraces(s) {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("JSON 未闭合");
}

// ---------- 模板 B：解析 SSR 出来的规格正文 ----------

/**
 * 旧模板的规格正文已经 SSR 在 HTML 里，不用开浏览器。
 * 分区结构：<div class="spec-content"><div class="title">分区名</div> … <p>键：值</p> …</div>
 *
 * 两处特殊处理：
 *   ① 相机分区里「后置」「前置」是独占一行的子标题 → 合成同名键，好让 parseCamera 原样复用
 *   ② 没有「键：值」结构的续行 → 并进上一条的值（见下方 pairs[pairs.length - 1]），不能直接丢
 *   ③ 整个分区没有「键：值」结构（如「防尘防水」只有一行说明）→ 用分区标题当键兜底
 *
 * 返回 null 表示静态 HTML 里没有规格分区（留给调用方退回浏览器渲染）。
 */
export function parseLegacyHtml(html) {
  const chunks = html.split('<div class="spec-content">').slice(1);
  if (!chunks.length) return null;

  const entries = [];
  for (const chunk of chunks) {
    const lines = toTextLines(chunk.split("</section>")[0]);
    if (!lines.length) continue;
    const [title, ...body] = lines;
    const pairs = [];
    const cam = { 后置: [], 前置: [] };
    let camSection = null;
    for (const line of body) {
      if (/^(后置|前置)$/.test(line)) { camSection = line; continue; }
      const m = line.match(/^([^：:]{1,20})[：:]\s*(.+)$/);
      if (camSection) {
        // 键和值留在同一行：parseCamera 需要同时看到「主摄/超广角」和「5000 万像素」
        cam[camSection].push(m ? `${m[1].trim()}：${m[2]}` : line);
      } else if (m) {
        pairs.push({ key: m[1].trim(), value: m[2].trim() });
      } else if (pairs.length) {
        // 没有「键：值」结构的续行 → 并进上一条的值（不能丢）
        // 例：Ace 5 电池分区里「6415mAh/24.57Wh (典型值)」是独立一行，也是唯一能取到典型值的来源
        pairs[pairs.length - 1].value += `\n${line}`;
      }
    }
    for (const k of ["后置", "前置"]) if (cam[k].length) pairs.push({ key: k, value: cam[k].join("\n") });
    if (pairs.length) entries.push(...pairs);
    else if (body.length) entries.push({ key: title, value: body.join("\n") });
  }

  // 配色与产品名：官方 #specs-color 里每个滑块把「产品图」和「色名」成对放在同一个节点里，
  // 不用像模板 A 那样按下标猜对应关系
  const colorSec = sliceBetween(html, 'id="specs-color"', 'id="specs-bottom"');
  const colorPairs = [];
  for (const slide of colorSec.split(/<div class="swiper-slide/).slice(1)) {
    const img = slide.match(/<img[^>]+src="((?:https?:)?\/\/oasisstatics\.oneplus\.cn\/[^"]+?\.(?:png|jpe?g))"/i);
    const cn = slide.match(/class="colorText"[^>]*>\s*([^<]+?)\s*</);
    if (img && cn) colorPairs.push({ url: absolutize(img[1]), name: cn[1].replace(/\u00ae/g, "").trim() });
  }
  const nameEl = colorSec.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/);

  return {
    entries,
    images: colorPairs.map((p) => p.url),
    swatches: [],
    colorPairs,
    name: nameEl ? nameEl[1].replace(/\u00ae/g, "").trim() : null,
  };
}

/**
 * 兜底：万一以后某页把规格放在客户端渲染（静态 HTML 里没有 .spec-content），
 * 就用浏览器渲染后再套同一套解析。目前 13 / Ace 5 都是 SSR 的，走不到这里。
 */
async function renderLegacy(url) {
  console.log("  静态 HTML 里没有规格分区，改用浏览器渲染…");
  const browser = await launchBrowser({ headless: true });
  try {
    const { page } = await newPage(browser, { width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    const parsed = parseLegacyHtml(await page.content());
    if (!parsed) throw new Error("浏览器渲染后仍未找到 .spec-content 分区，官网可能已改版");
    return parsed;
  } finally {
    await browser.close();
  }
}

/** HTML 片段 → 去标签后的非空文本行 */
function toTextLines(chunk) {
  return chunk
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.replace(/\r/g, "").replace(/\u00ae/g, "").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function sliceBetween(s, startMark, endMark) {
  const i = s.indexOf(startMark);
  if (i < 0) return "";
  const j = s.indexOf(endMark, i);
  return j < 0 ? s.slice(i) : s.slice(i, j);
}

const absolutize = (u) => (u.startsWith("//") ? `https:${u}` : u);

// ---------- schema 组装 ----------

function buildDevice(slug, raw) {
  const flat = {};
  for (const { key, value } of raw.entries) {
    const k = normKey(key);
    if (!(k in flat)) flat[k] = value; // 同名键取首次出现
  }
  const pick = (...keys) => keys.map((k) => flat[normKey(k)]).find(Boolean);
  const curated = CURATED[slug] ?? {};

  const name = raw.name ?? pick("SPU中文名称") ?? fallbackName(slug);

  // 配色两路来源：
  //   A) 模板 B：官方 #specs-color 里「产品图 + 色名」本来就是成对的，直接用
  //   B) 模板 A：官网只给「机身颜色」列表与「产品图片」列表，按下标对齐（官网模板保证顺序一致）
  let colors;
  if (raw.colorPairs?.length) {
    colors = raw.colorPairs.map((p, i) => ({
      slug: slugFromFilename(p.url) ?? `c${i}`,
      name: p.name,
      hex: null, // 由同目录的 normalize.py 采样回填
      is_default: i === 0,
      _imageUrl: p.url,
      _swatchUrl: null,
      _idSlug: slug,
    }));
  } else {
    const colorNames = (pick("机身颜色") ?? "")
      .split(/[|｜、,，/]+/) // 分隔符各页不一：15 用 |，Ace 6T / Turbo 6V 用 ｜，Ace 5 至尊版用 、
      .map((s) => s.trim())
      .filter(Boolean);
    if (!colorNames.length) colorNames.push(...raw.images.map((u) => slugFromFilename(u) ?? "default"));
    const { images, swatches } = raw;
    colors = colorNames.map((cname, i) => {
      const img = images[i % images.length] ?? images[0];
      return {
        slug: slugFromFilename(img) ?? `c${i}`,
        name: cname,
        hex: null,
        is_default: i === 0,
        _imageUrl: img,
        _swatchUrl: swatches[i % (swatches.length || 1)] ?? null,
        _idSlug: slug,
      };
    });
  }

  const release_date = curated.release_date;
  if (!release_date) throw new Error(`CURATED 里缺 ${slug} 的 release_date`);

  const device = {
    name,
    brand: "一加",
    release_year: Number(release_date.slice(0, 4)),
    chipset: {
      chip: normChip(pick("CPU型号", "平台")),
      ram: ramList(flat),
      rom: romList(flat),
    },
    body: {
      dimensions_mm: {
        height: firstNum(pick("机身长度（mm）", "高度")),
        width: firstNum(pick("机身宽度（mm）", "宽度")),
        depth: firstNum(pick("机身厚度（mm）", "厚度")),
      },
      weight_g: firstNum(pick("机身重量（g）", "重量")),
      frame_material: pick("中框材质", "中框") ?? null,
      back_material: normBack(pick("电池盖材质", "背部材质", "背部")),
      front_material: pick("屏幕盖板材质", "屏幕保护玻璃") ?? null,
      water_resistance: normWater(pick("防水等级", "防尘防水")) ?? curated.water_resistance ?? null,
    },
    display: {
      size_inch: firstNum(pick("屏幕尺寸", "尺寸")),
      resolution: normRes(pick("屏幕分辨率", "分辨率")),
      ppi: firstNum(pick("屏幕像素密度", "像素密度")),
      refresh_rate: pick("屏幕刷新率", "刷新率") ?? null,
      panel: "OLED",
      form: normForm(pick("屏幕类型")),
      // 旧模板把激发亮度单列为一条键（Ace 5 的「全局激发最高亮度」），所以要额外传进来
      max_brightness_nits: parseBrightness(pick("屏幕亮度", "亮度"), pick("全局激发最高亮度")),
      ...(curated.hdr_formats ? { hdr_formats: curated.hdr_formats } : {}),
    },
    battery: parseBattery(flat),
    camera: parseCamera(flat),
    colors,
    release_date,
  };
  return device;
}

// ---------- 字段清洗 ----------

function clean(s) {
  return String(s)
    .replace(/\r/g, "") // 官网值里是 \r\r\n 换行，JS 正则的 . 不匹配 \r，必须先去掉
    .replace(/<br\s*\/?>|<\/br>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00ae/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * 键名归一。官网各页的键写法并不统一，靠精确字符串匹配会漏：
 * 「机身长度（mm）」和「机身长度（毫米）」、Turbo 6X 系列用后一种，直接查前者会取到空。
 * 归一规则：去空白与括号 → 结尾单位 毫米→mm、克→g → 小写。
 * 只处理**结尾**的单位，避免「麦克风个数」里的「克」被误伤。
 */
function normKey(k) {
  return String(k)
    .replace(/[\s\u3000]/g, "")
    .replace(/[（）()]/g, "")
    .replace(/毫米$/, "mm")
    .replace(/克$/, "g")
    .toLowerCase();
}

/** 按原始键名取值（自动过 normKey） */
const g = (flat, key) => flat[normKey(key)];

/** slug 兜底成展示名：ace-5 → 一加 Ace 5 */
const fallbackName = (slug) =>
  "一加 " +
  slug
    .split("-")
    .map((t) => (/^\d/.test(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)))
    .join(" ");

function firstNum(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function normChip(s) {
  if (!s) return null;
  return s
    .replace(/移动平台|高通|MediaTek|联发科/g, "")
    .replace(/骁龙(\d)/g, "骁龙 $1")
    .replace(/天玑(\d)/g, "天玑 $1")
    .replace(/8至尊/g, "8 至尊")
    .trim();
}

function normRes(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/);
  return m ? `${m[1]} x ${m[2]}` : s;
}

function normForm(s) {
  if (!s) return null;
  return s.replace("直面屏", "直屏").replace("曲面屏", "曲屏");
}

function normWater(s) {
  if (!s) return null;
  const toks = String(s).match(/IP\d+\d*[K]?/g);
  return toks ? [...new Set(toks)].join("/") : s;
}

function normBack(s) {
  if (!s) return null;
  const first = String(s).split("\n")[0].replace(/（[^）]*）|\([^)]*\)/g, "").trim();
  const m = first.match(/^[^：:]{1,6}[：:]\s*(.+)$/); // 「云墨黑：丝绸玻璃工艺」→ 取右侧
  return (m ? m[1] : first).trim() || null;
}

/**
 * 屏幕亮度 → { typical, hdr }（单位尼特）。
 * hdrSource 是「激发亮度」被单独列为一条键时的补充来源（旧模板 Ace 5 的写法），
 * 主串里已经能取到激发亮度时不会用它。
 */
function parseBrightness(s, hdrSource) {
  if (!s) return null;
  const str = String(s);
  // 格式 A（15/15T/13T/Ace/Turbo）：全局默认最高亮度：800 尼特 / 全局激发最高亮度：1800 尼特
  const typicalA = str.match(/默认最高亮度[：:]\s*(\d+(?:\.\d+)?)/);
  const hdrA = str.match(/激发最高亮度[：:]\s*(\d+(?:\.\d+)?)/);
  // 格式 B（13）：800 尼特（典型值）、1600 尼特（HBM）、4500 尼特（峰值亮度）
  const typicalB = str.match(/([\d.]+)\s*尼特（典型值）/);
  const hbm = str.match(/([\d.]+)\s*尼特（HBM）/);
  const peak = str.match(/([\d.]+)\s*尼特（峰值亮度）/);
  const typical = typicalA ? Number(typicalA[1]) : typicalB ? Number(typicalB[1]) : null;
  let hdr = hdrA ? Number(hdrA[1]) : hbm ? Number(hbm[1]) : peak ? Number(peak[1]) : null;
  if (hdr == null && hdrSource) {
    const m = String(hdrSource).match(/(\d+(?:\.\d+)?)/);
    if (m) hdr = Number(m[1]);
  }
  if (typical == null && hdr == null) return null;
  return { typical, hdr };
}

function parseBattery(flat) {
  const capStr = String(pick2(flat, "电池容量", "电池") ?? "");
  // 容量常同时给额定值与典型值（Ace 5 里额定值还排在前面），口径统一取典型值
  const equiv = capStr.match(/等效\s*(\d+(?:\.\d+)?)\s*mAh/);
  const typical = typicalMah(capStr);
  const plain = capStr.match(/(\d+(?:\.\d+)?)\s*mAh/);

  const chargeStr = String(pick2(flat, "快速充电", "有线快充", "充电") ?? "");
  const wired = chargeStr.match(/最大支持[：:]?\s*(\d+)\s*W/) ?? chargeStr.match(/(\d+)\s*W/);
  const wireless =
    chargeStr.match(/无线充电[^\n]*?最大支持[：:]?\s*(\d+)\s*W/) ??
    String(pick2(flat, "无线快充") ?? "").match(/(\d+)\s*W/);

  return {
    capacity_mah: equiv ? Number(equiv[1]) : typical ?? (plain ? Number(plain[1]) : null),
    charging_watt: wired ? Number(wired[1]) : null,
    wireless_charging_watt: wireless ? Number(wireless[1]) : 0,
  };
}

/**
 * 取「典型值」那一行里的 mAh。
 *
 * 不能简单写成 /(\d+)mAh[^\n]*?典型值/：Ace 5 的值串是
 *   「6285mAh/24.08Wh (额定值)\n　6415mAh/24.57Wh (典型值)（不可拆卸）」
 * 惰性匹配会从**行首**的 6285 开始往后找「典型值」，从而错拿额定值，
 * 所以先定位含「典型值」的那一行，再只在该行（及其下一行，兼容标号与数值分行）里取 mAh。
 */
function typicalMah(str) {
  const lines = String(str).split("\n");
  const i = lines.findIndex((l) => l.includes("典型值"));
  if (i < 0) return null;
  for (const line of [lines[i], lines[i + 1]]) {
    const m = line?.match(/(\d+(?:\.\d+)?)\s*mAh/);
    if (m) return Number(m[1]);
  }
  return null;
}

function comboCaps(flat) {
  const raw = pick2(flat, "RAM容量+ROM容量", "配置组合") ?? "";
  const pairs = [...String(raw).matchAll(/(\d+)GB\s*\+\s*(\d+(?:\.\d+)?)\s*(GB|TB)/g)];
  const rams = [...new Set(pairs.map((m) => Number(m[1])))].sort((a, b) => a - b);
  const roms = [...new Set(pairs.map((m) => (m[3] === "TB" ? Number(m[2]) * 1024 : Number(m[2]))))].sort((a, b) => a - b);
  return { rams, roms };
}

function romType(s) {
  const m = String(s ?? "").match(/UFS\s?([\d.]+)/i);
  return m ? `UFS ${m[1]}` : "";
}

function ramList(flat) {
  let spec = String(pick2(flat, "RAM规格", "运行内存（RAM）") ?? "").replace(/（[^）]*）/g, "").trim();
  // 旧模板把容量写在规格里：「12GB/16GB/24GB LPDDR5X」→ 只留 LPDDR5X
  // 分隔符可能不是每项都有（最后一项后面是空格不是斜杠），所以斜杠必须可选，
  // 否则 13 会残留成「12GB 24GB LPDDR5X」
  spec = spec.replace(/^(?:\d+(?:\.\d+)?GB\/?)+\s*/g, "").trim();
  const { rams } = comboCaps(flat);
  return rams.map((gb) => `${gb}GB ${spec}`.trim());
}

function romList(flat) {
  const t = romType(pick2(flat, "ROM规格", "机身存储（ROM）"));
  const { roms } = comboCaps(flat);
  return roms.map((gb) => `${gb >= 1024 ? gb / 1024 + "TB" : gb + "GB"} ${t}`.trim());
}

const pick2 = (flat, ...keys) => keys.map((k) => flat[normKey(k)]).find(Boolean);

/**
 * 从镜头那一行里抠出传感器型号。官网多数机型不写，写了就是有效信息
 * （Ace 5 前置写的是「1600 万像素，SONY IMX480，f/2.4」）。
 * 只认 SONY/索尼 + IMX 编号这种无歧义的写法，其余一律回落到「未公开」。
 */
function sensorName(line) {
  const m = String(line).match(/(?:SONY|索尼)\s*(IMX\s?\d+)/i);
  return m ? `索尼 ${m[1].replace(/\s+/g, "")}` : "未公开";
}

function parseCamera(flat) {
  const cams = [];
  const AP = /[fƒ]\s*\/\s*(\d+(?:\.\d+)?)/; // 13 页光圈用 ƒ（U+0192）

  // 行来源三种：A) 「后置摄像头」一条多行；B) 模板 B 合成的「后置」（镜头名在键里、像素在值里）；
  // C) 13 旧模板每个镜头是独立键
  const rearText =
    pick2(flat, "后置摄像头", "后置") ??
    Object.entries(flat)
      .filter(([k, v]) => /万像素/.test(v) && /(主摄|超广角|广角|长焦|微距)/.test(k + v))
      .map(([k, v]) => `${k}：${v}`)
      .join("\n");
  const frontText =
    pick2(flat, "前置摄像头", "前置") ??
    Object.entries(flat)
      .filter(([k, v]) => /万像素/.test(v) && /摄像头/.test(k) && !/(主摄|超广角|广角|长焦|微距)/.test(k))
      .map(([k, v]) => `${k}：${v}`)
      .join("\n");

  for (const line of String(rearText).split("\n")) {
    if (!/(主摄|广角|长焦|微距)/.test(line) || !/万像素/.test(line)) continue;
    const type = /超广角/.test(line) ? "超广角" : /长焦/.test(line) ? "长焦" : /微距/.test(line) ? "微距" : "主摄";
    const mp = line.match(/(\d+(?:\.\d+)?)\s*万像素/);
    const ap = line.match(AP);
    const fl = line.match(/等效焦距\s*(\d+(?:\.\d+)?)\s*(毫米|mm)/);
    const fov = line.match(/(\d+(?:\.\d+)?)\s*°/);
    const cam = {
      type,
      sensor: sensorName(line),
      resolution_mp: mp ? Number(mp[1]) / 100 : null,
      aperture: ap ? `f/${ap[1]}` : null,
      focal_length_mm: fl ? Number(fl[1]) : null,
    };
    if (fov) cam.field_of_view_deg = Number(fov[1]);
    if (/OIS/.test(line)) cam.image_stabilization = ["光学防抖"];
    cams.push(cam);
  }
  for (const line of String(frontText).split("\n")) {
    // 13T 写作「1600万摄像头：f/2.4」——没有「像素」二字，只按「N万」匹配
    if (!/\d{3,4}\s*万/.test(line) || !AP.test(line)) continue;
    const mp = line.match(/(\d+(?:\.\d+)?)\s*万像素/) ?? line.match(/(\d+(?:\.\d+)?)\s*万/);
    const ap = line.match(AP);
    const fl = line.match(/等效焦距\s*(\d+(?:\.\d+)?)\s*(毫米|mm)/);
    if (!mp) continue;
    const cam = {
      type: "前置",
      sensor: sensorName(line),
      resolution_mp: Number(mp[1]) / 100,
      aperture: ap ? `f/${ap[1]}` : null,
      focal_length_mm: fl ? Number(fl[1]) : null,
    };
    if (/OIS/.test(line)) cam.image_stabilization = ["光学防抖"];
    else if (/防抖/.test(line)) cam.image_stabilization = ["电子防抖"];
    cams.push(cam);
  }
  return cams;
}

/**
 * 官网图片文件名 → 配色 slug。
 * 文件名里的色名不总是完整单词，这里把已知简称折到数据集通用写法上，
 * 免得同一个含义出现两种 slug（Ace 6 至尊版的「金属风暴」图名是 OnePlus_Roadster_tai_...，
 * 「tai」是「钛」的拼音，与 Ace 5 至尊版的 titanium 对齐）。
 */
const COLOR_SLUG_ALIAS = { tai: "titanium" };

function slugFromFilename(url) {
  const base = basename(new URL(url, BASE).pathname).replace(/\.[a-z]+$/i, "");
  const stripped = base
    .replace(/[-_]?\d+x\d+$/i, "") // OnePlus15-gold-1080x1080
    .replace(/[-_]?\d+$/, ""); // white-050214 / OnePlus13T_grey
  const m = stripped.match(/([a-z]+)$/i);
  if (!m) return null;
  const s = m[1].toLowerCase();
  return COLOR_SLUG_ALIAS[s] ?? s;
}

// ---------- 图片归一化 + 取色（Python/Pillow） ----------

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

async function runNormalizer(colors, outDir) {
  const script = join(HERE, "normalize.py");
  const payload = colors.map((c) => ({
    raw: c._rawPath,
    swatch: c._swatchPath ?? null,
    out: join(outDir, `oneplus-${c._idSlug}.${c.slug}.jpg`),
  }));
  const stdout = execFileSync(pythonBin(), [script, JSON.stringify(payload)], {
    encoding: "utf8",
    maxBuffer: 10 << 20,
  });
  // 最后一行是 JSON 报告：{ "<raw path>": { hex, out } }
  const report = JSON.parse(stdout.trim().split("\n").pop());
  const hexMap = {};
  for (const [rawPath, info] of Object.entries(report)) {
    hexMap[rawPath] = info.hex;
    const c = colors.find((x) => x._rawPath === rawPath);
    if (c) c._outPath = info.out;
  }
  for (const c of colors) {
    if (!c._outPath || !existsSync(c._outPath)) throw new Error(`图片归一化失败：${c._rawPath}`);
  }
  return hexMap;
}
