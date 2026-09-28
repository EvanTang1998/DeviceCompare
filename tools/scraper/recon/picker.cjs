// 端到端验证：机型选择弹框的「全部」浏览态与「品牌 → 系列」分组、全局搜索
// 前置：dev server 已起在 5173（在项目根跑 npm run dev）
//
// 用法：node recon/picker.cjs
//
// 为什么单独验：弹框是点击图片上的「更换」后才挂载的，ssr-check 的整树渲染碰不到它。
// 这里按 DOM 顺序重建「卡片 → 所属品牌/系列/新角标」，与 src/data.js 的真实数据逐台比对，
// 能抓住分组错位、系列漏标、系列**顺序**排错、新角标错配、精选集算错、「查看更多」跳错品牌这类问题。
//
// 期望值不另写一份：直接在浏览器里 import 应用自己的 data.js，避免两处各维护一套。
// 系列顺序的期望值同样取自 data.js 的 SERIES_ORDER（产品线定位表）。
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

  // 首页成为入口后，对比表默认是空的（机型得由用户从首页加进来），
  // 所以先按真实路径铺满 4 列：点卡片上的「添加对比」，再切到对比页。
  for (let i = 0; i < 4; i += 1) {
    await pg.locator(".hot-card").nth(i).locator(".hot-card-actions button").first().click();
    await pg.waitForTimeout(200);
  }
  await pg.locator(".nav-compare-btn").click();
  await pg.waitForTimeout(900);

  // 数据侧
  const { phones, seriesOrder } = await pg.evaluate(async () => {
    const m = await import("/DeviceCompare/src/data.js");
    return {
      phones: m.phones.map((p) => ({ name: p.name, brand: p.brand, series: p.series, isNew: p.isNew })),
      seriesOrder: m.SERIES_ORDER
    };
  });
  // 数据侧期望的系列顺序：按 SERIES_ORDER 权重稳定排序，未配表的保持原顺序落到末尾。
  // 与 App.jsx 的 sort 是同一套语义（首次出现顺序 + 稳定排序）。
  const expectSeriesOrder = (br, list) => {
    const table = seriesOrder[br] ?? [];
    const weight = (s) => {
      const i = table.indexOf(s);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...new Set(list.map((p) => p.series))].sort((a, b) => weight(a) - weight(b));
  };

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

  // ---------- 1. 浏览态（默认 chip「全部」）：品牌分组 × 最新 4 台 + 查看更多 ----------
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
  // 每品牌最多 PER_BRAND 台；不足 PER_BRAND 台的品牌（如 OPPO 首批 3 台）有几台显示几张
  const expectBrowseCards = brandOrder.reduce(
    (sum, br) => sum + Math.min(PER_BRAND, phones.filter((p) => p.brand === br).length),
    0
  );
  if (browse.cards.length !== expectBrowseCards) {
    problems.push(`浏览态机型卡 ${browse.cards.length} ≠ 各品牌 min(${PER_BRAND}, 台数) 之和 ${expectBrowseCards}`);
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
  console.log(`【全部】每个品牌最新 ${PER_BRAND} 台 + 查看更多：`);
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
    // 系列默认折叠为 2 行（2026-09-24 起）：把所有「显示更多」点开再做全量断言。
    // 点击后按钮变「收起」，不会死循环。
    for (;;) {
      const moreBtns = await pg.locator(".overlay-body .model-card-more").all();
      let clicked = false;
      for (const btn of moreBtns) {
        if ((await btn.innerText().catch(() => "")).includes("显示更多")) {
          await btn.click();
          clicked = true;
        }
      }
      await pg.waitForTimeout(150);
      if (!clicked) break;
    }
    const v = await readBody(br);
    const list = phones.filter((p) => p.brand === br);

    // 系列折叠按钮（「收起」）也用 model-card-more 类，只有「查看更多」才算浏览态残留
    const strayMore = v.more.filter((m) => m.name.includes("查看更多"));
    if (strayMore.length) problems.push(`${br} 完整列表里不应再有「查看更多」卡片`);
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

    // 系列顺序：必须按「主流旗舰高端 → 低端」排（用户要求），期望值取自 data.js 的 SERIES_ORDER
    const domSeriesList = v.series.map((s) => s.series);
    const expectedList = expectSeriesOrder(br, list);
    if (domSeriesList.join(",") !== expectedList.join(",")) {
      problems.push(`${br} 系列顺序不符：DOM=${domSeriesList.join(" → ")} 期望=${expectedList.join(" → ")}`);
    }
    console.log(`【${br}】${v.cards.length} 台、${v.series.length} 个系列：${domSeriesList.join(" → ")}`);
  }

  // ---------- 3. 搜索：结果全局、仍带分组 ----------
  await pg.locator(".brand-chip", { hasText: "全部" }).first().click();
  await pg.fill(".overlay-header input", "X500");
  await pg.waitForTimeout(250);
  const hit = await readBody(null);
  const expectHit = phones.filter((p) => p.name.toLowerCase().includes("x500"));
  if (hit.cards.length !== expectHit.length) {
    problems.push(`搜索「X500」返回 ${hit.cards.length} 台 ≠ 期望 ${expectHit.length} 台`);
  }
  if (hit.series.some((s) => !s.brand)) problems.push("搜索结果里出现无品牌归属的系列标题");
  console.log(`【搜索「X500」】${hit.cards.map((c) => c.name).join(" / ")}（分组：${hit.series.map((s) => s.series).join("/")}）`);

  // ---------- 4. 全局搜索：选着品牌时输入关键词也要跳到「搜索结果」标签、不受品牌限制 ----------
  // 先切到华为，再搜「oppo」——全局搜索应返回全部 38 台 OPPO，且活动标签是「搜索结果」
  await pg.locator(".brand-chip", { hasText: "华为" }).first().click();
  await pg.waitForTimeout(150);
  await pg.fill(".overlay-header input", "oppo");
  await pg.waitForTimeout(250);
  {
    const activeChip = (await pg.locator(".brand-chip.is-active").first().innerText()).trim();
    if (activeChip !== "搜索结果") {
      problems.push(`搜索态活动标签应为「搜索结果」，实际「${activeChip}」`);
    }
    const activeBrandChip = await pg
      .locator(".brand-chip.is-active", { hasText: "华为" })
      .count();
    if (activeBrandChip) problems.push("搜索态不应有品牌 chip 处于激活态");
  }
  const searchAll = await readBody(null);
  {
    const hitList = phones.filter((p) => p.name.toLowerCase().replace(/[\s-]+/g, "").includes("oppo"));
    const byBrandHit = new Map();
    for (const p of hitList) {
      if (!byBrandHit.has(p.brand)) byBrandHit.set(p.brand, []);
      byBrandHit.get(p.brand).push(p);
    }
    for (const [br, list] of byBrandHit) {
      const domList = searchAll.series.filter((s) => s.brand === br).map((s) => s.series);
      const expected = expectSeriesOrder(br, list);
      if (domList.join(",") !== expected.join(",")) {
        problems.push(`搜索态 ${br} 系列顺序不符：DOM=${domList.join(" → ")} 期望=${expected.join(" → ")}`);
      }
    }
    if (searchAll.cards.length !== hitList.length) {
      problems.push(`搜索「oppo」返回 ${searchAll.cards.length} 台 ≠ 期望 ${hitList.length} 台`);
    }
    console.log(
      `【搜索「oppo」】${searchAll.cards.length} 台；OPPO 系列顺序：${
        searchAll.series.filter((s) => s.brand === "OPPO").map((s) => s.series).join(" → ")
      }`
    );
  }

  // ---------- 5. 清空叉号：一键清词并回到原品牌标签 ----------
  await pg.click(".overlay-search-clear");
  await pg.waitForTimeout(200);
  {
    const kw = await pg.inputValue(".overlay-header input");
    if (kw !== "") problems.push("清空按钮未清空搜索词");
    const backChip = (await pg.locator(".brand-chip.is-active").first().innerText()).trim();
    if (backChip !== "华为") problems.push(`清空后应回到原品牌标签「华为」，实际「${backChip}」`);
    const clearGone = await pg.locator(".overlay-search-clear").count();
    if (clearGone) problems.push("清空后叉号按钮应消失");
  }

  // ---------- 结论 ----------
  await pg.locator(".brand-chip", { hasText: "全部" }).first().click();
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
