#!/usr/bin/env node
// DeviceCompare 数据采集工具的 CLI 入口
//
// 这里只做「参数解析 + 把活派给对应数据源」，不含任何抓取逻辑。
// 每个数据源在 sources/<源>/ 下自成一体，互不引用：
//
//   images / promote / list / recon  →  sources/apple/    苹果中国官网对比页（只抓图）
//   oneplus                          →  sources/oneplus/  一加中国官网 specs 页（参数 + 图片）
//   vivo                             →  sources/vivo/     vivo 中国官网参数页（参数 + 图片）
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

示例：
  node cli.mjs images --models iphone-18-pro,iphone-17
  node cli.mjs promote --devices iphone-18-pro --dry-run
  node cli.mjs oneplus --models 15,15t --dry-run
  node cli.mjs oneplus --models https://www.oneplus.com/cn/ace-5-ultra-specs
  node cli.mjs vivo --models x500pro,x300 --dry-run
`);
}
