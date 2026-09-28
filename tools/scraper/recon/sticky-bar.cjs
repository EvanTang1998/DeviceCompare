// 端到端验证：置顶机型栏的按钮点击后弹出「机型选择弹框」（而不是就地展开的下拉）
// 前置：dev server 已起在 5173（在项目根跑 npm run dev）
//
// 用法：node recon/sticky-bar.cjs
//
// 为什么单独验：置顶栏只在「表头滚出视口」后才挂载，ssr-check 的整树渲染碰不到它；
// 而「点按钮弹什么」是交互契约，必须真点一次才算数。
//
// 断言：
// 1. 滚动越过表头后置顶栏出现，按钮文案 = 各列当前机型名
// 2. 点按钮 → 出现 .overlay-panel（弹框），且**不**出现旧的 .model-menu（下拉）与 .model-menu-backdrop
// 3. 弹框里当前机型卡片带 is-active（值的透传正确）
// 4. 选另一台 → 置顶栏该列文案与列头机型名同步更新，弹框关闭
// 5. Esc 能关掉弹框且不改动机型
const { chromium } = require("playwright-core");

const URL = "http://localhost:5173/DeviceCompare/";
const SHOT = "/tmp/sticky-bar.png";

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const pg = await b.newPage({ viewport: { width: 1680, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: "networkidle" });

  const problems = [];
  const sleep = (ms) => pg.waitForTimeout(ms);

  // 首页成为入口后，对比表默认是空的（机型得由用户从首页加进来），
  // 所以先按真实路径铺满 4 列：点卡片上的「添加对比」，再切到对比页。
  for (let i = 0; i < 4; i += 1) {
    await pg.locator(".hot-card").nth(i).locator(".hot-card-actions button").first().click();
    await sleep(200);
  }
  await pg.locator(".nav-compare-btn").click();
  await sleep(900);

  // ---------- 1. 滚动到出现置顶栏 ----------
  await pg.evaluate(() => window.scrollTo(0, 900));
  await sleep(400);
  const barCount = await pg.locator(".picker-bar").count();
  if (barCount !== 1) problems.push(`滚动后置顶栏数量 ${barCount} ≠ 1`);

  const cellLabel = async (i) =>
    (await pg.locator(".picker-bar .model-select-btn").nth(i).locator("span").first().innerText()).trim();
  // 列头的机型名在列内选择器的按钮上（.phone-header 里没有单独的机型名节点）
  const headerLabel = async (i) =>
    (
      await pg
        .locator(".phone-header")
        .nth(i)
        .locator(".picker-model-btn > span")
        .first()
        .innerText()
        .catch(() => "")
    ).trim();

  const beforeLabels = [];
  const cells = await pg.locator(".picker-bar .model-select-btn").count();
  for (let i = 0; i < cells; i++) beforeLabels.push(await cellLabel(i));
  if (beforeLabels.some((n) => !n || n === "—")) problems.push(`置顶栏有空格子：${beforeLabels.join(" / ")}`);
  console.log(`置顶栏 ${cells} 列：${beforeLabels.join(" / ")}`);

  // ---------- 2. 点第 2 列按钮 → 应弹「弹框」而不是「下拉」 ----------
  const TARGET = 1;
  await pg.locator(".picker-bar .model-select-btn").nth(TARGET).click();
  await sleep(500);

  const overlay = await pg.locator(".overlay-panel").count();
  const dropdown = await pg.locator(".model-menu").count();
  const dropdownBackdrop = await pg.locator(".model-menu-backdrop").count();
  if (overlay === 0) problems.push("点置顶栏按钮没有弹出机型选择弹框（.overlay-panel 缺失）");
  if (dropdown > 0) problems.push(`点置顶栏按钮仍展开了旧下拉（.model-menu 出现 ${dropdown} 次）`);
  if (dropdownBackdrop > 0) problems.push(`出现了旧下拉的遮罩 .model-menu-backdrop（${dropdownBackdrop} 次）`);
  if (overlay > 0) console.log(`点第 ${TARGET + 1} 列 → 弹框已打开（旧下拉未出现）`);

  // ---------- 3. 弹框里当前机型应标记为选中 ----------
  const activeName = (
    await pg.locator(".overlay-panel .model-card.is-active .model-card-name").first().innerText().catch(() => "")
  ).trim();
  if (activeName !== beforeLabels[TARGET]) {
    problems.push(`弹框里高亮的机型 ${activeName || "(无)"} ≠ 该列当前机型 ${beforeLabels[TARGET]}`);
  }
  const modal = await pg.locator(".overlay-panel").first().getAttribute("aria-modal");
  if (modal !== "true") problems.push(`弹框 aria-modal=${modal} ≠ true`);

  // ---------- 4. 选另一台 → 置顶栏与列头同步更新，弹框关闭 ----------
  const usedNames = await pg.locator(".phone-header .picker-model-btn > span").allInnerTexts();
  const cards = pg.locator(".overlay-panel .model-card:not(.model-card-more)");
  const n = await cards.count();
  let picked = null;
  for (let i = 0; i < n; i++) {
    if (i > 40) break; // 浏览态只铺每品牌 4 台，够用了
    const name = (await cards.nth(i).locator(".model-card-name").innerText()).trim();
    if (!usedNames.map((s) => s.trim()).includes(name) && !name.includes("查看更多")) {
      picked = name;
      await cards.nth(i).click();
      break;
    }
  }
  await sleep(700);

  if (!picked) {
    problems.push("弹框里没找到「当前未在对比中」的机型可点");
  } else {
    const afterCell = await cellLabel(TARGET);
    const afterHeader = await headerLabel(TARGET);
    if (afterCell !== picked) problems.push(`选完后置顶栏第 ${TARGET + 1} 列文案 ${afterCell} ≠ 所选 ${picked}`);
    if (!afterHeader.includes(picked)) problems.push(`选完后列头机型 ${afterHeader} 未同步为 ${picked}`);
    const stillOpen = await pg.locator(".overlay-panel").count();
    if (stillOpen !== 0) problems.push("选完机型后弹框没有关闭");
    console.log(`第 ${TARGET + 1} 列：${beforeLabels[TARGET]} → ${afterCell}（列头同步：${afterHeader}）`);
  }

  await pg.screenshot({ path: SHOT });

  // ---------- 5. Esc 关闭且不改机型 ----------
  await pg.locator(".picker-bar .model-select-btn").nth(0).click();
  await sleep(400);
  const openAgain = await pg.locator(".overlay-panel").count();
  if (openAgain === 0) problems.push("第二次点按钮没有弹出弹框");
  const keep = await cellLabel(0);
  await pg.keyboard.press("Escape");
  await sleep(400);
  const closed = await pg.locator(".overlay-panel").count();
  if (closed !== 0) problems.push("Esc 没有关闭弹框");
  if ((await cellLabel(0)) !== keep) problems.push("Esc 关闭弹框后机型被意外改动");

  console.log(`\n页面报错：${errs.length ? errs.join(" | ") : "无"}`);
  console.log(`问题：${problems.length}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`截图：${SHOT}`);

  await b.close();
  process.exit(problems.length || errs.length ? 1 : 0);
})().catch((e) => {
  console.error("RUNTIME ERROR:", e);
  process.exit(1);
});
