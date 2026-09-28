// 侦察 4：英文站 specs 图是否为正面机位（Pura 海外在售；Mate 系列无海外版，预期 404）
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const cands = [
  "https://consumer.huawei.com/en/phones/pura90/specs/",
  "https://consumer.huawei.com/en/phones/pura80-pro/specs/",
  "https://consumer.huawei.com/en/phones/pura80/specs/",
];
for (const u of cands) {
  const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow" });
  const t = r.status === 200 ? await r.text() : "";
  console.log("=== " + u + " " + r.status + " " + (t ? "len " + t.length : ""));
  if (t) {
    const imgs = [...new Set([...t.matchAll(/\/content\/dam\/[^"'\\\s()]+?\.png/gi)].map((m) => m[0]))];
    for (const i of imgs.filter((x) => x.includes("/specs/")).slice(0, 12))
      console.log("   " + (i.split("/phones/")[1] || i));
    // 配色区图片的 alt
    const alts = [...t.matchAll(/<img src="([^"]+\/specs\/[^"]+\.png)"\s+alt="([^"]+)"/g)].map((m) => m[2] + " → " + m[1].split("/").pop());
    console.log("   alt: " + (alts.join(" | ") || "（无）"));
  }
}
