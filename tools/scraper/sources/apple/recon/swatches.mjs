// 侦察 v2：深挖色板 DOM，确认如何遍历全部配色
// 用法：node sources/apple/recon/swatches.mjs [modelList] [dpr]
// 结论输出：recon-out/color-swatches-<时间>.json

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, autoScroll, sleep } from "../../../lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../../recon-out");

const modelList = process.argv[2] || "iphone-18-pro,iphone-17,iphone-duo";
const dpr = Number(process.argv[3] || 2);
const url = `https://www.apple.com.cn/iphone/compare/?modelList=${modelList}`;

const report = {
  capturedAt: new Date().toISOString(),
  url,
  dpr,
  imageRequests: [],
  colorSectionHtml: null,
  swatchCandidates: [],
  clickExperiment: null
};

const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: dpr,
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
});
const page = await context.newPage();

page.on("request", (req) => {
  const u = req.url();
  if (/compare_[^/?]+\.(?:png|jpe?g|webp)$/i.test(u.split("?")[0])) {
    report.imageRequests.push(u.split("/").pop());
    console.log(`[图片] ${u.split("/").pop()}`);
  }
});

console.log(`\n=== 打开对比页（dpr=${dpr}）===\n`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await sleep(1500);
await autoScroll(page);
await page.waitForLoadState("networkidle").catch(() => {});
await sleep(1200);

// 1) 抓色板区块的 HTML 结构（截断，避免报告过大）
report.colorSectionHtml = await page.evaluate(() => {
  const sec =
    document.querySelector("[data-analytics-activitymap-region-id*='color' i]") ||
    document.querySelector(".section-colors") ||
    document.querySelector("[class*='section-color' i]");
  if (!sec) return { found: false };
  return {
    found: true,
    selector: sec.className,
    length: sec.outerHTML.length,
    html: sec.outerHTML.slice(0, 6000)
  };
});

// 2) 在色板区块里找出所有可能是"颜色按钮"的元素，记录其特征
report.swatchCandidates = await page.evaluate(() => {
  const sec =
    document.querySelector("[data-analytics-activitymap-region-id*='color' i]") ||
    document.querySelector(".section-colors");
  if (!sec) return [];

  const results = [];
  // 把所有带 role=button / button / 有 aria-label 的元素都收集起来，看谁是色块
  const all = sec.querySelectorAll("button, [role='button'], a, li, [aria-label]");
  for (const el of all) {
    const aria = el.getAttribute("aria-label") || "";
    const cls = String(el.className || "");
    const txt = (el.textContent || "").trim();
    const style = el.getAttribute("style") || "";
    const looksLikeColor =
      /色/.test(aria) ||
      /color|swatch/i.test(cls) ||
      /色/.test(txt) ||
      /background/.test(style);
    if (!looksLikeColor) continue;
    results.push({
      tag: el.tagName,
      className: cls.slice(0, 140),
      ariaLabel: aria,
      text: txt.slice(0, 40),
      style: style.slice(0, 120),
      role: el.getAttribute("role"),
      parentClass: String(el.parentElement?.className || "").slice(0, 120),
      childCount: el.children.length
    });
    if (results.length >= 40) break;
  }
  return results;
});

// 3) 点击实验：点第一个看起来像色块的东西，看是否触发新图片请求
const before = report.imageRequests.length;
report.clickExperiment = await page.evaluate(() => {
  const sec = document.querySelector(".section-colors");
  if (!sec) return { clicked: false, reason: "no .section-colors" };
  const btns = sec.querySelectorAll("button, [role='button']");
  if (!btns.length) return { clicked: false, reason: "no clickable" };
  const target = btns[0];
  target.click();
  return {
    clicked: true,
    targetTag: target.tagName,
    targetClass: String(target.className).slice(0, 120),
    targetAria: target.getAttribute("aria-label"),
    totalClickables: btns.length,
    ariaList: Array.from(btns)
      .map((b) => b.getAttribute("aria-label") || "")
      .filter(Boolean)
      .slice(0, 30)
  };
});
await sleep(2500);
report.clickExperiment.newImages = report.imageRequests.slice(before);

await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = resolve(OUT_DIR, `color-swatches-${stamp}.json`);
writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(`\n=== 图片请求（共 ${report.imageRequests.length}）===`);
console.log([...new Set(report.imageRequests)].join("\n"));
console.log("\n=== 色板区块 ===");
console.log(JSON.stringify({ found: report.colorSectionHtml.found, length: report.colorSectionHtml.length }));
console.log("\n=== 色板候选元素（前 20）===");
console.log(JSON.stringify(report.swatchCandidates.slice(0, 20), null, 2));
console.log("\n=== 点击实验 ===");
console.log(JSON.stringify(report.clickExperiment, null, 2));
console.log(`\n报告：${outFile}`);
