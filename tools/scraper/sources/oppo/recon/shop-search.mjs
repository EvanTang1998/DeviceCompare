// 侦察：OPPO 商城站内搜索（点击后可能弹面板，面板里才是真输入框）
//
// 背景：首页 <input placeholder="Find X10 Pro Max"> 直接填值 + Enter 无任何反应，
// 也没产生请求 —— 怀疑它是装饰性的，真正搜索在点击后弹出的面板里。
//
// 用法：node recon/shop-search.mjs "Find X6"

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const keyword = process.argv[2] || "Find X6";

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

const api = [];
page.on("response", async (res) => {
  if (!["xhr", "fetch"].includes(res.request().resourceType())) return;
  const u = res.url();
  if (/heytapmobi|track|monitor|member\/check|configs\/web\/icons/.test(u)) return;
  let body = "";
  try {
    if (/json/.test(res.headers()["content-type"] || "")) body = (await res.text()).slice(0, 400);
  } catch {
    /* ignore */
  }
  api.push({ url: u, body });
});

// 记录所有 history 变化（SPA 路由跳转不一定有网络请求）
await page.addInitScript(() => {
  window.__navs = [];
  const wrap = (fn) => function (...a) { window.__navs.push(location.href); return fn.apply(this, a); };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
});

await page.goto("https://www.opposhop.cn/cn/web/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(6000);

const before = await page.evaluate(() => document.querySelectorAll("input").length);
await page.locator("input[placeholder]").first().click();
await sleep(2500);
const after = await page.evaluate(() =>
  [...document.querySelectorAll("input")].map((i) => ({
    ph: i.placeholder || "",
    y: Math.round(i.getBoundingClientRect().y),
    vis: !!i.offsetParent,
  }))
);
console.log(`点击前 input 数 ${before}，点击后 ${after.length}`);
for (const i of after) console.log("  ", JSON.stringify(i));

// 在可见输入框里输入
const target = page.locator("input:visible").first();
await target.fill(keyword).catch(() => {});
await sleep(2500);

console.log("\n=== 联想下拉 ===");
const sugg = await page.evaluate(() =>
  [...document.querySelectorAll("[class*=suggest], [class*=search] li, [class*=hot] a")]
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
    .filter((t) => t && t.length < 40)
    .slice(0, 15)
);
console.log(sugg.length ? sugg.join(" | ") : "(无)");

// 找放大镜按钮点击
const btns = await page.evaluate(() =>
  [...document.querySelectorAll("button, [class*=search] i, [class*=icon-search], svg")].length
);
console.log("可点按钮数:", btns);
await page.keyboard.press("Enter");
await sleep(1500);
const clicked = await page.evaluate(() => {
  const el = [...document.querySelectorAll("[class*=search]")].find((e) => /btn|button|icon/i.test(String(e.className)));
  if (el) { el.click(); return String(el.className).slice(0, 60); }
  return "(未找到搜索按钮)";
});
console.log("点击:", clicked);
await sleep(5000);

console.log("\n=== 最终 URL ===", page.url());
console.log("=== history 变化 ===", JSON.stringify(await page.evaluate(() => window.__navs || [])));
console.log("=== title ===", await page.title());

const products = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="products/"]')].map((a) => a.href.split("?")[0]))]
);
console.log(`\n=== 商品链接 ${products.length} 个 ===`);
for (const p of products.slice(0, 20)) console.log(p);

console.log("\n=== 接口 ===");
for (const a of api.slice(-10)) {
  console.log(a.url.slice(0, 160));
  if (a.body) console.log("   ", a.body.replace(/\s+/g, " ").slice(0, 300));
}

await page.screenshot({ path: "/tmp/shop-search.png" });
await browser.close();
