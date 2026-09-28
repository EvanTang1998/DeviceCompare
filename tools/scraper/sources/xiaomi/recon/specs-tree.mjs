// 侦察：打印小米参数页「参数区」的完整层级与文本
//
// 参数页结构（2026-09 实测）：
//   div.<slug>_<id>_root_div > div.floor_0.msa-animated > 若干 div.div_XXX（每块一组参数）
// 这些 div_XXX 是可视化编辑器生成的，class 名无语义，所以只能按「顺序 + 文本形态」解析。
//
// 用法：node recon/specs-tree.mjs [specsUrl]

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";
import fs from "node:fs";

const url = process.argv.slice(2).find((a) => !a.startsWith("-")) || "https://www.mi.com/prod/xiaomi-17-ultra/specs";
const slug = url.match(/prod\/([^/]+)\//)?.[1] || "unknown";

const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });
await page.goto(url, { waitUntil: "load", timeout: 90000 });
await sleep(5000);
await autoScroll(page);
await sleep(2000);

const dump = await page.evaluate(() => {
  const root = document.querySelector('[class*="_root_div"]');
  if (!root) return { err: "没找到 _root_div" };
  const floors = [...root.children].flatMap((c) => [...c.children]);
  const blocks = [];
  for (const floor of floors) {
    // 每块：抓它的直接子元素文本（叶子级）
    const leaves = [...floor.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.innerText || "").trim())
      .map((e) => ({ tag: e.tagName.toLowerCase(), cls: (e.className || "").toString().slice(0, 40), t: e.innerText.trim().slice(0, 160) }));
    blocks.push({
      cls: (floor.className || "").toString(),
      id: floor.id,
      innerLen: (floor.innerText || "").length,
      text: (floor.innerText || "").slice(0, 400),
      leaves: leaves.slice(0, 40)
    });
  }
  return { count: blocks.length, blocks };
});

fs.writeFileSync(`/tmp/mi-specs-tree-${slug}.json`, JSON.stringify(dump, null, 1));
console.log(`块数：${dump.count ?? "?"}  明细见 /tmp/mi-specs-tree-${slug}.json\n`);
for (const [i, bk] of (dump.blocks || []).entries()) {
  console.log(`########## 块 ${i}  cls=${bk.cls}  innerLen=${bk.innerLen}`);
  console.log("文本： " + bk.text.replace(/\n/g, " ⏎ ").slice(0, 350));
  console.log("叶子：");
  for (const l of bk.leaves) console.log(`   ${l.tag}.${l.cls}  「${l.t.replace(/\n/g, " ⏎ ")}」`);
  console.log();
}
await b.close();
