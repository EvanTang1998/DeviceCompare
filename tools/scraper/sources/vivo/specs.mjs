// vivo 中国官网参数页抓取：参数 + 图片一步入库
//
// 页面是 Nuxt SSR，参数与配色都内嵌在 <script id="__NUXT_DATA__"> 里
// （devalue 扁平化数组，按下标互相引用），fetch 一次全拿到，**不需要浏览器**。
//
// 数据形态（30 个机型实测，分组结构完全一致）：
//   productAttrs[]  分组 { masterAttr.attrName, slaveAttrs: [{attrName, attrValue}] }
//   imgList[]       配色 { colorName, colorCode, imgUrl }   ← 色值官网直接给
//   product         { name: "X500 Pro", code: "x500pro" }
//   category        { name: "X系列" }
//
// 与一加源的关键差异：
//   - 字段名全站统一（无「机身长度（mm）」vs「（毫米）」这类变体）
//   - 色值官网给现成的 colorCode，不用从图片取色
//   - 配色 slug 官网没有英文名 → 用拼音（内置字表，见 PINYIN）
//   - 防水等级 / HDR 格式 / 亮度 / 中框背板材质官网一律不写 → 留空，前端显示「—」

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BASE = "https://www.vivo.com.cn";

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/scraper/sources/vivo
const PROJECT_ROOT = resolve(HERE, "../../../.."); // 项目根
const DEVICES_DIR = resolve(PROJECT_ROOT, "src/data/devices");
const IMAGES_DIR = resolve(PROJECT_ROOT, "src/data/images");

/** 裸 slug 或完整 URL 都行；URL 从 /vivo/param/<slug> 反推。id 一律小写（y505G → y505g） */
function resolveTarget(target) {
  const t = String(target).trim();
  if (/^https?:\/\//i.test(t)) {
    const m = new URL(t).pathname.match(/\/vivo\/param\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error(`无法从 URL 解析出机型 slug：${t}`);
    return { slug: m[1].toLowerCase(), url: `${BASE}/vivo/param/${m[1]}` };
  }
  return { slug: t.toLowerCase(), url: `${BASE}/vivo/param/${t}` };
}

export async function scrapeVivoSpecs({ slugs, dryRun = false }) {
  const jobs = [];
  for (const target of slugs) {
    const { slug, url } = resolveTarget(target);
    console.log(`\n──── vivo ${slug} ────`);
    const html = await fetchHtml(url);
    const page = parseParamPage(html);
    const n = page.attrs.reduce((s, g) => s + g.slaveAttrs.length, 0);
    console.log(
      `  ${page.product.name}（${page.category?.name ?? "?"}）：${page.attrs.length} 组 / ${n} 条参数，${page.imgList.length} 个配色`
    );
    const device = buildDevice(slug, page);
    jobs.push({ slug, device, page });
  }

  // 下载图片 → 归一化（Python/Pillow）→ 回填官网色值
  const workDir = resolve(tmpdir(), `vivo-specs-${Date.now()}`);
  const downloads = [];
  for (const { slug, device, page } of jobs) {
    const dir = join(workDir, slug);
    mkdirSync(dir, { recursive: true });
    page.imgList.forEach((c, i) => {
      const rawImg = join(dir, `${slug}.${device.colors[i].slug}.raw.png`);
      downloads.push({ color: device.colors[i], rawImg, url: c.imgUrl, outBase: `vivo-${slug}` });
    });
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

  const jsonDir = dryRun ? resolve(tmpdir(), "vivo-specs-json") : DEVICES_DIR;
  if (dryRun) mkdirSync(jsonDir, { recursive: true });
  const written = [];
  for (const { slug, device } of jobs) {
    const jsonPath = join(jsonDir, `vivo-${slug}.json`);
    writeFileSync(jsonPath, JSON.stringify(device, null, 2) + "\n");
    written.push(jsonPath);
    console.log(`  ✓ ${dryRun ? "[dry-run] " : ""}${jsonPath}`);
    console.log(`    ${device.name}：${device.colors.map((c) => c.name).join(" / ")}`);
  }
  return { written };
}

// ---------- 抓取与解码 ----------

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

export function parseParamPage(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("页面里没有 __NUXT_DATA__（官网改版了？先跑 recon）");
  const root = unflatten(JSON.parse(m[1]));

  let attrsData = null;
  let productData = null;
  for (const v of Object.values(root.data ?? {})) {
    const d = v?.data;
    if (!d || typeof d !== "object") continue;
    if (Array.isArray(d.productAttrs)) attrsData = d;
    if (d.product) productData = d;
  }
  if (!attrsData) throw new Error("__NUXT_DATA__ 里没找到 productAttrs");
  return {
    attrs: attrsData.productAttrs,
    imgList: attrsData.imgList ?? [],
    product: productData?.product ?? {},
    category: productData?.category ?? null,
    defaultColor: defaultColorName(html),
  };
}

/**
 * devalue 扁平化解码。__NUXT_DATA__ 是一个数组，元素之间用下标互相引用：
 *   - 元素是 number/string/boolean/null → 字面值
 *   - 元素是对象 → { key: 下标 }
 *   - 元素是数组 → 每项是下标；但首项若是类型标签（"ShallowReactive" 等）则是字面量，
 *     第二项才是下标
 * 负数是特殊值（-1 undefined / -3 NaN / -4、-5 正负无穷 / -6 负零）。
 */
const NUXT_TAGS = new Set([
  "ShallowReactive", "Reactive", "Ref", "ShallowRef", "EmptyRef",
  "Date", "Set", "Map", "BigInt", "RegExp", "Object",
]);

export function unflatten(arr) {
  const memo = new Map();
  const SPECIAL = { [-1]: undefined, [-2]: undefined, [-3]: NaN, [-4]: Infinity, [-5]: -Infinity, [-6]: -0 };
  function at(i, depth) {
    if (depth > 64) return undefined;
    if (memo.has(i)) return memo.get(i);
    if (i < 0) return SPECIAL[i] ?? undefined;
    if (i >= arr.length) return undefined;
    const raw = arr[i];
    if (raw === null || typeof raw !== "object") {
      memo.set(i, raw); // 字面值（含 number/string/boolean/null）
      return raw;
    }
    if (Array.isArray(raw)) {
      if (raw.length >= 1 && typeof raw[0] === "string" && NUXT_TAGS.has(raw[0])) {
        const out = at(raw[1], depth + 1);
        memo.set(i, out);
        return out;
      }
      const out = [];
      memo.set(i, out); // 先占位，防循环引用
      for (const e of raw) {
        if (typeof e === "number") out.push(at(e, depth + 1));
        else if (e === null || typeof e === "string" || typeof e === "boolean") out.push(e);
        else out.push(at(e, depth + 1));
      }
      return out;
    }
    const out = {};
    memo.set(i, out);
    for (const [k, ref] of Object.entries(raw)) out[k] = at(ref, depth + 1);
    return out;
  }
  return at(0, 0);
}

/** 默认配色写在渲染出的 HTML 里：<li class="active color-button-item" aria-label="大地回声"> */
function defaultColorName(html) {
  for (const tag of html.match(/<li\b[^>]*>/g) ?? []) {
    const cls = (tag.match(/class="([^"]*)"/) ?? [])[1] ?? "";
    const parts = cls.split(/\s+/);
    if (!parts.includes("color-button-item") || !parts.includes("active")) continue;
    const m = tag.match(/aria-label="([^"]+)"/);
    if (m) return clean(m[1]).replace(/（[^）]*）/g, "").trim();
  }
  return null;
}

// ---------- 参数映射 ----------

function clean(s) {
  return String(s ?? "").replace(/\r/g, "").trim();
}

/** 官网用 <br> 分隔多值（厚度的分配色值、多颗镜头等） */
function brLines(s) {
  return clean(s)
    .split(/<br\s*\/?>/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function flat(attrs) {
  const m = {};
  for (const g of attrs) for (const a of g.slaveAttrs) m[a.attrName] = clean(a.attrValue);
  return m;
}

/** 「摄夜：7.95mm<br>大地回声、晴天、览霞：8.12mm」→ 取第一段里带单位的数 */
function firstWithUnit(s, unit) {
  for (const seg of brLines(s)) {
    const m = seg.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*${unit}`));
    if (m) return Number(m[1]);
  }
  return null;
}

function ppi(w, h, inch) {
  if (!w || !h || !inch) return null;
  return Math.round(Math.sqrt(w * w + h * h) / inch);
}

function buildDevice(slug, page) {
  const f = flat(page.attrs);
  // 官网个别机型的 product.name 带尾空格（如 "X500 "）
  const name = `vivo ${clean(page.product.name ?? "") || slug.toUpperCase()}`.trim();
  const rel = clean(f["上市时间"]).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (!rel) throw new Error(`${slug}：官网没给「上市时间」，无法推 release_year`);

  const dims = {
    height: firstWithUnit(f["高度"], "mm"),
    width: firstWithUnit(f["宽度"], "mm"),
    depth: firstWithUnit(f["厚度"], "mm"),
  };
  const resM = clean(f["分辨率"]).match(/(\d{3,4})\s*[×xX*]\s*(\d{3,4})/);
  const sizeInch = Number((clean(f["尺寸（英寸）"]).match(/([0-9.]+)\s*英寸/) ?? [])[1] ?? 0) || null;

  const rear = parseRearCameras(f);
  const front = parseFrontCamera(f);
  const stab = parseStabilization(f);
  for (const cam of [...rear, front]) {
    cam.image_stabilization = [
      ...(stab.ois.has(cam.type) ? ["光学防抖"] : []),
      ...(stab.eis ? ["电子防抖"] : []),
    ];
  }

  const colors = buildColors(page);

  return {
    name,
    brand: "vivo",
    release_year: Number(rel[1]),
    chipset: {
      chip: clean(f["CPU型号"]) || null,
      ram: ramList(f),
      rom: romList(f),
    },
    body: {
      dimensions_mm: dims,
      weight_g: firstWithUnit(f["重量"], "g"),
      // 官网参数页不公布中框 / 背板 / 盖板材质
      frame_material: null,
      back_material: null,
      front_material: null,
      water_resistance: null,
    },
    display: {
      size_inch: sizeInch,
      resolution: resM ? `${resM[1]} x ${resM[2]}` : null,
      ppi: resM && sizeInch ? ppi(Number(resM[1]), Number(resM[2]), sizeInch) : null,
      refresh_rate: clean(f["刷新率"]) || null,
      panel: clean(f["屏幕材质"]) || null,
      form: null,
      max_brightness_nits: null,
      hdr_formats: null,
    },
    battery: battery(f),
    camera: [...rear, front],
    colors,
    release_date: `${rel[1]}-${String(Number(rel[2])).padStart(2, "0")}`,
  };
}

// ---------- 存储 ----------

/** 「12GB/16GB（由于操作系统…）」→ ["12GB","16GB"]，按容量升序 */
function capList(s) {
  const head = clean(s).split(/[（(]/)[0] ?? "";
  const caps = head
    .split("/")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[0-9.]+(GB|TB)$/.test(t));
  return [...new Set(caps)].sort((a, b) => capBytes(a) - capBytes(b));
}
const capBytes = (c) => Number(c.replace(/[GT]B$/, "")) * (c.endsWith("TB") ? 1024 : 1);

function lpddrOf(seg) {
  const m = String(seg).match(/LPDDR\s?\d[0-9A-Za-z]*(?:\s?Ultra(?:\s?Pro)?)?/i);
  return m ? m[0].replace(/\s+/g, " ") : null;
}

/** RAM 类型：多数机型一条通用；少数按容量分开写（y500i）→ 按容量配对 */
function ramList(f) {
  const caps = capList(f["运行内存（RAM）"] ?? "");
  if (!caps.length) return [];
  const segs = brLines(f["RAM类型"] ?? "");
  const perCap = new Map();
  for (const seg of segs) {
    const m = seg.match(/^([0-9.]+GB)\s*[:：]/i);
    const t = lpddrOf(seg);
    if (m && t) perCap.set(m[1].toUpperCase(), t);
  }
  const primary = lpddrOf(segs[0] ?? "") ?? "LPDDR";
  return caps.map((c) => `${c} ${perCap.get(c) ?? primary}`);
}

function romTypeOf(s) {
  const m = String(s).match(/UFS\s?[0-9.]+|eMMC\s?[0-9.]+/i);
  if (!m) return null;
  return m[0].replace(/\s+/g, "").replace(/^(UFS|eMMC)(?=[0-9])/i, "$1 ");
}

function romList(f) {
  const caps = capList(f["机身存储（ROM）"] ?? "");
  const t = romTypeOf(f["ROM类型"] ?? "");
  return t ? caps.map((c) => `${c} ${t}`) : caps;
}

// ---------- 电池 ----------

function battery(f) {
  const capRaw = clean(f["电池容量"] ?? "");
  // 双电芯串联时官网同时给电芯容量和「等效于 xxxmAh」，取等效值口径才和其它机型可比
  const equiv = capRaw.match(/等效于\s*([0-9]+(?:\.[0-9]+)?)\s*mAh/i);
  const typical = capRaw.match(/典型容量[：:]\s*([0-9]+(?:\.[0-9]+)?)\s*mAh/i);
  const any = capRaw.match(/([0-9]+(?:\.[0-9]+)?)\s*mAh/i);
  const capacity = Number((equiv ?? typical ?? any ?? [])[1] ?? 0) || null;

  // 充电：「90W有线闪充&最高40W无线闪充」「手机支持的充电器最大输出功率90W&40W无线闪充」
  //       「44W闪充（支持…11V 4A），兼容33W…」——第一个不带「无线」的 W 是有线功率
  const text = brLines(f["充电规格"] ?? "").join("\n");
  let wired = null;
  let wireless = null;
  for (const m of text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*W/gi)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4);
    if (wireless === null && /无线/.test(after)) wireless = Number(m[1]);
    else if (wired === null) wired = Number(m[1]);
  }
  return {
    capacity_mah: capacity,
    charging_watt: wired,
    wireless_charging_watt: wireless ?? 0,
  };
}

// ---------- 摄像头 ----------

function camType(desc) {
  if (/潜望|长焦/.test(desc)) return "长焦";
  if (/超广角|广角/.test(desc)) return "超广角";
  if (/虚化|景深/.test(desc)) return "景深";
  if (/微距/.test(desc)) return "微距";
  if (/人像/.test(desc)) return "人像";
  return "主摄";
}

/** 镜头描述里给了等效焦距的（x200 Ultra / x300 Ultra：35mm、85mm、14mm）直接采用 */
function focalOf(desc) {
  const m = String(desc).match(/(\d{2,3})\s*mm/);
  const n = m ? Number(m[1]) : 0;
  return n >= 10 && n <= 300 ? n : null;
}

function parseRearCameras(f) {
  const segs = brLines(f["后置摄像头像素"] ?? "");
  // 光圈的分隔符不统一（S 系列用 <br>、X100 用 、、Y500 用 +），不依赖分隔符、
  // 直接按出现顺序抓 f/数字 与镜头一一对应（个别机型只有裸 f/1.8，没有括号镜头名）
  const apertures = [...clean(f["后置摄像头光圈"] ?? "").matchAll(/f\/([0-9.]+)/gi)].map((m) => `f/${m[1]}`);
  if (apertures.length && apertures.length !== segs.length) {
    console.log(`    ⚠ 后置光圈 ${apertures.length} 个与镜头 ${segs.length} 颗数量不符，按下标对齐到可用部分`);
  }
  return segs.map((seg, i) => {
    // 像素口径两种：「5000万像素」→ 50mp、「2亿像素」→ 200mp
    const mpM = seg.match(/([0-9.]+)\s*(万|亿)/);
    const desc = seg.replace(/^[0-9.]+\s*[万亿](像素)?\s*/, "").trim();
    const mp = mpM ? (mpM[2] === "亿" ? Number(mpM[1]) * 100 : Number(mpM[1]) / 100) : null;
    return {
      type: camType(desc),
      sensor: "未公开",
      resolution_mp: mp,
      aperture: apertures[i] ?? null,
      focal_length_mm: focalOf(desc),
    };
  });
}

function parseFrontCamera(f) {
  const mpM = clean(f["前置摄像头像素"]).match(/([0-9.]+)\s*(万|亿)/);
  const apM = clean(f["前置摄像头光圈"]).match(/f\/([0-9.]+)/i);
  return {
    type: "前置",
    sensor: "未公开",
    resolution_mp: mpM ? (mpM[2] === "亿" ? Number(mpM[1]) * 100 : Number(mpM[1]) / 100) : null,
    aperture: apM ? `f/${apM[1]}` : null,
    focal_length_mm: null,
  };
}

/**
 * 防抖类型 → 按镜头归类。分句（；。，）后逐句判断：
 *   「后置主摄和长焦摄像头支持OIS防抖，前后置摄像头均支持视频防抖」
 *    → 前半句给主摄/长焦记 OIS，后半句只给全体记 EIS
 *   「后置摄像头均支持OIS防抖」（x200 Ultra / x300 Ultra）→ 后置全部记 OIS
 */
function parseStabilization(f) {
  const ois = new Set();
  let eis = false;
  for (const c of clean(f["防抖类型"] ?? "").split(/<br\s*\/?>|[；;。，,]/)) {
    const clause = c.trim();
    if (!clause) continue;
    const rearAll = /后置摄像头均|所有后置/.test(clause);
    if (/OIS/i.test(clause)) {
      if (/主摄/.test(clause) || rearAll) ois.add("主摄");
      if (/潜望|长焦/.test(clause) || rearAll) ois.add("长焦");
      if (rearAll) ois.add("超广角");
    }
    if (/EIS/i.test(clause) || /视频防抖/.test(clause)) eis = true;
  }
  return { ois, eis };
}

// ---------- 配色 ----------

/**
 * 官网没有英文配色名，slug 用拼音。内置字表覆盖现有 62 个配色名用到的 98 个字
 * （实测无多音字）；新出现的字原样保留，仍能生成可用 slug。
 */
const PINYIN = {
  东: "dong", 云: "yun", 光: "guang", 冰: "bing", 凤: "feng", 单: "dan", 可: "ke",
  告: "gao", 回: "hui", 圈: "quan", 在: "zai", 地: "di", 墨: "mo", 声: "sheng",
  夜: "ye", 大: "da", 天: "tian", 好: "hao", 宝: "bao", 川: "chuan", 幸: "xing",
  彩: "cai", 微: "wei", 悠: "you", 惬: "qie", 意: "yi", 感: "gan", 摄: "she",
  日: "ri", 旷: "kuang", 星: "xing", 晨: "chen", 晴: "qing", 晶: "jing", 曜: "yao",
  曦: "xi", 月: "yue", 来: "lai", 松: "song", 柔: "rou", 柠: "ning", 核: "he",
  桃: "tao", 梦: "meng", 棕: "zong", 橙: "cheng", 檬: "meng", 武: "wu", 气: "qi",
  河: "he", 浅: "qian", 淡: "dan", 深: "shen", 灰: "hui", 灵: "ling", 烟: "yan",
  片: "pian", 玄: "xuan", 玉: "yu", 白: "bai", 直: "zhi", 石: "shi", 祥: "xiang",
  空: "kong", 简: "jian", 粉: "fen", 粹: "cui", 紫: "zi", 红: "hong", 纯: "chun",
  绿: "lv", 羽: "yu", 胶: "jiao", 自: "zi", 色: "se", 荷: "he", 莓: "mei",
  落: "luo", 蓝: "lan", 薄: "bo", 览: "lan", 调: "diao", 辰: "chen", 迎: "ying",
  运: "yun", 迹: "ji", 酷: "ku", 野: "ye", 金: "jin", 钛: "tai", 钻: "zuan",
  银: "yin", 霞: "xia", 露: "lou", 青: "qing", 黄: "huang", 黑: "hei", 龙: "long",
};

function colorSlug(name, used) {
  let out = "";
  for (const ch of name) out += PINYIN[ch] ?? ch.toLowerCase();
  out = out.replace(/[^a-z0-9]+/g, "") || "color";
  while (used.has(out)) out = `${out}-${used.size + 1}`; // 同机型内撞名兜底
  return out;
}

function normHex(s) {
  const m = String(s ?? "").match(/#?\s*([0-9a-fA-F]{6})\b/);
  return m ? `#${m[1].toLowerCase()}` : null;
}

function buildColors(page) {
  const used = new Set();
  const colors = (page.imgList ?? []).map((c) => {
    const name = clean(c.colorName).replace(/（[^）]*）/g, "").trim();
    const slug = colorSlug(name, used);
    used.add(slug);
    return {
      slug,
      name,
      hex: normHex(c.colorCode) ?? normHex((c.colorCodeList ?? [])[0]),
      is_default: false,
    };
  });
  // 默认色以页面渲染出的 active 色钮为准；抓不到就退回官网列表第一个
  const di = colors.findIndex((c) => c.name === page.defaultColor);
  if (di >= 0) colors[di].is_default = true;
  else if (colors.length) colors[0].is_default = true;
  return colors;
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
