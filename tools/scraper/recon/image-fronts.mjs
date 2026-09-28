// 验收：图片机位改版 + 弹框系列折叠（2026-09-24）
//   1. 华为机型：每色轮播 = [分色背面图, vmall 正背组合图]，点「下一张」能看到正面
//   2. OPPO 机型：每色单图（正面+背面组合图），不再有侧面角度图
//   3. 弹框：系列默认只铺 2 行（末格「显示更多」），点击展开/收起；搜索态不折叠
// 用法：node recon/image-fronts.cjs   （需先起 dev server :5173）

import { launchBrowser, newPage, sleep } from "../lib/browser.mjs";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);
let problems = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) problems++;
};

await page.goto("http://localhost:5173/DeviceCompare/", { waitUntil: "domcontentloaded" });
await sleep(2500);

// 首页成为入口后，对比表默认是空的（机型得由用户从首页加进来），
// 所以先按真实路径铺满 4 列：点卡片上的「添加对比」，再切到对比页
for (let i = 0; i < 4; i++) {
  await page.locator(".hot-card").nth(i).locator(".hot-card-actions button").first().click();
  await sleep(200);
}
await page.locator(".nav-compare-btn").click();
await sleep(900);

const pick = async (i, q) => {
  await page.locator(".image-swap-btn").nth(i).click();
  await sleep(700);
  await page.fill(".overlay-header input", q);
  await sleep(400);
  await page.locator('.model-card-name:text-is("' + q + '")').first().click();
  await sleep(1500);
};

// 1. 华为：第 1 列 Mate 80 Pro Max —— 轮播 2 张，第 2 张是正背组合图
await pick(0, "HUAWEI Mate 80 Pro Max");
const dots = await page.locator(".phone-header").nth(0).locator(".carousel-dot").count();
check(dots === 2, `华为轮播圆点数 = 2（实际 ${dots}）`);
const src0 = await page.locator(".phone-header").nth(0).locator(".phone-image img").first().getAttribute("src");
check(/huawei-mate80-pro-max\.[a-z]+\.(?:jpg|png)$/.test(src0), `第 1 张是分色图（${src0.split("/").pop()}）`);
await page.locator(".phone-header").nth(0).locator(".carousel-btn.is-next").click();
await sleep(900);
const src1 = await page.locator(".phone-header").nth(0).locator(".phone-image img").first().getAttribute("src");
check(/huawei-mate80-pro-max\.jpg$/.test(src1), `第 2 张是正背组合图（${src1.split("/").pop()}）`);
const nat = await page
  .locator(".phone-header")
  .nth(0)
  .locator(".phone-image img")
  .first()
  .evaluate((el) => el.naturalWidth);
check(nat > 0, `组合图加载成功（naturalWidth=${nat}）`);

// 2. OPPO：第 2 列 Find X9 Pro —— 单图（无轮播），文件名不带角度号
await pick(1, "OPPO Find X9 Pro");
const dotsOppo = await page.locator(".phone-header").nth(1).locator(".carousel-dot").count();
check(dotsOppo === 0, `OPPO 无角度轮播（圆点 ${dotsOppo}）`);
const srcOppo = await page.locator(".phone-header").nth(1).locator(".phone-image img").first().getAttribute("src");
check(/oppo-find-x9-pro\.[a-z]+\.jpg$/.test(srcOppo), `OPPO 单图无角度号（${srcOppo.split("/").pop()}）`);

// 3. 弹框折叠：点第 3 列选择器 → 品牌选华为 → Mate 系列折叠
await page.locator(".image-swap-btn").nth(2).click();
await sleep(700);
await page.locator(".brand-chip:text-is('华为')").click();
await sleep(700);

const firstGridCards = async () => {
  const grid = page.locator(".overlay-series-title:text-is('Mate 系列') + .model-grid");
  return {
    cards: await grid.locator(".model-card:not(.model-card-more)").count(),
    more: await grid.locator(".model-card-more").count(),
    moreText: (await grid.locator(".model-card-more .model-card-name").first().innerText().catch(() => "")) || "",
  };
};
const folded = await firstGridCards();
check(folded.more === 1 && folded.moreText === "显示更多", `Mate 系列折叠态有「显示更多」（实际 ${folded.moreText || "无"}）`);
check(folded.cards > 0 && folded.cards < 15, `折叠态卡片数有限（${folded.cards} 张）`);

await page.locator(".overlay-series-title:text-is('Mate 系列') + .model-grid .model-card-more").first().click();
await sleep(500);
const expanded = await firstGridCards();
check(expanded.moreText === "收起", `展开后变「收起」（实际 ${expanded.moreText || "无"}）`);
check(expanded.cards === 15, `展开后 Mate 系列全量 15 台（实际 ${expanded.cards}）`);

await page.locator(".overlay-series-title:text-is('Mate 系列') + .model-grid .model-card-more").first().click();
await sleep(500);
const refolded = await firstGridCards();
check(refolded.moreText === "显示更多" && refolded.cards === folded.cards, "再点一次恢复折叠");

// 4. 搜索态不折叠：搜「Pura」应看到全部 Pura 机型、无「显示更多」
await page.fill(".overlay-header input", "Pura");
await sleep(600);
const searchMore = await page.locator(".overlay-body .model-card-more").count();
check(searchMore === 0, `搜索态无「显示更多」（实际 ${searchMore}）`);
const puraCards = await page.locator(".overlay-body .model-card").count();
check(puraCards === 8, `搜索 Pura 结果 8 台（实际 ${puraCards}）`);

await page.screenshot({ path: "/tmp/recon-fronts-overlay.png", fullPage: false });
await page.keyboard.press("Escape");
await sleep(500);

console.log(problems ? `\n共 ${problems} 个问题` : "\n全部通过");
await browser.close();
process.exit(problems ? 1 : 0);
