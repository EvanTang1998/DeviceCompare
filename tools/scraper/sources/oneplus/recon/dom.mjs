// 侦察 /cn/13/specs（无 pageDsl 的旧模板）：DOM 分区结构 + 图片 URL
// 用法：node sources/oneplus/recon/dom.mjs
import { chromium } from "playwright-core";

const b = await chromium.launch({ channel: "chrome", headless: true });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
await pg.goto("https://www.oneplus.com/cn/13/specs", { waitUntil: "networkidle", timeout: 60000 });
await pg.waitForTimeout(1500);

const data = await pg.evaluate(() => {
  // 找规格分区标题
  const heads = [...document.querySelectorAll("h2,h3,h4")]
    .map(h => h.tagName + ":" + h.textContent.trim())
    .filter(t => t.length < 30);
  // 图片
  const imgs = [...document.querySelectorAll("img")]
    .map(i => i.src || i.getAttribute("data-src"))
    .filter(s => s && /dam|product|spec|param/i.test(s));
  // 分区容器：找包含"高度："的元素向上三层结构
  const probe = [...document.querySelectorAll("*")].find(el =>
    el.children.length === 0 && /高度：/.test(el.textContent));
  let chain = [];
  let el = probe;
  for (let i = 0; i < 4 && el; i++) {
    chain.push(el.tagName + "." + String(el.className).slice(0, 60));
    el = el.parentElement;
  }
  return { heads: heads.slice(0, 40), imgs: [...new Set(imgs)].slice(0, 30), chain };
});
console.log(JSON.stringify(data, null, 1));
await b.close();
