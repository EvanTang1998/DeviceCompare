import { launchBrowser, newPage, sleep } from "../../../lib/browser.mjs";

const kw = process.argv[2] || "Xiaomi 14";
// 过滤词：关键词的末段（如 "Xiaomi 14" → /Xiaomi 14/）
const re = new RegExp(kw.split(/\s+/).join("\\s*"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });
await page.goto("https://www.mi.com/search?keyword=" + encodeURIComponent(kw), {
  waitUntil: "domcontentloaded",
  timeout: 90000
});
await sleep(7000);
const links = await page.evaluate(() =>
  [...document.querySelectorAll("a")]
    .map((a) => ({ href: a.href, text: (a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60) }))
    .filter((x) => x.text)
);
const seen = new Set();
for (const l of links) {
  if (!re.test(l.text)) continue;
  const k = l.href + l.text;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(l.text.padEnd(60) + " " + l.href.slice(0, 120));
}
await b.close();
