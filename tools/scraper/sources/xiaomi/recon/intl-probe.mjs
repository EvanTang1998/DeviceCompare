// 侦察：国际站（uk/global/hk）产品页的图片与配色结构
// 用法：node recon/intl-probe.mjs <url> [<url> ...]

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const urls = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });

for (const u of urls) {
  try {
    await page.goto(u, { waitUntil: "load", timeout: 90000 });
    await sleep(6000);
    await autoScroll(page, { step: 900, pause: 140 });
    await sleep(2000);
    const r = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("img")]
        .map((i) => ({ src: (i.currentSrc || i.src || "").split("?")[0], w: i.naturalWidth, h: i.naturalHeight }))
        .filter((x) => x.src && x.w >= 250 && !/logo|icon|appdownload|placeholder/.test(x.src));
      // 色卡：短文本 + 邻近 img/背景图
      const swatches = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length) continue;
        const t = (el.innerText || "").trim();
        if (!t || t.length > 14) continue;
        if (!/^(Black|White|Blue|Purple|Green|Gray|Grey|Silver|Gold|Pink|Cyan|Orange|Yellow|Brown|Titanium|Ceramic|Transparent|Lavender|Mint|Khaki)/i.test(t)) continue;
        swatches.push(t);
      }
      const cs = [...document.querySelectorAll("*")].filter((el) => {
        const s = getComputedStyle(el).backgroundImage;
        return s && s !== "none" && /url\(/.test(s);
      }).length;
      return {
        title: document.title,
        len: document.body.innerText.length,
        imgs: imgs.slice(0, 14),
        swatches: [...new Set(swatches)].slice(0, 12),
        bgImages: cs
      };
    });
    console.log(`\n== ${u}`);
    console.log(`   标题: ${r.title}  正文${r.len}B  背景图元素${r.bgImages}`);
    console.log(`   色卡候选: ${r.swatches.join(" / ") || "（无）"}`);
    for (const i of r.imgs) console.log(`   ${String(i.w).padStart(5)}x${String(i.h).padEnd(5)} …${i.src.slice(-72)}`);
  } catch (e) {
    console.log(`\n== ${u} 失败 ${String(e.message).slice(0, 60)}`);
  }
}
await b.close();
