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

  const checks = [
    ["站点标题", html.includes("灵眸")],
    ["iPhone 17 Pro", html.includes("iPhone 17 Pro")],
    ["一加 Ace 6", html.includes("一加 Ace 6")],
    ["芯片参数 A19 Pro", html.includes("A19 Pro")],
    ["芯片参数 骁龙 8 至尊版", html.includes("骁龙 8 至尊版")],
    ["传感器型号 IMX903", html.includes("IMX903")],
    ["摄像头分组行", html.includes("摄像头 · 主摄")]
  ];

  // 数据与图片配对检查：每台机型都应带上自己的图片
  for (const p of phones) {
    checks.push([`${p.name} 图片已配对`, Boolean(p.image)]);
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
