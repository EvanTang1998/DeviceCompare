// 调试：vmall 搜索页的商品链接结构
import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const browser = await launchBrowser({ headless: true });
const { page } = await newPage(browser);
await page.goto("https://www.vmall.com/search?keyword=" + encodeURIComponent("HUAWEI Mate 80 Pro Max 风驰版"), {
  waitUntil: "domcontentloaded",
});
await sleep(6000);
console.log("URL:", page.url(), "标题:", await page.title());
const links = await page.evaluate(() =>
  [...document.querySelectorAll("a")].map((a) => ({ href: a.href, text: (a.innerText || "").trim().slice(0, 40) })).filter((x) => x.text)
);
console.log("带文本的链接 " + links.length);
for (const l of links.slice(0, 25)) console.log("  " + l.href.slice(0, 80) + "  | " + l.text);
await page.screenshot({ path: "/tmp/vmall-search.png", fullPage: false });
await browser.close();
