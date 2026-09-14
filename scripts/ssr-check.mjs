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
  const html = renderToString(React.createElement(App));
  const checks = [
    ["灵眸", html.includes("灵眸")],
    ["iPhone 17 Pro", html.includes("iPhone 17 Pro")],
    ["一加 Ace 6", html.includes("一加 Ace 6")],
    ["A19 Pro", html.includes("A19 Pro")],
    ["骁龙 8 至尊版", html.includes("骁龙 8 至尊版")],
    ["IMX903", html.includes("IMX903")],
    ["主摄", html.includes("摄像头 · 主摄")]
  ];
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
