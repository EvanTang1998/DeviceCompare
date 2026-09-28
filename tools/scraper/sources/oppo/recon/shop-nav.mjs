// 侦察：点开 OPPO 商城顶部「手机」导航，找出分类列表页的真实 URL 与商品接口
//
// 背景：35 台目标机型需要「机型名 → 入口 skuId」，商品详情页 HTML 是 SSR 的
// （内含该 SPU 全部 skuId）。但商城的分类/搜索页 URL 不是猜得出来的（试过
// goods-list / search / list / products 全是 404 兜底页），只能从真实交互里拿。
//
// 用法：node recon/shop-nav.mjs

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

const api = [];
page.on("response", async (res) => {
  if (!["xhr", "fetch"].includes(res.request().resourceType())) return;
  const u = res.url();
  if (/heytapmobi|track|monitor|member\/check|configs\/web\/icons/.test(u)) return;
  let body = "";
  try {
    if (/json/.test(res.headers()["content-type"] || "")) body = (await res.text()).slice(0, 500);
  } catch {
    /* ignore */
  }
  api.push({ url: u, body });
});

await page.goto("https://www.opposhop.cn/cn/web/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(6000);

// 顶部导航里文本为「手机」的元素（排除商品标题里的「手机」）
const cands = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("a,li,div,span")) {
    const t = (el.textContent || "").trim();
    if (t !== "手机") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.y > 300) continue; // 只取顶部区域
    out.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
  }
  return out;
});
console.log("=== 顶部「手机」候选 ===");
for (const c of cands) console.log(c.tag, c.x, c.y, c.cls);

if (cands.length) {
  const top = cands.sort((a, b) => b.y - a.y)[0]; // 最靠下（更可能是真导航项）
  await page.mouse.move(top.x, top.y);
  await sleep(1500);
  await page.mouse.click(top.x, top.y);
  await sleep(5000);
}

console.log("\n=== 当前 URL ===", page.url());

console.log("\n=== 页面上的分类/列表链接 ===");
const links = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll("a")].map((a) => a.href).filter((h) => h && !/\.(css|js|png|jpg)$/i.test(h)))]
);
for (const l of links.filter((h) => !/products\/\d+\.html/.test(h)).slice(0, 30)) console.log(l);

console.log("\n=== 接口 ===");
const seen = new Set();
for (const a of api) {
  const k = a.url.split("?")[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(a.url.slice(0, 170));
  if (a.body) console.log("   ", a.body.replace(/\s+/g, " ").slice(0, 350));
}

await page.screenshot({ path: "/tmp/shop-nav.png", fullPage: false });
await browser.close();
