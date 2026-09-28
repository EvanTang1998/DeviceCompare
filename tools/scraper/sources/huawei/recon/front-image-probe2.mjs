// 侦察 2：产品页 kv/design 目录文件名 + 华为官网对比页
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// 1) 产品页 design 目录文件名（配色切换区的主图通常在这）
for (const slug of ["mate80-pro", "pura90"]) {
  const t = await (
    await fetch("https://consumer.huawei.com/cn/phones/" + slug + "/", { headers: { "user-agent": UA } })
  ).text();
  const design = [
    ...new Set(
      [...t.matchAll(/\/content\/dam\/[^"'\\\s)]+?\/img\/(?:design|kv)\/[^"'\\\s)]+?\.(?:png|jpg|jpeg|webp)/gi)].map(
        (m) => m[0]
      )
    ),
  ];
  console.log("=== " + slug + " kv/design 图 " + design.length);
  for (const u of design.slice(0, 24)) console.log("   " + u.split("/phones/")[1]);
}

// 2) 官网对比页
for (const u of [
  "https://consumer.huawei.com/cn/phones/compare/",
  "https://consumer.huawei.com/cn/mobile-phones/compare/",
  "https://consumer.huawei.com/cn/phones/comparison/",
]) {
  try {
    const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow" });
    const t = await r.text();
    console.log("=== " + u + " → " + r.status + " " + r.url.slice(-40) + " len " + t.length);
    if (r.status === 200) {
      // 找对比接口或图片模式
      const apis = [...new Set([...t.matchAll(/["'](\/[^"']*?(?:compare|diff)[^"']*?)["']/gi)].map((m) => m[1]))];
      console.log("   compare 相关路径: " + apis.slice(0, 10).join(" | "));
      const imgs = [...new Set([...t.matchAll(/\/content\/dam\/[^"'\\\s)]+?\.png/gi)].map((m) => m[0]))];
      console.log("   页面图样例:");
      for (const i of imgs.slice(0, 8)) console.log("     " + i.split("/phones/")[1] || i);
    }
  } catch (e) {
    console.log("=== " + u + " ERR " + e.message);
  }
}
