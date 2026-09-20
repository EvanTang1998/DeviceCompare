// 解析逻辑自检：用侦察阶段实测到的真实 URL 当用例
// 运行：node test/parse.test.mjs

import { appleModelToDeviceId, modelMatchKeys, norm } from "../lib/naming.mjs";
import { parseCompareImageUrl, buildModelIndex, imageIdentity } from "../lib/apple-images.mjs";

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
};

console.log("\n=== 机型标识收敛 ===");
check("iphone_18_pro → id", appleModelToDeviceId("iphone_18_pro"), "iphone-18-pro");
check("iphone17 → id", appleModelToDeviceId("iphone17"), "iphone-17");
check("iphone_duo → id", appleModelToDeviceId("iphone_duo"), "iphone-duo");
check("iPhone 18 Pro → id", appleModelToDeviceId("iPhone 18 Pro"), "iphone-18-pro");
check("iphone17promax → id", appleModelToDeviceId("iphone17promax"), "iphone-17-pro-max");
check("已是 id 形式保持不变", appleModelToDeviceId("iphone-17-pro"), "iphone-17-pro");

console.log("\n=== 机型匹配键（用于最长匹配）===");
// 3 处分隔符位（iphone|18|pro 之间两处）各 3 种可能 = 9 种写法，必须全覆盖
check(
  "iphone-18-pro 展开全部分隔符组合",
  modelMatchKeys("iphone-18-pro").sort(),
  [
    "iphone-18-pro",
    "iphone-18_pro",
    "iphone-18pro",
    "iphone_18-pro",
    "iphone_18_pro",
    "iphone_18pro",
    "iphone18-pro",
    "iphone18_pro",
    "iphone18pro"
  ].sort()
);
check("展开后含混搭写法 iphone16_pro", modelMatchKeys("iphone-16-pro").includes("iphone16_pro"), true);
check("iphone17 无分隔符写法仍在", modelMatchKeys("iphone-17").includes("iphone17"), true);

console.log("\n=== 产品图 URL 解析（真实侦察样本）===");
const models = ["iphone-18-pro", "iphone-17", "iphone-duo"];
const idx = buildModelIndex(models);

const cases = [
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone_18_pro_black__f7t3q1k8wfiq_large_2x.jpg", "iphone-18-pro", "black"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone17_sage__edsxj53vsn0i_large_2x.jpg", "iphone-17", "sage"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone17_mist_blue__fjf0c9euujee_large_2x.jpg", "iphone-17", "mist-blue"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone_duo_star_white__f2s3n9ds95ay_large_2x.jpg", "iphone-duo", "star-white"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone_18_pro_burgundy__mdv9ns7r6oa6_large_2x.jpg", "iphone-18-pro", "burgundy"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone17_black__epmfmcpap0sy_large.jpg", "iphone-17", "black"]
];

for (const [url, deviceId, color] of cases) {
  const p = parseCompareImageUrl(url, idx);
  check(`${url.split("/").pop()}`, [p?.deviceId, p?.color], [deviceId, color]);
}

console.log("\n=== 必须被过滤掉的杂项 ===");
check("og:image 空机型", parseCompareImageUrl("https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare__duu5jgjx6fue_og.png", idx), null);
check("非产品图 icon", parseCompareImageUrl("https://www.apple.com.cn/v/iphone/compare/am/images/overview/icon_battery__zg9rvfnxhdeq_large.jpg", idx), null);

console.log("\n=== 机型不冲突：iphone17 不能抢走 iphone18pro 的图 ===");
const idx2 = buildModelIndex(["iphone-17", "iphone-17-pro"]);
const p2 = parseCompareImageUrl("https://x/v/iphone/compare/am/images/overview/compare_iphone17pro_cosmicorange__abc123_large_2x.jpg", idx2);
check("最长匹配命中 pro", [p2.deviceId, p2.color], ["iphone-17-pro", "cosmicorange"]);

console.log("\n=== 回归：16/17 系列的分隔符混搭（真实抓取暴露的 bug）===");
// 苹果对 16 Pro 用的是 iphone16_pro：前半无分隔符 + 后半个下划线。
// 修复前最长匹配会退回 iphone16，把 Pro 的图误判成标准版，配色也变成 "pro-black-titanium"。
const idx3 = buildModelIndex(["iphone-17-pro", "iphone-16-pro", "iphone-16"]);
const cases3 = [
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone16_black__bedc0hlw316q_large_2x.jpg", "iphone-16", "black"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone16_pink__bedc0hlw316q_large_2x.jpg", "iphone-16", "pink"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone16_pro_black_titanium__c7t71uah5qky_large_2x.jpg", "iphone-16-pro", "black-titanium"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone16_pro_desert_titanium__ftixjyyve6qi_large_2x.jpg", "iphone-16-pro", "desert-titanium"],
  ["https://www.apple.com.cn/v/iphone/compare/am/images/overview/compare_iphone17_pro_cosmicorange__a1b2c3d4e5f6_large_2x.jpg", "iphone-17-pro", "cosmicorange"]
];
for (const [url, deviceId, color] of cases3) {
  const p = parseCompareImageUrl(url, idx3);
  check(`${url.split("/").pop().replace(/__.*/, "")}`, [p?.deviceId, p?.color], [deviceId, color]);
}

console.log("\n=== DOM 与 URL 的 join 键（下划线差异要能归一）===");
check("URL mist_blue == DOM mistblue", imageIdentity("iphone-17", "mist_blue") === imageIdentity("iphone-17", "mistblue"), true);
check("机型也能归一", norm("iphone_18_pro") === norm("iphone-18-pro"), true);

console.log(`\n通过 ${pass}，失败 ${fail}\n`);
process.exitCode = fail ? 1 : 0;
