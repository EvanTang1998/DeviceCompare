// OPPO 图片源：官方商城（opposhop.cn）
//
// 为什么不用 oppo.com 参数页的图：参数页只有一张「多色横排拼图」（productColorImg），
// 没有分色独立图。分色产品图在官方商城，且有公开 JSON 接口。
//
// 数据链路（实测 2026-09）：
//   1. GET /cn/oapi/goods-detail/web/info/pc/sku?skuId=<入口SKU>
//        attributesColorParams[] → { color 配色名, colorValue 官方色值（渐变双值，逗号分隔）,
//                                    colorUrl 色块图 }，顺序即官网展示顺序
//        attributes.skuItems[]   → { key1 配色名, skuId }，每个配色的任一 SKU
//   2. 对每个配色：GET 同接口 ?skuId=<该配色的 skuId>
//        galleryResource[] 中 type=img 且 .png 的条目 = 该配色的产品图，官网轮播顺序：
//        第 1 张 = 正面+背面组合图（唯一入库的），第 2 张起 = 侧面/斜侧角度 —— 不要，
//        用户口径：对比表里不出现侧面机位图（2026-09-24 定）
//
// 产物：
//   原图备份  tools/scraper/out/<run>/oppo-raw/<id>.<slug>.<n>.png（官网 1440 透明 PNG，git 不跟踪）
//   归一化    src/data/images/<id>.<slug>.<n>.jpg（612x760 白底，命名见 src/data.js 顶部约定）
//
// 配色 slug：OPPO 官网不给英文色名，映射表统一在 colors.mjs（COLOR_SLUGS），
// 新机型在那边补；本文件只负责「入口 skuId → 分色多角度图」。

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slugOf } from "./colors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "../../../.."); // sources/oppo → scraper → tools → 项目根
const IMAGES_DIR = resolve(PROJECT_ROOT, "src/data/images");

const SKU_API = "https://www.opposhop.cn/cn/oapi/goods-detail/web/info/pc/sku";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://www.opposhop.cn/",
};

// 入口 SKU：任选该机型的一个 SKU 即可（接口会返回全配色 + 各配色 skuId）。
// 取值来自官网机型页购买区的商城商品页链接，扫描脚本见 recon/shop-map.mjs。
// 缺图机型（商城已下架，或官网机型页没挂购买链接）不在此表 —— 参数照常入库、图片留空。
const DEVICES = {
  // 首批入库（2026-09-23 前）
  "oppo-find-x10": { skuId: 45215 },
  "oppo-find-x10-pro-max": { skuId: 45203 },
  "oppo-find-n6": { skuId: 39269 },

  // 第二批（2026-09-23）
  "oppo-find-x10-e": { skuId: 45222 },
  "oppo-find-x9": { skuId: 36846 },
  "oppo-find-x9-pro": { skuId: 36880 },
  "oppo-find-x9-pro-satellite": { skuId: 39322 },
  "oppo-find-x9-ultra": { skuId: 39829 },
  "oppo-find-x9s-pro": { skuId: 39813 },
  "oppo-find-x8-pro": { skuId: 29560 },
  "oppo-find-x8-pro-satellite": { skuId: 29560 },
  "oppo-find-x8-ultra": { skuId: 33281 },
  "oppo-find-x8s-plus": { skuId: 33368 },
  "oppo-find-n5": { skuId: 32589 },
  "oppo-reno16-pro": { skuId: 40691 },
  "oppo-reno15": { skuId: 37695 },
  "oppo-reno15-pro": { skuId: 37681 },
  "oppo-k15-pro": { skuId: 39760 },
  "oppo-k15-pro-plus": { skuId: 39751 },
  "oppo-k13-turbo": { skuId: 35696 },
  "oppo-k13-turbo-pro": { skuId: 35684 },
  "oppo-a7-pro": { skuId: 45181 },
  "oppo-a7-pro-max": { skuId: 42048 },
  "oppo-a6-pro": { skuId: 36485 },
  "oppo-a6k": { skuId: 39673 },
  "oppo-a6s-pro": { skuId: 39978 },
};

/** 该机型有没有商城图片源 */
export function hasShopEntry(id) {
  return Boolean(DEVICES[id]);
}

/** 参数页多色拼图 URL（window.pageDsl 的 CmpProductParamPage.attr.productColorImg），没有则返回 null
 *  部分页面值带尾随「?」（如 find-x7-ultra-976_720.png?），截到扩展名即可 */
function stripUrl(html) {
  const m = String(html ?? "").match(/"productColorImg"\s*:\s*"(\/[^"]+?\.(?:png|jpe?g|webp))[^"]*"/i);
  return m ? `https://www.oppo.com${m[1]}` : null;
}

async function fetchSku(skuId) {
  const res = await fetch(`${SKU_API}?skuId=${skuId}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`SKU 接口 ${skuId} HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200 || !json.data) throw new Error(`SKU 接口 ${skuId} 返回异常：${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

/** 机型级配色信息（specs.mjs 写 JSON 时也用它） */
export async function fetchOppoColors(id) {
  const dev = DEVICES[id];
  if (!dev) throw new Error(`未知 OPPO 机型：${id}（可选：${Object.keys(DEVICES).join(", ")}）`);

  const entry = await fetchSku(dev.skuId);
  const skuByColor = new Map();
  for (const s of entry.attributes?.skuItems ?? []) {
    if (s.key1 && s.skuId && !skuByColor.has(s.key1)) skuByColor.set(s.key1, String(s.skuId));
  }

  const colors = [];
  for (const c of entry.attributesColorParams ?? []) {
    const slug = slugOf(id, c.color);
    if (!slug) throw new Error(`${id}: 配色「${c.color}」没有 slug 映射，请在 colors.mjs 的 COLOR_SLUGS 里补`);
    colors.push({
      name: c.color,
      slug,
      // 官方渐变双值取第一个作色板主色（完整值保留在 colorValueFull）
      hex: (c.colorValue || "").split(",")[0] || null,
      colorValueFull: c.colorValue || null,
      skuId: skuByColor.get(c.color) ?? null,
    });
  }
  if (!colors.length) throw new Error(`${id}: 接口没返回配色（attributesColorParams 为空）`);
  return { id, name: (entry.goodsSpuName || entry.name || "").trim(), colors };
}

/** 某配色 SKU 的产品图：官网轮播第 1 张 = 正面+背面组合图。
 *  第 2 张起是侧面/斜侧角度，不入库（2026-09-24 起用户口径：不要侧面图） */
async function fetchAngles(skuId) {
  const data = await fetchSku(skuId);
  const urls = (data.galleryResource ?? [])
    .filter((x) => x.type === "img" && /\.png(\?|$)/.test(x.url || ""))
    .map((x) => x.url.split("?")[0]);
  if (!urls.length) throw new Error(`SKU ${skuId} 的 galleryResource 里没有 PNG 产品图`);
  return urls.slice(0, 1);
}

/**
 * 抓取并归一化入库。
 * @param {Map<string,string>} [specsHtml] 机型 id → 参数页 HTML（scrapeOppoSpecs 已抓过），
 *   无商城源的机型从参数页取 productColorImg（官方多色拼图）作整机裸名图，与小米 12/11/10 系列同口径
 * @returns {{ report: object }} 每台机型的配色/角度清单
 */
export async function scrapeOppoShop({ ids, dryRun = false, outDir, specsHtml }) {
  // 无商城源的机型（已下架 / 官网没挂购买链接）跳过分色图，参数照常入库；
  // 参数页有多色拼图的退化为一张整机裸名图（<id>.jpg，colors 不逐色配图）
  const targets = ids.filter(hasShopEntry);
  const skipped = ids.filter((id) => !hasShopEntry(id));
  if (skipped.length) {
    const withStrip = skipped.filter((id) => stripUrl(specsHtml?.get(id) ?? ""));
    console.log(
      `  跳过 ${skipped.length} 台无商城图片源` +
        (withStrip.length ? `，其中 ${withStrip.length} 台退回参数页多色图：${withStrip.join(", ")}` : `：${skipped.join(", ")}`)
    );
  }

  const runDir = outDir ?? resolve(HERE, `../../out/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const rawDir = resolve(runDir, "oppo-raw");
  mkdirSync(rawDir, { recursive: true });

  const manifest = [];
  const report = {};

  for (const id of targets) {
    const { colors } = await fetchOppoColors(id);
    report[id] = { colors: [] };

    for (const color of colors) {
      if (!color.skuId) throw new Error(`${id}: 配色「${color.name}」没有对应 skuId`);
      const urls = await fetchAngles(color.skuId);
      // 每色单图（正面+背面组合），命名不带角度号：oppo 系列不再有多角度图。
      // 旧的多角度文件（<id>.<slug>.<n>.jpg）由重抓后的清理步骤删掉
      const raw = resolve(rawDir, `${id}.${color.slug}.png`);
      const res = await fetch(urls[0], { headers: HEADERS });
      if (!res.ok) throw new Error(`下载失败 ${urls[0]} HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(raw, buf);
      manifest.push({
        raw,
        out: resolve(IMAGES_DIR, `${id}.${color.slug}.jpg`),
        slug: color.slug,
        n: null,
      });
      report[id].colors.push({ name: color.name, slug: color.slug, hex: color.hex, angles: 1 });
      console.log(`  ${id} ${color.name}(${color.slug}) 正面+背面组合图，色值 ${color.hex}`);
    }
  }

  // 无商城源机型的兜底：参数页 productColorImg（官方多色拼图）→ 一张整机裸名图。
  // 不逐色切图 —— 拼图机位有遮挡，切出来不是完整产品图（README OPPO 章节有说明）
  for (const id of skipped) {
    const url = stripUrl(specsHtml?.get(id) ?? "");
    if (!url) {
      console.log(`  ⚠ ${id}: 参数页没有 productColorImg，图片留空`);
      continue;
    }
    const raw = resolve(rawDir, `${id}.strip.png`);
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`下载失败 ${url} HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(raw, buf);
    manifest.push({ raw, out: resolve(IMAGES_DIR, `${id}.jpg`), bare: true });
    report[id] = { colors: [], strip: url };
    console.log(`  ${id} 参数页多色图 ${Math.round(buf.length / 1024)}KB ← ${url}`);
  }

  if (!dryRun) {
    console.log(`\n归一化 ${manifest.length} 张原图 → ${IMAGES_DIR}`);
    execFileSync(pythonBin(), [resolve(HERE, "normalize.py"), JSON.stringify(manifest)], {
      stdio: "inherit",
      maxBuffer: 10 << 20,
    });
  } else {
    console.log(`\n（dry-run）跳过归一化，${manifest.length} 张原图已备份到 ${rawDir}`);
  }

  return { runDir, rawDir, report };
}

/** 找带 Pillow 的 python3（与 vivo 源同一套候选顺序） */
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
