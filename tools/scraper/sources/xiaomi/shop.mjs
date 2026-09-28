// 小米图片源：小米商城商品详情接口（api2.order.mi.com/product/view）
//
// 为什么不用 www.mi.com 的页面：参数页（/prod/<slug>/specs）是 SPA 壳，产品图
// 都在商城商品详情接口里，公开 JSON、无需登录。
//
// 数据链路（实测 2026-09）：
//   GET /product/view?product_id=<id>&version=2   （要带 Referer: https://www.mi.com/）
//     data.buy_option[]   → name="颜色" 的那组 list 是配色（顺序即商城展示顺序，
//                           第一项与官网默认色一致）
//     data.goods_list[]   → 每个库存单元（版本 × 配色）一条，goods_info：
//         .name        "Xiaomi 17 Ultra 12GB+512GB 黑色" —— 末段是配色名
//         .img_url     该配色的产品渲染图（800x800 透明 PNG，正反双面构图）
//     注意 imgs[] 随「版本」变、gallery_v3 全局共享，都不是分色图，不能用
//     goods_info.class_parameters.list → 商城「关键参数」（电池/充电/前置像素等），
//        作为参数页缺失时的兜底（17T 参数页为空，全靠它）
//
// 产物：
//   原图备份  tools/scraper/out/<run>/xiaomi-raw/<id>.<slug>.png（800 透明 PNG，git 不跟踪）
//   归一化    src/data/images/<id>.<slug>.jpg（612x760 白底；小米只有每色一张，无多角度）

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slugOf } from "./colors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "../../../.."); // sources/xiaomi → scraper → tools → 项目根
const IMAGES_DIR = resolve(PROJECT_ROOT, "src/data/images");

const VIEW_API = "https://api2.order.mi.com/product/view";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://www.mi.com/",
};

// 机型 id → 商城 product_id。取值来自商城搜索结果卡片的购买链接
//（采集脚本见 recon/search-cards.mjs）与产品页「立即购买」链接
//（采集脚本见 recon/buy-links.mjs，2026-09-24）。
// 注意 id 有两种形态（22422 / 1230804969），接口两种都认。
export const PRODUCT_IDS = {
  "xiaomi-17": 1230804969,
  "xiaomi-17-pro": 1230804972,
  "xiaomi-17-pro-max": 1230804977,
  "xiaomi-17-ultra": 22422,
  "xiaomi-17-max": 24648,
  "xiaomi-17t": 24814,
  "xiaomi-17t-pro": 24809,
  "xiaomi-15": 20618,
  "xiaomi-15-pro": 20603,
  "xiaomi-15-ultra": 20982,
  "xiaomi-15s-pro": 21305,
  "xiaomi-14": 19300,
  "xiaomi-14-pro": 1230801073,
  "xiaomi-14-ultra": 1230801639,
  "xiaomi-13": 17971,
  "xiaomi-13-pro": 17969,
  "xiaomi-13-ultra": 18363,
};

export function hasShopEntry(id) {
  return Boolean(PRODUCT_IDS[id]);
}

// ---------- 老机型（12/11/10 系列）的图片与配色 ----------
//
// 这批机型已从商城下架，没有 product_id，分色渲染图拿不到（product/view 接口
// 和 item.mi.com 详情页都不再返回它们）。改用两条路：
//   1. 国行参数页 CSS 背景里的「多色全家福」（cdn.cnbj1.fds.api.mi-img.com，
//      文件名 specs-product.png / specs_01.png / 数字.png，随页面模板而异）
//   2. 国行页面下架的（小米10 / 10 Pro）走 UK 站 hero 图；10 青春版国行
//      概述页只有哆啦A梦联名图，改用全球同名机型 Mi 10 Lite 的官方图
// 都落成**一张裸名图** src/data/images/<id>.jpg（无配色维度），
// data.js 的 bareImages 会把它当机型主图；配色只声明名字（hex 留空），
// 与 OPPO 无图机型同口径 —— 详见 tools/scraper/README.md 的小米章节。
//
// 配色来源（逐台核对过，非商城接口）：
//   12 / 12X / 12S / 12S Pro / 12S Ultra  官网概述页配色选择器
//   12 Pro / 11 / 11 Pro / 11 Ultra       官网参数页多色图的自带色标
//   11 青春版 / 10S / 10 至尊纪念版        官网参数页配色块
//   10 青春版                             官网参数页配色块（哆啦A梦限定款不入）
//   10 / 10 Pro                           UK 站参数页色卡（全球版色名，英文）
export const LEGACY_MODELS = {
  "xiaomi-12": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi120mmgce/specs-product.png",
    colors: ["黑色", "蓝色", "紫色", "原野绿"],
  },
  "xiaomi-12-pro": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/xiaomi12proarp71i/specs-product.png",
    colors: ["黑色", "蓝色", "紫色", "原野绿（PU）"],
  },
  "xiaomi-12x": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi12x0mmgce/specs-product.png",
    colors: ["黑色", "蓝色", "紫色"],
  },
  "xiaomi-12s": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi12sltli3b/3825.png",
    colors: ["白色", "黑色", "原野绿", "紫色", "蓝色"],
  },
  "xiaomi-12s-pro": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi12s-provuejwm/spc_sj.png",
    colors: ["黑色", "紫色", "原野绿", "白色"],
  },
  "xiaomi-12s-ultra": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi12s-ultrartl5tw/3477.png",
    colors: ["经典黑", "冷杉绿"],
  },
  "xiaomi-11": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi11/specs-product.png",
    colors: ["黑色", "白色", "蓝色", "卡其（素皮）", "烟紫（素皮）", "雷军签名特别版"],
  },
  "xiaomi-11-pro": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi11Pro/specs-product.png",
    colors: ["黑色", "绿色", "紫色"],
  },
  "xiaomi-11-ultra": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi11ultra/specs-product.png",
    colors: ["黑色", "白色", "大理石纹特别版"],
  },
  "xiaomi-11-youth": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi11youth/specs-product.png",
    colors: ["冰峰黑提", "清甜荔枝", "奇异果香", "樱花蜜粉", "清凉薄荷", "夏日柠檬"],
  },
  "xiaomi-10-ultra": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi10ultra/specs_01.png",
    colors: ["透明版", "陶瓷黑", "亮银版"],
  },
  "xiaomi-10s": {
    img: "https://cdn.cnbj1.fds.api.mi-img.com/product-images/mi10s/specs-product.png",
    colors: ["黑", "蓝", "白"],
  },
  "xiaomi-10-youth": {
    img: "https://i01.appmifile.com/webfile/globalimg/products/pc/mi-10-lite/specs-header.png",
    colors: ["黑巧风暴", "蓝莓薄荷", "桃子西柚", "四季春奶绿", "白桃乌龙"],
  },
  "xiaomi-10": {
    img: "https://i01.appmifile.com/webfile/globalimg/products/pc/mi10/specs1.png",
    colors: ["Coral Green", "Twilight Grey"],
  },
  "xiaomi-10-pro": {
    img: "https://i01.appmifile.com/webfile/globalimg/products/pc/mi-10-pro/specs1.png",
    colors: ["Alpine White", "Solstice Grey"],
  },
};

export function isLegacyModel(id) {
  return Boolean(LEGACY_MODELS[id]);
}

/** 老机型配色 → 与 fetchXiaomiColors 同构的返回（imgUrl 恒为 null：没有分色图） */
export function fetchLegacyColors(id) {
  const legacy = LEGACY_MODELS[id];
  if (!legacy) throw new Error(`未知小米老机型：${id}`);
  const colors = legacy.colors.map((name, i) => {
    const slug = slugOf(name);
    if (!slug) throw new Error(`${id}: 配色「${name}」没有 slug 映射，请在 colors.mjs 的 COLOR_SLUGS 里补`);
    return { name, slug, hex: null, is_default: i === 0, imgUrl: null };
  });
  return { id, name: null, colors };
}

// 同一次运行里 specs.mjs 会调 3 个入口（关键参数 / 在售版本 / 配色），都落在
// 同一个商品详情上，按 id 记忆化，一台机型只发一次请求
const viewCache = new Map();

export async function fetchProductView(id) {
  if (viewCache.has(id)) return viewCache.get(id);
  const pid = PRODUCT_IDS[id];
  if (!pid) throw new Error(`未知小米机型：${id}（可选：${Object.keys(PRODUCT_IDS).join(", ")}）`);
  const res = await fetch(`${VIEW_API}?product_id=${pid}&version=2`, { headers: HEADERS });
  if (!res.ok) throw new Error(`商品接口 ${id}(${pid}) HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200 || !json.data) {
    throw new Error(`商品接口 ${id}(${pid}) 返回异常：${JSON.stringify(json).slice(0, 200)}`);
  }
  viewCache.set(id, json.data);
  return json.data;
}

/** 机型级配色（specs.mjs 写 JSON 时也用它）。顺序 = 商城展示顺序，第一个为默认色。
 *  非「真配色」的条目（套装、限量定制色）剔除，与 17 Ultra 徕卡版的排除口径一致 */
const SKIP_COLOR_RE = /套装|定制色/;

export async function fetchXiaomiColors(id) {
  const data = await fetchProductView(id);

  const colorNames = (data.buy_option ?? [])
    .find((o) => o.name === "颜色")
    ?.list?.map((c) => c.name)
    .filter((n) => !SKIP_COLOR_RE.test(n)) ?? [];
  if (!colorNames.length) throw new Error(`${id}: 商品接口没返回配色（buy_option 里没有「颜色」）`);

  // 每个配色的渲染图：goods_list 里同名配色的第一个非空 img_url。
  // 注意 goods_info.name 末段可能带材质后缀（如「黑色（玻璃）」），按剥后缀的名字归组
  const imgUrlByColor = new Map();
  for (const g of data.goods_list ?? []) {
    const gi = g.goods_info ?? {};
    const name = (gi.name || "").trim().split(/\s+/).pop(); // "… 12GB+512GB 黑色" → 黑色
    if (name && !imgUrlByColor.has(name) && gi.img_url) {
      imgUrlByColor.set(name, gi.img_url.startsWith("//") ? `https:${gi.img_url}` : gi.img_url);
    }
  }

  const colors = colorNames
    .map((name, i) => {
      const slug = slugOf(name);
      if (!slug) throw new Error(`${id}: 配色「${name}」没有 slug 映射，请在 colors.mjs 的 COLOR_SLUGS 里补`);
      return { name, slug, hex: null, is_default: false, imgUrl: imgUrlByColor.get(name) ?? null };
    })
    .filter((c) => {
      // 商城挂了色名但没有产品图的（= 不可购/无货）不声明为配色，
      // 与 OPPO 源「不可购配色不入库」同口径（ssr-check 会抓「部分配色有图部分没图」）
      if (c.imgUrl) return true;
      console.log(`  ⚠ ${id}: 配色「${c.name}」商城没有产品图（不可购），不入库`);
      return false;
    });
  colors[0].is_default = true; // 第一个「有图」配色为默认色
  return { id, name: (data.product_info?.name || "").trim(), colors };
}

/** 商城「关键参数」→ [{name, value}]，参数页缺失字段的兜底数据源。
 *  老机型（12/11/10 系列）已从商城下架，没有关键参数可兜底 */
export async function fetchKeyParams(id) {
  if (isLegacyModel(id)) return [];
  const data = await fetchProductView(id);
  const gi = data.goods_list?.[0]?.goods_info ?? {};
  return (gi.class_parameters?.list ?? []).map((it) => ({ name: it.name ?? "", value: it.value ?? "" }));
}

/** 商城在售的全部「内存+存储」组合，如 ["12GB+256GB", "12GB+512GB"] */
export async function fetchVariants(id) {
  if (isLegacyModel(id)) return [];
  const data = await fetchProductView(id);
  const out = [];
  for (const g of data.goods_list ?? []) {
    const m = (g.goods_info?.name || "").match(/(\d+GB)\s*\+\s*(\d+GB|1TB)/);
    if (m) out.push(`${m[1]}+${m[2]}`);
  }
  return [...new Set(out)];
}

/**
 * 下载各配色产品图并归一化入库。
 * @returns {Record<string, string>} 原图路径 → 采样色值 hex（normalize.py 回填）
 */
export async function scrapeXiaomiShop({ ids, dryRun = false, outDir }) {
  const shopIds = ids.filter(hasShopEntry);
  const legacyIds = ids.filter(isLegacyModel);
  const skipped = ids.filter((id) => !hasShopEntry(id) && !isLegacyModel(id));
  if (skipped.length) console.log(`  跳过 ${skipped.length} 台无图片源：${skipped.join(", ")}`);

  const runDir = outDir ?? resolve(HERE, `../../out/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const rawDir = resolve(runDir, "xiaomi-raw");
  mkdirSync(rawDir, { recursive: true });

  const manifest = [];
  const report = {};

  for (const id of shopIds) {
    const { colors } = await fetchXiaomiColors(id);
    report[id] = { colors: [] };

    for (const color of colors) {
      if (!color.imgUrl) continue;
      const raw = resolve(rawDir, `${id}.${color.slug}.png`);
      const res = await fetch(color.imgUrl, { headers: HEADERS });
      if (!res.ok) throw new Error(`下载失败 ${color.imgUrl} HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(raw, buf);
      manifest.push({ raw, out: resolve(IMAGES_DIR, `${id}.${color.slug}.jpg`), slug: color.slug });
      report[id].colors.push({ name: color.name, slug: color.slug, raw });
      console.log(`  ${id} ${color.name}(${color.slug}) 1 张产品图`);
    }
  }

  // 老机型：一张裸名图（无配色维度），配色只声明名字、hex 留空
  for (const id of legacyIds) {
    const { colors } = fetchLegacyColors(id);
    report[id] = { colors: colors.map(({ name, slug }) => ({ name, slug, raw: null })) };
    const raw = resolve(rawDir, `${id}.png`);
    const res = await fetch(LEGACY_MODELS[id].img, { headers: HEADERS });
    if (!res.ok) throw new Error(`下载失败 ${LEGACY_MODELS[id].img} HTTP ${res.status}`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    manifest.push({ raw, out: resolve(IMAGES_DIR, `${id}.jpg`), bare: true });
    console.log(`  ${id} 裸名多色图 1 张（${colors.length} 个配色只声明名字，hex 留空）`);
  }

  const hexMap = {};
  if (!dryRun && manifest.length) {
    console.log(`\n归一化 ${manifest.length} 张原图 → ${IMAGES_DIR}`);
    const out = execFileSync(pythonBin(), [resolve(HERE, "normalize.py"), JSON.stringify(manifest)], {
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 10 << 20,
    });
    // 最后一行是 JSON 报告：{ "<raw path>": { hex, out } }
    for (const line of out.toString().trim().split("\n")) {
      try {
        Object.assign(hexMap, JSON.parse(line));
      } catch {
        /* 非 JSON 行（Pillow 版本提示等）忽略 */
      }
    }
  } else if (dryRun) {
    console.log(`\n（dry-run）跳过归一化，${manifest.length} 张原图已备份到 ${rawDir}`);
  }

  return { runDir, rawDir, report, hexMap };
}

/** 找带 Pillow 的 python3（与 OPPO/vivo 源同一套候选顺序） */
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
    } catch {
      /* 下一个 */
    }
  }
  throw new Error("找不到带 Pillow 的 python3（先 pip install pillow）");
}
