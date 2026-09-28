// 侦察：产品页（/<slug>）里有没有「按配色区分」的图（色卡区图片）
// 用法：node recon/color-img-probe.mjs <slug> [<slug> ...]

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });

for (const s of slugs) {
  await page.goto(`https://www.mi.com/${s}`, { waitUntil: "load", timeout: 90000 });
  await sleep(5000);
  await autoScroll(page, { step: 900, pause: 150 });
  await sleep(2000);
  const r = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")]
      .map((i) => ({ src: (i.currentSrc || i.src || "").split("?")[0], w: i.naturalWidth, h: i.naturalHeight }))
      .filter((x) => x.src && x.w >= 200);
    // 含颜色词的元素的祖先里找图
    const colorWords = ["黑", "白", "蓝", "绿", "紫", "金", "银", "灰", "粉", "陶瓷", "透明", "素皮", "原野"];
    const colorBlocks = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length) continue;
      const t = (el.innerText || "").trim();
      if (!t || t.length > 10) continue;
      if (!colorWords.some((w) => t.includes(w))) continue;
      let cur = el;
      let found = null;
      for (let i = 0; i < 5 && cur; i++) {
        const im = cur.querySelector("img");
        if (im) { found = (im.currentSrc || im.src || "").split("?")[0]; break; }
        cur = cur.parentElement;
      }
      if (found) colorBlocks.push(`${t} → ${found.slice(-70)}`);
    }
    return { imgs: imgs.slice(0, 25), colorBlocks: [...new Set(colorBlocks)].slice(0, 12) };
  });
  console.log(`\n== ${s} == 图片 ${r.imgs.length} 张`);
  console.log("  按配色关联到图的色名: " + (r.colorBlocks.length ? r.colorBlocks.join(" | ") : "（无）"));
  for (const i of r.imgs.slice(0, 6)) console.log(`    ${i.w}x${i.h}  …${i.src.slice(-70)}`);
}
await b.close();
