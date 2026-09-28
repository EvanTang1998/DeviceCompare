// 侦察：小米商城购买页（/shop/buy/detail?product_id=XXXX）怎么拿分色产品图
//
// 关心三件事：
//   1. 页面加载过程中打了哪些接口（找商品详情 JSON）
//   2. 颜色切换器点击后图片如何变化（是整组换还是按色替换）
//   3. 图集里是否区分「渲染图 / 实拍图 / 多角度」
//
// 用法：node recon/shop-api.mjs [productId] [--dump]

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";
import fs from "node:fs";

const args = process.argv.slice(2);
const pid = args.find((a) => !a.startsWith("-")) || "22422";
const url = `https://www.mi.com/shop/buy/detail?product_id=${pid}`;
const dump = args.includes("--dump");

const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });

const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/\.(js|css|png|jpe?g|webp|svg|woff2?|gif|eot|ttf)(\?|$)/i.test(u)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 400);
  } catch {
    body = "(不可读)";
  }
  hits.push({ status: res.status(), ct: (res.headers()["content-type"] || "").split(";")[0], url: u.slice(0, 140), body });
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
await autoScroll(page);
await sleep(3000);

console.log("=========== XHR（非静态资源）===========");
for (const h of hits) {
  console.log(`${h.status} ${h.ct.padEnd(26)} ${h.url}`);
  if (/json/.test(h.ct) && !/^\[|^\{"?code/.test(h.body) === false) {
    console.log(`      body: ${h.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }
}

// 页面上现成的图片
const imgs = await page.evaluate(() => {
  const seen = new Map();
  for (const im of document.querySelectorAll("img")) {
    const src = im.currentSrc || im.src || im.getAttribute("data-src") || "";
    if (src && !seen.has(src)) seen.set(src, (im.alt || "").slice(0, 30));
  }
  return [...seen.entries()].map(([src, alt]) => ({ src, alt }));
});
console.log(`\n=========== 页面 img（${imgs.length} 张）===========`);
for (const i of imgs) console.log(`  ${i.alt.padEnd(22)} ${i.src.slice(0, 130)}`);

if (dump) {
  const html = await page.content();
  fs.writeFileSync(`/tmp/mi-shop-${pid}.html`, html);
  console.log(`\n渲染后 HTML → /tmp/mi-shop-${pid}.html（${html.length}B）`);
}
await b.close();
