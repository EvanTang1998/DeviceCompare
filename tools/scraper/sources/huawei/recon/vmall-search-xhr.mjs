// 调试 2：捕获 vmall 搜索接口 XHR 响应，找 prdId + 商品名的 JSON
import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";
import { writeFileSync } from "node:fs";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);

const bodies = [];
page.on("response", async (r) => {
  const u = r.url();
  if (/\.(png|jpg|jpeg|webp|css|js|woff2?|gif|svg)($|\?)/i.test(u)) return;
  try {
    const ct = (r.headers()["content-type"] || "");
    if (!/json|text\/plain/.test(ct)) return;
    const t = await r.text();
    if (t.includes("prdId") || t.includes("Mate 80")) bodies.push({ u: u.slice(0, 140), t });
  } catch {}
});

await page.goto(
  "https://www.vmall.com/search?keyword=" + encodeURIComponent("HUAWEI Mate 80 Pro Max 风驰版"),
  { waitUntil: "domcontentloaded" }
);
await sleep(6000);
console.log("候选响应 " + bodies.length);
for (const b of bodies) {
  console.log("=== " + b.u + "  len=" + b.t.length);
  // 打印含 prdId 的片段
  const m = b.t.match(/.{80}prdId.{200}/);
  if (m) console.log("   " + m[0].replace(/\s+/g, " "));
  writeFileSync("/tmp/imgcheck/search-xhr.json", bodies.map((x) => x.t).join("\n---\n"));
}
await browser.close();
