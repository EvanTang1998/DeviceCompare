// 侦察：直接打商城 product/view，看机型名 / 配色 / 图是否可用
// 用法：node recon/shop-id-probe.mjs <product_id> [<product_id> ...]
const ids = process.argv.slice(2);
for (const id of ids) {
  try {
    const res = await fetch(`https://api2.order.mi.com/product/view?product_id=${id}&version=2`, {
      headers: { Referer: "https://www.mi.com/" },
    });
    const j = await res.json();
    const d = j.data ?? {};
    const colors = (d.buy_option ?? [])
      .filter((o) => o.name === "颜色")
      .flatMap((o) => (o.list ?? []).map((c) => c.name));
    const goods = d.goods_list ?? [];
    const withImg = goods.filter((g) => g.goods_info?.img_url).length;
    console.log(
      `${id}  ${d.goods_name ?? j.message ?? "?"}  配色:${colors.join("/") || "(无)"}  goods:${goods.length} 有图:${withImg} 在售:${d.status ?? "?"}`
    );
  } catch (e) {
    console.log(`${id}  请求失败 ${e.message}`);
  }
}
