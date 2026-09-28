// 侦察：打印指定机型的「后置 / 前置」相机原文 + 解析结果
//
// 用途：巡检镜头归类是否正确（主摄 / 超广角 / 长焦 / 微距 / 色彩还原）。
// 官网写法代际差异大——老机型没有「摄像头」二字、用 ƒ 而非 f、分隔符还可能是逗号——
// 只靠 JSON 看不出是解析漏了还是页面本来就少，必须回看原文。
//
// 用法：
//   node recon/camera-dump.mjs                      # 全部 38 台，只看异常（镜头数 < 官网条数 / 类型重复）
//   node recon/camera-dump.mjs oppo-find-x8 oppo-a7-pro   # 指定机型，打印原文
//   node recon/camera-dump.mjs --all                # 全部机型，打印原文

import { parseSections, findVal, CAM_RE, toMegapixels, classifyLens } from "../specs.mjs";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const SPECS = {
  "oppo-find-x10": "series-find-x/find-x10",
  "oppo-find-x10-pro-max": "series-find-x/find-x10-pro-max",
  "oppo-find-x10-e": "series-find-x/find-x10-e",
  "oppo-find-x9": "series-find-x/find-x9",
  "oppo-find-x9-pro": "series-find-x/find-x9-pro",
  "oppo-find-x9-pro-satellite": "series-find-x/find-x9-pro-satellite",
  "oppo-find-x9-ultra": "series-find-x/find-x9-ultra",
  "oppo-find-x9s-pro": "series-find-x/find-x9s-pro",
  "oppo-find-x8": "series-find-x/find-x8",
  "oppo-find-x8-pro": "series-find-x/find-x8-pro",
  "oppo-find-x8-pro-satellite": "series-find-x/find-x8-pro-satellite",
  "oppo-find-x8-ultra": "series-find-x/find-x8-ultra",
  "oppo-find-x8s": "series-find-x/find-x8s",
  "oppo-find-x8s-plus": "series-find-x/find-x8s-plus",
  "oppo-find-x7": "series-find-x/find-x7",
  "oppo-find-x7-ultra": "series-find-x/find-x7-ultra",
  "oppo-find-x6": "series-find-x/find-x6",
  "oppo-find-x6-pro": "series-find-x/find-x6-pro",
  "oppo-find-n6": "series-find-n/find-n6",
  "oppo-find-n5": "series-find-n/find-n5",
  "oppo-reno16": "series-reno/reno16",
  "oppo-reno16-pro": "series-reno/reno16-pro",
  "oppo-reno15": "series-reno/reno15",
  "oppo-reno15-pro": "series-reno/reno15-pro",
  "oppo-reno15c": "series-reno/reno15c",
  "oppo-k15-pro": "series-k/k15-pro",
  "oppo-k15-pro-plus": "series-k/k15-pro-plus",
  "oppo-k13-turbo": "series-k/k13-turbo",
  "oppo-k13-turbo-pro": "series-k/k13-turbo-pro",
  "oppo-a7-pro": "series-a/a7-pro",
  "oppo-a7-pro-max": "series-a/a7-pro-max",
  "oppo-a6": "series-a/a6",
  "oppo-a6-pro": "series-a/a6-pro",
  "oppo-a6k": "series-a/a6k",
  "oppo-a6m": "series-a/a6m",
  "oppo-a6s-pro": "series-a/a6s-pro",
  "oppo-a6t": "series-a/a6t",
  "oppo-a6x": "series-a/a6x",
};

/** 直接复用 specs.mjs 的归类规则，这里不重复实现（改一处即两处生效） */
function parseCams(text, isFront) {
  const cams = [];
  if (!text) return cams;
  const ms = [...String(text).matchAll(CAM_RE)];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const chunk = text.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : undefined);
    const desc = (m[3] || "").trim();
    const focal = chunk.match(/等效焦距\s*([\d.]+)\s*毫米/);
    const focalMm = focal ? Number(focal[1]) : null;
    cams.push({
      type: classifyLens(desc, { isFront, focalMm }),
      desc,
      mp: toMegapixels(m[1], m[2]),
      focalMm,
      ap: `f/${m[4]}`,
    });
  }
  return cams;
}

/** 官网原文里「XX像素」出现几次，对不上就是正则漏抓 */
const countPixelPhrases = (t) => (String(t ?? "").match(/[\d.]+\s*(?:亿|万)?像素/g) || []).length;

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const picked = args.filter((a) => !a.startsWith("--"));
const targets = picked.length ? picked : Object.keys(SPECS);

const onlyBad = !picked.length && !showAll;
let problems = 0;

for (const id of targets) {
  const path = SPECS[id];
  if (!path) {
    console.log(`✗ 未知机型 ${id}`);
    continue;
  }
  const res = await fetch(`https://www.oppo.com/cn/smartphones/${path}/specs/`, { headers: HEADERS });
  const html = await res.text();
  const s = parseSections(html);
  const rearTxt = findVal(s, "摄像头", "后置") ?? "";
  const frontTxt = findVal(s, "摄像头", "前置") ?? "";
  const rear = parseCams(rearTxt, false);
  const front = parseCams(frontTxt, true);

  const expRear = countPixelPhrases(rearTxt);
  const expFront = countPixelPhrases(frontTxt);
  const typeCount = rear.reduce((a, c) => ((a[c.type] = (a[c.type] || 0) + 1), a), {});
  const dup = Object.entries(typeCount).some(([t, n]) => t === "主摄" && n > 1);
  // 两类异常都算「对不上」：① 镜头数漏抓 ② 归类错（同一台机出现多个主摄）
  const bad = rear.length !== expRear || front.length !== expFront || dup;

  if (onlyBad && !bad) continue;
  if (bad) problems++;

  console.log(`\n${bad ? "⚠" : "✓"} ${id}   后置 ${rear.length}/${expRear}  前置 ${front.length}/${expFront}${dup ? "   ← 多个「主摄」，分类可疑" : ""}`);
  if (!onlyBad) {
    console.log(`  原文后置：${rearTxt.replace(/\n/g, " ⏎ ")}`);
    console.log(`  原文前置：${frontTxt.replace(/\n/g, " ⏎ ")}`);
  }
  console.log(`  解析：${[...rear, ...front].map((c) => `${c.type}${c.mp}MP(${c.desc || "无描述"})`).join("  |  ")}`);
}

console.log(
  onlyBad
    ? `\n镜头数对不上的机型：${problems} 台（加 --all 看全部原文）`
    : `\n完成，共 ${targets.length} 台`
);
