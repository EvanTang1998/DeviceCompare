// 侦察脚本：实测苹果对比页到底请求了哪些图片、色板长什么样
// 用法：node recon/apple-compare.mjs [modelList]
//   modelList 默认 iphone-18-pro,iphone-17,iphone-duo
// 输出：控制台报告 + recon-out/apple-compare-<时间>.json

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, newPage, autoScroll, sleep } from "../lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../recon-out");

const modelList = process.argv[2] || "iphone-18-pro,iphone-17,iphone-duo";
const url = `https://www.apple.com.cn/iphone/compare/?modelList=${modelList}`;

// 宽松匹配：只要路径里带 compare_ 且是图片格式就抓，先不预设严格规律
const IMG_RE = /compare_[^/?]+\.(?:png|jpe?g|webp)$/i;

const report = {
  capturedAt: new Date().toISOString(),
  url,
  modelList,
  imageRequests: [],
  allCompareApiRequests: [],
  nonImageStatuses: [],
  backportData: null,
  colorSwatchProbe: null,
  specTableProbe: null
};

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

const seen = new Map();

page.on("request", (req) => {
  const u = req.url();
  if (!/apple\.com/.test(u)) return;
  if (IMG_RE.test(u.split("?")[0])) {
    if (!seen.has(u)) {
      seen.set(u, { url: u, resourceType: req.resourceType() });
      report.imageRequests.push(seen.get(u));
      console.log(`[图片请求] ${u.split("/").pop()}`);
    }
  } else if (/\/v\/iphone\/compare|\/compare-geo|backport/.test(u)) {
    report.allCompareApiRequests.push({ url: u, resourceType: req.resourceType() });
  }
});

page.on("response", (res) => {
  const u = res.url();
  const ct = res.headers()["content-type"] || "";
  if (ct && !/image|javascript|json|html|css/.test(ct) && res.status() >= 400) {
    report.nonImageStatuses.push({ url: u, status: res.status(), contentType: ct });
  }
});

console.log(`\n=== 打开 ${url} ===\n`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await sleep(1500);
await autoScroll(page);
await page.waitForLoadState("networkidle").catch(() => {});
await sleep(1500);

// 1) 内嵌数据块
report.backportData = await page.evaluate(() => {
  const el = document.querySelector("#backport-data");
  if (!el) return { found: false };
  const text = el.textContent || "";
  return {
    found: true,
    length: text.length,
    head: text.slice(0, 300),
    hasImageRefs: /images\/|\.jpg|\.png/i.test(text)
  };
});

// 2) 色板探测：找出页面上所有"可点的颜色小圆点/按钮"
report.colorSwatchProbe = await page.evaluate(() => {
  const out = { candidates: [], samples: [] };
  const selectors = [
    "[data-automation-id*='color' i]",
    "[data-analytics-activitymap-region-id*='color' i]",
    "button[aria-label*='色']",
    "button[aria-label*='colour' i]",
    "[role='radiogroup']",
    "fieldset[class*='color' i]",
    "[class*='color-swatch' i]",
    "[class*='colorswatch' i]",
    "[class*='colorSwatch']"
  ];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    if (els.length) out.candidates.push({ selector: sel, count: els.length });
  }
  // 抓几个样例，看它们长什么样
  for (const sel of selectors.slice(0, 6)) {
    const el = document.querySelector(sel);
    if (el) {
      out.samples.push({
        selector: sel,
        tag: el.tagName,
        className: String(el.className).slice(0, 160),
        ariaLabel: el.getAttribute("aria-label"),
        text: (el.textContent || "").trim().slice(0, 80),
        childCount: el.children.length
      });
    }
  }
  return out;
});

// 3) 规格表探测：看有没有可解析的表格结构
report.specTableProbe = await page.evaluate(() => {
  const tables = document.querySelectorAll("table");
  const dl = document.querySelectorAll("dl");
  const rows = document.querySelectorAll("tr");
  return {
    tableCount: tables.length,
    dlCount: dl.length,
    trCount: rows.length,
    firstTableHeadRow: tables[0] ? (tables[0].querySelector("tr")?.textContent || "").trim().slice(0, 200) : null,
    bodyTextLength: (document.body.innerText || "").length
  };
});

await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = resolve(OUT_DIR, `apple-compare-${stamp}.json`);
writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log("\n=== 图片请求统计 ===");
console.log(`共 ${report.imageRequests.length} 个`);
for (const r of report.imageRequests) console.log("  " + r.url);
console.log("\n=== 其他 compare 相关请求 ===");
console.log(`共 ${report.allCompareApiRequests.length} 个`);
for (const r of report.allCompareApiRequests.slice(0, 20)) console.log(`  [${r.resourceType}] ${r.url}`);
console.log("\n=== backport-data ===");
console.log(JSON.stringify(report.backportData, null, 2));
console.log("\n=== 色板探测 ===");
console.log(JSON.stringify(report.colorSwatchProbe, null, 2));
console.log("\n=== 规格表探测 ===");
console.log(JSON.stringify(report.specTableProbe, null, 2));
console.log(`\n报告已写入 ${outFile}`);
