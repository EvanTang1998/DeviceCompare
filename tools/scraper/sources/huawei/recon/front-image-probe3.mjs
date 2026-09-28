// 侦察 3：mate80-pro 产品页 design 目录全部文件名（找正面/背面对图）
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const t = await (
  await fetch("https://consumer.huawei.com/cn/phones/mate80-pro/", { headers: { "user-agent": UA } })
).text();
const all = [...new Set([...t.matchAll(/\/content\/dam\/[^"'\\\s)]+?\.png/gi)].map((m) => m[0]))];
const design = all.filter((u) => /\/design\//.test(u));
console.log("design PNG " + design.length);
for (const u of design) console.log("   " + u.split("/mate80-pro/")[1]);
// specs 页的图名（对照）
const s = await (
  await fetch("https://consumer.huawei.com/cn/phones/mate80-pro/specs/", { headers: { "user-agent": UA } })
).text();
const specs = [...new Set([...s.matchAll(/\/content\/dam\/[^"\\\s)]+?\.png/gi)].map((m) => m[0]))];
console.log("specs PNG " + specs.length);
for (const u of specs) console.log("   " + u.split("/mate80-pro/")[1]);
