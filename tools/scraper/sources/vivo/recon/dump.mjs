// 侦察：抓一台 vivo 参数页，把 __NUXT_DATA__ 解码后的结构打出来。
// 用途：官网改版 / 新增机型时先看这里，再回去改 specs.mjs 的映射。
//
// 用法：node sources/vivo/recon/dump.mjs [slug]     默认 x500pro
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseParamPage, unflatten } from "../specs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2] || "x500pro";
const url = `https://www.vivo.com.cn/vivo/param/${slug}`;

const res = await fetch(url, {
  headers: {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  },
});
if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
const html = await res.text();

const page = parseParamPage(html);
console.log(`产品：${page.product.name}（code=${page.product.code}）  系列：${page.category?.name}`);
console.log(`页面默认配色：${page.defaultColor ?? "(未找到 active 色钮)"}`);
console.log(`\n=== productAttrs：${page.attrs.length} 组 ===`);
for (const g of page.attrs) {
  console.log(`## ${g.masterAttr.attrName}`);
  for (const a of g.slaveAttrs) {
    console.log(`   ${a.attrName} = ${String(a.attrValue).replace(/<br\s*\/?>/gi, " ⏎ ").slice(0, 140)}`);
  }
}
console.log(`\n=== imgList：${page.imgList.length} 个配色 ===`);
for (const c of page.imgList) console.log(`   ${c.colorName}  ${c.colorCode}  ${c.imgUrl}`);

// __NUXT_DATA__ 顶层形态（改版时先看这里有没有变）
const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
const arr = JSON.parse(m[1]);
console.log(`\n=== __NUXT_DATA__：${arr.length} 项，root.data 下的 useFetch 结果：`);
const root = unflatten(arr);
for (const [k, v] of Object.entries(root.data ?? {})) {
  console.log(`   ${k.slice(0, 16)}…  data keys: ${v?.data ? Object.keys(v.data).join(", ") : "?"}`);
}
console.log(`\nresolve 示例：resolve(HERE, "../..") = ${resolve(HERE, "../..")}`);
