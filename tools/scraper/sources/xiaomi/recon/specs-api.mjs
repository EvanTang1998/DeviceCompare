// 侦察：小米官网参数页（/prod/<slug>/specs）到底从哪儿取数据
//
// 目的有三：
//   1. 抓出页面加载过程中的全部 XHR，定位参数接口（页面本身是 SPA 壳，HTML 里没有参数）
//   2. 若接口可用，打印其 JSON 顶层结构，判断能不能直接当数据源
//   3. 打印渲染后的参数 DOM 结构（分组标题 + 条目），作为接口失败时的兜底解析依据
//
// 用法：node recon/specs-api.mjs [specsUrl] [--dump-html]
//   默认 https://www.mi.com/prod/xiaomi-17-ultra/specs

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";
import fs from "node:fs";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("-")) || "https://www.mi.com/prod/xiaomi-17-ultra/specs";
const dumpHtml = args.includes("--dump-html");

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser, { width: 1440, height: 1000 });

const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  const ct = res.headers()["content-type"] || "";
  if (/\.(js|css|png|jpe?g|webp|svg|woff2?|gif)(\?|$)/i.test(u)) return;
  let size = "";
  try {
    const buf = await res.body();
    size = `${buf.length}B`;
  } catch {
    size = "(body 不可读)";
  }
  hits.push({ status: res.status(), ct: ct.split(";")[0], size, url: u });
});

console.log(`打开 ${url}\n`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
await autoScroll(page);
await sleep(3000);

console.log("=========== 全部 XHR / fetch ===========");
for (const h of hits) console.log(`${h.status} ${h.size.padStart(9)} ${h.ct.padEnd(28)} ${h.url.slice(0, 150)}`);

// ---------- 渲染后的参数 DOM ----------
const dom = await page.evaluate(() => {
  // 找出所有可能的参数容器：class/id 里带 spec 的元素
  const nodes = [...document.querySelectorAll('[class*="spec" i],[id*="spec" i]')].slice(0, 40);
  return nodes.map((n) => ({
    tag: n.tagName.toLowerCase(),
    cls: (n.className || "").toString().slice(0, 120),
    id: n.id,
    textLen: (n.innerText || "").length,
    // 只取前 3 个子元素示意结构
    kids: [...n.children].slice(0, 3).map((c) => `${c.tagName.toLowerCase()}.${(c.className || "").toString().split(" ")[0]}`)
  }));
});
console.log("\n=========== class/id 含 spec 的元素 ===========");
console.log(JSON.stringify(dom, null, 1));

// 找「屏幕」「电池」附近的 DOM 结构
const probe = await page.evaluate(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || "").trim();
    if (t === "屏幕" || t === "电池容量" || t === "后置摄像头") {
      let p = n.parentElement;
      const chain = [];
      for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
        chain.push(`${p.tagName.toLowerCase()}.${(p.className || "").toString().split(" ").slice(0, 2).join(".")}`);
      }
      const box = n.parentElement.closest("div");
      out.push({ text: t, chain, siblingHTML: (box?.parentElement?.outerHTML || "").slice(0, 700) });
    }
  }
  return out.slice(0, 4);
});
console.log("\n=========== 「屏幕/电池容量/后置摄像头」附近结构 ===========");
for (const p of probe) {
  console.log(`--- ${p.text}`);
  console.log(`    祖先链: ${p.chain.join(" < ")}`);
  console.log(`    兄弟盒: ${p.siblingHTML.replace(/\s+/g, " ")}\n`);
}

if (dumpHtml) {
  const html = await page.content();
  fs.writeFileSync("/tmp/mi-specs-rendered.html", html);
  console.log(`\n渲染后 HTML 已写入 /tmp/mi-specs-rendered.html（${html.length}B）`);
}

await browser.close();
