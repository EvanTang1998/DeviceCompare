// 侦察 2：全量抓包（不做任何猜测性过滤），把页面上所有 XHR/fetch 接口与响应落盘
//
// 用法：node sources/huawei/recon/vmall-all.mjs [prdId] [sbomCode]

import { launchBrowser, newPage, sleep, autoScroll } from "../../../lib/browser.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const prdId = process.argv[2] || "10086981094378";
const sbom = process.argv[3] || "2601010612503";
const URL = `https://item.vmall.com/product/comdetail/index.html?prdId=${prdId}&sbomCode=${sbom}`;

const OUT = "/tmp/vmall-all";
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser, { width: 1440, height: 1000 });

const rows = [];
page.on("response", async (res) => {
  const req = res.request();
  if (!["xhr", "fetch"].includes(req.resourceType())) return;
  let body = "";
  try {
    body = await res.text();
  } catch {
    return;
  }
  rows.push({ url: res.url(), type: req.resourceType(), len: body.length, body });
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(7000);
// 交互一次：点第一个疑似配色项，触发切色请求
const clicked = await page.evaluate(() => {
  const cands = [...document.querySelectorAll("li, a, div")].filter((e) => {
    const t = (e.className || "").toString();
    return /sku|color|colour|spec-item/i.test(t) && e.offsetParent;
  });
  if (cands[1]) {
    cands[1].click();
    return String(cands[1].className).slice(0, 80);
  }
  return null;
});
await sleep(3500);
await autoScroll(page, { step: 900, pause: 250 });
await sleep(2500);

console.log("点击的配色项:", clicked);
console.log(`\n=== 全部接口 ${rows.length} 个 ===`);
for (const r of rows) {
  console.log(`${String(r.len).padStart(8)}  ${r.url.slice(0, 150)}`);
}

writeFileSync("/tmp/vmall-all/all.json", JSON.stringify(rows, null, 1));
console.log("\n全量落盘 → /tmp/vmall-all/all.json");

// 页面 DOM：参数/配色区
const dom = await page.evaluate(() => {
  const pick = (sel) =>
    [...document.querySelectorAll(sel)].map((e) => ({
      cls: String(e.className).slice(0, 60),
      text: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)
    }));
  return {
    imgs: [...document.images].map((i) => i.currentSrc || i.src).filter((s) => s && !/\.svg/.test(s)).slice(0, 40),
    skuLike: pick("[class*=sku]").slice(0, 30)
  };
});
console.log("\n=== 页面图片 ===");
for (const s of new Set(dom.imgs)) console.log("  " + s);
console.log("\n=== 含 sku 的节点 ===");
for (const s of dom.skuLike) console.log("  " + JSON.stringify(s));

await page.screenshot({ path: "/tmp/vmall-all/page.png", fullPage: false });
await browser.close();
