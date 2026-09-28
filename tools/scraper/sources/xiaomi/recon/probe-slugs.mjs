// 侦察：批量确认「某 slug 的参数页是不是真机型」
//
// 背景：mi.com 对不存在的 slug 也可能返回 200（软 404），只看状态码会误判。
// 判据用两条：
//   1. $GLOBAL_PAGE_INFO.seo_title 有值且不是空
//   2. 渲染后参数区（[class*="_root_div"]）里的小节数量 >= 8（真机型一般 15~18 个）
//
// 用法：node recon/probe-slugs.mjs [slug1 slug2 ...]
//   不带参数则跑内置的 17 系列候选

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const DEFAULT = [
  "xiaomi-17",
  "xiaomi-17-pro",
  "xiaomi-17-pro-max",
  "xiaomi-17-ultra",
  "xiaomi-17-max",
  "xiaomi-17t",
  "xiaomi-17t-pro"
];
const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const list = slugs.length ? slugs : DEFAULT;

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser, { width: 1440, height: 1200 });

console.log(`${"slug".padEnd(22)} ${"状态".padEnd(6)} ${"seo_title".padEnd(20)} 小节数`);
for (const s of list) {
  const url = `https://www.mi.com/prod/${s}/specs`;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await sleep(2500);
    await autoScroll(page, { step: 900, pause: 120 });
    await sleep(1200);
    const r = await page.evaluate(() => {
      const t = document.title.trim();
      const root = document.querySelector('[class*="_root_div"]');
      const floors = root ? [...root.children].flatMap((c) => [...c.children]) : [];
      // 有内容的小节：innerText 非空
      const real = floors.filter((f) => (f.innerText || "").trim().length > 3);
      return { title: t, floors: floors.length, real: real.length };
    });
    const ok = r.real >= 8 ? "真机型" : "疑似软 404";
    console.log(`${s.padEnd(22)} ${ok.padEnd(6)} ${r.title.replace(/\s+$/, "").padEnd(20)} ${r.real}/${r.floors}`);
  } catch (e) {
    console.log(`${s.padEnd(22)} 失败  ${String(e.message).slice(0, 60)}`);
  }
}
await browser.close();
