// 侦察：vmall（华为商城）用**真浏览器**能否过 WAF —— 官网已下架 Mate 60 系列 specs 页，
// 商城是剩下的官方源，所以这次值得再试一次（curl 那次是 302 乒乓，见 vmall-probe.mjs）。
//
// 用法：node sources/huawei/recon/vmall-browser.mjs [关键词，默认 "Mate 60 Pro"]

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const kw = process.argv[2] ?? "Mate 60 Pro";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);

const hits = [];
page.on("response", (r) => {
  const u = r.url();
  if (/search|product|sku|prdId|comdetail/i.test(u) && !/\.(png|jpg|jpeg|webp|css|js|woff2?)($|\?)/i.test(u)) {
    hits.push(`${r.status()} ${u.slice(0, 160)}`);
  }
});

const url = `https://www.vmall.com/search?keyword=${encodeURIComponent(kw)}`;
console.log("→", url);
await page.goto(url, { waitUntil: "domcontentloaded" }).catch((e) => console.log("goto 失败：", e.message));
await sleep(4000);

console.log("最终 URL：", page.url());
console.log("标题：", await page.title());
const text = await page.locator("body").innerText().catch(() => "");
console.log("正文长度：", text.length, "| 含「验证」：", /验证|滑动|安全/.test(text));
console.log("正文片段：", text.replace(/\s+/g, " ").slice(0, 400));

const links = await page.locator('a[href*="product"], a[href*="comdetail"]').evaluateAll((els) =>
  els.map((e) => `${(e.innerText || "").trim().slice(0, 30)} → ${e.href}`).slice(0, 20)
);
console.log("商品链接：\n  " + (links.join("\n  ") || "（无）"));

console.log("关键请求：\n  " + hits.slice(0, 25).join("\n  "));

await page.screenshot({ path: "/tmp/vmall-browser.png", fullPage: false });
await browser.close();
