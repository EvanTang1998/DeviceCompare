// 华为正面图：vmall（华为商城）商品图 = 官方「多色正面+背面」组合图。
//
// 背景（2026-09-24 定）：华为官网 specs 页的分色图是背面斜视图，官网全站没有正面渲染图
// （中文站 specs / 产品页 design、英文站 specs 都确认过，见 recon/front-image-probe*.mjs）。
// 唯一的官方正面图是 vmall 的商品图 —— 多色正背组合图（白底 PNG）。
//
// 链路（真浏览器过 WAF 拿搜索接口响应，每台约 5-6s）：
//   1. 真浏览器打开 https://www.vmall.com/search?keyword=<关键词>
//      → 捕获 XHR 里带 resultList 的搜索结果 JSON（openapi.vmall.com/mcp/...）
//   2. 取 name 精确匹配的商品条目：productId + photoPath + photoName
//   3. 拼 CDN 原图 URL（800_800_ 前缀）下载 → normalize.py（bare 模式）
//      → src/data/images/<id>.jpg（裸名图）
//
// 前端把裸名图追加进每个配色的图片轮播末尾（src/App.jsx PhoneHeader），色块分色图照旧。
//
// 注意：Mate 60 系列 vmall 已无手机商品（只剩壳膜），搜不到 —— 这 4 台维持背面分色图，
// 属于已知口径，不是 bug。

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, newPage, sleep } from "../../lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = resolve(HERE, "../../../../src/data/images");
const CDN = "https://res.vmallres.com/pimages";

// 本项目机型 id → vmall 搜索关键词（新机型在这补一行）
const KEYWORDS = {
  "huawei-mate80": "HUAWEI Mate 80",
  "huawei-mate80-pro": "HUAWEI Mate 80 Pro",
  "huawei-mate80-pro-max": "HUAWEI Mate 80 Pro Max",
  "huawei-mate80-pro-max-fengchiban": "HUAWEI Mate 80 Pro Max 风驰版",
  "huawei-mate80-rs": "HUAWEI Mate 80 RS 非凡大师",
  "huawei-pura90": "HUAWEI Pura 90",
  "huawei-pura90-pro": "HUAWEI Pura 90 Pro",
  "huawei-pura90-pro-max": "HUAWEI Pura 90 Pro Max",
  "huawei-pura80": "HUAWEI Pura 80",
  "huawei-pura80-pro": "HUAWEI Pura 80 Pro",
  "huawei-pura80-pro-plus": "HUAWEI Pura 80 Pro+",
  "huawei-pura80-ultra": "HUAWEI Pura 80 Ultra",
  "huawei-pura-x-view": "HUAWEI Pura X View",
  "huawei-mate70": "HUAWEI Mate 70",
  "huawei-mate70-pro": "HUAWEI Mate 70 Pro",
  "huawei-mate70-pro-plus": "HUAWEI Mate 70 Pro+",
  "huawei-mate70-pro-youxiangban": "HUAWEI Mate 70 Pro 优享版",
  "huawei-mate70-air": "HUAWEI Mate 70 Air",
  "huawei-mate70-rs": "HUAWEI Mate 70 RS 非凡大师",
  "huawei-mate60": "HUAWEI Mate 60",
  "huawei-mate60-pro": "HUAWEI Mate 60 Pro",
  "huawei-mate60-pro-plus": "HUAWEI Mate 60 Pro+",
  "huawei-mate60-rs": "HUAWEI Mate 60 RS 非凡大师",
};

// 搜索结果里要精确命中的型号词（去掉「HUAWEI 」前缀）
const NAME_OF = {
  "huawei-mate80": "Mate 80",
  "huawei-mate80-pro": "Mate 80 Pro",
  "huawei-mate80-pro-max": "Mate 80 Pro Max",
  "huawei-mate80-pro-max-fengchiban": "Mate 80 Pro Max 风驰版",
  "huawei-mate80-rs": "Mate 80 RS 非凡大师",
  "huawei-pura90": "Pura 90",
  "huawei-pura90-pro": "Pura 90 Pro",
  "huawei-pura90-pro-max": "Pura 90 Pro Max",
  "huawei-pura80": "Pura 80",
  "huawei-pura80-pro": "Pura 80 Pro",
  "huawei-pura80-pro-plus": "Pura 80 Pro+",
  "huawei-pura80-ultra": "Pura 80 Ultra",
  "huawei-pura-x-view": "Pura X View",
  "huawei-mate70": "Mate 70",
  "huawei-mate70-pro": "Mate 70 Pro",
  "huawei-mate70-pro-plus": "Mate 70 Pro+",
  "huawei-mate70-pro-youxiangban": "Mate 70 Pro 优享版",
  "huawei-mate70-air": "Mate 70 Air",
  "huawei-mate70-rs": "Mate 70 RS 非凡大师",
  "huawei-mate60": "Mate 60",
  "huawei-mate60-pro": "Mate 60 Pro",
  "huawei-mate60-pro-plus": "Mate 60 Pro+",
  "huawei-mate60-rs": "Mate 60 RS 非凡大师",
};

const pythonBin = () => {
  const cands = [
    process.env.PYTHON,
    "/Users/shentang/.workbuddy/binaries/python/envs/default/bin/python3",
    "python3",
  ].filter(Boolean);
  for (const bin of cands) {
    try {
      execFileSync(bin, ["-c", "import PIL"], { stdio: "ignore" });
      return bin;
    } catch {}
  }
  throw new Error("找不到带 Pillow 的 python（pip install pillow）");
};

/** 商品名排他：命中「Mate 80 Pro」时排除「Mate 80 Pro Max」「Mate 80 RS」等同系列更长型号 */
function excluded(name, needle) {
  const i = name.indexOf(needle);
  if (i === -1) return true;
  const tail = name.slice(i + needle.length);
  // 紧跟的字符如果直接续着型号（Max/Air/RS/Pro/优享/非凡/数字），说明命中的是更长的名字
  return /^\s*(?:Max|Air|RS|Pro|优享|非凡|\d)/.test(tail);
}

// 配件词：命中直接丢弃（Mate 60 系列搜出来的全是保护套/壳膜）
const ACCESSORY_RE = /保护套|手机壳|皮套|壳|膜|充电器|数据线|支架|耳机|手表|平板|音箱|车充/;

/** 从搜索候选里选商品：非配件精确匹配优先；该型号只有「官方翻新」在售时（新机已停售，
 *  商品图与新品相同）退回翻新机条目 */
function pickItem(items, needle) {
  const clean = items.filter((x) => x.name && !ACCESSORY_RE.test(x.name));
  return (
    clean.find((x) => !x.name.includes("翻新") && !excluded(x.name, needle)) ??
    clean.find((x) => !excluded(x.name, needle)) ??
    null
  );
}

/**
 * 抓全部华为机型的 vmall 正背组合图并归一化为裸名图。
 * @param {{ ids?: string[], dryRun?: boolean }} opts
 */
export async function scrapeHuaweiFronts({ ids, dryRun = false } = {}) {
  const targets = (ids ?? Object.keys(KEYWORDS)).filter((id) => KEYWORDS[id]);
  const unknown = (ids ?? []).filter((id) => !KEYWORDS[id]);
  if (unknown.length) console.log(`⚠ 未知机型（跳过）：${unknown.join(", ")}`);

  const runDir = resolve(HERE, `../../out/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const rawDir = resolve(runDir, "huawei-front-raw");
  mkdirSync(rawDir, { recursive: true });

  const browser = await launchBrowser({ headless: true });
  const { page } = await newPage(browser);

  const downloaded = [];
  const report = {};

  for (const id of targets) {
    const kw = KEYWORDS[id];
    const needle = NAME_OF[id];
    console.log(`\n──── ${id}（搜「${kw}」）────`);
    try {
      // 收集搜索 XHR：带 resultList 的 JSON（openapi.vmall.com/mcp/...）
      const xhrs = [];
      const onResp = async (r) => {
        const u = r.url();
        if (!/openapi\.vmall\.com|fss-cdn\.vmall\.com/.test(u)) return;
        if (/\.(png|jpe?g|webp|css|js|woff2?)($|\?)/i.test(u)) return;
        try {
          const t = await r.text();
          if (t.includes("resultList")) xhrs.push(t);
        } catch {}
      };
      page.on("response", onResp);
      await page.goto(`https://www.vmall.com/search?keyword=${encodeURIComponent(kw)}`, {
        waitUntil: "domcontentloaded",
      });
      await sleep(5000);
      page.off("response", onResp);

      // 汇总所有 resultList 条目
      const items = [];
      for (const t of xhrs) {
        try {
          const j = JSON.parse(t);
          const walk = (node) => {
            if (Array.isArray(node)) node.forEach(walk);
            else if (node && typeof node === "object") {
              if (Array.isArray(node.resultList)) items.push(...node.resultList);
              else Object.values(node).forEach(walk);
            }
          };
          walk(j);
        } catch {}
      }
      const hit = pickItem(items, needle);
      if (!hit) {
        console.log(`  ✗ 搜索结果没有精确匹配「${needle}」（候选 ${items.length} 条）`);
        report[id] = { error: "no-match", candidates: items.slice(0, 5).map((x) => x.name) };
        continue;
      }
      const imgUrl = `${CDN}${hit.photoPath}800_800_${hit.photoName}`;
      console.log(`  商品：${hit.name}  productId=${hit.productId}`);
      console.log(`  图：${imgUrl}`);

      const buf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
      if (buf.length < 20000) {
        console.log(`  ✗ 图太小（${buf.length}B），不像产品图`);
        report[id] = { error: "too-small", imgUrl };
        continue;
      }
      const raw = resolve(rawDir, `${id}.png`);
      writeFileSync(raw, buf);
      report[id] = { productId: hit.productId, imgUrl, raw, bytes: buf.length, name: hit.name };
      downloaded.push({ id, raw, out: resolve(IMAGES_DIR, `${id}.jpg`) });
      console.log(`  ✓ ${Math.round(buf.length / 1024)}KB`);
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
      report[id] = { error: String(e.message) };
    }
  }
  await browser.close();

  if (dryRun) {
    console.log(`\n[dry-run] 抓到 ${downloaded.length}/${targets.length} 张，图片只落 ${rawDir}`);
    writeFileSync(resolve(runDir, "report.json"), JSON.stringify(report, null, 1));
    return;
  }
  if (!downloaded.length) {
    console.log("\n一张都没抓到，看上面的报错");
    return;
  }
  // normalize.py 的约定：argv[1] = JSON 数组（{"raw","out"}），argv[2] = "bare" 走组合图分支
  const jobs = downloaded.map(({ raw, out }) => ({ raw, out }));
  execFileSync(pythonBin(), [resolve(HERE, "normalize.py"), JSON.stringify(jobs), "bare"], {
    stdio: "inherit",
  });
  console.log(`\n入库 ${downloaded.length} 张裸名图：${downloaded.map((d) => d.id).join(", ")}`);
}
