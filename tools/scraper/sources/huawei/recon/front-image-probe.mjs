// 侦察：华为产品页（非 specs）有没有正面渲染图
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
for (const slug of ["mate80-pro", "pura90", "pura-x-view"]) {
  const r = await fetch("https://consumer.huawei.com/cn/phones/" + slug + "/", {
    headers: { "user-agent": UA },
  });
  const t = await r.text();
  console.log("=== " + slug + " HTTP " + r.status + " len " + t.length);
  // 所有 content/dam 图片，按目录归类去重
  const imgs = [...new Set([...t.matchAll(/\/content\/dam\/[^"'\\\s)]+?\.(?:png|jpg|jpeg|webp)/gi)].map((m) => m[0]))];
  console.log("  图片总数 " + imgs.length);
  // 文件名带 front/face/screen/kai/cover/positive 的
  const front = imgs.filter((u) => /front|face|screen|zheng|mian|positive|display/i.test(u));
  console.log("  文件名疑似正面（" + front.length + "）:");
  for (const u of front.slice(0, 15)) console.log("    " + u);
  // img/ 目录下的分色相关
  const imgdir = [...new Set(imgs.filter((u) => /\/img\//.test(u)).map((u) => u.replace(/\/[^/]+$/, "")))];
  console.log("  含图的目录: " + imgdir.join("\n    "));
  // 页面里 color 相关的 JS 数据（正面图可能挂在配色切换数据里）
  const m = t.match(/"colorImage[^"]*"\s*:\s*"[^"]+"/g) || t.match(/colorImage[^,]{0,120}/g);
  if (m) console.log("  colorImage 线索: " + [...new Set(m)].slice(0, 6).join(" | "));
}
