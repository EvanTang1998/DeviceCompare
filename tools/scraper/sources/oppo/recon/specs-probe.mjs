// 侦察：35 台目标机型的官网 specs 页可用性
//
// 目的：图片侧已有 25/35 的商城映射，但参数侧必须先确认 specs 页存在且结构
// 与解析器兼容（老的 Find X6/X7 系列、A 系列低端机的参数分组可能不同）。
//
// 用法：node recon/specs-probe.mjs

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

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

function clean(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function probe(id, path) {
  const url = `https://www.oppo.com/cn/smartphones/${path}/specs/`;
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!res.ok) return { id, status: res.status, note: "HTTP " + res.status };
    const html = await res.text();
    const has = html.includes('id="ch-product-param"');
    if (!has) return { id, status: 200, note: "无 ch-product-param 组件" };

    const start = html.indexOf('id="ch-product-param"');
    const end = html.indexOf("ch-product-footer", start);
    const seg = html.slice(start, end > 0 ? end : undefined);

    const groups = [...seg.matchAll(/data-labeKey="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => clean(m[2]));
    const items = [...seg.matchAll(/data-labelKey="([^"]+)"[^>]*>([\s\S]*?)<\/div><\/div><\/div>/g)];
    const colorNames = [...html.matchAll(/color-list-name[^>]*>([\s\S]*?)<\/(?:span|div|p)>/g)].map((m) => clean(m[1]));
    return { id, status: 200, groups: groups.length, items: items.length, colors: colorNames, firstGroups: groups.slice(0, 3) };
  } catch (e) {
    return { id, status: 0, note: "抓取失败 " + e.message };
  }
}

const results = [];
for (let i = 0; i < DEVICES.length; i += 4) {
  const batch = DEVICES.slice(i, i + 4);
  results.push(...(await Promise.all(batch.map(([id, p]) => probe(id, p)))));
}

console.log("=== specs 页可用性 ===");
for (const r of results) {
  if (r.note) {
    console.log(`✗ ${r.id.padEnd(28)} ${r.note}`);
  } else {
    console.log(
      `✓ ${r.id.padEnd(28)} 分组 ${String(r.groups).padStart(2)}  条目 ${String(r.items).padStart(3)}  配色 ${r.colors.length}  [${r.firstGroups.join(" / ")}]`
    );
  }
}
const ok = results.filter((r) => !r.note).length;
console.log(`\n可用：${ok}/${results.length}`);
