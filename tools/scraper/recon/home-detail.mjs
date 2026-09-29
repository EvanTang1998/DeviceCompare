// 验收：首页 + 参数浮窗 + 暂存区浮标（2026-09-28）
//   1. 首页：大标题、搜索框、热门机型卡片（每品牌最新 HOT_PER_BRAND 台，铺满 HOT_ROWS 行、一行最多 6 列）
//   2. 「添加对比」三级：平时不显示 → 鼠标进卡片显出小胶囊 → 光标压到按钮上才长大（满宽的 81% × 40px 高）；
//      卡片本身跟着"原地放大"一点点（只放大、不位移）；从小到大的**配色完全一致**（只有尺寸在变），
//      且小胶囊是**浅灰**不是高饱和蓝；
//      卡片上另有一枚**跟随光标**的「查看详情」提示（鼠标走多远它跟多远）
//   3. 空态暂存区：一台都没加时浮标也常显（计数 0）；点它不跳转，改成图标震一下；空态不摊开空清单
//   4. 点卡片任意处都打开参数浮窗（浮窗左侧图片、右侧参数）
//   5. 浮窗**不铺满**：两侧留白、上下留空隙，尺寸小于视口
//   6. 浮窗从被点的那张卡片处放大（transform-origin 落在卡片中心），关闭时播回缩动画再卸载
//   7. 点空白处、按 Esc、点右上角 × 三种方式都能关
//   8. 「添加对比」→ 暂存区计数 +1，悬停摊开已添加机型；放大后的浮标 ≥1.5 倍原尺寸，带「清空」
//   9. 点浮标进对比页，对比表第一列就是刚加的那台；顶栏「返回首页」能退回来，
//      且卡片上的「已添加」是**常显状态**（不 hover 也看得见：卡面留白 + 四周加强 + 常驻大按钮）
//   10. 网格底部的「显示更多」：一次多铺 HOT_ROWS 行、按钮居中且报出剩余台数，
//       热门池取空后按钮自己消失；搜索时不出现（搜索结果是全部命中）
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
// 标题是「灵眸 手机对比」一行（中间一个空格），JSX 里的换行可能带出额外空白，
// 所以把空白统一折成一个再比，免得断言因为排版抖一下就红
const title = (await page.locator(".home-title").textContent())?.replace(/\s+/g, " ").trim();
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
check(title === "灵眸 · 手机对比", `首页大标题 = 「灵眸 · 手机对比」：${title}`);
// 用户反馈过"这几个字格式不一样"（最初后缀是缩小的浅色小字）——
// 现在整行必须是一种格式：站名和后缀之间不许再有任何差异化 span。
check(
  (await page.locator(".home-title-sub").count()) === 0,
  "大标题整行一种格式，没有缩小/变浅的后缀段"
);
check(hasSearch, "首页搜索框可见");
check(cards === cols * hotRows, `热门机型 ${cards} 张 = ${cols} 列 × ${hotRows} 行（池子 ${hotPoolSize} 台）`);
check(cards % hotRows === 0, `铺满 ${hotRows} 行，最后一行不留半截`);
// 一行最多 6 列：这条是"卡片太挤"那个反馈的看门人 —— 列数再多就说明 CSS 里的 minmax 下限被改小了
check(cols <= 6, `一行不超过 6 列（实际 ${cols} 列）`);
const cardW = (await page.locator(".hot-card").first().boundingBox()).width;
check(cardW >= 220, `卡片已加宽（宽 ${Math.round(cardW)}px）`);
check(!(await page.locator(".compare-grid").isVisible().catch(() => false)), "首页不渲染对比表");

// ---------- 1b. 一台都没加时：浮标也要在；点了不跳转，改成图标震一下 ----------
// 入口时有时无的话，用户根本形成不了"这里能发起对比"的印象，所以空态必须常显。
check((await page.locator(".compare-dock").count()) === 1, "一台都没加时浮标也在（不是隐藏）");
check((await page.locator(".dock-count").textContent())?.trim() === "0", "空态浮标计数显示 0");
check((await page.locator(".dock-btn.is-empty").count()) === 1, "空态浮标带 is-empty 标记");
await page.locator(".dock-btn").hover();
await sleep(350);
check((await page.locator(".dock-list").count()) === 0, "空态悬停不摊开空清单（里面没东西可看）");

const search0 = await page.evaluate(() => location.search);
await page.locator(".dock-btn").click();
await sleep(80);
const shaking = await page.locator(".dock-btn").evaluate((el) => el.classList.contains("is-shake"));
const animName = await page.locator(".dock-btn svg").evaluate((el) => getComputedStyle(el).animationName);
check(shaking, "点空态浮标：按钮进入震动状态");
check(String(animName).includes("dock-shake"), `图标正在播震动动画（animation-name: ${animName}）`);
check(!(await page.locator(".compare-grid").isVisible().catch(() => false)), "点空态浮标没有跳去对比页");
check((await page.evaluate(() => location.search)) === search0, "点空态浮标地址栏没变（没留下历史记录）");
await sleep(700);
check(
  !(await page.locator(".dock-btn").evaluate((el) => el.classList.contains("is-shake"))),
  "震动播完自动收回，不会一直抖"
);
await page.mouse.move(10, 10);

// 搜索：全局过滤，且带清空按钮
await page.fill(".home-search input", "iphone17");
await sleep(400);
const hitNames = await page.locator(".hot-card-name").allTextContents();
check(hitNames.length > 0 && hitNames.every((n) => /iPhone 17/.test(n)), `搜 "iphone17" 命中 ${hitNames.length} 台且全是 iPhone 17 系`);
check((await page.locator(".home-search .overlay-search-clear").count()) === 1, "搜索框出现清空按钮");
await page.locator(".home-search .overlay-search-clear").click();
await sleep(400);
check((await page.locator(".hot-card").count()) === cols * hotRows, "清空后回到热门机型");

// ---------- 2. 三级：平时不显示 → 鼠标进卡片显示小胶囊 → 压到按钮上才放大；「查看详情」跟随光标 ----------
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
// 卡片左右内边距各 16px —— 占比按"可用内宽"算，不看 padding
const fillOf = (btn, card) => btn.width / (card.width - 32);
// 按钮配色：用来盯"小胶囊 → 放大态颜色不许跳"这条（用户反馈过"很割裂"）
const btnColors = () =>
  firstCard.locator(".hot-action").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
  });

const hintBefore = await opacityOf(".cursor-hint");
check(hintBefore === "0", `跟随提示默认不可见（opacity ${hintBefore}）`);

// ① 平时：按钮**不显示**（高度仍恒占，所以卡片不会因为按钮浮现被撑高）
const btnHidden = await opacityOf(".hot-card-actions");
check(btnHidden === "0", `① 平时按钮不显示（opacity ${btnHidden}）`);

// ② 鼠标进卡片（但没压到按钮上）：小胶囊浮现；顺带验跟随提示真的跟着光标走
await page.mouse.move(cardBox.x + 40, cardBox.y + 40);
await sleep(360);
// 卡片 hover 时是"原地放大"，boundingBox 会跟着变大 —— 算占比要拿**同一时刻**的卡片框，
// 不能拿布局尺寸去比一枚已经跟着放大过的按钮。
const cardHov = await firstCard.boundingBox();
const btnSmall = await firstCard.locator(".hot-action").boundingBox();
const colorsSmall = await btnColors();
const hintAfter = await opacityOf(".cursor-hint");
const p1 = await hintXY();
await page.mouse.move(cardBox.x + 130, cardBox.y + 110);
await sleep(320);
const p2 = await hintXY();
check((await opacityOf(".hot-card-actions")) === "1", "② 鼠标进卡片后按钮浮现");
check(btnSmall.height <= 38, `② 浮现的是小胶囊（高 ${Math.round(btnSmall.height)}px）`);
check(
  fillOf(btnSmall, cardHov) <= 0.75,
  `② 小胶囊不撑满卡片底部（占可用宽 ${Math.round(fillOf(btnSmall, cardHov) * 100)}%）`
);
check(btnSmall.width >= 104, `② 再小也得看得清（宽 ${Math.round(btnSmall.width)}px）`);

// 卡片 hover 的"突出感"：原地放大一点点（×1.03）。
// 只放大不位移是关键 —— 位移会把鼠标从卡片身下抽走，放大则只会把边往外推，hover 丢不了。
const lift = cardHov.width / cardBox.width;
check(lift > 1.01 && lift < 1.06, `鼠标进卡片时卡片原地放大（×${lift.toFixed(3)}，布局宽 ${Math.round(cardBox.width)}px）`);
check(cardHov.height > cardBox.height, `放大是整体的，高度也跟着起来（${Math.round(cardBox.height)} → ${Math.round(cardHov.height)}px）`);
check(hintAfter === "1", `鼠标移上卡片后跟随提示浮现（opacity ${hintAfter}）`);
check(
  Math.abs(p1.x - (cardBox.x + 40 + 16)) <= 3 && Math.abs(p1.y - (cardBox.y + 40 + 18)) <= 3,
  `提示落在光标右下偏移处（${Math.round(p1.x)}, ${Math.round(p1.y)}）`
);
check(
  Math.abs(p2.x - p1.x - 90) <= 3 && Math.abs(p2.y - p1.y - 70) <= 3,
  `提示跟随光标位移（鼠标走 90×70，提示走 ${Math.round(p2.x - p1.x)}×${Math.round(p2.y - p1.y)}）`
);

// ③ 光标压到那枚小胶囊上：才长大（满宽的 81% × 40px 高，比"撑满整条"收两档）
await page.mouse.move(btnSmall.x + btnSmall.width / 2, btnSmall.y + btnSmall.height / 2);
await sleep(420);
const cardHov3 = await firstCard.boundingBox();
const btnBig = await firstCard.locator(".hot-action").boundingBox();
const colorsBig = await btnColors();
// 卡片 hover 时整体放大了 lift 倍，按钮的 boundingBox 也跟着放大 —— 除以 lift 还原成 CSS 尺寸再断言
const grownW = btnBig.width / lift;
const grownH = btnBig.height / lift;
const innerW = cardBox.width - 32;
check(
  btnBig.height >= 38 && btnBig.height < btnSmall.height + 20,
  `③ 光标压到按钮上才长大（高 ${Math.round(btnSmall.height)} → ${Math.round(btnBig.height)}px）`
);
// 用户两次要求收窄：先"满宽的 90%"，再"在现在的基础上再缩到 90%" → 90% × 90% = 81%。
// 口径是**相对满宽**（而不是"比小胶囊大多少"），所以这里直接对 innerW 取 0.81。
check(
  Math.abs(grownW / innerW - 0.81) <= 0.03,
  `③ 长到"满宽"的 81%（宽 ${Math.round(grownW)}px / 可用 ${Math.round(innerW)}px = ${((grownW / innerW) * 100).toFixed(0)}%）`
);
check(
  Math.abs(grownH - 40) <= 1.5,
  `③ 高度是 40px（原 42px 的 95%）：${grownH.toFixed(1)}px`
);
check(
  btnBig.height / cardBox.height <= 0.2,
  `③ 按钮没有大到失真（占卡片高 ${Math.round((btnBig.height / cardBox.height) * 100)}%）`
);

// ③c 「小胶囊」和「长大的按钮」必须是**同一个按钮**，不能是两副面孔 ——
// 用户反馈：「添加卡片 和 放大的添加卡片 颜色不一致 很割裂」。
// 规矩定死：颜色只由"加没加"决定，尺寸只由"鼠标在不在按钮上"决定。所以 ②→③ 配色一个字节都不许改。
check(
  colorsSmall.bg === colorsBig.bg && colorsSmall.color === colorsBig.color && colorsSmall.border === colorsBig.border,
  `②→③ 只有尺寸在变、配色一模一样（${colorsSmall.bg} / ${colorsSmall.color}）`
);
// 也不能再是高饱和蓝：用户反馈过"蓝色饱和度太高了、丑陋，做成浅灰色"。
// 判据 = 三个通道几乎相等（中性色，没有色相）且足够浅。
const channelsSmall = (colorsSmall.bg.match(/\d+/g) ?? []).map(Number).slice(0, 3);
check(
  channelsSmall.length === 3 &&
    Math.max(...channelsSmall) - Math.min(...channelsSmall) <= 6 &&
    Math.min(...channelsSmall) >= 235,
  `小胶囊是浅灰（不再高饱和蓝）：底 ${colorsSmall.bg}`
);

// ③b 光标从按钮上移开（人还在卡片里）：缩回小胶囊
await page.mouse.move(cardBox.x + 40, cardBox.y + 40);
await sleep(420);
const btnBack = await firstCard.locator(".hot-action").boundingBox();
check(btnBack.height <= 38, `③ 光标离开按钮后缩回小胶囊（${Math.round(btnBig.height)} → ${Math.round(btnBack.height)}px）`);

// hover 时卡片**不许位移**（原地放大可以，平移不行）：一上移，鼠标停在下边缘就会被"从身下抽走"，
// hover 反复触发/取消、按钮一闪一闪，用户得再对焦一次才点得中 —— 那正是"二次对焦"的根因。
const hoverTf = await firstCard.evaluate((el) => getComputedStyle(el).transform);
const tfNums = (hoverTf.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1] ?? "").split(",").map(Number);
const [tx, ty] = tfNums.length === 6 ? [tfNums[4], tfNums[5]] : [tfNums[12], tfNums[13]];
check(
  hoverTf !== "none" && Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5,
  `hover 时卡片只就地放大、一点位移都没有（transform: ${hoverTf}）`
);

// ① 光标离开卡片：提示消失、按钮也跟着收回去
await page.mouse.move(20, 20);
await sleep(420);
check((await opacityOf(".cursor-hint")) === "0", "光标移出卡片后提示消失");
check((await opacityOf(".hot-card-actions")) === "0", "光标移出卡片后按钮也收回去（回到 ①）");

check(cardBox.height >= 265, `卡片整体拉长（高 ${Math.round(cardBox.height)}px）`);

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
check(Boolean(addedBg) && Boolean(plainBg) && addedBg !== plainBg, "已添加卡片的底色与未添加的不同");

// 表达方式必须是"往外走"：卡内几乎留白（只有顶端一丝极淡的蓝），力量放在四周（描边 + 光晕 + 外投影）。
// 之前整卡刷淡蓝底，用户反馈"像被盖住、没有空气感"，这两条断言就是那个反馈的守门人。
const addedStyle = await page.evaluate(() => {
  const el = document.querySelector(".hot-card.is-added");
  const cs = getComputedStyle(el);
  // 渐变卡面的 background-color 恒为 transparent（颜色都在 background-image 里），
  // 所以把渐变里出现的所有颜色一起取出来判断"是不是接近白"。
  const rgb = [...cs.backgroundImage.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) => [
    +m[1],
    +m[2],
    +m[3]
  ]);
  return { rgb, shadow: cs.boxShadow, border: cs.borderTopColor };
});
check(
  addedStyle.rgb.length > 0 && addedStyle.rgb.every((c) => Math.min(...c) >= 240),
  `已添加卡片的卡面颜色全部接近白、不再整体刷蓝底（${addedStyle.rgb.map((c) => c.join(",")).join(" / ")}）`
);
check(
  (addedStyle.shadow.match(/rgba\(0, 102, 204/g) ?? []).length >= 2,
  `已添加卡片四周加强：描边 + 至少两层蓝色外阴影（${addedStyle.shadow.slice(0, 64)}…）`
);
check(
  /^rgba\(0, 102, 204/.test(addedStyle.border),
  `已添加卡片描边是蓝色（${addedStyle.border}）`
);

// 已添加的卡片：按钮**常驻显示**（不 hover 也看得见）—— 用户反馈"添加后看不出来"。
// 但尺寸仍走同一套规则：鼠标不在按钮上时是 ② 的小胶囊，压上去才 ③ 放大。
await page.mouse.move(20, 20);
await sleep(420);
const addOpacity = await firstCard2.locator(".hot-card-actions").evaluate((el) => getComputedStyle(el).opacity);
const addLabel = (await firstCard2.locator(".hot-card-actions button").first().textContent())?.trim();
check(addOpacity === "1", `已添加的卡片：未 hover 时按钮也常显（opacity ${addOpacity}）`);
check(addLabel === "已添加", `按钮文案：${addLabel}`);
const addBtn2 = await firstCard2.locator(".hot-action").boundingBox();
const addCard2 = await firstCard2.boundingBox();
check(
  fillOf(addBtn2, addCard2) <= 0.75,
  `已添加的按钮静止时同样是 ② 的小胶囊（占可用宽 ${Math.round(fillOf(addBtn2, addCard2) * 100)}%）`
);
// 「已添加」在这一档要**安静下来**：换成淡蓝底 + 蓝字（和参数浮窗里「已加入」同一套），
// 和未添加那张实心蓝底白字的按钮拉开档次 —— 状态一眼可辨，但仍然没有换一套配色语言。
const addBtnColors = await firstCard2.locator(".hot-action").evaluate((el) => {
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, color: cs.color };
});
check(
  addBtnColors.bg === "rgb(240, 247, 255)" && addBtnColors.color === "rgb(0, 102, 204)",
  `已添加的按钮是淡蓝底 + 蓝字、与未添加的实心蓝可区分（${addBtnColors.bg} / ${addBtnColors.color}）`
);

// 对照：没加入对比的卡片，鼠标不在它上面时按钮是**隐藏**的（①）；鼠标进去才显出小胶囊（②）
const plainCard = page.locator(".hot-card").nth(cols);
const plainCardBox = await plainCard.boundingBox();
check(
  (await plainCard.locator(".hot-card-actions").evaluate((el) => getComputedStyle(el).opacity)) === "0",
  "未添加的卡片：鼠标不在上面时按钮不显示（①）"
);
await page.mouse.move(plainCardBox.x + 40, plainCardBox.y + 40);
await sleep(380);
const plainBtn = await plainCard.locator(".hot-action").boundingBox();
check(
  (await plainCard.locator(".hot-card-actions").evaluate((el) => getComputedStyle(el).opacity)) === "1",
  "未添加的卡片：鼠标进去后显出按钮（②）"
);
check(
  fillOf(plainBtn, plainCardBox) <= 0.75,
  `未添加的卡片按钮也是小胶囊（占可用宽 ${Math.round(fillOf(plainBtn, plainCardBox) * 100)}%）`
);

// 再点一次那个常显按钮 = 取消
await firstCard2.hover();
await sleep(300);
await firstCard2.locator(".hot-card-actions button").first().click();
await sleep(400);
check((await page.locator(".hot-card.is-added").count()) === 0, "取消后卡片的已添加态一并消失");
// 浮标不再消失，而是回到空态（入口常显）
check((await page.locator(".compare-dock").count()) === 1, "取消到 0 台后浮标仍在（回到空态，不是隐藏）");
check((await page.locator(".dock-count").textContent())?.trim() === "0", "取消后浮标计数回到 0");
check((await page.locator(".dock-btn.is-empty").count()) === 1, "取消后浮标回到空态标记");

// ---------- 10. 「清空」：一次撤完 ----------
await page.locator(".hot-card").first().hover();
await sleep(300);
await page.locator(".hot-card").first().locator(".hot-action").click();
await sleep(400);
check((await page.locator(".dock-count").textContent())?.trim() === "1", "重新加一台，计数回到 1");
check((await page.locator(".dock-btn.is-empty").count()) === 0, "有内容后空态标记消失");
await page.locator(".dock-btn").hover();
await sleep(350);
await page.locator(".dock-clear").click();
await sleep(400);
check((await page.locator(".hot-card.is-added").count()) === 0, "「清空」后所有卡片的已添加态一并消失");
check((await page.locator(".dock-count").textContent())?.trim() === "0", "「清空」后计数为 0");
check((await page.locator(".dock-list").count()) === 0, "清空后不再摊开空清单");
await page.locator(".dock-btn").click();
await sleep(80);
check(
  await page.locator(".dock-btn").evaluate((el) => el.classList.contains("is-shake")),
  "清空后再点浮标：同样只震动、不跳转"
);
await sleep(700);

// ---------- 11. 满员拒绝：反馈必须落在**被点的按钮**上，而不是远处的浮标 ----------
// 用户明确过的设计原则："用户的焦点在哪里，效果就应该出现在哪里"。
// v1 是让右下角浮标摇 + 计数徽章红闪，被否；现在改成按钮自己置灰 + 点击左右晃。
// 加满 4 台（前 4 张卡各点一次）
for (let i = 0; i < 4; i++) {
  const c = page.locator(".hot-card").nth(i);
  await c.hover();
  await sleep(250);
  await c.locator(".hot-action").click();
  await sleep(350);
}
check((await page.locator(".dock-count").textContent())?.trim() === "4", "已加满 4 台");

// 满员后：未添加卡片的按钮置灰（.is-full）
const fullBtn = page.locator(".hot-card:not(.is-added) .hot-action").first();
check(
  await fullBtn.evaluate((el) => el.classList.contains("is-full")),
  "满员后：未添加的卡片按钮带 is-full（置灰）"
);
const fullOpacity = await fullBtn.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
check(fullOpacity < 0.5, `满员后：按钮确实灰掉了（opacity ${fullOpacity}）`);
check(
  ((await fullBtn.getAttribute("aria-label")) ?? "").includes("已满"),
  "满员后：按钮的无障碍标签说明了原因（读屏能听到「已满」，而不是一串静默）"
);
// 已添加的卡片按钮不受影响（它是"移除"，满员照样能点）
const addedBtn = page.locator(".hot-card.is-added .hot-action").first();
check(
  !(await addedBtn.evaluate((el) => el.classList.contains("is-full"))),
  "满员后：已添加的按钮不置灰（移除仍然可用）"
);

// 置灰按钮**不许再放大**（又在长大、又点不动 = 骗人），同时点击要左右晃
const fullCard = page.locator(".hot-card:not(.is-added)").first();
const fullCardBox = await fullCard.boundingBox();
await fullBtn.hover();
await sleep(420);
const fullBox = await fullBtn.boundingBox();
check(
  fullBox.height <= 38,
  `满员后：压上去也不长大（高 ${Math.round(fullBox.height)}px，仍是 ② 级小胶囊）`
);
check(
  fullBox.width / (fullCardBox.width - 32) <= 0.75,
  `满员后：宽度也没撑开（占可用宽 ${Math.round((fullBox.width / (fullCardBox.width - 32)) * 100)}%）`
);
await fullBtn.click();
await sleep(100);
check(
  await fullBtn.evaluate((el) => el.classList.contains("is-shake")),
  "满员后点击：按钮自己进入晃动状态"
);
check(
  String(await fullBtn.evaluate((el) => getComputedStyle(el).animationName)).includes("hot-shake"),
  "满员后点击：按钮在播左右晃动动画"
);
// 反馈不该跑到右下角去（浮标必须毫无反应）
check(
  !(await page.locator(".dock-btn").evaluate((el) => el.classList.contains("is-shake"))),
  "满员后点击：右下角浮标**不**震（焦点在哪，效果在哪）"
);
check(
  (await page.locator(".dock-count").textContent())?.trim() === "4",
  "满员后点击：数量不变（仍是 4）"
);
check((await page.locator(".hot-card.is-added").count()) === 4, "满员后点击：已添加卡片数量不变");
await sleep(600);
check(
  !(await fullBtn.evaluate((el) => el.classList.contains("is-shake"))),
  "晃动播完自动收回"
);

// 已添加的卡片再点一次 = 取消，不是"再添加"，不能误触发拒绝
const added = page.locator(".hot-card.is-added").first();
await added.hover();
await sleep(250);
await added.locator(".hot-action").click();
await sleep(350);
check((await page.locator(".dock-count").textContent())?.trim() === "3", "已添加的再点一次 = 正常取消（计数 3）");
// 腾出位置后，置灰必须立刻解除
check(
  !(await page.locator(".hot-card:not(.is-added) .hot-action").first().evaluate((el) =>
    el.classList.contains("is-full")
  )),
  "取消一台后：未添加卡片的按钮解除置灰"
);

// ---------- 12. 网格底部的「显示更多」 ----------
// 没做分页：分页要往地址栏加 page 参数、还得管翻页后的滚动位置，而"扫一眼 → 点进去看"
// 这种动作本来就不该多一道"下一页/上一页"的决策；要精确找某一台走「浏览全部机型」。
const { hotPoolLen, hotRowCount } = await page.evaluate(async () => {
  const m = await import("/DeviceCompare/src/Home.jsx");
  return { hotPoolLen: m.HOT_POOL.length, hotRowCount: m.HOT_ROWS };
});
check((await page.locator(".home-more-btn").count()) === 1, "网格底部有「显示更多」按钮");
const moreBox = await page.locator(".home-more-btn").boundingBox();
check(moreBox.height >= 42, `做成 44px 的胶囊而不是一行小字（高 ${Math.round(moreBox.height)}px）`);
// 按钮居中：它是这一屏唯一的"继续往下看"出口，摆偏了会显得像脚注
const gridBox = await page.locator(".home-grid").boundingBox();
const moreCX = moreBox.x + moreBox.width / 2;
check(
  Math.abs(moreCX - (gridBox.x + gridBox.width / 2)) <= 4,
  `「显示更多」在网格下方居中（偏差 ${Math.abs(moreCX - (gridBox.x + gridBox.width / 2)).toFixed(0)}px）`
);
const moreLabel = (await page.locator(".home-more-btn").textContent())?.replace(/\s+/g, "");
check(/还有\d+台/.test(moreLabel ?? ""), `按钮上报了还剩多少台，用户能判断要点几下：${moreLabel}`);

const cols11 = await hotCols();
const first11 = await page.locator(".hot-card").count();
check(first11 === cols11 * hotRowCount, `首屏 ${first11} 张 = ${cols11} 列 × ${hotRowCount} 行`);
await page.locator(".home-more-btn").click();
await sleep(450);
const afterOne = await page.locator(".hot-card").count();
check(
  afterOne === cols11 * hotRowCount * 2,
  `点一次多铺 ${hotRowCount} 行：${first11} → ${afterOne} 张`
);
check(afterOne % cols11 === 0, `新增的是整行，不留半截空行（${afterOne} / ${cols11} 行）`);
// 一路点到热门池取空：按钮要自己消失，不能留一个"点了没反应"的死按钮
for (let i = 0; i < 12 && (await page.locator(".home-more-btn").count()) > 0; i += 1) {
  await page.locator(".home-more-btn").click();
  await sleep(260);
}
const finalCards = await page.locator(".hot-card").count();
check(finalCards === hotPoolLen, `一直点到底 = 热门池 ${hotPoolLen} 台全部铺出（实际 ${finalCards} 张）`);
check(finalCards % cols11 === 0, `铺完仍是整行（${finalCards} / ${cols11} = ${finalCards / cols11} 行）`);
check((await page.locator(".home-more-btn").count()) === 0, "池子取空后按钮自己消失，不留死按钮");
// 搜索时不出现：搜索结果是全部命中，本来就没有"更多"可给
const beforeSearch = await page.locator(".hot-card").count();
await page.fill(".home-search input", "iphone");
await sleep(450);
check((await page.locator(".home-more-btn").count()) === 0, "搜索时底部不出现「显示更多」");
await page.locator(".home-search .overlay-search-clear").click();
await sleep(400);
// 清空搜索后回到刚才的铺法（已经点到 48 台了，就还回 48 台，不要莫名其妙缩回首屏）
check(
  (await page.locator(".hot-card").count()) === beforeSearch,
  `清空搜索后回到搜索前的铺法（${beforeSearch} 张）`
);

await page.screenshot({ path: "/tmp/home-detail.png", fullPage: false });
console.log(problems ? `\n${problems} 项未通过` : "\n全部通过");
await browser.close();
process.exit(problems ? 1 : 0);
