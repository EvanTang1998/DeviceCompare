// 一次性探针：渲染任意 specs URL，数参数小节
import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const urls = process.argv.slice(2);
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });
for (const url of urls) {
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await sleep(3000);
  await autoScroll(page, { step: 900, pause: 120 });
  await sleep(1200);
  const r = await page.evaluate(() => {
    const root = document.querySelector('[class*="_root_div"]');
    const text = root ? root.innerText : "";
    const lines = new Set(text.split("\n").map((l) => l.trim()));
    const TITLES = ["外观尺寸","内存容量","移动平台","屏幕显示","指纹解锁","充电续航","影像系统","网络频段","数据传输","多功能NFC","操作系统"];
    const hits = TITLES.filter((t) => lines.has(t));
    return { len: text.length, hits };
  });
  console.log(`${url}\n  文本 ${r.len}B，命中小节：${r.hits.join("、") || "(无)"}`);
}
await b.close();
