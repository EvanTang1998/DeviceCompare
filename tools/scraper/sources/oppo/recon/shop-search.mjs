// 侦察：在 opposhop 搜索 "Find X10"，监听真实搜索接口并 dump 商品链接
//
// 用法：node recon/shop-search.mjs "Find X10"

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const keyword = process.argv[2] || "Find X10";

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

const apiHits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/oapi/.test(u)) return;
  let body = null;
  try {
    if (/json/.test(res.headers()["content-type"] || "")) body = (await res.text()).slice(0, 400);
  } catch {
    /* ignore */
  }
  apiHits.push({ url: u.slice(0, 150), body });
});

await page.goto(`https://www.opposhop.cn/cn/web/search?keyword=${encodeURIComponent(keyword)}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await sleep(5000);

// 在搜索框里重新输入并回车
const input = page.locator('input[placeholder]').first();
await input.click();
await input.fill(keyword);
await page.keyboard.press("Enter");
await sleep(6000);

const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="products/"]')].map((a) => ({
    href: a.href,
    text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
  }))
);

console.log("=== 商品链接 ===");
const seen = new Set();
for (const l of links) {
  if (seen.has(l.href)) continue;
  seen.add(l.href);
  console.log(l.href, "|", l.text);
}

console.log("\n=== 搜索相关接口 ===");
const seen2 = new Set();
for (const h of apiHits) {
  if (seen2.has(h.url)) continue;
  seen2.add(h.url);
  console.log(h.url);
  if (h.body) console.log("    ", h.body.replace(/\s+/g, " ").slice(0, 300));
  console.log();
}

await page.screenshot({ path: "/tmp/shop-search.png", fullPage: false });
await browser.close();
