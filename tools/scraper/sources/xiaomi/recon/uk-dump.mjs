// 侦察：dump 国际站 specs 页全文 + 打关键字行
// 用法：node recon/uk-dump.mjs <url> [<url> ...]
// 产物：/tmp/mi-dump/<host>-<path尾部>.txt

import { writeFileSync } from "node:fs";
import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const urls = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1300 });

for (const u of urls) {
  const name = u.replace(/^https?:\/\//, "").replace(/[/?#=]/g, "_").slice(-60);
  console.log(`\n======== ${u} ========`);
  try {
    await page.goto(u, { waitUntil: "load", timeout: 90000 });
    await sleep(5000);
    await autoScroll(page, { step: 900, pause: 140 });
    await sleep(2000);
  } catch (e) {
    console.log("  ✗ 加载失败：" + e.message);
    continue;
  }
  const t = await page.evaluate(() => document.body.innerText);
  writeFileSync(`/tmp/mi-dump/${name}.txt`, t);
  console.log(
    t.split("\n").map((s) => s.trim()).filter(Boolean)
      .filter((l) => /AMOLED|OLED|fingerprint|Fingerprint|in-display|Hz|nit|MP\b|mAh|\d+\s*W\b|mm|g\b|SIM|resolution|Resolution/i.test(l) && l.length <= 110)
      .slice(0, 60).join("\n")
  );
}
await b.close();
