// 一次性探针：看商城关键参数里有没有防水等级
import { fetchKeyParams } from "../shop.mjs";

for (const id of ["xiaomi-17-pro", "xiaomi-17-pro-max"]) {
  const kp = await fetchKeyParams(id);
  console.log(`\n===== ${id} =====`);
  for (const item of kp) {
    if (/防水|防尘|IP|抗水/.test(item.name + item.value)) {
      console.log(`  ${item.name}: ${item.value}`);
    }
  }
}
