// 无浏览器渲染验证：直接在 Node 里渲染整棵组件树，检查页面是否正常产出内容
// 用法：node scripts/ssr-check.mjs
import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import React from "react";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error"
});

try {
  const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
  const { phones } = await vite.ssrLoadModule("/src/data.js");
  const html = renderToString(React.createElement(App));

  // 首屏 4 列默认取「最新的 4 台」（App.jsx 里是 phones.slice(0, SLOT_COUNT)），
  // 所以断言不能写死具体机型 —— 每加一批新机型都会假报警。这里跟着 phones 算出来。
  // 另外不再断言具体机型的芯片/传感器型号：那是某几台的数据细节，不是「页面渲染正常」的证据，
  // 机型一旦滑出首屏就会误报。芯片/传感器是否抓到了，由下面的数据完整性检查逐台覆盖。
  const SLOT_COUNT = 4; // 与 App.jsx 的 SLOT_COUNT 保持一致

  const checks = [
    ["站点标题", html.includes("灵眸")],
    ...phones.slice(0, SLOT_COUNT).map((p) => [`首屏列：${p.name}`, html.includes(p.name)]),
    ["分区标题 芯片组", html.includes("芯片组")],
    ["分区标题 摄像头", html.includes("摄像头")]
  ];

  // 数据完整性检查：逐台核对「能不能上对比表」的必填项，
  // 抓到一半就落库（缺芯片/电池/摄像头/发布日期）这种问题靠这一组断言兜住
  for (const p of phones) {
    const d = p.data;
    checks.push([`${p.name} 品牌已标注`, Boolean(p.brand) && p.brand !== "其他"]);
    // 系列供机型选择弹框分组，缺了会掉进「其他」分组
    checks.push([`${p.name} 系列已标注`, Boolean(p.series) && p.series !== "其他"]);
    checks.push([`${p.name} 图片已配对`, Boolean(p.image)]);
    checks.push([`${p.name} 配色声明与配图齐全`, p.colors.length > 0 && p.colors.every((c) => c.image)]);
    checks.push([`${p.name} 芯片已解析`, Boolean(d.chipset?.chip)]);
    checks.push([`${p.name} 电池容量已解析`, d.battery?.capacity_mah != null]);
    checks.push([`${p.name} 摄像头非空`, Array.isArray(d.camera) && d.camera.length > 0]);
    checks.push([`${p.name} 发布日期已填`, Boolean(d.release_date)]);
  }
  console.log(`机型数：${phones.length}（${phones.map((p) => p.id).join(" / ")}）`);

  let ok = true;
  for (const [name, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
    if (!passed) ok = false;
  }
  console.log(`html length: ${html.length}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("RUNTIME ERROR:", e);
  process.exit(1);
} finally {
  await vite.close();
}
