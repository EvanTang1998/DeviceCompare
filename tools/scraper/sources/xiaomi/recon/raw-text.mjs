// 侦察：把参数区全文按行拉成一维文本（含块序号），用来设计/校对「小节标题表」
//
// 为什么按「标题切分全文」而不是按 block 位置取：小米参数页有两套模板
//   A. 一块一小节（Ultra / 17 Max）：div_XXX 里第一行是小节标题
//   B. 两块一小节（17 / 17 Pro / 17 Pro Max）：div_AAA 只放标题，div_BBB 放值
// 按位置写死会在两种模板间翻车，按标题切分则两边通吃。
//
// 用法：node recon/raw-text.mjs <slug> [--grep=屏幕]

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";
import fs from "node:fs";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("-")) || "xiaomi-17-pro-max";
const url = target.startsWith("http") ? target : `https://www.mi.com/prod/${target}/specs`;
const grep = args.find((a) => a.startsWith("--grep="))?.split("=")[1];

const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });
await page.goto(url, { waitUntil: "load", timeout: 90000 });
await sleep(4000);
await autoScroll(page, { step: 900, pause: 120 });
await sleep(1500);

const data = await page.evaluate(() => {
  const root = document.querySelector('[class*="_root_div"]');
  if (!root) return null;
  const floors = [...root.children].flatMap((c) => [...c.children]);
  const perBlock = floors.map((f, i) => ({
    i,
    cls: (f.className || "").toString(),
    lines: (f.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean)
  }));
  const lines = [];
  for (const bk of perBlock) for (const l of bk.lines) lines.push({ block: bk.i, cls: bk.cls, t: l });
  return { perBlock, lines };
});

if (!data) {
  console.log("参数区为空（不是真机型页或结构变了）");
} else {
  fs.writeFileSync(`/tmp/mi-raw-${target}.json`, JSON.stringify(data, null, 1));
  console.log(`共 ${data.perBlock.length} 块 / ${data.lines.length} 行，全量见 /tmp/mi-raw-${target}.json\n`);
  // 短行（<14 字）通常是标题，单独列出来便于定标题表
  const shorts = data.lines.filter((l) => l.t.length <= 14);
  console.log("=== 短行（疑似小节标题）===");
  for (const l of shorts) console.log(`  [块${String(l.block).padStart(2)}] ${l.t}`);
  if (grep) {
    console.log(`\n=== 含「${grep}」的行 ===`);
    for (const l of data.lines.filter((x) => x.t.includes(grep))) console.log(`  [块${String(l.block).padStart(2)}] ${l.t}`);
  }
}
await b.close();
