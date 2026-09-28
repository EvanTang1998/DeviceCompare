// 侦察：扫描 product/view 的 id 区间，找出「在售且有分色图」的商品
// 用法：node recon/id-scan.mjs <from> <to> [并发数]
// 已知种子：12S Pro=16176、13=17971、13 Pro=17969、13 Ultra=18363、14=19300

const from = Number(process.argv[2]);
const to = Number(process.argv[3]);
const conc = Number(process.argv[4] || 8);

const probe = async (id) => {
  try {
    const res = await fetch(`https://api2.order.mi.com/product/view?product_id=${id}&version=2`, {
      headers: { Referer: "https://www.mi.com/" },
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json();
    const d = j.data ?? {};
    const goods = d.goods_list ?? [];
    const names = new Set();
    for (const g of goods) {
      const n = (g.goods_info?.name || "").trim();
      if (n) names.add(n.replace(/^\S+\s+/, "")); // 去掉机型前缀
    }
    const colors = (d.buy_option ?? []).find((o) => o.name === "颜色")?.list?.map((c) => c.name) ?? [];
    const withImg = goods.filter((g) => g.goods_info?.img_url).length;
    if (goods.length && withImg) {
      return `${id}  goods:${goods.length} 有图:${withImg} 配色:[${colors.join("/")}]  例:${[...names][0] ?? "?"}`;
    }
  } catch {}
  return null;
};

const ids = [];
for (let i = from; i <= to; i++) ids.push(i);
let done = 0;
const queue = [...ids];
const workers = Array.from({ length: conc }, async () => {
  while (queue.length) {
    const id = queue.shift();
    const r = await probe(id);
    done++;
    if (r) console.log(r);
  }
});
await Promise.all(workers);
console.log(`\n扫描完成：${from}-${to} 共 ${done} 个 id`);
