// 侦察：打开 mi.com 搜索页，嗅探它的搜索 XHR 接口（找到能用 product_id 的搜索 API）
// 用法：node recon/search-sniff.mjs "关键词"

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const kw = process.argv[2] || "Xiaomi 12";
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });

const hits = [];
page.on("response", async (res) => {
  const url = res.url();
  if (!/order\.mi\.com|api/i.test(url)) return;
  if (!/search|list|query|keyword/i.test(url)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 400);
  } catch {}
  hits.push(`${res.status()}  ${url.slice(0, 160)}\n     ${body.replace(/\s+/g, " ").slice(0, 200)}`);
});

await page.goto("https://www.mi.com/search?keyword=" + encodeURIComponent(kw), {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await sleep(9000);
await page.evaluate(() => window.scrollBy(0, 1200));
await sleep(4000);

console.log(`命中 ${hits.length} 个候选请求：`);
for (const h of [...new Set(hits)]) console.log("  " + h);
await b.close();
