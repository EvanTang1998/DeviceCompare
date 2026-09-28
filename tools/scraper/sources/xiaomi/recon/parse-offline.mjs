// 离线回归：用 /tmp/mi-dump 里已抓好的页面文本跑完整 buildSpec，不需要联网/开浏览器
//
// 用法：node recon/parse-offline.mjs [机型id ...]   不带参数 = 全部 15 台
// dump 文件名是官网 slug（mi12.txt / uk-mi10.txt），按 SPECS_URLS 反查。
// 商城关键参数兜底对老机型本来就没有（isLegacyModel → []），所以 keyParams 传 [] 即可。

import { readFileSync } from "node:fs";
import { parseSections, buildSpec, META } from "../specs.mjs";

const FILE_OF = {
  "xiaomi-12": "mi12", "xiaomi-12-pro": "mi12pro", "xiaomi-12x": "mi12x",
  "xiaomi-12s": "mi12s", "xiaomi-12s-pro": "mi12s-pro", "xiaomi-12s-ultra": "mi12s-ultra",
  "xiaomi-11": "mi11", "xiaomi-11-pro": "mi11Pro", "xiaomi-11-ultra": "mi11ultra",
  "xiaomi-11-youth": "mi11youth", "xiaomi-10-ultra": "mi10ultra", "xiaomi-10s": "mi10s",
  "xiaomi-10-youth": "mi10youth", "xiaomi-10": "uk-mi10", "xiaomi-10-pro": "uk-mi10pro",
};

const ids = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const all = ids.length ? ids : Object.keys(FILE_OF);
let bad = 0;

for (const id of all) {
  const text = readFileSync(`/tmp/mi-dump/${FILE_OF[id]}.txt`, "utf8");
  const sections = parseSections(text);
  let s;
  try {
    s = buildSpec(id, META[id], sections, [], [], text);
  } catch (e) {
    bad++;
    console.log(`\n✗ ${id}: ${e.message}`);
    continue;
  }
  const probs = [];
  if (!s.chipset.chip) probs.push("无芯片");
  if (!s.chipset.ram.length || !s.chipset.rom.length) probs.push("无内存/存储");
  const b = s.body.dimensions_mm;
  if (b.height == null || b.width == null || b.depth == null || s.body.weight_g == null) probs.push(`尺寸不全 ${JSON.stringify(b)} ${s.body.weight_g}`);
  const d = s.display;
  if (d.size_inch == null || !d.resolution || d.panel == null || d.refresh_rate == null || d.max_brightness_nits == null) {
    probs.push(`屏幕不全 ${JSON.stringify({ size: d.size_inch, res: d.resolution, panel: d.panel, hz: d.refresh_rate, nit: d.max_brightness_nits })}`);
  }
  if (!s.battery.capacity_mah) probs.push("无电池");
  if (s.battery.charging_watt == null) probs.push("无有线充电");
  const rear = s.camera.filter((c) => c.type !== "前置");
  if (!rear.length || !s.camera.some((c) => c.type === "前置")) probs.push(`相机异常 ${s.camera.map((c) => c.type).join("/")}`);
  if (!s.os) probs.push("无 os");
  if (!s.biometric.fingerprint) probs.push("无指纹");
  if (!s.cellular.bands?.length) probs.push("无频段");
  if (!s.cellular.sim) probs.push("无 sim");
  if (!s.nfc) probs.push("无 NFC");

  console.log(`\n== ${id} ==${probs.length ? `  ⚠ ${probs.join("；")}` : "  ✓"}`);
  console.log(`   芯片 ${s.chipset.chip}｜${s.chipset.ram.join("/")}｜${s.chipset.rom.join("/")}`);
  console.log(`   机身 ${b.height}x${b.width}x${b.depth} ${s.body.weight_g}g｜防水 ${s.body.water_resistance}`);
  console.log(`   屏幕 ${d.size_inch}" ${d.resolution} ${d.ppi}ppi ${d.refresh_rate} ${d.panel} ${d.max_brightness_nits}nit HDR=${JSON.stringify(d.hdr_formats)}`);
  console.log(`   电池 ${s.battery.capacity_mah}mAh 有线${s.battery.charging_watt}W 无线${s.battery.wireless_charging_watt}W`);
  console.log(`   相机 ${s.camera.map((c) => `${c.type}:${c.resolution_mp ?? "–"}${c.aperture ?? ""}`).join("  ")}`);
  console.log(`   os ${JSON.stringify(s.os)}｜指纹 ${JSON.stringify(s.biometric.fingerprint)}｜sim ${JSON.stringify(s.cellular.sim)}`);
  console.log(`   频段 ${(s.cellular.bands ?? []).join(" / ")}`);
  console.log(`   NFC ${JSON.stringify(s.nfc).slice(0, 60)}...`);
}
console.log(`\n—— ${all.length} 台，${bad} 台构建失败 ——`);
