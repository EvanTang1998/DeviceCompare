// 无浏览器渲染验证：直接在 Node 里渲染整棵组件树，检查页面是否正常产出内容
// 用法：node scripts/ssr-check.mjs
import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import React from "react";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error"
});

try {
  const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
  const { phones } = await vite.ssrLoadModule("/src/data.js");
  // 直接从 Home.jsx 取口径常量，而不是在这里再抄一份 —— 抄的那份迟早会和实现脱节
  const { HOT_PER_BRAND, HOT_ROWS, DEFAULT_COLS, HOT_POOL } = await vite.ssrLoadModule("/src/Home.jsx");
  // 地址栏参数的转换是纯函数，顺手在这里做一组往返验证（浏览器里那组见 recon/url-state.mjs）
  const { buildSearch, readFromSearch, sameState } = await vite.ssrLoadModule("/src/urlState.js");

  const SLOT_COUNT = 4; // 与 App.jsx 的 SLOT_COUNT 保持一致

  // 首页成为默认入口后，整树渲染默认停在首页 —— 对比表这组断言必须显式传初始视图与初始机型，
  // 否则会全部落空（不是页面坏了，是压根没渲染对比表）。
  // 首屏 4 列取「最新的 4 台」，所以断言不能写死具体机型：每加一批新机型都会假报警，
  // 这里跟着 phones 算出来。也不断言具体机型的芯片/传感器型号 —— 那是某几台的数据细节，
  // 不是「页面渲染正常」的证据；芯片/传感器是否抓到，由下面的数据完整性检查逐台覆盖。
  const html = renderToString(
    React.createElement(App, {
      initialView: "compare",
      initialSlots: phones.slice(0, SLOT_COUNT).map((p) => p.id)
    })
  );

  // 首页也整树渲染一遍：它是新的默认入口，大标题、搜索框、热门卡片都得在
  const homeHtml = renderToString(React.createElement(App));
  // 热门机型的池子 = 每品牌最新 HOT_PER_BRAND 台；实际渲染几张取决于一行能放几列，
  // 服务端量不到宽度，所以按 DEFAULT_COLS 算；并且必须正好是 HOT_ROWS 行的整数倍（"铺满"）。
  const hotPool = (() => {
    const per = new Map();
    let n = 0;
    for (const p of phones) {
      const k = per.get(p.brand) ?? 0;
      if (k < HOT_PER_BRAND) {
        n += 1;
        per.set(p.brand, k + 1);
      }
    }
    return n;
  })();
  const hotExpected = Math.min(hotPool, HOT_ROWS * DEFAULT_COLS);
  const hotRendered = (homeHtml.match(/class="hot-card"/g) ?? []).length;

  // 地址栏参数：拼出来的串必须干净（逗号不能被转义成 %2C，否则分享出去的链接没法读），
  // 而且「拼出去 → 读回来」要能还原成同一个状态，否则刷新/后退就会漂移。
  const A = phones[0].id;
  const B = phones[1].id;
  const rt = { view: "compare", ids: [A, B], phoneId: A };
  const rtSearch = buildSearch(rt);
  const rtBack = readFromSearch(rtSearch, phones, SLOT_COUNT);

  // 带暂存机型的首页：验「已添加」是**常显状态**（不靠 hover），不是只存在于 interactive 时的样式
  const homeAddedHtml = renderToString(
    React.createElement(App, { initialSlots: phones.slice(0, 1).map((p) => p.id) })
  );

  const checks = [
    ["站点标题", html.includes("灵眸")],
    ...phones.slice(0, SLOT_COUNT).map((p) => [`首屏列：${p.name}`, html.includes(p.name)]),
    ["分区标题 芯片组", html.includes("芯片组")],
    ["分区标题 摄像头", html.includes("摄像头")],
    ["首页 站名大标题", homeHtml.includes("home-title")],
    ["首页 搜索框", homeHtml.includes("搜索机型")],
    [
      `首页 热门机型 ${hotRendered} 张（${HOT_ROWS} 行 × ${DEFAULT_COLS} 列，池子 ${hotPool} 台）`,
      hotRendered === hotExpected
    ],
    [`首页 热门机型铺满 ${HOT_ROWS} 行（无半截空行）`, hotRendered % HOT_ROWS === 0],
    [
      "首页 热门池覆盖全部品牌",
      new Set(HOT_POOL.map((p) => p.brand)).size === new Set(phones.map((p) => p.brand)).size
    ],
    [
      `首页 第一行就是 ${DEFAULT_COLS} 个品牌各一台（按品牌轮转排列）`,
      new Set(HOT_POOL.slice(0, DEFAULT_COLS).map((p) => p.brand)).size === DEFAULT_COLS
    ],
    ["首页 卡片带查看详情提示", homeHtml.includes("查看详情")],
    ["首页 未加入对比时卡片不带已添加态", !homeHtml.includes("hot-card is-added")],
    ["首页 未加入对比时按钮还是「添加对比」", homeHtml.includes("添加对比")],
    ["首页 已加入对比的卡片整体标记 is-added", homeAddedHtml.includes("hot-card is-added")],
    ["首页 已加入对比后按钮转成「已添加」", homeAddedHtml.includes(">已添加<") || homeAddedHtml.includes("已添加</button>")],
    ["首页 右上角那枚重复的已添加徽标已移除", !homeHtml.includes("hot-card-added")],
    ["首页 未渲染对比表", !homeHtml.includes("compare-grid")],
    ["地址栏 cart 里的逗号没被转义成 %2C", rtSearch.includes(`${A},${B}`) && !rtSearch.includes("%2C")],
    [`地址栏往返一致（${rtSearch}）`, sameState(rt, rtBack)],
    ["地址栏 首页不写 view", buildSearch({ view: "home", ids: [A], phoneId: null }) === `?cart=${A}`],
    [
      "地址栏 丢掉不存在的 id 与重复 id",
      (() => {
        const s = readFromSearch(`?cart=nope,${A},${A},${B}&view=compare`, phones, SLOT_COUNT);
        return s.view === "compare" && s.ids.join(",") === `${A},${B}`;
      })()
    ],
    [
      `地址栏 截到 ${SLOT_COUNT} 台上限`,
      readFromSearch(`?cart=${phones.map((p) => p.id).join(",")}`, phones, SLOT_COUNT).ids.length ===
        SLOT_COUNT
    ]
  ];

  // 数据完整性检查：逐台核对「能不能上对比表」的必填项，
  // 抓到一半就落库（缺芯片/电池/摄像头/发布日期）这种问题靠这一组断言兜住
  //
  // 例外：华为 Mate 60 / 70 两代 + Pura 80 系列，**官网口径就是不公布 SoC**（参数页连「处理器」分组都没有），
  // 所以 chip 为空是合法态（前端显示「—」，与网络频段同一口径），不是解析漏抓。
  // 不在列的：Mate 80 系列（麒麟 9030 系）、Mate 70 Air（麒麟 9020A / 9020B）、Pura 90 系列（麒麟 9010S / 9030S）。
  const CHIPSET_NOT_PUBLISHED = new Set([
    "huawei-mate60",
    "huawei-mate60-pro",
    "huawei-mate60-pro-plus",
    "huawei-mate60-rs",
    "huawei-mate70",
    "huawei-mate70-pro",
    "huawei-mate70-pro-plus",
    "huawei-mate70-pro-youxiangban",
    "huawei-mate70-rs",
    "huawei-pura80",
    "huawei-pura80-pro",
    "huawei-pura80-pro-plus",
    "huawei-pura80-ultra",
  ]);
  for (const p of phones) {
    const d = p.data;
    checks.push([`${p.name} 品牌已标注`, Boolean(p.brand) && p.brand !== "其他"]);
    // 系列供机型选择弹框分组，缺了会掉进「其他」分组
    checks.push([`${p.name} 系列已标注`, Boolean(p.series) && p.series !== "其他"]);
    // 图片有两种合法状态：① 有图 ② 整机留空（商城已下架 / 官网没挂购买链接的机型，
    // 参数照常入库、图片留空，前端渲染占位卡 —— 见 tools/scraper/README.md 的 OPPO 章节）。
    // 真正要抓的是「部分配色有图、部分没图」—— 那说明配色 slug 与图片文件名对错了位。
    const withImg = p.colors.filter((c) => c.image).length;
    const imageless = p.colors.length > 0 && withImg === 0;
    checks.push([`${p.name} 图片已配对（或整机留空）`, imageless ? true : Boolean(p.image)]);
    checks.push([
      `${p.name} 配色声明与配图齐全（或整机留空）`,
      p.colors.length > 0 && (imageless || withImg === p.colors.length)
    ]);
    checks.push([`${p.name} 芯片已解析`, Boolean(d.chipset?.chip) || CHIPSET_NOT_PUBLISHED.has(p.id)]);
    checks.push([`${p.name} 电池容量已解析`, d.battery?.capacity_mah != null]);
    checks.push([`${p.name} 摄像头非空`, Array.isArray(d.camera) && d.camera.length > 0]);
    checks.push([`${p.name} 发布日期已填`, Boolean(d.release_date)]);
  }
  console.log(`机型数：${phones.length}（${phones.map((p) => p.id).join(" / ")}）`);

  // 整机无图的机型单独列出来，别让它静默通过 —— 加了新图却没配上时，这里一眼能看出少了谁
  const imagelessNames = phones
    .filter((p) => p.colors.length > 0 && !p.colors.some((c) => c.image))
    .map((p) => p.name);
  console.log(
    `整机留空（参数入库、图片留空）：${imagelessNames.length} 台${imagelessNames.length ? ` — ${imagelessNames.join("、")}` : ""}`
  );

  let ok = true;
  for (const [name, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
    if (!passed) ok = false;
  }
  console.log(`html length: ${html.length}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("RUNTIME ERROR:", e);
  process.exit(1);
} finally {
  await vite.close();
}
