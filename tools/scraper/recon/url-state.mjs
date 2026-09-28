// 验收：地址栏状态同步（2026-09-28）
//   1. 首页无参数；加机型只改当前地址（replaceState），不产生历史
//   2. 换页（首页↔对比页、浮窗开合）压历史，所以浏览器**后退键真的能用**
//   3. 关浮窗走 history.back()，不会在"开/关"之间来回弹
//   4. 分享链接：直接打开 ?cart=...&view=compare 就是那一屏；?phone=... 直接开浮窗
//   5. 刷新后状态保持（地址就是状态的载体）
//   6. 脏链接（不存在的 id）会被清洗掉，不留一条脏地址在历史里
// 用法：node recon/url-state.mjs   （需先起 dev server :5173）
//
// 为什么单独验：ssr-check 只在 Node 里渲染一次树，碰不到 history / popstate；
// 而"后退键能不能用"恰恰是这个功能的核心，只能靠真浏览器。

import { launchBrowser, newPage, sleep } from "../lib/browser.mjs";

const BASE = "http://localhost:5173/DeviceCompare/";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);
await page.setViewportSize({ width: 1680, height: 1000 });

let problems = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) problems++;
};

const search = () => page.evaluate(() => location.search);
const histLen = () => page.evaluate(() => history.length);

// ---------- 1. 干净打开 ----------
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await sleep(2400);
check((await search()) === "", `干净打开首页时地址无参数（"${await search()}"）`);

// 期望值不另写一份：直接在页面里 import 应用自己的 data.js（必须在 goto 之后，否则模块解析不到）
const ids = await page.evaluate(async () => {
  const m = await import("/DeviceCompare/src/data.js");
  return m.phones.slice(0, 4).map((p) => p.id);
});

// ---------- 2. 加机型：只 replace，不压历史 ----------
const addCard = async (i) => {
  const c = page.locator(".hot-card").nth(i);
  await c.hover();
  await sleep(200);
  await c.locator(".hot-action").click();
  await sleep(300);
};

const h0 = await histLen();
await addCard(0);
await addCard(1);
check((await search()) === `?cart=${ids[0]},${ids[1]}`, `加两台后地址变成 ?cart=...（"${await search()}"）`);
check((await histLen()) === h0, `加机型不产生历史（历史条数保持 ${h0}）`);

// ---------- 3. 进对比页：压历史，后退能用 ----------
await page.locator(".nav-compare-btn").click();
await sleep(700);
check(
  (await search()) === `?cart=${ids[0]},${ids[1]}&view=compare`,
  `进对比页地址带上 view（"${await search()}"）`
);
const h1 = await histLen();
check(h1 === h0 + 1, `进对比页压了一条历史（${h0} → ${h1}）`);

await page.goBack();
await sleep(600);
check(!(await page.locator(".compare-grid").isVisible().catch(() => false)), "浏览器后退键能退出对比页");
check((await search()) === `?cart=${ids[0]},${ids[1]}`, "后退后暂存区还在（cart 没丢）");
check((await page.locator(".dock-count").textContent())?.trim() === "2", "后退后暂存区计数仍是 2");

await page.goForward();
await sleep(600);
check(await page.locator(".compare-grid").isVisible(), "前进键能回到对比页");

// 回首页（走界面上的按钮，不是后退键）
await page.locator(".back-home").click();
await sleep(600);
check((await search()) === `?cart=${ids[0]},${ids[1]}`, "点「返回首页」后地址只剩 cart");

// ---------- 4. 浮窗：开压历史、关退回 ----------
const h2 = await histLen();
await page.locator(".hot-card").first().click({ position: { x: 60, y: 60 } });
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(500);
check((await search()) === `?cart=${ids[0]},${ids[1]}&phone=${ids[0]}`, `开浮窗后地址带 phone（"${await search()}"）`);
const h3 = await histLen();
check(h3 === h2 + 1, `开浮窗压了一条历史（${h2} → ${h3}）`);

await page.locator(".detail-close").click();
await sleep(900);
check((await page.locator(".detail-panel").count()) === 0, "浮窗已关闭");
check((await search()) === `?cart=${ids[0]},${ids[1]}`, `关浮窗后 phone 从地址里消失（"${await search()}"）`);

// 怎么证明关浮窗是「退回去」而不是「再压一条」：
// 不能用 history.length —— 后退**不会**让它变短，它只是把游标往回挪，前方那一条还留着。
// 真正的证据是"前进键还能把它打开"：压一条新的会把前方向的历史截断，前进就没得可走了。
await page.goForward();
await sleep(900);
check(
  (await page.locator(".detail-panel").count()) === 1 &&
    (await search()) === `?cart=${ids[0]},${ids[1]}&phone=${ids[0]}`,
  "关浮窗是退回去而非再压一条（前进键能重新打开它）"
);

await page.goBack();
await sleep(900);
check((await page.locator(".detail-panel").count()) === 0, "再后退一次，浮窗又关上");

// 从关闭态再按后退：应该退到上一条（对比页），而不是把浮窗弹出来
await page.goBack();
await sleep(900);
check(!(await page.locator(".detail-panel").count()), "关浮窗后按后退不会又把浮窗弹出来");

// ---------- 4b. 浮窗里加机型再关浮窗：暂存区不能被后退清空 ----------
// 这是这套机制最容易踩的坑：关浮窗走的是 back()，会落到"打开浮窗之前"那条历史上，
// 而那条历史是**当时**的快照、里面还没有 cart —— 照搬就等于把用户刚挑的机型清掉。
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await sleep(2400);
await page.locator(".hot-card").first().click({ position: { x: 60, y: 60 } });
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(500);
await page.locator(".detail-add").click();
await sleep(400);
await page.locator(".detail-close").click();
await sleep(1000);
check((await page.locator(".detail-panel").count()) === 0, "浮窗已关闭（点浮窗内按钮加机型后）");
check(
  (await page.locator(".dock-count").textContent())?.trim() === "1",
  "浮窗里加入对比、关窗后暂存区仍在（没被后退清空）"
);
check((await search()) === `?cart=${ids[0]}`, `地址栏也补上了 cart（"${await search()}"）`);

// 再按后退：暂存区同样不该消失（后退只还原"在哪一页"，不还原"挑过哪几台"）。
// 注意必须先做一次**同文档内**的 push（点「对比表」）再后退 —— 上面那次 page.goto 是整份文档加载，
// 直接 goBack 会跨文档回到上一个 document，整个应用重新初始化、cart 从地址里重新读，
// 那样验的就不是"后退时的取舍"，而是"重新打开"，会给出假绿灯。
await page.locator(".nav-compare-btn").click();
await sleep(700);
check((await search()) === `?cart=${ids[0]}&view=compare`, "进对比页时把当前 cart 一起带上");
await page.goBack();
await sleep(900);
check(!(await page.locator(".compare-grid").isVisible().catch(() => false)), "后退回到首页");
check(
  (await page.locator(".dock-count").textContent())?.trim() === "1",
  "后退后暂存区仍是 1 台（没被清空）"
);
check((await search()) === `?cart=${ids[0]}`, `后退后地址只剩 cart（"${await search()}"）`);

// ---------- 5. 分享链接：直接打开 ----------
const shareUrl = `${BASE}?cart=${ids[0]},${ids[2]}&view=compare`;
await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
await sleep(2400);
check(await page.locator(".compare-grid").isVisible(), "分享链接直接落在对比页");
const names = await page.evaluate(async (want) => {
  const m = await import("/DeviceCompare/src/data.js");
  return want.map((id) => m.phones.find((p) => p.id === id)?.name);
}, [ids[0], ids[2]]);
const shown = (await page.locator(".header-cell .picker-model-btn").allTextContents()).map((s) =>
  s.replace(/▾$/, "").trim()
);
check(shown.length === 2, `对比页正好 2 列（实际 ${shown.length}）`);
check(
  shown[0] === names[0] && shown[1] === names[1],
  `两列就是链接里指定的机型：${shown.join(" / ")}`
);

// 暂存区在对比页不渲染浮标（人已经站在对比页上了），回首页再看它有没有被链接恢复
await page.locator(".back-home").click();
await sleep(700);
check(
  (await page.locator(".dock-count").textContent())?.trim() === "2",
  "暂存区也按链接恢复成 2 台"
);

// 浮窗分享链接
await page.goto(`${BASE}?cart=${ids[0]}&phone=${ids[1]}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(500);
check((await page.locator(".detail-panel").count()) === 1, "分享链接能直接打开参数浮窗");
const overlayName = (await page.locator(".detail-name").textContent())?.trim();
const expectName = await page.evaluate(async (id) => {
  const m = await import("/DeviceCompare/src/data.js");
  return m.phones.find((p) => p.id === id)?.name;
}, ids[1]);
check(overlayName === expectName, `浮窗里就是链接指定的那台：${overlayName}`);

// ---------- 6. 刷新：状态保持 ----------
await page.reload({ waitUntil: "domcontentloaded" });
await sleep(2400);
check((await page.locator(".detail-panel").count()) === 1, "刷新后浮窗还在");
check((await search()) === `?cart=${ids[0]}&phone=${ids[1]}`, `刷新后地址不变（"${await search()}"）`);

await page.goto(`${BASE}?cart=${ids[0]},${ids[1]}&view=compare`, { waitUntil: "domcontentloaded" });
await sleep(2400);
await page.reload({ waitUntil: "domcontentloaded" });
await sleep(2400);
check(await page.locator(".compare-grid").isVisible(), "刷新后仍停在对比页");
check(
  (await page.locator(".header-cell .picker-model-btn").count()) === 2,
  "刷新后两列机型都还在"
);

// ---------- 7. 脏链接清洗 ----------
await page.goto(`${BASE}?cart=nope-1,${ids[0]},${ids[0]}&view=compare&phone=nope-2`, {
  waitUntil: "domcontentloaded"
});
await sleep(2400);
check(
  (await search()) === `?cart=${ids[0]}&view=compare`,
  `不存在的 id 与重复 id 都被洗掉（"${await search()}"）`
);
check((await page.locator(".header-cell").count()) === 1, "只剩一个合法列");

// 超上限：塞 6 个也只留 4 个
await page.goto(`${BASE}?cart=${ids.join(",")},${ids[0]},${ids[1]}`, { waitUntil: "domcontentloaded" });
await sleep(2400);
check(
  (await search()) === `?cart=${ids.join(",")}`,
  `超过 4 台被截到上限（"${await search()}"）`
);

console.log(problems ? `\n${problems} 项未通过` : "\n全部通过");
await browser.close();
process.exit(problems ? 1 : 0);
