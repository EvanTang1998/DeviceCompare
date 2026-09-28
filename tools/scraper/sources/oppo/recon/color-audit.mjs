// 侦察：25 台有商城映射的机型，逐个验证入口 skuId 并取出全部配色名 + 角度图数
//
// 验证目的：
//   1. 官网机型页给的候选 skuId 可能指向同一 SPU 的不同 SKU（如 X9 Ultra 给了 39829/39826），
//      需要挑出能返回完整配色表的那个
//   2. 已下架机型（Find X7 Ultra 实测 27434 返回 0 配色）要提前识别出来，图片留空
//
// 用法：node recon/color-audit.mjs

const API = "https://www.opposhop.cn/cn/oapi/goods-detail/web/info/pc/sku";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://www.opposhop.cn/",
};

// [机型 id, 候选入口 skuId]
const DEVICES = [
  ["oppo-find-x10-e", [45222]],
  ["oppo-find-x9", [36846]],
  ["oppo-find-x9-pro", [36880]],
  ["oppo-find-x9-pro-satellite", [39322]],
  ["oppo-find-x9-ultra", [39829, 39826]],
  ["oppo-find-x9s-pro", [39813, 39805]],
  ["oppo-find-x8-pro", [29560]],
  ["oppo-find-x8-pro-satellite", [29560]],
  ["oppo-find-x8-ultra", [33281, 33275]],
  ["oppo-find-x8s-plus", [33368, 33363]],
  ["oppo-find-x7-ultra", [27434, 26277]],
  ["oppo-find-n5", [32589, 32586]],
  ["oppo-reno16", [41905]],
  ["oppo-reno16-pro", [40691]],
  ["oppo-reno15", [37695]],
  ["oppo-reno15-pro", [37681]],
  ["oppo-k15-pro", [39760, 39754]],
  ["oppo-k15-pro-plus", [39751]],
  ["oppo-k13-turbo", [35696]],
  ["oppo-k13-turbo-pro", [35684]],
  ["oppo-a7-pro", [45181]],
  ["oppo-a7-pro-max", [42048, 42054]],
  ["oppo-a6-pro", [36485]],
  ["oppo-a6k", [39673]],
  ["oppo-a6s-pro", [39978]],
];

async function fetchSku(skuId) {
  const res = await fetch(`${API}?skuId=${skuId}`, { headers: HEADERS });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  if (json.code !== 200 || !json.data) throw new Error("接口异常");
  return json.data;
}

async function colorsOf(skuId) {
  const data = await fetchSku(skuId);
  const skuByColor = new Map();
  for (const s of data.attributes?.skuItems ?? []) {
    if (s.key1 && s.skuId && !skuByColor.has(s.key1)) skuByColor.set(s.key1, String(s.skuId));
  }
  const colors = [];
  for (const c of data.attributesColorParams ?? []) {
    const cid = skuByColor.get(c.color);
    let angles = 0;
    if (cid) {
      try {
        const d2 = await fetchSku(cid);
        angles = (d2.galleryResource ?? []).filter((x) => x.type === "img" && /\.png(\?|$)/.test(x.url || "")).length;
      } catch {
        angles = -1;
      }
    }
    colors.push({ name: c.color, hex: (c.colorValue || "").split(",")[0] || null, skuId: cid || null, angles });
  }
  return colors;
}

const out = {};
for (const [id, cands] of DEVICES) {
  let best = null;
  for (const sku of cands) {
    try {
      const colors = await colorsOf(sku);
      if (!best || colors.length > best.colors.length) best = { sku, colors };
    } catch (e) {
      if (!best) best = { sku, colors: [], err: e.message };
    }
  }
  out[id] = best;
  const line = best.colors.length
    ? best.colors.map((c) => `${c.name}(${c.angles})`).join(" ")
    : "— 无配色" + (best.err ? ` [${best.err}]` : "");
  console.log(`${id.padEnd(28)} sku ${String(best.sku).padEnd(6)} ${best.colors.length} 色  ${line}`);
}

console.log("\n=== JSON ===");
console.log(JSON.stringify(out, null, 1));
