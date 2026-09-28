// 侦察：dump 老机型参数页原文 + 列出疑似「小节标题」的行
// 用法：node recon/dump-old.mjs <slug> [<slug> ...]
// 产物：/tmp/mi-dump/<slug>.txt

import { mkdirSync, writeFileSync } from "node:fs";
import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const KNOWN = [
  "外观尺寸", "内存容量", "移动平台", "屏幕显示", "指纹解锁",
  "充电续航", "续航与充电", "影像系统", "网络频段", "数据传输", "数据连接",
  "多功能NFC", "导航定位", "视频音频", "传感器", "操作系统", "包装清单",
];

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
mkdirSync("/tmp/mi-dump", { recursive: true });
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });

for (const s of slugs) {
  await page.goto(`https://www.mi.com/${s}/specs`, { waitUntil: "load", timeout: 90000 });
  await sleep(3500);
  await autoScroll(page, { step: 900, pause: 120 });
  await sleep(1500);
  const r = await page.evaluate(() => {
    const root = document.querySelector('[class*="_root_div"]');
    const legacy = document.querySelector('[class*="component-content__"]');
    const el = (root && root.innerText.trim()) ? root : (legacy && legacy.innerText.trim()) ? legacy : document.body;
    return { text: el.innerText, cls: String(el.className).slice(0, 60) };
  });
  writeFileSync(`/tmp/mi-dump/${s}.txt`, r.text);
  // 疑似标题：短行（<=10 字）且不含数字/冒号/常见单位
  const cand = [...new Set(
    r.text.split("\n").map((l) => l.trim())
      .filter((l) => l && l.length <= 10 && !/[\d：:|丨/]|mm|g$|Hz|W$/.test(l) && !KNOWN.includes(l))
  )];
  console.log(`\n== ${s} == ${r.text.length}B  [${r.cls}]`);
  console.log("  已知标题命中: " + KNOWN.filter((t) => r.text.split("\n").some((l) => l.trim() === t)).join("/"));
  console.log("  其它短行候选: " + cand.join(" | "));
}
await b.close();
