// 侦察：列出页面上所有够大的图（img + CSS 背景图），用于挑机型图
//
// 用法：node recon/img-probe.mjs <url> [<url> ...]
// 说明：w>=260 过滤 logo/图标；背景图从 getComputedStyle 里挖，小米老页面的
//   多色全家福常挂在 CSS background-image 上（specs-product.png / specs_01.png）

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const urls = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1400 });

for (const u of urls) {
  console.log(`\n======== ${u} ========`);
  try {
    await page.goto(u, { waitUntil: "load", timeout: 90000 });
    await sleep(4500);
    await autoScroll(page, { step: 900, pause: 140 });
    await sleep(2000);
  } catch (e) {
    console.log("  ✗ 加载失败：" + e.message);
    continue;
  }
  const imgs = await page.evaluate(() => {
    const seen = new Map();
    const push = (src, w, h) => {
      src = String(src || "").split("?")[0];
      if (!src || !/^https?:/.test(src)) return;
      if (!/logo|icon|appdownload|placeholder|favicon|qrcode/.test(src) && w >= 260) {
        if (!seen.has(src)) seen.set(src, { w, h });
      }
    };
    for (const i of document.querySelectorAll("img")) {
      push(i.currentSrc || i.src, i.naturalWidth, i.naturalHeight);
    }
    for (const el of document.querySelectorAll("*")) {
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (m) {
        const r = el.getBoundingClientRect();
        push(m[1], Math.round(r.width), Math.round(r.height));
      }
    }
    return [...seen.entries()].map(([src, d]) => ({ src, ...d }));
  });
  for (const x of imgs) console.log(`  ${x.w}x${x.h}  ${x.src}`);
}
await b.close();
