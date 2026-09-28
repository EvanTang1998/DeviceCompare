// 验收：三项 UI 修复
//   1. 查不到的参数不出现「未公开」这类占位文案
//   2. 切配色时立刻有 loading 反馈（用 CDP 限速放大等待，模拟真实弱网）
//   3. 删除一列后，空位列是浅色圆圈加号，点击进入机型选择弹框
// 用法：node recon/ui-fixes.mjs   （需先起 dev server :5173，限速只作用于浏览器）

import { launchBrowser, newPage, sleep } from "../lib/browser.mjs";

const URL = "http://localhost:5173/DeviceCompare/";
const problems = [];

const browser = await launchBrowser({ headless: true });
const { context, page } = await newPage(browser);

// ---------- 0. 先正常加载页面 ----------
await page.goto(URL, { waitUntil: "domcontentloaded" });
await sleep(2500);

// 首页成为入口后，对比表默认是空的（机型得由用户从首页加进来），
// 所以先按真实路径铺满 4 列：点卡片上的「添加对比」，再切到对比页
for (let i = 0; i < 4; i++) {
  await page.locator(".hot-card").nth(i).locator(".hot-card-actions button").first().click();
  await sleep(200);
}
await page.locator(".nav-compare-btn").click();
await sleep(900);

// 第一列换成 OPPO Find N6（多配色 + 多角度，便于验切色）
// 浏览态每品牌只铺 4 台，Find N6 不一定在精选里，用搜索定位
await page.locator(".image-swap-btn").first().click();
await sleep(800);
await page.fill(".overlay-header input", "Find N6");
await sleep(400);
await page.locator('.model-card-name:text-is("OPPO Find N6")').first().click();
await sleep(1500);

// ---------- 1. 页面不应出现「未公开」 ----------
const bodyText = await page.locator("body").innerText();
for (const word of ["未公开", "未公布", "暂无", "待补充"]) {
  if (bodyText.includes(word)) problems.push(`页面出现占位文案「${word}」`);
}
// 缺参数的机型（vivo X300 后置镜头官网不写传感器型号）不该多出一行空文本
const camCells = await page.locator(".section-row").allInnerTexts();
if (camCells.some((t) => /未公开/.test(t))) problems.push("参数表里仍有「未公开」");

// ---------- 2. 切配色的 loading 反馈 ----------
const header = page.locator(".phone-header").first();
const swatches = header.locator(".swatch");
const swatchCount = await swatches.count();
if (swatchCount < 2) problems.push(`第一列配色数 ${swatchCount} < 2，无法验切色`);

const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
// 限速到 ~300KB/s、延迟 300ms，并禁用缓存强制真下载：
// 接近用户反映的「点完要等好几秒」，否则本地缓存命中会快到看不见 loading
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 300,
  downloadThroughput: 300 * 1024,
  uploadThroughput: 300 * 1024
});

const before = await header.locator(".phone-image img").first().getAttribute("src");
await swatches.nth(1).click();

// 点完立刻查 loading 是否出现（0.5s 内）
let loadingSeen = false;
let loadingText = null;
for (let i = 0; i < 10; i++) {
  const n = await header.locator(".image-loading").count();
  if (n > 0) {
    loadingSeen = true;
    loadingText = (await header.locator(".image-loading").first().innerText()).replace(/\s+/g, " ").trim();
    break;
  }
  await sleep(50);
}
if (!loadingSeen) problems.push("切配色后 0.5s 内没有出现 loading 提示");
else if (!/loading/i.test(loadingText ?? "")) problems.push(`loading 提示文案异常：${loadingText}`);

// 图到位后 loading 应消失，且 src 已换
let loadingGoneAt = null;
const t0 = Date.now();
for (let i = 0; i < 120; i++) {
  if ((await header.locator(".image-loading").count()) === 0) {
    loadingGoneAt = Date.now() - t0;
    break;
  }
  await sleep(100);
}
if (loadingGoneAt === null) problems.push("图片加载完后 loading 提示一直不消失");
const after = await header.locator(".phone-image img").first().getAttribute("src");
if (before === after) problems.push("切配色后图片 src 没变");

// 复原网络
await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1
});
await sleep(500);

// ---------- 3. 删除一列 → 空位列圆圈加号 → 点开弹框加回来 ----------
const headersBefore = await page.locator(".phone-header").count();
const ghostsBefore = await page.locator(".ghost-col").count();
await page.locator(".remove-slot-btn").last().click();
await sleep(400);

const headersAfterRemove = await page.locator(".phone-header").count();
const ghostsAfterRemove = await page.locator(".ghost-col").count();
if (headersAfterRemove !== headersBefore - 1) problems.push(`删除后列数 ${headersAfterRemove} ≠ ${headersBefore - 1}`);
if (ghostsAfterRemove !== ghostsBefore + 1) problems.push(`删除后空位列 ${ghostsAfterRemove} ≠ ${ghostsBefore + 1}`);

const plus = await page.locator(".ghost-plus").count();
if (plus !== ghostsAfterRemove) problems.push(`圆圈加号数 ${plus} ≠ 空位列数 ${ghostsAfterRemove}`);

// 点空位列 → 应弹出机型选择弹框
await page.locator(".ghost-col").first().click();
await sleep(600);
const overlayOpen = await page.locator(".overlay-backdrop").count();
if (overlayOpen === 0) problems.push("点空位列没有弹出机型选择弹框");

// 选一台 → 列数应补回，空位列消失
let picked = null;
if (overlayOpen > 0) {
  const cards = page.locator(".overlay-panel .model-card:not(.model-card-more)");
  const n = await cards.count();
  // 避开已在对比里的机型：挑一个名字不在当前列的（机型名在列内选择器按钮上）
  const inUse = await page.locator(".phone-header .picker-model-btn > span").allInnerTexts();
  for (let i = 0; i < Math.min(n, 30); i++) {
    const name = (await cards.nth(i).locator(".model-card-name").innerText()).trim();
    if (!inUse.includes(name)) {
      await cards.nth(i).click();
      picked = name;
      break;
    }
  }
  await sleep(800);
  const headersFinal = await page.locator(".phone-header").count();
  if (headersFinal !== headersBefore) problems.push(`空位列里选机型后列数 ${headersFinal} ≠ ${headersBefore}`);
  const ghostsFinal = await page.locator(".ghost-col").count();
  if (ghostsFinal !== ghostsBefore) problems.push(`补回一列后空位列 ${ghostsFinal} ≠ ${ghostsBefore}`);
}

await page.screenshot({ path: "/tmp/ui-fixes.png", fullPage: false });

console.log(
  JSON.stringify(
    {
      swatchCount,
      loadingSeen,
      loadingText,
      loadedAfterMs: loadingGoneAt,
      imageChanged: before !== after,
      ghostsBefore,
      ghostsAfterRemove,
      plusCircles: plus,
      overlayOpen,
      picked,
      headerCount: await page.locator(".phone-header").count(),
      problems
    },
    null,
    1
  )
);

await browser.close();
process.exit(problems.length ? 1 : 0);
