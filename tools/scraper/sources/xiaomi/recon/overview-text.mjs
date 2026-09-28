// 侦察：17T 概述页全文（参数页为空的机型，看概述页能兜底多少参数）
//
// 用法：node recon/overview-text.mjs <slug>

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const slug = process.argv[2] || "xiaomi-17t";
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });
await page.goto(`https://www.mi.com/prod/${slug}/`, { waitUntil: "load", timeout: 90000 });
await sleep(4000);
await autoScroll(page);
await sleep(1500);
const text = await page.evaluate(() => document.body.innerText);
// 只打印含数字+单位的行和关键参数行
for (const line of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
  if (/nits|Hz|mAh|W\s|W$|万|MP|GB|英寸|″|mm|g$|mm｜|LPDDR|UFS|骁龙|天玑|HyperOS|澎湃|像素|光圈|焦距|防抖|屏|指纹/.test(line)) {
    console.log(line);
  }
}
await b.close();
