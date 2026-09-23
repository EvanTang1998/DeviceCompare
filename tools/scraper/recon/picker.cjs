// 端到端验证：机型选择弹框的「最近发布」浏览态与「品牌 → 系列」分组
// 前置：dev server 已起在 5173（在项目根跑 npm run dev）
//
// 用法：node recon/picker.cjs
//
// 为什么单独验：弹框是点击图片上的「更换」后才挂载的，ssr-check 的整树渲染碰不到它。
// 这里按 DOM 顺序重建「卡片 → 所属品牌/系列/新角标」，与 src/data.js 的真实数据逐台比对，
// 能抓住分组错位、系列漏标、新角标错配、精选集算错、「查看更多」跳错品牌这类问题。
//
// 期望值不另写一份：直接在浏览器里 import 应用自己的 data.js，避免两处各维护一套。
const { chromium } = require("playwright-core");

const URL = "http://localhost:5173/DeviceCompare/";
const SHOT = "/tmp/picker-groups.png";

(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const pg = await b.newPage({ viewport: { width: 1680, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: "networkidle" });

  const problems = [];

  // 数据侧
  const phones = await pg.evaluate(async () => {
    const m = await import("/DeviceCompare/src/data.js");
    return m.phones.map((p) => ({ name: p.name, brand: p.brand, series: p.series, isNew: p.isNew }));
  });

  // 打开弹框：点第一列的「更换」按钮
  await pg.click(".header-cell >> nth=0 >> .image-swap-btn");
  await pg.waitForSelector(".overlay-panel");

  // 按 DOM 顺序重建：品牌标题 → 系列标题 → 网格（网格里可能混「查看更多」卡，单独归到 more）
  const readBody = (defaultBrand = null) =>
    pg.evaluate((fallbackBrand) => {
      const out = { brands: [], series: [], cards: [], more: [] };
      let curBrand = fallbackBrand;
      let curSeries = null;
      for (const el of document.querySelector(".overlay-body").children) {
        if (el.classList.contains("overlay-brand-title")) {
          curBrand = el.textContent.trim();
          out.brands.push(curBrand);
        } else if (el.classList.contains("overlay-series-title")) {
          curSeries = el.textContent.trim();
          out.series.push({ brand: curBrand, series: curSeries });
        } else if (el.classList.contains("model-grid")) {
          for (const card of el.querySelectorAll(".model-card")) {
            const rec = {
              brand: curBrand,
              series: curSeries,
              name: card.querySelector(".model-card-name")?.textContent.trim() ?? "",
              isNew: Boolean(card.querySelector(".model-card-new")),
              hint: card.querySelector(".model-card-hint")?.textContent.trim() ?? ""
            };
            if (card.classList.contains("model-card-more")) out.more.push(rec);
            else out.cards.push(rec);
          }
        }
      }
      return out;
    }, defaultBrand);

  // ---------- 1. 浏览态（默认 chip「最近发布」）：品牌分组 × 最新 4 台 + 查看更多 ----------
  const PER_BRAND = 4;
  const brandOrder = [];
  const featNames = new Set();
  {
    const per = new Map();
    for (const p of phones) {
      const n = per.get(p.brand) ?? 0;
      if (n < PER_BRAND) {
        featNames.add(p.name);
        per.set(p.brand, n + 1);
      }
      if (!brandOrder.includes(p.brand)) brandOrder.push(p.brand);
    }
  }
  const restOf = (br) => phones.filter((p) => p.brand === br && !featNames.has(p.name));

  const browse = await readBody();
  if (browse.brands.join(",") !== brandOrder.join(",")) {
    problems.push(`浏览态品牌顺序异常：DOM=${browse.brands.join("/")} 数据=${brandOrder.join("/")}`);
  }
  if (browse.cards.length !== brandOrder.length * PER_BRAND) {
    problems.push(`浏览态机型卡 ${browse.cards.length} ≠ ${brandOrder.length} 品牌 × ${PER_BRAND} 台`);
  }
  for (const br of brandOrder) {
    const expectFeat = phones.filter((p) => p.brand === br && featNames.has(p.name));
    const domFeat = browse.cards.filter((c) => c.brand === br);
    for (let i = 0; i < Math.min(expectFeat.length, domFeat.length); i++) {
      if (domFeat[i].name !== expectFeat[i].name) {
        problems.push(`${br} 最新机型第 ${i + 1} 位：DOM=${domFeat[i].name} 期望=${expectFeat[i].name}`);
      }
      if (domFeat[i].isNew !== expectFeat[i].isNew) problems.push(`${domFeat[i].name} 新角标不符`);
    }
    if (domFeat.length !== expectFeat.length) problems.push(`${br} 浏览态卡数 ${domFeat.length} ≠ ${expectFeat.length}`);
    const rest = restOf(br);
    const more = browse.more.find((m) => m.brand === br);
    if (rest.length && !more) problems.push(`${br} 缺「查看更多」卡片`);
    if (more && rest.length && !more.hint.includes(`还有 ${rest.length} 台`)) {
      problems.push(`${br} 查看更多提示异常：${more.hint}（期望 还有 ${rest.length} 台）`);
    }
  }

  console.log(`机型数：${phones.length}（${brandOrder.length} 个品牌）`);
  console.log(`【最近发布】每个品牌最新 ${PER_BRAND} 台 + 查看更多：`);
  for (const br of brandOrder) {
    const names = browse.cards.filter((c) => c.brand === br).map((c) => c.name);
    const more = browse.more.find((m) => m.brand === br);
    console.log(`  ${br}：${names.join(" / ")}${more ? `  → ${more.hint}` : ""}`);
  }

  await pg.screenshot({ path: SHOT });

  // ---------- 2. 逐品牌进完整列表（直接点品牌 chip）：全量分组核对 ----------
  const byName = new Map(phones.map((p) => [p.name, p]));
  for (const br of brandOrder) {
    await pg.locator(".brand-chip", { hasText: br }).first().click();
    await pg.waitForTimeout(200);
    const v = await readBody(br);
    const list = phones.filter((p) => p.brand === br);

    if (v.more.length) problems.push(`${br} 完整列表里不应再有「查看更多」卡片`);
    if (v.cards.length !== list.length) problems.push(`${br} 列表卡片数 ${v.cards.length} ≠ ${list.length}`);
    for (const c of v.cards) {
      const e = byName.get(c.name);
      if (!e) { problems.push(`${c.name}：不在 data.js 里`); continue; }
      if (c.brand !== e.brand) problems.push(`${c.name} 品牌分组错位：DOM=${c.brand} 数据=${e.brand}`);
      if (c.series !== e.series) problems.push(`${c.name} 系列分组错位：DOM=${c.series} 数据=${e.series}`);
      if (c.isNew !== e.isNew) problems.push(`${c.name} 新角标不符：DOM=${c.isNew} 数据=${e.isNew}`);
    }
    const domPairs = new Set(v.series.map((s) => `${s.brand}|${s.series}`));
    const expectedPairs = new Set(list.map((p) => `${p.brand}|${p.series}`));
    for (const pair of expectedPairs) {
      if (!domPairs.has(pair)) problems.push(`${br} 缺分组：${pair.replace("|", " → ")}`);
    }
    if (domPairs.size !== v.series.length) problems.push(`${br} 系列标题有重复`);
    console.log(`【${br}】${v.cards.length} 台、${v.series.length} 个系列标题`);
  }

  // ---------- 3. 搜索：结果仍带分组 ----------
  await pg.locator(".brand-chip", { hasText: "最近发布" }).first().click();
  await pg.fill(".overlay-header input", "X500");
  await pg.waitForTimeout(250);
  const hit = await readBody(null);
  const expectHit = phones.filter((p) => p.name.toLowerCase().includes("x500"));
  if (hit.cards.length !== expectHit.length) {
    problems.push(`搜索「X500」返回 ${hit.cards.length} 台 ≠ 期望 ${expectHit.length} 台`);
  }
  if (hit.series.some((s) => !s.brand)) problems.push("搜索结果里出现无品牌归属的系列标题");
  console.log(`【搜索「X500」】${hit.cards.map((c) => c.name).join(" / ")}（分组：${hit.series.map((s) => s.series).join("/")}）`);

  // ---------- 结论 ----------
  await pg.fill(".overlay-header input", "");
  await pg.locator(".brand-chip", { hasText: "最近发布" }).first().click();
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: SHOT });

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
