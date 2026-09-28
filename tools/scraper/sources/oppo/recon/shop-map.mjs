// 侦察：官网机型页 → 商城入口 skuId 映射覆盖率
//
// 链路（已验证 2026-09）：oppo.com 机型页是 SSR HTML，购买区带商城商品页链接
//   https://www.opposhop.cn/cn/web/products/<skuId>.html
// 该商品页 HTML 同样是 SSR，内含该 SPU 的全部 skuId（shop.mjs 用的入口）。
//
// 注意：官网每页都带一组固定的推广位链接（Pad 6 / Watch S2 / Enco X4），
// 需要按商品标题过滤掉，只留真正的手机。
//
// 用法：node recon/shop-map.mjs

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

// [项目里用的机型 id, 官网路径]
const DEVICES = [
  ["oppo-find-x10-e", "series-find-x/find-x10-e"],
  ["oppo-find-x9", "series-find-x/find-x9"],
  ["oppo-find-x9-pro", "series-find-x/find-x9-pro"],
  ["oppo-find-x9-pro-satellite", "series-find-x/find-x9-pro-satellite"],
  ["oppo-find-x9-ultra", "series-find-x/find-x9-ultra"],
  ["oppo-find-x9s-pro", "series-find-x/find-x9s-pro"],
  ["oppo-find-x8", "series-find-x/find-x8"],
  ["oppo-find-x8-pro", "series-find-x/find-x8-pro"],
  ["oppo-find-x8-pro-satellite", "series-find-x/find-x8-pro-satellite"],
  ["oppo-find-x8-ultra", "series-find-x/find-x8-ultra"],
  ["oppo-find-x8s", "series-find-x/find-x8s"],
  ["oppo-find-x8s-plus", "series-find-x/find-x8s-plus"],
  ["oppo-find-x7", "series-find-x/find-x7"],
  ["oppo-find-x7-ultra", "series-find-x/find-x7-ultra"],
  ["oppo-find-x6", "series-find-x/find-x6"],
  ["oppo-find-x6-pro", "series-find-x/find-x6-pro"],
  ["oppo-find-n5", "series-find-n/find-n5"],
  ["oppo-reno16", "series-reno/reno16"],
  ["oppo-reno16-pro", "series-reno/reno16-pro"],
  ["oppo-reno15", "series-reno/reno15"],
  ["oppo-reno15-pro", "series-reno/reno15-pro"],
  ["oppo-reno15c", "series-reno/reno15c"],
  ["oppo-k15-pro", "series-k/k15-pro"],
  ["oppo-k15-pro-plus", "series-k/k15-pro-plus"],
  ["oppo-k13-turbo", "series-k/k13-turbo"],
  ["oppo-k13-turbo-pro", "series-k/k13-turbo-pro"],
  ["oppo-a7-pro", "series-a/a7-pro"],
  ["oppo-a7-pro-max", "series-a/a7-pro-max"],
  ["oppo-a6", "series-a/a6"],
  ["oppo-a6-pro", "series-a/a6-pro"],
  ["oppo-a6k", "series-a/a6k"],
  ["oppo-a6m", "series-a/a6m"],
  ["oppo-a6s-pro", "series-a/a6s-pro"],
  ["oppo-a6t", "series-a/a6t"],
  ["oppo-a6x", "series-a/a6x"],
];

// 官网每页固定带的推广位（非手机）
const PROMO = new Set(["41012", "47804", "47836"]);

const titleCache = new Map();

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function titleOf(productId) {
  if (titleCache.has(productId)) return titleCache.get(productId);
  let title = "";
  try {
    const html = await fetchText(`https://www.opposhop.cn/cn/web/products/${productId}.html`);
    title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.trim() || "(无标题)";
  } catch (e) {
    title = "(抓取失败 " + e.message + ")";
  }
  titleCache.set(productId, title);
  return title;
}

const rows = [];
for (const [id, path] of DEVICES) {
  const url = `https://www.oppo.com/cn/smartphones/${path}/`;
  let ids = [];
  let err = "";
  try {
    const html = await fetchText(url);
    ids = [...new Set([...html.matchAll(/opposhop\.cn\/cn\/web\/products\/(\d+)\.html/g)].map((m) => m[1]))].filter(
      (x) => !PROMO.has(x)
    );
    // 顺带记录机型页是否还在（有些老机型可能 404）
    if (!html.includes("ch-product-param") && !/specs/i.test(html)) err = "页面无参数组件";
  } catch (e) {
    err = "机型页 " + e.message;
  }
  rows.push({ id, path, ids, err });
}

console.log("=== 官网机型页 → 商城候选 skuId ===");
for (const r of rows) {
  const titles = [];
  for (const pid of r.ids) titles.push(`${pid}(${await titleOf(pid)})`);
  console.log(
    `${r.id.padEnd(28)} ${r.ids.length ? titles.join("  ") : "（无商城链接）"}${r.err ? "   ⚠ " + r.err : ""}`
  );
}

const hit = rows.filter((r) => r.ids.length).length;
console.log(`\n覆盖：${hit}/${rows.length}`);
