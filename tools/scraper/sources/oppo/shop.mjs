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
//        galleryResource[] 中 type=img 且 .png 的条目 = 该配色的产品图，
//        顺序即官网轮播顺序（1=展开正面，2/3=折叠态等其他角度）
//
// 产物：
//   原图备份  tools/scraper/out/<run>/oppo-raw/<id>.<slug>.<n>.png（官网 1440 透明 PNG，git 不跟踪）
//   归一化    src/data/images/<id>.<slug>.<n>.jpg（612x760 白底，命名见 src/data.js 顶部约定）
//
// 配色 slug：OPPO 官网不给英文色名，这里用人工映射表（与用户手动入库的
//   black/orange/titanium 保持一致），新机型要在 DEVICES 里补。

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "../../../.."); // sources/oppo → scraper → tools → 项目根
const IMAGES_DIR = resolve(PROJECT_ROOT, "src/data/images");

const SKU_API = "https://www.opposhop.cn/cn/oapi/goods-detail/web/info/pc/sku";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://www.opposhop.cn/",
};

// 入口 SKU 任选该机型的一个 SKU 即可（接口会返回全配色 + 各配色 skuId）
const DEVICES = {
  "oppo-find-x10": { skuId: 45215, slugs: { 冰蓝: "iceblue", 清橙: "orange", 浅钛: "titanium" } },
  "oppo-find-x10-pro-max": {
    skuId: 45203,
    slugs: { 月白: "moonwhite", 暖橙: "warmorange", 浅钛: "titanium" },
  },
  "oppo-find-n6": { skuId: 39269, slugs: { 深黑: "black", 金橙: "orange", 原钛: "titanium" } },
};

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
    const slug = dev.slugs[c.color];
    if (!slug) throw new Error(`${id}: 配色「${c.color}」没有 slug 映射，请在 DEVICES.slugs 里补`);
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

/** 某配色 SKU 的全部角度图（官网轮播顺序） */
async function fetchAngles(skuId) {
  const data = await fetchSku(skuId);
  const urls = (data.galleryResource ?? [])
    .filter((x) => x.type === "img" && /\.png(\?|$)/.test(x.url || ""))
    .map((x) => x.url.split("?")[0]);
  if (!urls.length) throw new Error(`SKU ${skuId} 的 galleryResource 里没有 PNG 产品图`);
  return urls;
}

/**
 * 抓取并归一化入库。
 * @returns {{ report: object }} 每台机型的配色/角度清单
 */
export async function scrapeOppoShop({ ids, dryRun = false, outDir }) {
  const runDir = outDir ?? resolve(HERE, `../../out/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const rawDir = resolve(runDir, "oppo-raw");
  mkdirSync(rawDir, { recursive: true });

  const manifest = [];
  const report = {};

  for (const id of ids) {
    const { colors } = await fetchOppoColors(id);
    report[id] = { colors: [] };

    for (const color of colors) {
      if (!color.skuId) throw new Error(`${id}: 配色「${color.name}」没有对应 skuId`);
      const urls = await fetchAngles(color.skuId);
      const angles = [];
      for (let i = 0; i < urls.length; i++) {
        const n = i + 1;
        const raw = resolve(rawDir, `${id}.${color.slug}.${n}.png`);
        const res = await fetch(urls[i], { headers: HEADERS });
        if (!res.ok) throw new Error(`下载失败 ${urls[i]} HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(raw, buf);
        angles.push({ n, raw, bytes: buf.length, url: urls[i] });
        manifest.push({
          raw,
          out: resolve(IMAGES_DIR, `${id}.${color.slug}.${n}.jpg`),
          slug: color.slug,
          n,
        });
      }
      report[id].colors.push({ name: color.name, slug: color.slug, hex: color.hex, angles: angles.length });
      console.log(`  ${id} ${color.name}(${color.slug}) ${angles.length} 张角度图，色值 ${color.hex}`);
    }
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
