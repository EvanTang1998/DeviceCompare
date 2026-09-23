// 侦察：按分组结构 dump OPPO specs 页的全部参数项
//
// 用法：node recon/dump.cjs [find-x10|find-x10-pro-max|find-n6]
//
// 页面结构（实测 2026-09）：
// - 纯 SSR HTML，参数在 <div class="item-left-heading" data-labeKey="...">（分组，官网把 label 拼成 labeKey）
//   与 <div data-labelKey="..." class="item-right-list"><p class="key">…</p><p class="value">…</p></div>（条目）里
// - **labelKey 与中文标签/内容存在错位**（同一含义两台机器用不同 key，X10 把 SIM 卡类型标在
//   sensor 键下），所以解析只信「DOM 顺序 + 中文标签 + 值特征」，labelKey 仅作参考
// - 产品图/配色在 window.pageDsl 的 CmpProductParamPage.attr：productColorImg（多色拼图）、
//   color-list-name（"浅钛 | 清橙 | 冰蓝"）

const SLUGS = ["find-x10", "find-x10-pro-max", "find-n6"];
const URLS = {
  "find-x10": "https://www.oppo.com/cn/smartphones/series-find-x/find-x10/specs/",
  "find-x10-pro-max": "https://www.oppo.com/cn/smartphones/series-find-x/find-x10-pro-max/specs/",
  "find-n6": "https://www.oppo.com/cn/smartphones/series-find-n/find-n6/specs/",
};

function clean(s) {
  return s
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/<!---->/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main(slug) {
  const list = slug ? [slug] : SLUGS;
  for (const s of list) {
    const res = await fetch(URLS[s], {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0" },
    });
    const html = await res.text();

    // 只取参数组件区域，避免导航干扰
    const start = html.indexOf('id="ch-product-param"');
    const end = html.indexOf("ch-product-footer", start);
    const seg = html.slice(start, end > 0 ? end : undefined);

    console.log(`\n########## ${s}  (http ${res.status}, 参数区 ${seg.length} 字节) ##########`);

    // 分组标题：<div class="item-left-heading" data-labeKey="xxx"><span>尺寸与重量</span><span class="item-left-labelNum">1</span>
    // 条目：<div data-labelKey="xxx" class="item-right-list"><p class="...key">…<span>高</span>…</p><p class="...value">…</p>
    // 用游标顺序扫两类标记，保持 DOM 顺序
    const marks = [];
    for (const m of seg.matchAll(/data-labeKey="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
      marks.push({ at: m.index, kind: "group", key: m[1], text: clean(m[2]) });
    }
    for (const m of seg.matchAll(/data-labelKey="([^"]+)"[^>]*>([\s\S]*?)<\/div><\/div><\/div>/g)) {
      const blob = m[2];
      const key = clean((blob.match(/class="[^"]*key"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
      const val = clean((blob.match(/class="[^"]*value[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
      marks.push({ at: m.index, kind: "item", key: m[1], text: `${key} = ${val}` });
    }
    marks.sort((a, b) => a.at - b.at);
    for (const mk of marks) {
      console.log(mk.kind === "group" ? `\n== [${mk.key}] ${mk.text} ==` : `  (${mk.key}) ${mk.text}`);
    }
  }
}

main(process.argv[2]).catch((e) => {
  console.error(e);
  process.exit(1);
});
