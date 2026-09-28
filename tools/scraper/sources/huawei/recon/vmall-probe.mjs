// 侦察：华为商城（vmall）商品详情页的接口与配色/图集结构
//
// 背景：vmall 对 curl 是 WAF 反爬（www ↔ item 302 乒乓，需要 HWWAFSESID cookie），
// 所以用真浏览器打开商品页，抓 XHR/JSON 响应，找「配色 + 分色产品图」的来源。
//
// 用法：
//   node sources/huawei/recon/vmall-probe.mjs [prdId] [sbomCode]

import { launchBrowser, newPage, sleep, autoScroll } from "../../../lib/browser.mjs";
import { writeFileSync } from "node:fs";

const prdId = process.argv[2] || "10086981094378";
const sbom = process.argv[3] || "2601010612503";
const URL = `https://item.vmall.com/product/comdetail/index.html?prdId=${prdId}&sbomCode=${sbom}`;

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser, { width: 1440, height: 1000 });

const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  const ct = res.headers()["content-type"] || "";
  if (!/json|javascript/i.test(ct)) return;
  if (/\.js(\?|$)/.test(u)) return;
  let body = "";
  try {
    body = await res.text();
  } catch {
    return;
  }
  if (body.length < 80) return;
  // 只留可能含商品详情的
  if (!/sku|color|prdId|product|goods|photo|image|album/i.test(u + body.slice(0, 4000))) return;
  hits.push({ url: u, len: body.length, body });
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(6000);
await autoScroll(page, { step: 800, pause: 260 });
await sleep(3000);

console.log(`\n=== 页面 ===\n${page.url()}\n${await page.title()}`);
const h1 = await page.evaluate(() => document.querySelector("h1")?.innerText?.trim() ?? "");
console.log("商品名:", h1);

// 页面上的配色切换器
const swatches = await page.evaluate(() =>
  [...document.querySelectorAll("[class*=color] li, [class*=color] a, [class*=sku] li")]
    .map((e) => ({
      cls: String(e.className).slice(0, 50),
      text: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30),
      img: e.querySelector("img")?.src ?? null
    }))
    .filter((x) => x.text || x.img)
    .slice(0, 25)
);
console.log("\n=== 疑似配色项 ===");
for (const s of swatches) console.log(" ", JSON.stringify(s));

console.log(`\n=== 命中的接口 ${hits.length} 个 ===`);
for (const h of hits) {
  console.log(`\n--- ${h.url.slice(0, 180)}  (${h.len} 字节)`);
  console.log(h.body.slice(0, 700).replace(/\s+/g, " "));
}

writeFileSync("/tmp/vmall-hits.json", JSON.stringify(hits, null, 1));
console.log("\n完整命中体已写 /tmp/vmall-hits.json");

await page.screenshot({ path: "/tmp/vmall-probe.png", fullPage: false });
await browser.close();
