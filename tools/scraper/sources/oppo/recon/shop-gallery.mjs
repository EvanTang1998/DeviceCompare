// 侦察 v3：监听商城页网络请求 + 点击颜色后截图/提取轮播 DOM
//
// 用法：node recon/shop-gallery.mjs [skuId]   默认 39269

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";
import fs from "node:fs";

const skuId = process.argv[2] || "39269";
const url = `https://www.opposhop.cn/cn/web/products/${skuId}.html`;

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

const netHits = [];
page.on("response", (res) => {
  const u = res.url();
  if (
    /commons-media-picture/.test(u) ||
    (/opposhop\.cn/.test(u) && /\.(json|html)\b/.test(u) && !/\.js|\.css/.test(u)) ||
    /api/.test(u)
  ) {
    netHits.push({ status: res.status(), type: res.headers()["content-type"] || "", url: u.slice(0, 160) });
  }
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("img", { timeout: 30000 });
await sleep(6000);
netHits.push({ mark: "=== 页面加载完，开始点击颜色 ===" });

const colorButtons = page.locator('div.v-item-group:has(.item-title:text-is("颜色")) button.btn');
const n = await colorButtons.count();

for (let i = 0; i < n; i++) {
  const btn = colorButtons.nth(i);
  const label = (await btn.innerText()).trim();
  await btn.click();
  await sleep(5000);
  await page.screenshot({ path: `/tmp/shop-${skuId}-${i}-${label}.png` });
  const galleryHTML = await page.evaluate(() => {
    const sw = document.querySelector(".swiper-wrapper");
    return sw ? sw.parentElement.outerHTML.slice(0, 1500) : null;
  });
  console.log(`=== 颜色[${label}] 轮播容器 HTML ===`);
  console.log(galleryHTML);
}

fs.writeFileSync("/tmp/shop-net.json", JSON.stringify(netHits, null, 1));
console.log("\n=== 网络请求 ===");
const seen = new Set();
for (const h of netHits) {
  const key = h.url || h.mark;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(h.mark || `${h.status} ${h.type.slice(0, 24)} ${h.url}`);
}
await browser.close();
