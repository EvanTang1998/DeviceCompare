// 验收：首页 + 参数浮窗 + 暂存区浮标（2026-09-28）
//   1. 首页：大标题、搜索框、热门机型卡片（每品牌最新 HOT_PER_BRAND 台，铺满 HOT_ROWS 行）
//   2. 操作平时不可见、hover 才浮现：「添加对比」按钮 + 一枚**跟随光标**的「查看详情」提示
//   3. 点卡片任意处都打开参数浮窗（浮窗左侧图片、右侧参数）
//   4. 浮窗**不铺满**：两侧留白、上下留空隙，尺寸小于视口
//   5. 浮窗从被点的那张卡片处放大（transform-origin 落在卡片中心），关闭时播回缩动画再卸载
//   6. 点空白处、按 Esc、点右上角 × 三种方式都能关
//   7. 「添加对比」→ 右下角出现暂存区浮标，悬停摊开已添加机型；放大后的浮标 ≥1.5 倍原尺寸，带「清空」
//   8. 点浮标进对比页，对比表第一列就是刚加的那台；顶栏「返回首页」能退回来，
//      且卡片上的「已添加」是**常显状态**（不 hover 也看得见，靠整卡底色 + 常驻按钮两处表达）
// 用法：node recon/home-detail.mjs   （需先起 dev server :5173）

import { launchBrowser, newPage, sleep } from "../lib/browser.mjs";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);
await page.setViewportSize({ width: 1680, height: 1000 });

let problems = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) problems++;
};

await page.goto("http://localhost:5173/DeviceCompare/", { waitUntil: "domcontentloaded" });
await sleep(2500);

const panelCount = () => page.locator(".detail-panel").count();
const waitClosed = async () => {
  for (let i = 0; i < 20 && (await panelCount()) > 0; i++) await sleep(100);
};

// ---------- 1. 首页结构 ----------
const title = (await page.locator(".home-title").textContent())?.trim();
const hasSearch = await page.locator(".home-search input").isVisible();
const cards = await page.locator(".hot-card").count();
// 热门机型几张是跟着视口走的（一行几列由 CSS 的 auto-fill 决定），所以断言 =
// 「网格真实列数 × HOT_ROWS」—— 直接把列数读回来，而不是在脚本里猜一个固定数字。
const hotCols = () =>
  page
    .locator(".home-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
const cols = await hotCols();
// 口径常量从 Home.jsx 取，别在这里抄一份 —— 用户调"每品牌放几台/铺几行"时脚本要自动跟上
const { hotRows, hotPoolSize } = await page.evaluate(async () => {
  const m = await import("/DeviceCompare/src/Home.jsx");
  return { hotRows: m.HOT_ROWS, hotPoolSize: m.HOT_POOL.length };
});
check(title === "灵眸", `首页大标题：${title}`);
check(hasSearch, "首页搜索框可见");
check(cards === cols * hotRows, `热门机型 ${cards} 张 = ${cols} 列 × ${hotRows} 行（池子 ${hotPoolSize} 台）`);
check(cards % hotRows === 0, `铺满 ${hotRows} 行，最后一行不留半截`);
check(!(await page.locator(".compare-grid").isVisible().catch(() => false)), "首页不渲染对比表");

// 搜索：全局过滤，且带清空按钮
await page.fill(".home-search input", "iphone17");
await sleep(400);
const hitNames = await page.locator(".hot-card-name").allTextContents();
check(hitNames.length > 0 && hitNames.every((n) => /iPhone 17/.test(n)), `搜 "iphone17" 命中 ${hitNames.length} 台且全是 iPhone 17 系`);
check((await page.locator(".home-search .overlay-search-clear").count()) === 1, "搜索框出现清空按钮");
await page.locator(".home-search .overlay-search-clear").click();
await sleep(400);
check((await page.locator(".hot-card").count()) === cols * hotRows, "清空后回到热门机型");

// ---------- 2. 操作 hover 才出现；「查看详情」跟随光标 ----------
const opacityOf = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).opacity);
const parseXY = (tf) => {
  const m = /matrix\(([^)]+)\)/.exec(tf);
  if (!m) return null;
  const p = m[1].split(",").map(Number);
  return { x: p[4], y: p[5] };
};
const hintXY = async () => parseXY(await page.locator(".cursor-hint").evaluate((el) => getComputedStyle(el).transform));

const firstCard = page.locator(".hot-card").first();
const cardBox = await firstCard.boundingBox();

const btnBefore = await opacityOf(".hot-card-actions");
const hintBefore = await opacityOf(".cursor-hint");
check(btnBefore === "0", `「添加对比」按钮默认不可见（opacity ${btnBefore}）`);
check(hintBefore === "0", `跟随提示默认不可见（opacity ${hintBefore}）`);

// 光标挪到卡片内两个位置，验提示真的跟着走
await page.mouse.move(cardBox.x + 40, cardBox.y + 40);
await sleep(320);
const btnAfter = await opacityOf(".hot-card-actions");
const hintAfter = await opacityOf(".cursor-hint");
const p1 = await hintXY();
await page.mouse.move(cardBox.x + 130, cardBox.y + 110);
await sleep(320);
const p2 = await hintXY();
check(btnAfter === "1", `鼠标移上卡片后按钮浮现（opacity ${btnAfter}）`);
check(hintAfter === "1", `鼠标移上卡片后跟随提示浮现（opacity ${hintAfter}）`);
check(
  Math.abs(p1.x - (cardBox.x + 40 + 16)) <= 3 && Math.abs(p1.y - (cardBox.y + 40 + 18)) <= 3,
  `提示落在光标右下偏移处（${Math.round(p1.x)}, ${Math.round(p1.y)}）`
);
check(
  Math.abs(p2.x - p1.x - 90) <= 3 && Math.abs(p2.y - p1.y - 70) <= 3,
  `提示跟随光标位移（鼠标走 90×70，提示走 ${Math.round(p2.x - p1.x)}×${Math.round(p2.y - p1.y)}）`
);

await page.mouse.move(20, 20);
await sleep(320);
check((await opacityOf(".cursor-hint")) === "0", "光标移出卡片后提示消失");

// 按钮比原先大了（用户反馈"略有点小"）
const btnBox = await page.locator(".hot-card").first().locator(".hot-action").boundingBox();
check(btnBox.height >= 32, `「添加对比」按钮已放大（${Math.round(btnBox.width)}×${Math.round(btnBox.height)}）`);

// ---------- 3~5. 点卡片开浮窗 ----------
const cardRect = await page.locator(".hot-card").first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
const firstName = (await page.locator(".hot-card-name").first().textContent())?.trim();
await page.locator(".hot-card").first().click({ position: { x: 60, y: 60 } });
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(400);

check((await panelCount()) === 1, "点卡片打开参数浮窗");
check((await page.locator(".detail-shot img").count()) > 0, "浮窗左侧有图片");
const specTitle = (await page.locator(".detail-name").textContent())?.trim();
check(specTitle === firstName, `浮窗右侧是同一台机：${specTitle}`);
const sectionTitles = await page.locator(".detail-section h3").allTextContents();
check(sectionTitles.includes("芯片组") && sectionTitles.includes("摄像头"), `右侧参数分区：${sectionTitles.join(" / ")}`);

const vp = page.viewportSize();
const geo = await page.locator(".detail-panel").evaluate((el) => {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
    origin: getComputedStyle(el).transformOrigin,
    transform: getComputedStyle(el).transform
  };
});
const gapLeft = Math.round(geo.left);
const gapRight = Math.round(vp.width - geo.right);
const gapTop = Math.round(geo.top);
const gapBottom = Math.round(vp.height - geo.bottom);
check(gapLeft >= 40 && gapRight >= 40, `两侧留白：左 ${gapLeft}px / 右 ${gapRight}px`);
check(gapTop >= 8 && gapBottom >= 8, `上下留空隙：上 ${gapTop}px / 下 ${gapBottom}px`);
check(geo.width < vp.width && geo.height < vp.height, `浮窗未铺满：${Math.round(geo.width)}×${Math.round(geo.height)} vs 视口 ${vp.width}×${vp.height}`);
check(geo.transform === "matrix(1, 0, 0, 1, 0, 0)", `展开到位（transform=${geo.transform}）`);

const [ox, oy] = geo.origin.split(" ").map(parseFloat);
const dx = Math.abs(geo.left + ox - cardRect.cx);
const dy = Math.abs(geo.top + oy - cardRect.cy);
check(dx < 14 && dy < 14, `放大起点落在被点卡片上（偏差 ${dx.toFixed(0)}×${dy.toFixed(0)} px）`);

// 背景模糊虚化
const blur = await page.locator(".detail-backdrop").evaluate((el) => getComputedStyle(el).backdropFilter);
check(/blur\(/.test(blur), `背板做了模糊虚化（${blur}）`);

// ---------- 6a. 关闭时播回缩动画 ----------
await page.locator(".detail-close").click();
await sleep(70);
const midTransform = (await panelCount()) ? await page.locator(".detail-panel").evaluate((el) => getComputedStyle(el).transform) : "已卸载";
check(midTransform !== "matrix(1, 0, 0, 1, 0, 0)" && midTransform !== "已卸载", `关闭时在播回缩动画（${midTransform}）`);
await waitClosed();
check((await panelCount()) === 0, "动画结束后浮窗从 DOM 移除");

// ---------- 6b. 点空白处关闭 ----------
await page.locator(".hot-card").first().click({ position: { x: 60, y: 60 } });
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(400);
await page.locator(".detail-backdrop").click({ position: { x: 12, y: 12 } });
await waitClosed();
check((await panelCount()) === 0, "点空白处关闭");

// ---------- 6c. Esc 关闭 ----------
await page.locator(".hot-card").first().click({ position: { x: 60, y: 60 } });
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(400);
await page.keyboard.press("Escape");
await waitClosed();
check((await panelCount()) === 0, "按 Esc 关闭");

// ---------- 3b. 点图片区也开浮窗（跟随提示 pointer-events:none，不吃点击） ----------
await page.locator(".hot-card").first().hover();
await sleep(300);
await page.locator(".hot-card").first().locator(".hot-card-media").click();
await page.waitForSelector(".detail-panel", { timeout: 5000 });
await sleep(400);
const viaMediaName = (await page.locator(".detail-name").textContent())?.trim();
check(viaMediaName === firstName, `点图片区打开的还是这台：${viaMediaName}`);
// 顺带验浮窗里的「加入对比」
await page.locator(".detail-add").click();
await sleep(300);
check((await page.locator(".detail-add").textContent())?.includes("已加入"), "浮窗内「加入对比」可点且回显已加入");
await page.keyboard.press("Escape");
await waitClosed();

// ---------- 7. 暂存区浮标 ----------
check((await page.locator(".compare-dock").count()) === 1, "右下角出现暂存区浮标");
check((await page.locator(".dock-count").textContent())?.trim() === "1", "浮标计数为 1");

// 整体放大过：主按钮高度应在 60px 以上（原来 46px，1.5 倍后 68px）
const dockBox = await page.locator(".dock-btn").boundingBox();
check(dockBox.height >= 60, `浮标主按钮已放大（高 ${Math.round(dockBox.height)}px）`);
const dockFont = await page
  .locator(".dock-btn span")
  .first()
  .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
check(dockFont >= 18, `浮标文字同步放大（${dockFont}px）`);

const listHidden = await page.locator(".dock-list").evaluate((el) => getComputedStyle(el).visibility);
await page.locator(".dock-btn").hover();
await sleep(400);
const listShown = await page.locator(".dock-list").evaluate((el) => getComputedStyle(el).visibility);
const dockNames = await page.locator(".dock-item-name").allTextContents();
check(listHidden === "hidden", `浮标清单默认隐藏（${listHidden}）`);
check(listShown === "visible", `鼠标移上后摊开（${listShown}）`);
check(dockNames.length === 1 && dockNames[0] === firstName, `清单里是刚加的那台：${dockNames.join("、")}`);
check((await page.locator(".dock-clear").count()) === 1, "清单里有「清空」按钮");
const thumbBox = await page.locator(".dock-thumb").first().boundingBox();
check(thumbBox.height >= 46, `清单缩略图同步放大（高 ${Math.round(thumbBox.height)}px）`);

// ---------- 8. 进对比页 ----------
await page.locator(".dock-btn").click();
await sleep(700);
check(await page.locator(".compare-grid").isVisible(), "点浮标进入对比页");
const headerName = (await page.locator(".header-cell .picker-model-btn").first().textContent())?.trim();
// 按钮文案里带一个下拉三角（.caret），所以用包含判断
check(headerName?.includes(firstName), `对比表第一列就是它：${headerName?.replace(/▾$/, "")}`);

// ---------- 9. 退出对比页 → 回首页看「已添加」状态 ----------
check((await page.locator(".back-home").count()) === 1, "对比页顶栏有「返回首页」按钮");
// 放大过的返回按钮：44px 是触摸目标的下限，比原 30px 明显好点
const backBox = await page.locator(".back-home").boundingBox();
check(backBox.height >= 42, `「返回首页」已放大（高 ${Math.round(backBox.height)}px）`);
await page.locator(".back-home").click();
await sleep(700);
check(!(await page.locator(".compare-grid").isVisible().catch(() => false)), "点「返回首页」退出了对比页");

// 「已添加」是**状态**：整卡换底 + 底部按钮常驻，两处表达同一件事；
// 右上角那枚徽标已删（和底部按钮重复）
check((await page.locator(".hot-card-added").count()) === 0, "已删掉右上角那枚重复的「已添加」徽标");
const firstCard2 = page.locator(".hot-card").first();
check(
  await firstCard2.evaluate((el) => el.classList.contains("is-added")),
  "该卡片整体带上 is-added 标记"
);
const [addedBg, plainBg] = await page.evaluate(() => {
  const all = [...document.querySelectorAll(".hot-card")];
  const pick = (el) => `${getComputedStyle(el).backgroundImage}|${getComputedStyle(el).backgroundColor}`;
  const a = all.find((el) => el.classList.contains("is-added"));
  const b = all.find((el) => !el.classList.contains("is-added"));
  return a && b ? [pick(a), pick(b)] : [null, null];
});
check(Boolean(addedBg) && Boolean(plainBg) && addedBg !== plainBg, "已添加卡片的底色与未添加的明显不同");
check(/gradient/.test(addedBg ?? ""), "已添加卡片用的是渐变底色（更醒目）");

// 按钮常显：不 hover 也得看得见（用户反馈"添加后看不出来"）
await page.mouse.move(20, 20);
await sleep(350);
const addOpacity = await firstCard2.locator(".hot-card-actions").evaluate((el) => getComputedStyle(el).opacity);
const addLabel = (await firstCard2.locator(".hot-card-actions button").first().textContent())?.trim();
check(addOpacity === "1", `未 hover 时「已添加」按钮也常显（opacity ${addOpacity}）`);
check(addLabel === "已添加", `按钮文案：${addLabel}`);

// 对照：没加入对比的卡片，操作仍然是 hover 才出现
const plainOpacity = await page
  .locator(".hot-card")
  .nth(cols)
  .locator(".hot-card-actions")
  .evaluate((el) => getComputedStyle(el).opacity);
check(plainOpacity === "0", `未添加的卡片按钮依旧 hover 才出现（opacity ${plainOpacity}）`);

// 再点一次那个常显按钮 = 取消
await firstCard2.hover();
await sleep(300);
await firstCard2.locator(".hot-card-actions button").first().click();
await sleep(400);
check((await page.locator(".compare-dock").count()) === 0, "取消后浮标消失");
check((await page.locator(".hot-card.is-added").count()) === 0, "取消后卡片的已添加态一并消失");

// ---------- 10. 「清空」：一次撤完 ----------
await page.locator(".hot-card").first().hover();
await sleep(300);
await page.locator(".hot-card").first().locator(".hot-action").click();
await sleep(400);
check((await page.locator(".dock-count").textContent())?.trim() === "1", "重新加一台，浮标回来了");
await page.locator(".dock-btn").hover();
await sleep(350);
await page.locator(".dock-clear").click();
await sleep(400);
check((await page.locator(".compare-dock").count()) === 0, "点「清空」后浮标消失");
check((await page.locator(".hot-card.is-added").count()) === 0, "「清空」后所有卡片的已添加态一并消失");

await page.screenshot({ path: "/tmp/home-detail.png", fullPage: false });
console.log(problems ? `\n${problems} 项未通过` : "\n全部通过");
await browser.close();
process.exit(problems ? 1 : 0);
