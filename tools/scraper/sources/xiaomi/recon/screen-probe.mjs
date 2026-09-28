// 侦察：老机型「概述页」里找屏幕材质与指纹写法
//
// 背景：12/11/10 系列的部分机型，参数页（/<slug>/specs）的屏幕小节只写
//   「6.28″ 超视感屏」这类营销名，不写 AMOLED/OLED，也不写指纹方案；
//   这些信息只出现在概述页（/<slug>/）。本脚本 dump 概述页里含关键字的行。
//
// 用法：node recon/screen-probe.mjs mi12 mi12x mi12s mi10s
// 产物：/tmp/mi-dump/ov-<slug>.txt（全文）

import { mkdirSync, writeFileSync } from "node:fs";
import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
mkdirSync("/tmp/mi-dump", { recursive: true });
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });

for (const s of slugs) {
  await page.goto(`https://www.mi.com/${s}/`, { waitUntil: "load", timeout: 90000 });
  await sleep(4500);
  await autoScroll(page, { step: 900, pause: 140 });
  await sleep(2000);
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(`/tmp/mi-dump/ov-${s}.txt`, text);
  const hits = [...new Set(
    text.split("\n").map((l) => l.trim()).filter(Boolean)
      .filter((l) => /指纹|AMOLED|OLED|分辨率|刷新率|\d+\s*Hz|PPI|尺寸|英寸|″/.test(l) && l.length <= 120)
  )];
  console.log(`\n== ${s} == ${text.length}B`);
  for (const h of hits.slice(0, 25)) console.log("   " + h);
}
await b.close();
