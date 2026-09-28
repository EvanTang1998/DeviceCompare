// 侦察：从老机型产品页（/<slug>）挖商城购买链接 product_id
// 用法：node recon/buy-links2.mjs <slug> [<slug> ...]

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });
for (const s of slugs) {
  try {
    await page.goto(`https://www.mi.com/${s}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(6000);
    const found = await page.evaluate(() => {
      const out = new Set();
      for (const a of document.querySelectorAll("a")) {
        const m = (a.href || "").match(/product_id=(\d+)/);
        if (m) out.add(`${m[1]}  ${(a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 24)}`);
      }
      return [...out];
    });
    console.log(`\n== ${s} ==`);
    for (const f of found) console.log("  " + f);
    if (!found.length) console.log("  （页面上没有 product_id 链接）");
  } catch (e) {
    console.log(`\n== ${s} == 失败 ${e.message}`);
  }
}
await b.close();
