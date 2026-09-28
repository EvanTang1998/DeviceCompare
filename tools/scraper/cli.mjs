#!/usr/bin/env node
// DeviceCompare 数据采集工具的 CLI 入口
//
// 这里只做「参数解析 + 把活派给对应数据源」，不含任何抓取逻辑。
// 每个数据源在 sources/<源>/ 下自成一体，互不引用：
//
//   images / promote / list / recon  →  sources/apple/    苹果中国官网对比页（只抓图）
//   oneplus                          →  sources/oneplus/  一加中国官网 specs 页（参数 + 图片）
//   vivo                             →  sources/vivo/     vivo 中国官网参数页（参数 + 图片）
//   oppo                             →  sources/oppo/     OPPO 官网 specs 页（参数）
//                                        + 官方商城接口（分色多角度图，参数页只有拼图）
//   xiaomi                           →  sources/xiaomi/   小米官网 specs 页（参数，需浏览器渲染）
//                                        + 官方商城接口（分色图 + 关键参数兜底）
//   huawei                           →  sources/huawei/   华为官网 specs 页（参数 + 分色图，同一页）
//
// 常用：
//   node cli.mjs images --models iphone-18-pro,iphone-17    # 抓图到 out/
//   node cli.mjs promote --devices iphone-17 --dry-run      # 预览入库
//   node cli.mjs oneplus --models 15,15t --dry-run          # 一加：先预览
//
// 路径说明：苹果抓图落 tools/scraper/out/，再由 promote 入库到 src/data/images/；
//          一加直接写项目根的 src/data/devices/ 与 src/data/images/

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteRun, listTarget } from "./sources/apple/promote.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/scraper
const PROJECT_ROOT = resolve(HERE, "../..");
const DEFAULT_OUT = resolve(HERE, "out");
const DEFAULT_TARGET = resolve(PROJECT_ROOT, "src/data/images");

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "help";
const flags = parseFlags(argv.slice(command === argv[0] ? 1 : 0));

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
});

async function main() {
  switch (command) {
    case "images":
      return cmdImages();
    case "oneplus":
      return cmdOnePlus();
    case "vivo":
      return cmdVivo();
    case "huawei":
      return cmdHuawei();
    case "huawei-front":
      return cmdHuaweiFront();
    case "oppo":
      return cmdOppo();
    case "xiaomi":
      return cmdXiaomi();
    case "promote":
      return cmdPromote();
    case "list":
      return cmdList();
    case "recon":
      return cmdRecon();
    case "help":
    default:
      return printHelp();
  }
}

// ---------- images：苹果抓图 ----------

async function cmdImages() {
  const models = splitList(flags.models || flags.model);
  if (!models.length && !flags.url) {
    throw new Error(
      `必须用 --models 指定机型（苹果 slug 或我们的机型 id 都行）\n` +
        `  例：node cli.mjs images --models iphone-18-pro,iphone-17`
    );
  }

  const outDir = resolve(flags.out || DEFAULT_OUT);
  const { scrapeAppleCompare } = await import("./sources/apple/compare.mjs");

  console.log("=== 苹果对比页抓图 ===");
  console.log(`机型：${models.length ? models.join(", ") : "(由 --url 决定)"}`);
  console.log(`输出：${outDir}`);
  console.log(`像素比：${flags.dpr ?? 2}${(flags.dpr ?? 2) >= 2 ? "（取 2x 高清图）" : ""}`);

  const { runDir, report } = await scrapeAppleCompare({
    models,
    url: flags.url,
    outDir,
    headless: !flags.headed,
    dpr: Number(flags.dpr ?? 2),
    channel: flags.channel,
    chromePath: flags["chrome-path"],
    timeoutMs: Number(flags.timeout ?? 60000),
    batchSize: Number(flags["batch-size"] ?? 3),
    clickSwatches: flags["click-swatches"] !== "false" && !flags["no-click-swatches"]
  });

  console.log(`\n=== 完成 ===`);
  console.log(`命中产品图请求 ${report.stats.matchedRequests} 个，保存 ${report.stats.savedImages} 张`);
  if (report.failures.length) console.log(`失败 ${report.failures.length} 条（详见 index.json）`);
  console.log(`产物目录：${runDir}`);

  const byDevice = new Map();
  for (const img of report.images) {
    if (!byDevice.has(img.deviceId)) byDevice.set(img.deviceId, []);
    byDevice.get(img.deviceId).push(img);
  }
  console.log(`\n机型 / 配色：`);
  for (const [id, list] of byDevice) {
    const colors = list.map((i) => i.colorName || i.color).join("、");
    console.log(`  ${id.padEnd(16)} ${list.length} 色  ${colors}`);
  }

  console.log(`\n下一步（预览入库，不写入）：`);
  console.log(`  node cli.mjs promote --from "${runDir}" --dry-run`);
  console.log(`确认无误后去掉 --dry-run 正式写入 ${DEFAULT_TARGET}`);
}

// ---------- oneplus：一加官网 specs 页（参数 + 图片一步入库） ----------

async function cmdOnePlus() {
  const models = splitList(flags.models || flags.model);
  if (!models.length) {
    throw new Error(
      `必须用 --models 指定一加机型 slug（官网 URL 里那段）\n` +
        `  例：node cli.mjs oneplus --models 15,15t,13,13t`
    );
  }
  const { scrapeOnePlusSpecs } = await import("./sources/oneplus/specs.mjs");

  console.log("=== 一加官网 specs 抓取 ===");
  console.log(`机型：${models.join(", ")}`);
  if (flags["dry-run"]) console.log("（--dry-run：JSON 不写入、图片只落临时目录）");

  const { written } = await scrapeOnePlusSpecs({
    slugs: models,
    dryRun: Boolean(flags["dry-run"])
  });

  console.log(`\n=== 完成 ===`);
  console.log(`${flags["dry-run"] ? "将写入" : "已写入"} ${written.length} 个参数 JSON`);
  if (!flags["dry-run"]) {
    console.log(`图片已归一化并入库到 src/data/images/`);
    console.log(`下一步：PATH="/opt/homebrew/bin:$PATH" npm run build 验证`);
  }
}

// ---------- vivo：vivo 官网参数页（参数 + 图片一步入库） ----------

async function cmdVivo() {
  const models = splitList(flags.models || flags.model);
  if (!models.length) {
    throw new Error(
      `必须用 --models 指定 vivo 机型 slug（官网 URL /vivo/param/<slug> 里那段）\n` +
        `  例：node cli.mjs vivo --models x500pro,x300,x100`
    );
  }
  const { scrapeVivoSpecs } = await import("./sources/vivo/specs.mjs");

  console.log("=== vivo 官网参数页抓取 ===");
  console.log(`机型：${models.join(", ")}`);
  if (flags["dry-run"]) console.log("（--dry-run：JSON 不写入、图片只落临时目录）");

  const { written } = await scrapeVivoSpecs({
    slugs: models,
    dryRun: Boolean(flags["dry-run"])
  });

  console.log(`\n=== 完成 ===`);
  console.log(`${flags["dry-run"] ? "将写入" : "已写入"} ${written.length} 个参数 JSON`);
  if (!flags["dry-run"]) {
    console.log(`图片已归一化并入库到 src/data/images/`);
    console.log(`下一步：PATH="/opt/homebrew/bin:$PATH" npm run build 验证`);
  }
}

// ---------- huawei：华为官网 specs（参数 + 分色图，同一页） ----------

async function cmdHuawei() {
  const models = splitList(flags.models || flags.model);
  if (!models.length) {
    throw new Error(
      `必须用 --models 指定华为机型 id（sources/huawei/specs.mjs 的 SPECS_URLS 键）\n` +
        `  例：node cli.mjs huawei --models huawei-mate80,huawei-mate80-pro,huawei-mate80-pro-max`
    );
  }
  const { scrapeHuaweiSpecs } = await import("./sources/huawei/specs.mjs");

  console.log("=== 华为官网 specs 页抓取（参数 + 配色分色图） ===");
  console.log(`机型：${models.join(", ")}`);
  if (flags["dry-run"]) console.log("（--dry-run：JSON 不写入、图片只落临时目录）");

  const { written } = await scrapeHuaweiSpecs({
    ids: models,
    dryRun: Boolean(flags["dry-run"]),
  });

  console.log(`\n=== 完成 ===`);
  console.log(`${flags["dry-run"] ? "将写入" : "已写入"} ${written.length} 个参数 JSON`);
  if (!flags["dry-run"]) {
    console.log(`图片已归一化并入库到 src/data/images/`);
    console.log(`下一步：PATH="/opt/homebrew/bin:$PATH" npm run build 验证`);
  }
}

// ---------- huawei-front：vmall 正背组合图（裸名图，追加进每色轮播） ----------

async function cmdHuaweiFront() {
  const models = splitList(flags.models || flags.model);
  const { scrapeHuaweiFronts } = await import("./sources/huawei/front.mjs");

  console.log("=== 华为 vmall 正背组合图（官网没有正面图，见 front.mjs 头部说明） ===");
  console.log(models.length ? `机型：${models.join(", ")}` : "机型：全部（Mate 60 系列会自动跳过）");
  if (flags["dry-run"]) console.log("（--dry-run：图片只落 out/ 临时目录）");
  await scrapeHuaweiFronts({ ids: models.length ? models : undefined, dryRun: Boolean(flags["dry-run"]) });
}

// ---------- oppo：OPPO 官网 specs（参数）+ 官方商城接口（分色图） ----------

async function cmdOppo() {
  const models = splitList(flags.models || flags.model);
  if (!models.length) {
    throw new Error(
      `必须用 --models 指定 OPPO 机型 id\n` +
        `  例：node cli.mjs oppo --models oppo-find-x10,oppo-find-x10-pro-max,oppo-find-n6`
    );
  }
  const { scrapeOppoSpecs } = await import("./sources/oppo/specs.mjs");

  console.log("=== OPPO 官网 specs + 商城分色图 ===");
  console.log(`机型：${models.join(", ")}`);
  if (flags["dry-run"]) console.log("（--dry-run：JSON 只预览、图片只备份不归一化）");
  if (flags["no-images"]) console.log("（--no-images：跳过图片，只处理参数）");

  const { written } = await scrapeOppoSpecs({
    ids: models,
    dryRun: Boolean(flags["dry-run"]),
    withImages: !flags["no-images"],
  });

  console.log(`\n=== 完成 ===`);
  console.log(`${flags["dry-run"] ? "将写入" : "已写入"} ${written.length} 个参数 JSON`);
  if (!flags["dry-run"] && !flags["no-images"]) {
    console.log(`图片已归一化并入库到 src/data/images/（原图备份在 tools/scraper/out/）`);
    console.log(`下一步：PATH="/opt/homebrew/bin:$PATH" npm run build 验证`);
  }
}

// ---------- xiaomi：小米官网 specs（参数）+ 官方商城接口（分色图） ----------

async function cmdXiaomi() {
  const models = splitList(flags.models || flags.model);
  if (!models.length) {
    throw new Error(
      `必须用 --models 指定小米机型 id\n` +
        `  例：node cli.mjs xiaomi --models xiaomi-17,xiaomi-17-pro,xiaomi-17-ultra`
    );
  }
  const { scrapeXiaomiSpecs } = await import("./sources/xiaomi/specs.mjs");

  console.log("=== 小米官网 specs + 商城分色图 ===");
  console.log(`机型：${models.join(", ")}`);
  if (flags["dry-run"]) console.log("（--dry-run：JSON 只预览、图片只落临时目录不归一化）");
  if (flags["no-images"]) console.log("（--no-images：跳过图片，只处理参数）");

  const { written } = await scrapeXiaomiSpecs({
    ids: models,
    dryRun: Boolean(flags["dry-run"]),
    withImages: !flags["no-images"],
  });

  console.log(`\n=== 完成 ===`);
  console.log(`${flags["dry-run"] ? "将写入" : "已写入"} ${written.length} 个参数 JSON`);
  if (!flags["dry-run"] && !flags["no-images"]) {
    console.log(`图片已归一化并入库到 src/data/images/（原图备份在 tools/scraper/out/）`);
    console.log(`下一步：PATH="/opt/homebrew/bin:$PATH" npm run build 验证`);
  }
}

// ---------- promote：苹果图片入库 ----------

async function cmdPromote() {
  const runDir = resolve(flags.from || latestRunDir());
  const targetDir = resolve(flags.target || DEFAULT_TARGET);

  console.log("=== 图片入库 ===");
  console.log(`来源：${runDir}`);
  console.log(`目标：${targetDir}`);
  if (flags.devices) console.log(`限机型：${splitList(flags.devices).join(", ")}`);

  const result = promoteRun({
    fromRunDir: runDir,
    targetDir,
    overwrite: Boolean(flags.overwrite),
    dryRun: Boolean(flags["dry-run"]),
    devices: splitList(flags.devices)
  });

  if (flags["dry-run"]) console.log("\n（--dry-run：只预览，未写入任何文件）\n");

  if (result.written.length) {
    console.log(`\n${flags["dry-run"] ? "将写入" : "已写入"} ${result.written.length} 个文件：`);
    for (const w of result.written) {
      const label = w.colorName || w.color;
      console.log(`  ${w.dest}   （${label}）${w.isCurrentColor ? "   ← 抓取时页面默认色" : ""}`);
    }
  }
  if (result.removed.length) {
    console.log(`\n清理同名不同扩展的旧文件 ${result.removed.length} 个：`);
    for (const r of result.removed) console.log(`  - ${r}`);
  }
  if (result.skipped.length) {
    console.log(`\n跳过 ${result.skipped.length} 个（已存在）：`);
    for (const s of result.skipped) console.log(`  ${s.dest}  ${s.reason}`);
    console.log(`  提示：加 --overwrite 可覆盖`);
  }
  if (result.note) console.log(`\n${result.note}`);
}

// ---------- list：列出图片目录现状 ----------

function cmdList() {
  const targetDir = resolve(flags.target || DEFAULT_TARGET);
  console.log(`=== ${targetDir} ===`);
  const files = listTarget(targetDir);
  if (!files.length) return console.log("（无图片）");
  for (const f of files) console.log(`  ${String(f.kb).padStart(5)} KB  ${f.file}`);
  console.log(`\n共 ${files.length} 个文件`);
}

// ---------- recon：侦察脚本清单（脚本本身可直接 node 运行） ----------

async function cmdRecon() {
  console.log("侦察脚本按数据源分开放，独立运行（也可用 npm run recon:xxx）：");
  console.log("");
  console.log("苹果 —— 扒对比页请求的图 / 色板 DOM");
  console.log("  node sources/apple/recon/page.mjs [机型列表]        看页面请求了哪些图、色板与表格结构");
  console.log("  node sources/apple/recon/swatches.mjs [机型] [dpr]  深挖色板 DOM 与 2x 图");
  console.log("");
  console.log("一加 —— 扒 specs 页的 DOM 分区 / 验收入库结果");
  console.log("  node sources/oneplus/recon/dom.mjs                  看旧模板 specs 页的分区结构");
  console.log("  node sources/oneplus/recon/e2e.cjs                  入库后在真实页面上验收（需先起 dev server）");
  console.log("");
  console.log("vivo —— 扒参数页解码后的结构");
  console.log("  node sources/vivo/recon/dump.mjs [slug]             看参数分组、配色与 __NUXT_DATA__ 顶层形态");
  console.log("");
  console.log("OPPO —— 扒 specs 页字段结构 / 商城页颜色切换行为");
  console.log("  node sources/oppo/recon/dump.cjs [find-x10|find-n6] 看参数分组与全部字段");
  console.log("  node sources/oppo/recon/camera-dump.mjs [--all]   相机原文 + 归类，查漏抓与分错");
  console.log("  node sources/oppo/recon/specs-probe.mjs           全部机型 specs 页可用性");
  console.log("  node sources/oppo/recon/color-audit.mjs           参数页配色 vs 商城配色对齐");
  console.log("  node sources/oppo/recon/shop-gallery.mjs [skuId]  看商城颜色切换器与图集接口");
  console.log("");
  console.log("自检：node sources/apple/test/parse.test.mjs（或 npm test）");
  console.log("");
  console.log("加 --run page / --run swatches 可直接跑对应苹果侦察脚本。");
  if (flags.run === "page") return import("./sources/apple/recon/page.mjs");
  if (flags.run === "swatches") return import("./sources/apple/recon/swatches.mjs");
}

// ---------- 工具 ----------

function latestRunDir() {
  if (!existsSync(DEFAULT_OUT)) throw new Error(`还没有抓取产物，请先跑 images 命令（目录 ${DEFAULT_OUT} 不存在）`);
  const dirs = readdirSync(DEFAULT_OUT)
    .map((d) => resolve(DEFAULT_OUT, d))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  if (!dirs.length) throw new Error(`目录 ${DEFAULT_OUT} 下没有抓取产物`);
  return dirs[dirs.length - 1];
}

function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 极简参数解析：--key value / --flag / --key=value */
function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = true;
      }
    }
  }
  return out;
}

function printHelp() {
  console.log(`
DeviceCompare 数据采集工具

用法：
  node cli.mjs <命令> [选项]

苹果（sources/apple/，苹果中国官网对比页 —— 只抓图，参数 JSON 手工维护）
  node cli.mjs images --models <机型列表> [选项]      抓取产品图到 out/
  node cli.mjs promote [--from <产物目录>] [选项]     把抓到的图入库到 src/data/images/
  node cli.mjs list                                  列出 src/data/images/ 现状
  node cli.mjs recon                                 侦察脚本清单（改了选择器再看）

一加（sources/oneplus/，一加中国官网 specs 页 —— 参数 + 图片一步入库）
  node cli.mjs oneplus --models <一加slug列表> [--dry-run]

images 选项（苹果）：
  --models    逗号分隔的机型，如 iphone-18-pro,iphone-17,iphone-duo（必填，或改用 --url）
  --url       直接指定对比页完整 URL，覆盖 --models
  --dpr       设备像素比，默认 2（2 会拿到 _large_2x 高清图）
  --out       输出目录，默认 tools/scraper/out
  --batch-size 每批对比的机型数，默认 3（苹果对比页上限），0 表示不分批
  --no-click-swatches  不逐个点击配色按钮（更快，但可能漏掉非默认配色）
  --headed    显示浏览器窗口，便于观察
  --channel   浏览器通道（chrome / msedge），默认自动探测
  --chrome-path  Chrome 可执行文件路径
  --timeout   单次导航超时毫秒，默认 60000

promote 选项（苹果入库）：
  --from      抓取产物目录，默认取 out/ 下最新的一次
  --target    目标目录，默认 src/data/images
  --devices   只入库指定机型，逗号分隔（避免动到已有图片）
  --dry-run   只预览不写入
  --overwrite 覆盖已存在的图

oneplus 选项（一加，--models 填机型 slug 或官网完整 URL）：
  --models    逗号分隔，如 15,15t,13,13t；也可直接贴 URL（规格页路径不规律的机型用这种）
  --dry-run   JSON 不写入、图片只落临时目录，用于先检查

vivo 选项（vivo，--models 填官网 /vivo/param/<slug> 里的 slug）：
  --models    逗号分隔，如 x500pro,x300,x100；也可直接贴完整 URL
  --dry-run   JSON 不写入、图片只落临时目录，用于先检查

huawei 选项（华为，--models 填本项目机型 id，参数与分色图同来自官网 specs 页）：
  --models    逗号分隔，如 huawei-mate80,huawei-pura90-pro-max,huawei-mate60-rs
  --dry-run   JSON 不写入、图片只落临时目录，用于先检查
              （Mate 60 系列官网参数页已下架，自动走 sources/huawei/legacy.mjs 的官方存档数据）

   跑全部机型：
     node cli.mjs huawei --models "$(grep -oE '^  \"huawei-[a-z0-9-]+\":' sources/huawei/specs.mjs | sed 's/[\": ]//g' | sort -u | paste -sd, -)"

oppo 选项（OPPO，--models 填本项目机型 id，参数来自官网 specs 页、分色图来自官方商城接口）：
  --models      逗号分隔，如 oppo-find-x10,oppo-find-x10-pro-max,oppo-find-n6
  --dry-run     JSON 只预览、图片只备份不归一化
  --no-images   只处理参数，跳过商城图片（改完解析逻辑自查用）

xiaomi 选项（小米，--models 填本项目机型 id，参数来自官网 specs 页、分色图来自官方商城接口）：
  --models      逗号分隔，如 xiaomi-17,xiaomi-17-pro-max,xiaomi-17-ultra
  --dry-run     JSON 只预览、图片只落临时目录
  --no-images   只处理参数，跳过商城图片

   跑全部机型：
     node cli.mjs xiaomi --models xiaomi-17,xiaomi-17-pro,xiaomi-17-pro-max,xiaomi-17-ultra,xiaomi-17-max,xiaomi-17t,xiaomi-17t-pro

   跑全部机型：
     node cli.mjs oppo --models "$(grep -oE '^  \"oppo-[a-z0-9-]+\":' sources/oppo/specs.mjs | sed 's/[\": ]//g' | sort -u | paste -sd, -)" --no-images
   ⚠ 商城已下架 / 官网没挂购买链接的机型没有分色图，参数照常入库、图片留空（正常，非报错）

示例：
  node cli.mjs images --models iphone-18-pro,iphone-17
  node cli.mjs promote --devices iphone-18-pro --dry-run
  node cli.mjs oneplus --models 15,15t --dry-run
  node cli.mjs oneplus --models https://www.oneplus.com/cn/ace-5-ultra-specs
  node cli.mjs vivo --models x500pro,x300 --dry-run
  node cli.mjs oppo --models oppo-find-x10-e --no-images
  node cli.mjs xiaomi --models xiaomi-17,xiaomi-17-ultra --dry-run
  node cli.mjs huawei --models huawei-mate80,huawei-mate80-pro-max --dry-run
`);
}
