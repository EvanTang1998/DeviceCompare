// 侦察：小米 17T 这类「商城在售但 specs 页为空」的机型，参数到底在哪儿
//
// 用法：node recon/overview-probe.mjs <slug>
//   1. 打开 /prod/<slug>/ 概述页，收集页面里所有含 spec/参数 的链接
//   2. 打印商品描述接口（class_parameters / goods 详情）里的关键参数

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const slug = process.argv[2] || "xiaomi-17t";
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1100 });

const url = `https://www.mi.com/prod/${slug}/`;
console.log(`打开 ${url}`);
await page.goto(url, { waitUntil: "load", timeout: 90000 });
await sleep(4000);
await autoScroll(page);
await sleep(1500);

const links = await page.evaluate(() =>
  [...document.querySelectorAll("a")]
    .map((a) => ({ href: a.href, text: (a.innerText || "").trim().slice(0, 30) }))
    .filter((x) => /spec|参数/.test(x.href + x.text) && x.text)
);
console.log("含 spec/参数 的链接：");
for (const l of links.slice(0, 10)) console.log(`  ${l.text.padEnd(20)} ${l.href.slice(0, 100)}`);

const title = await page.title();
console.log(`\n页面 title: ${title}`);
const bodyLen = await page.evaluate(() => (document.body.innerText || "").length);
console.log(`body 文本长度: ${bodyLen}`);
const head = await page.evaluate(() => (document.body.innerText || "").slice(0, 600).replace(/\n+/g, " | "));
console.log(`body 开头: ${head}`);
await b.close();
