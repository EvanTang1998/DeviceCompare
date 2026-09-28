// 侦察：老机型（12/11/10 系列）参数页探测
//
// 与 probe-slugs.mjs 的区别：那个只看 [class*="_root_div"]（新模板），
// 老机型（13 及更早）参数区挂在 component-content__<slug> 下，甚至有第三种容器，
// 所以这里统一**按整页文本里的小节标题命中数**判定，不依赖容器。
//
// 用法：node recon/slug-probe2.mjs <slug> [<slug> ...]
// 每台会试两种 URL：/prod/<slug>/specs 与 /<slug>/specs

import { launchBrowser, newPage, autoScroll, sleep } from "../../../lib/browser.mjs";

const TITLES = [
  "外观尺寸", "内存容量", "移动平台", "屏幕显示", "指纹解锁",
  "充电续航", "续航与充电", "影像系统", "网络频段", "数据传输", "数据连接",
  "多功能NFC", "导航定位", "视频音频", "传感器", "操作系统", "包装清单",
];

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const b = await launchBrowser({ headless: true });
const { page } = await newPage(b, { width: 1440, height: 1200 });

for (const s of slugs) {
  for (const kind of ["prod", "legacy"]) {
    const url = kind === "prod" ? `https://www.mi.com/prod/${s}/specs` : `https://www.mi.com/${s}/specs`;
    let line = `${s.padEnd(24)} ${kind.padEnd(7)} `;
    try {
      await page.goto(url, { waitUntil: "load", timeout: 60000 });
      await sleep(3000);
      await autoScroll(page, { step: 900, pause: 120 });
      await sleep(1200);
      const r = await page.evaluate((titles) => {
        const body = document.body.innerText;
        const hit = titles.filter((t) => body.split("\n").some((l) => l.trim() === t));
        const cont = [...document.querySelectorAll('[class*="_root_div"], [class*="component-content__"]')]
          .map((el) => String(el.className).slice(0, 50))
          .slice(0, 3);
        return { title: document.title.trim(), hit, cont, len: body.length };
      }, TITLES);
      const ok = r.hit.length >= 8 ? "真机型" : r.hit.length >= 3 ? "疑似" : "空壳/404";
      console.log(`${line}${ok.padEnd(8)} 小节${String(r.hit.length).padStart(2)} 正文${String(r.len).padStart(6)}B  ${r.title.slice(0, 24)}  [${r.cont.join(" , ")}]`);
      console.log(`${" ".repeat(32)}命中: ${r.hit.join("/")}`);
    } catch (e) {
      console.log(`${line}失败 ${String(e.message).slice(0, 50)}`);
    }
  }
}
await b.close();
