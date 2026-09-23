// 端到端验证：vivo 机型在页面上的可用性（下拉列表 / 产品图配对 / 色环切换）
// 前置：本机 dev server 已起在 5173（在项目根跑 npm run dev）
//
// 用法：
//   node sources/vivo/recon/e2e.cjs                 # 逐台检查下拉列表里的全部 vivo 机型
//   node sources/vivo/recon/e2e.cjs "vivo X500 Pro" # 只查指定机型（可给多个）
//
// 与一加版同思路：从 src/data/devices/*.json 读「机型名 → 机型 id」，
// 比对页面上那张图的文件名是否以该 id 开头 —— 配错色、抓错机型只有这样才能抓住。
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const devicesDir = path.resolve(__dirname, "../../../../../src/data/devices");
const idByName = new Map();
for (const f of fs.readdirSync(devicesDir)) {
  if (!f.endsWith(".json")) continue;
  const d = JSON.parse(fs.readFileSync(path.join(devicesDir, f), "utf8"));
  if (d.brand === "vivo") idByName.set(d.name, f.replace(/\.json$/, ""));
}

(async () => {
  const wanted = process.argv.slice(2);
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const pg = await b.newPage({ viewport: { width: 1680, height: 1000 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await pg.goto("http://localhost:5173/DeviceCompare/", { waitUntil: "networkidle" });

  const col = ".header-cell >> nth=0";
  const modelBtn = col + " >> .picker-model-btn";
  // 触发按钮的文字带下拉箭头，图片 src 在 dev server 下带 ?t= 时间戳，都要洗掉再比对
  const clean = (s) => String(s ?? "").replace(/[▾▴\s]+$/u, "").trim();
  const imgName = async () =>
    String(await pg.locator(col + " >> .phone-image img").getAttribute("src") ?? "")
      .split("/")
      .pop()
      .replace(/\?.*$/, "") || null;

  // 1. 品牌切到「vivo」，列出下拉里的全部 vivo 机型
  await pg.selectOption(col + " >> .picker select[aria-label=品牌]", { label: "vivo" });
  await pg.waitForTimeout(300);
  await pg.click(modelBtn);
  await pg.waitForTimeout(400);
  const allItems = (await pg.locator(".model-menu .model-item").allTextContents()).map(clean);
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);

  const targets = wanted.length ? wanted : allItems;
  const problems = [];

  console.log(`下拉里的 vivo 机型：${allItems.length} 台`);
  console.log(`本次检查：${targets.length} 台\n`);

  // 2. 逐台选中，核对产品图文件名与机型 id、色环数量
  for (const name of targets) {
    const idx = allItems.indexOf(name);
    if (idx < 0) {
      problems.push(`${name}：不在下拉列表里`);
      continue;
    }
    await pg.click(modelBtn);
    await pg.waitForTimeout(250);
    await pg.click(`.model-menu .model-item >> nth=${idx}`);
    await pg.waitForTimeout(400);

    const picked = clean(await pg.locator(modelBtn).textContent());
    const img = await imgName();
    const swatches = await pg.locator(col + " >> .swatch").count();
    const expId = idByName.get(picked);

    const imgOk = Boolean(img) && Boolean(expId) && img.startsWith(`${expId}.`);
    if (!imgOk) problems.push(`${picked}：图片 ${img} 与机型 id ${expId} 不匹配`);
    if (swatches < 1) problems.push(`${picked}：没有色环（图片或配色没入库）`);

    // 换到第 2 个配色，确认图片跟着换（单色机型跳过）
    let switched = null;
    if (swatches > 1) {
      await pg.click(col + " >> .swatch >> nth=1");
      await pg.waitForTimeout(400);
      switched = await imgName();
      if (switched === img) problems.push(`${picked}：切配色后图片没变（仍是 ${img}）`);
    }

    console.log(`${imgOk ? "✓" : "✗"} ${picked.padEnd(18)} 图=${String(img).padEnd(36)} 色环=${swatches}${switched ? ` → ${switched}` : ""}`);
  }
  await pg.screenshot({ path: "/tmp/vivo-e2e.png" });
  console.log(`\n截图：/tmp/vivo-e2e.png`);
  console.log(`页面报错：${errs.length ? JSON.stringify(errs) : "无"}`);
  console.log(`问题：${problems.length ? "\n  - " + problems.join("\n  - ") : "无"}`);
  await b.close();
  process.exit(problems.length || errs.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
