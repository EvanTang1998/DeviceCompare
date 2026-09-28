// 侦察：在 mi.com 搜索页里找机型卡片（标题 + 链接），用于定位老机型 product_id / 产品页
// 用法：node recon/search2.mjs "关键词"

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const kw = process.argv[2] || "小米10";
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });
await page.goto("https://www.mi.com/search?keyword=" + encodeURIComponent(kw), {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await sleep(8000);

const cards = await page.evaluate(() => {
  const seen = new Set();
  const out = [];
  for (const a of document.querySelectorAll("a")) {
    const href = a.href || "";
    if (!/product_id=\d+|mi\.com\/mi\d/i.test(href)) continue;
    const text = (a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const k = href.slice(0, 80) + "|" + text;
    if (seen.has(k) || !text) continue;
    seen.add(k);
    out.push({ text, href });
  }
  return out;
});
console.log(`关键词「${kw}」共 ${cards.length} 个候选卡片：`);
for (const c of cards) console.log(`  ${c.text.padEnd(42)} ${c.href.slice(0, 110)}`);
await b.close();
