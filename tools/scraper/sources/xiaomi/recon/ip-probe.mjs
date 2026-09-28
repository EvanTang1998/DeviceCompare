// 一次性探针：看 17 Pro / 17 Pro Max 渲染全文里防水/IP 的原文写法
import { fetchSpecsTexts } from "../specs.mjs";

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["xiaomi-17-pro", "xiaomi-17-pro-max"];
const texts = await fetchSpecsTexts(ids);
for (const [id, text] of Object.entries(texts)) {
  console.log(`\n===== ${id} =====`);
  const lines = text.split("\n");
  lines.forEach((l, i) => {
    if (/防水|防尘|IP\s*6|IP\s*6[89]|抗水/.test(l)) {
      console.log(`  [${i}] ${l.trim()}`);
    }
  });
}
