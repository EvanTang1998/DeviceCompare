// 侦察：把某机型参数页所有小节按「标题 + 全文」打印出来
//
// 参数区每个小节的 DOM 形态（2026-09 实测）：
//   div.div_XXX > （若干）span.text_YYY
//   第一个 span 是小节标题（外观尺寸 / 续航与充电 / 影像系统 …），其余是值
//   有的小节值放在嵌套 div 里，所以取整块 innerText 最省事
//
// 用法：node recon/blocks.mjs <slug|url> [--only=外观尺寸,续航与充电]

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("-")) || "xiaomi-17-ultra";
const url = target.startsWith("http") ? target : `https://www.mi.com/prod/${target}/specs`;
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");

const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });
await page.goto(url, { waitUntil: "load", timeout: 90000 });
await sleep(4000);
await autoScroll(page, { step: 900, pause: 120 });
await sleep(1500);

const blocks = await page.evaluate(() => {
  const root = document.querySelector('[class*="_root_div"]');
  if (!root) return null;
  const floors = [...root.children].flatMap((c) => [...c.children]);
  return floors.map((f) => {
    const t = f.innerText || "";
    return { cls: (f.className || "").toString(), lines: t.split("\n").map((s) => s.trim()).filter(Boolean) };
  });
});

if (!blocks) {
  console.log("没找到参数区（可能不是真机型页）");
} else {
  console.log(`共 ${blocks.length} 块\n`);
  for (const [i, bk] of blocks.entries()) {
    const title = bk.lines[0] || "(空)";
    if (only && !only.some((k) => title.includes(k))) continue;
    console.log(`########## 块 ${i}  cls=${bk.cls}`);
    for (const l of bk.lines) console.log(`  ${l}`);
    console.log();
  }
}
await b.close();
