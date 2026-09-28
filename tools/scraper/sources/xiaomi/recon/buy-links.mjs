// 侦察：从 mi.com/prod/<slug> 产品页里挖商城购买链接（product_id）
import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const slugs = process.argv.slice(2);
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });
for (const s of slugs) {
  await page.goto(`https://www.mi.com/prod/${s}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);
  const found = await page.evaluate(() => {
    const out = new Set();
    for (const a of document.querySelectorAll("a")) {
      const m = (a.href || "").match(/product_id=(\d+)/);
      if (m) out.add(`${m[1]}  ${(a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 30)}`);
    }
    return [...out];
  });
  console.log(`\n== ${s} ==`);
  for (const f of found) console.log("  " + f);
  if (!found.length) console.log("  （页面上没有 product_id 链接）");
}
await b.close();
