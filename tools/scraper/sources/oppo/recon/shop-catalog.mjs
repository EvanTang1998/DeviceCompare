// 侦察：OPPO 商城分类/搜索入口探测
//
// 目的：35 台目标机型需要「机型名 → 入口 skuId」。商品详情页 HTML 是 SSR 的
// （内含该 SPU 全部 skuId），所以只要能拿到「机型 → products/<id>.html」映射即可。
//
// 用法：
//   node recon/shop-catalog.mjs                      # 探默认候选列表
//   node recon/shop-catalog.mjs "候选URL" ...         # 探指定 URL

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const CANDIDATES = [
  "https://www.opposhop.cn/cn/web/goods-list",
  "https://www.opposhop.cn/cn/web/goods-list?categoryId=1",
  "https://www.opposhop.cn/cn/web/search.html?keyword=Find%20X6",
  "https://www.opposhop.cn/cn/web/goods-list?keyword=Find%20X6",
  "https://www.opposhop.cn/cn/web/products?categoryId=1",
  "https://www.opposhop.cn/cn/web/classify",
];

const urls = process.argv.slice(2);
const targets = urls.length ? urls : CANDIDATES;

const browser = await launchBrowser({ headless: true });

for (const url of targets) {
  const { context, page } = await newPage(browser);
  const api = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (!["xhr", "fetch"].includes(res.request().resourceType())) return;
    if (/heytapmobi|track|monitor/.test(u)) return;
    let body = "";
    try {
      if (/json/.test(res.headers()["content-type"] || "")) body = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    api.push({ url: u, body });
  });

  let title = "(goto 失败)";
  let products = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await sleep(5000);
    title = await page.title();
    products = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="products/"]')].map((a) => a.href.split("?")[0]))]
    );
  } catch (e) {
    title = "ERROR " + String(e.message).split("\n")[0];
  }

  console.log(`\n### ${url}`);
  console.log(`    title: ${title}`);
  console.log(`    商品链接: ${products.length}`);
  for (const p of products.slice(0, 8)) console.log(`      ${p}`);
  if (api.length) {
    console.log(`    接口:`);
    for (const a of api.slice(0, 6)) {
      console.log(`      ${a.url.slice(0, 150)}`);
      if (a.body) console.log(`         ${a.body.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }
  await context.close();
}

await browser.close();
