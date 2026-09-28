// 侦察：vmall 搜索接口 queryPrd 返回什么 —— 查老机型（Mate 60 系列）在商城是否还有手机商品页，
// 以及商品页是否还带「规格参数」（官网 specs 页已下架，商城是剩下的官方源）。
//
// 用法：node sources/huawei/recon/vmall-search-api.mjs [关键词，默认 "Mate 60"]

import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const kw = process.argv[2] ?? "Mate 60";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);

const captured = [];
page.on("response", async (r) => {
  if (!/openapi\.vmall\.com\/mcp\/.*(queryPrd|queryActiveContent)/i.test(r.url())) return;
  try {
    captured.push({ url: r.url(), body: await r.json() });
  } catch {
    /* 非 JSON 忽略 */
  }
});

await page.goto(`https://www.vmall.com/search?keyword=${encodeURIComponent(kw)}`, { waitUntil: "domcontentloaded" });
await sleep(5000);

for (const c of captured) {
  console.log("=== " + c.url.slice(0, 120));
  const j = JSON.stringify(c.body);
  console.log("  长度", j.length, "顶层键:", Object.keys(c.body ?? {}).join(","));
  // 找商品名与 prdId（字段名不固定，先把带 Mate 的片段打出来）
  const ctx = [...new Set([...j.matchAll(/".{0,30}Mate\s?\d0[^"]{0,40}"/g)].map((m) => m[0]))];
  console.log("  含 Mate 的字段值:", ctx.slice(0, 30));
  const ids = [...new Set([...j.matchAll(/"(\w*[Pp]rd\w*Id)":\s*"?(\d{6,})"?/g)].map((m) => m[1] + "=" + m[2]))];
  console.log("  prdId:", ids.slice(0, 20));
  const keys = [...new Set([...j.matchAll(/"([a-zA-Z_]*[Nn]ame)":/g)].map((m) => m[1]))];
  console.log("  名字类字段:", keys.slice(0, 20));
}

const text = await page.locator("body").innerText().catch(() => "");
console.log("\n正文片段：", text.replace(/\s+/g, " ").slice(0, 500));

await browser.close();
