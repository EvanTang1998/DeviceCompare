// 侦察：小米商城搜索页 → 从结果里反查「机型名 → product_id」
//
// 为什么不直接调 api2.order.mi.com/search/box：该接口对非浏览器来源返回
// 406「请求来源不合法」，所以这里干脆开真页面让浏览器自己带凭据发请求，
// 顺手把页面里出现的 product/detail 链接都收集起来。
//
// 用法：node recon/search.mjs "Xiaomi 17" ["Xiaomi 17 Ultra" ...]

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const kws = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (!kws.length) kws.push("Xiaomi 17");

const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });

const found = new Map(); // product_id -> name
page.on("response", async (res) => {
  const u = res.url();
  if (!/search|goods|product/i.test(u) || !/json/i.test(res.headers()["content-type"] || "")) return;
  try {
    const t = await res.text();
    const j = JSON.parse(t.replace(/^[\w$]+\((.*)\);?$/, "$1"));
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      const pid = o.product_id ?? o.goods_id;
      const nm = o.product_name ?? o.name ?? o.goods_name;
      if (typeof pid === "number" && typeof nm === "string" && nm) {
        const k = `${nm}|${pid}`;
        if (!found.has(k)) found.set(k, true);
      }
      Object.values(o).forEach(walk);
    };
    walk(j);
  } catch {}
});

for (const kw of kws) {
  console.log(`\n===== 搜索「${kw}」=====`);
  found.clear();
  await page.goto(`https://www.mi.com/search?keyword=${encodeURIComponent(kw)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });
  await sleep(6000);
  // 页面 DOM 里的商品卡（title + 链接）
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("a[href*='product'], a[href*='detail']")]
      .map((a) => ({ href: a.href, text: (a.innerText || "").trim().slice(0, 60) }))
      .filter((x) => /product_id=\d+/.test(x.href) && x.text)
  );
  const seen = new Set();
  for (const c of cards) {
    const pid = c.href.match(/product_id=(\d+)/)?.[1];
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    console.log(`  ${pid.padEnd(10)} ${c.text.replace(/\s+/g, " ")}`);
  }
  console.log(`  (接口里也抓到 ${found.size} 条)`);
  for (const k of [...found.keys()].slice(0, 20)) console.log(`    · ${k}`);
}
await b.close();
