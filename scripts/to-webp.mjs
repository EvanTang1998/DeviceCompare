// 把 src/data/images/ 下的原图批量转成同目录同名的 .webp 副本。
//
// 为什么是「副本」而不是「替换」：
//   原图（jpg/png）是唯一的源，必须留在仓库里；.webp 是派生产物，已被 .gitignore 忽略。
//   网站运行时只引用 .webp —— 具体由 src/data.js 的 import.meta.glob 决定。
//
// 为什么用 sharp 而不是 cwebp / ImageMagick：
//   构建跑在 GitHub Actions 的 ubuntu-latest 上（见 .github/workflows/deploy.yml），
//   那里只有 npm 依赖、没有系统级命令行工具；sharp 自带预编译二进制，本地与 CI 行为一致。
//
// 用法：
//   node scripts/to-webp.mjs           增量转换（.webp 比源图新则跳过）
//   node scripts/to-webp.mjs --force   强制全部重转
//
// 由 package.json 的 prebuild / predev 自动调用，通常不需要手动执行。

import { readdir, stat, unlink } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_DIR = join(ROOT, "src/data/images");

// 源图扩展名（小写）。webp 本身不在此列 —— 它是产物，不是源
const SOURCE_EXT = new Set([".png", ".jpg", ".jpeg"]);

// 82 是 WebP 有损压缩的甜点：手机产品图（浅色背景 + 细腻渐变）在这个档位肉眼无差，
// 体积通常只剩 JPG 的 35%~50%。再往上加质量，体积涨得快、收益骤减
const QUALITY = 82;

// sharp 的 effort 取 0~6：越高体积略小、耗时越长。552 张的规模下 5 是合适平衡
const EFFORT = 5;

// 并发路数。552 张串行要一分钟上下，8 路并发压到几秒
const CONCURRENCY = 8;

const force = process.argv.includes("--force");

const webpNameOf = (name) => basename(name, extname(name)) + ".webp";

const mtime = async (p) => {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return null;
  }
};

const size = async (p) => {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
};

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";

const main = async () => {
  let names;
  try {
    names = await readdir(IMAGE_DIR);
  } catch (err) {
    console.error(`✗ 读不到图片目录 ${IMAGE_DIR}：${err.message}`);
    process.exit(1);
  }

  const sources = names.filter((n) => SOURCE_EXT.has(extname(n).toLowerCase())).sort();
  if (!sources.length) {
    console.error(`✗ ${IMAGE_DIR} 下没有找到任何源图（${[...SOURCE_EXT].join("/")}）`);
    process.exit(1);
  }

  // 孤儿清理：源图已被删除、但 .webp 还留在目录里的，一并删掉。
  // 否则残留的 .webp 会被 data.js 的 glob 扫到，网站上会冒出「幽灵机型」。
  // 只删派生产物（.webp 已被 .gitignore 忽略，随时可重建），不碰任何源图。
  const sourceSet = new Set(sources.map(webpNameOf));
  const orphans = names.filter((n) => n.toLowerCase().endsWith(".webp") && !sourceSet.has(n));
  for (const name of orphans) await unlink(join(IMAGE_DIR, name));

  const converted = [];
  const skipped = [];
  const failed = [];

  let cursor = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      const name = sources[cursor++];
      const src = join(IMAGE_DIR, name);
      const dest = join(IMAGE_DIR, webpNameOf(name));

      if (!force) {
        const [destTime, srcTime] = await Promise.all([mtime(dest), mtime(src)]);
        if (destTime !== null && srcTime !== null && destTime >= srcTime) {
          skipped.push(name);
          continue;
        }
      }

      try {
        await sharp(src).webp({ quality: QUALITY, effort: EFFORT }).toFile(dest);
        converted.push(name);
      } catch (err) {
        failed.push(`${name}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  let srcTotal = 0;
  let destTotal = 0;
  for (const name of sources) {
    srcTotal += await size(join(IMAGE_DIR, name));
    destTotal += await size(join(IMAGE_DIR, webpNameOf(name)));
  }

  const label = force ? "强制重转" : "增量转换";
  console.log(`WebP ${label}：转换 ${converted.length} 张、跳过 ${skipped.length} 张`);
  if (orphans.length) console.log(`  已清理 ${orphans.length} 张源图不存在的孤儿 .webp`);
  console.log(`  原图 ${mb(srcTotal)} → WebP ${mb(destTotal)}（省 ${(100 - (destTotal / srcTotal) * 100).toFixed(1)}%）`);

  if (failed.length) {
    // 转换失败必须让命令非零退出：漏掉的图不会进 glob，网站会静默缺图，
    // 在 CI 上直接把构建拦下来，好过部署一个残缺站点
    console.error(`\n✗ ${failed.length} 张转换失败：`);
    for (const line of failed.slice(0, 10)) console.error("  " + line);
    if (failed.length > 10) console.error(`  …另有 ${failed.length - 10} 张`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error("✗ 转换出错：" + err.message);
  process.exit(1);
});
