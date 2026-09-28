import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";
import fs from "node:fs";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("-")) || "https://www.mi.com/prod/xiaomi-17-ultra/specs";
const tag = args.find((a) => a.startsWith("--tag="))?.split("=")[1] || "top";

const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });
await page.goto(url, { waitUntil: "load", timeout: 90000 });
await sleep(5000);
await autoScroll(page);
await sleep(3000);
await page.screenshot({ path: `/tmp/mi-${tag}-top.png`, fullPage: false });

const html = await page.content();
fs.writeFileSync(`/tmp/mi-${tag}-rendered.html`, html);
console.log("rendered len", html.length);
for (const kw of ["屏幕", "处理器", "电池容量", "后置摄像头", "分辨率", "参数", "specs"]) {
  console.log(`  ${kw}: ${html.split(kw).length - 1}`);
}
const frames = await page.evaluate(() => [...document.querySelectorAll("iframe")].map((i) => i.src));
console.log("iframes:", JSON.stringify(frames));

const struct = await page.evaluate(() => {
  const out = [];
  const walk = (el, d) => {
    if (d > 5) return;
    for (const c of el.children) {
      out.push(`${"  ".repeat(d)}${c.tagName.toLowerCase()}.${(c.className || "").toString().split(" ").slice(0, 2).join(".")} [${(c.innerText || "").slice(0, 44).replace(/\n/g, " ")}]`);
      walk(c, d + 1);
    }
  };
  walk(document.body, 0);
  return out.slice(0, 80);
});
console.log(struct.join("\n"));
await b.close();
