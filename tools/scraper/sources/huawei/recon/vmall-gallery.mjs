// 侦察 5：vmall 商品详情页的 gallery 图是什么机位（真浏览器过 WAF）
// 用法：node sources/huawei/recon/vmall-gallery.mjs <prdId>  默认 Mate 80 Pro Max 风驰版
import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const prdId = process.argv[2] ?? "10086981094378";
const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);

const imgUrls = new Set();
page.on("response", (r) => {
  const u = r.url();
  if (/res.*vmallres|\.jpe?g|\.png|\.webp/i.test(u) && /product|goods|sku|gallery|image|pic/i.test(u)) {
    imgUrls.add(u.split("?")[0]);
  }
});

const url = "https://item.vmall.com/product/comdetail/index.html?prdId=" + prdId;
console.log("→", url);
await page.goto(url, { waitUntil: "domcontentloaded" }).catch((e) => console.log("goto 失败：", e.message));
await sleep(6000);
console.log("标题：", await page.title());

// 页面上主图区的 <img> / <li> 背景
const imgs = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("img")) {
    const src = el.currentSrc || el.src;
    if (src && /vmallres|huawei/.test(src) && el.naturalWidth >= 200) {
      out.push({ src: src.split("?")[0], w: el.naturalWidth, h: el.naturalHeight, alt: el.alt || "" });
    }
  }
  return out;
});
console.log("主图区 img " + imgs.length + " 张:");
for (const i of imgs.slice(0, 15)) console.log("   " + i.w + "x" + i.h + " " + i.src + (i.alt ? "  alt=" + i.alt : ""));

console.log("疑似接口图片响应 " + imgUrls.size + " 个:");
for (const u of [...imgUrls].slice(0, 15)) console.log("   " + u);

// 下载前 8 张看看机位
mkdirSync("/tmp/imgcheck/vmall", { recursive: true });
let n = 0;
for (const i of imgs) {
  if (n >= 8) break;
  if (!/\.(jpe?g|png|webp)$/i.test(i.src)) continue;
  try {
    const buf = Buffer.from(await (await fetch(i.src)).arrayBuffer());
    if (buf.length < 8000) continue;
    n++;
    writeFileSync("/tmp/imgcheck/vmall/" + n + "." + i.src.split(".").pop(), buf);
  } catch {}
}
console.log("已下载 " + n + " 张到 /tmp/imgcheck/vmall/");
await page.screenshot({ path: "/tmp/imgcheck/vmall-page.png", fullPage: false });
await browser.close();
