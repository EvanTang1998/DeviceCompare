// 侦察：在老机型产品页/参数页里挖「立即购买」链接的 product_id（会滚动等待懒加载）
// 用法：node recon/buy-dig.mjs <slug> [<slug> ...]  （slug 形如 mi12 / mi12s-ultra）

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });

for (const s of slugs) {
  for (const suffix of ["", "/specs"]) {
    const url = `https://www.mi.com/${s}${suffix}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await sleep(6000);
      await autoScroll(page, { step: 800, pause: 150 });
      await sleep(2500);
      const found = await page.evaluate(() => {
        const out = new Set();
        for (const a of document.querySelectorAll("a")) {
          const href = a.href || "";
          if (!/product_id=\d+|item\.mi\.com\/product\/\d+/.test(href)) continue;
          const text = (a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20);
          // 只要购买类链接（排除导航/页脚的商品推荐）
          if (!/立即购买|购买|加入购物车|预约|抢购/.test(text)) continue;
          out.add(`${text.padEnd(10)} ${href}`);
        }
        return [...out];
      });
      if (found.length) {
        console.log(`\n== ${url} ==`);
        for (const f of found) console.log("  " + f);
      }
    } catch (e) {
      console.log(`\n== ${url} == 失败 ${String(e.message).slice(0, 50)}`);
    }
  }
}
await b.close();
