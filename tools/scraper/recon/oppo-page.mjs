// 验收：OPPO 机型在对比页的轮播与新参数分区
// 用法：node recon/oppo-page.mjs   （需先起 dev server :5173）

import { launchBrowser, newPage, sleep } from "../lib/browser.mjs";

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

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

// 第一个槽位选 OPPO Find N6
// 浏览态每品牌只铺 4 台，Find N6 不一定在精选里，用弹框里的搜索定位
await page.locator(".image-swap-btn").first().click();
await sleep(800);
await page.fill(".overlay-header input", "Find N6");
await sleep(400);
await page.locator('.model-card-name:text-is("OPPO Find N6")').first().click();
await sleep(1500);

const r = {};

// 图片：2026-09-24 起 OPPO 每色只入库一张「正面+背面」组合图，所以**不该有轮播**。
// 这里改成验真正有意义的交互：切配色要换图，且换到的是该配色自己的那张。
r.carouselBtns = await page.locator(".phone-header").first().locator(".carousel-btn").count();
r.dots = await page.locator(".phone-header").first().locator(".carousel-dot").count();
const img1 = await page.locator(".phone-header").first().locator(".phone-image img").first().getAttribute("src");
await page.locator(".phone-header").first().locator(".swatch").nth(1).click();
await sleep(600);
const img2 = await page.locator(".phone-header").first().locator(".phone-image img").first().getAttribute("src");
r.colorSwapWorks = img1 !== img2;
r.img1 = img1.split("/").pop();
r.img2 = img2.split("/").pop();

// 新分区
for (const title of ["副屏", "系统与连接"]) {
  r[`section_${title}`] = (await page.locator(`.section-head h2:text-is("${title}")`).count()) > 0;
}
// 折叠态尺寸行
r.foldedRow = (await page.locator('.label-cell:text-is("折叠态尺寸")').count()) > 0;
for (const label of ["操作系统", "指纹识别", "SIM 卡", "网络频段", "卫星通信", "NFC"]) {
  r[`row_${label}`] = (await page.locator(`.label-cell:text-is("${label}")`).count()) > 0;
}

console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: "/tmp/oppo-page.png", fullPage: false });
await browser.close();
