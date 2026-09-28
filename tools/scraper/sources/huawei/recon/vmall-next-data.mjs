// 侦察 6：vmall comdetail 的 __NEXT_DATA__ —— 找每配色的 gallery 结构
import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";
import { writeFileSync } from "node:fs";

const prdId = process.argv[2] ?? "10086981094378";
const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);

await page
  .goto("https://item.vmall.com/product/comdetail/index.html?prdId=" + prdId, {
    waitUntil: "domcontentloaded",
  })
  .catch(() => {});
await sleep(6000);

const next = await page.evaluate(() => {
  const el = document.getElementById("__NEXT_DATA__");
  return el ? el.textContent : null;
});
if (next) {
  writeFileSync("/tmp/imgcheck/vmall-next.json", next);
  const j = JSON.parse(next);
  const s = JSON.stringify(j);
  console.log("NEXT_DATA 长度", s.length);
  // 找图片数组和配色
  const imgs = [...new Set([...s.matchAll(/"(https?:)?\/\/res\d?\.vmallres\.com\/[^"]+?\.(?:png|jpe?g|webp)"/gi)].map((m) => m[0].slice(1, -1)))];
  console.log("vmallres 图 " + imgs.length);
  for (const u of imgs.filter((x) => /pmsSalesFile|product/.test(x)).slice(0, 20)) console.log("   " + u);
  // 找颜色名
  const colors = [...new Set([...s.matchAll(/"(?:skuColor|color|colorName|skuValue|specValue)"\s*:\s*"([^"]{1,12})"/g)].map((m) => m[1]))];
  console.log("颜色候选: " + colors.join(" | "));
} else {
  console.log("没有 __NEXT_DATA__");
  // 退而求其次：抓 XHR JSON
}
await browser.close();
