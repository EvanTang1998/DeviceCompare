// 把抓取结果"入库"到 src/data/images/
//
// 命名约定（与 src/data.js 的扫描规则一致）：
//   <机型id>.<配色slug>.<ext>   ← 每个配色各存一份，文件名与颜色严格绑定
//   <机型id>.<ext>              ← 仅用于「没有配色维度」的机型（第三方来源的单图）
//
// 「默认色」不进文件名。它只是苹果页面上初始选中的那一色，会随抓取时机变化
// （实测同一机型两次抓取，默认色从黑色变成勃艮第酒红），一旦写进文件名，
// 同一个文件名就会被不同内容静默替换、Git 里也 review 不出来。
// 哪一色默认改由 src/data/devices/<id>.json 的 colors[].is_default 决定，
// 改默认色只需改一行 JSON，不再动任何图片。
//
// 之所以要显式删除同名的其他扩展名：data.js 用 import.meta.glob 扫描整个目录，
// 若同时存在 iphone-17.lavender.png 和 iphone-17.lavender.jpg，会按字母序互相覆盖且没有任何报错。

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * @param {object} opts
 * @param {string} opts.fromRunDir   抓取产物目录（含 index.json）
 * @param {string} opts.targetDir    目标目录，通常是 src/data/images
 * @param {boolean} [opts.overwrite] 是否覆盖已存在的图
 * @param {boolean} [opts.dryRun]    只打印不写入
 * @param {string[]} [opts.devices]  只入库指定机型（留空 = 全部）
 */
export function promoteRun({ fromRunDir, targetDir, overwrite = false, dryRun = false, devices = [] }) {
  const indexPath = resolve(fromRunDir, "index.json");
  if (!existsSync(indexPath)) throw new Error(`找不到 ${indexPath}，请先跑 images 命令`);

  const report = JSON.parse(readFileSync(indexPath, "utf8"));
  const allImages = report.images || [];
  const wanted = new Set(devices.map((d) => d.toLowerCase()));
  const images = wanted.size ? allImages.filter((i) => wanted.has(String(i.deviceId).toLowerCase())) : allImages;
  if (!images.length) {
    const hint = wanted.size ? `指定机型 ${devices.join(", ")} 在本次抓取中没有图片` : "该次抓取没有图片";
    return { written: [], skipped: [], removed: [], note: hint };
  }

  // 按机型分组（每组内标注哪一色是抓取时页面默认色，仅用于输出提示）
  const byDevice = new Map();
  for (const img of images) {
    if (!byDevice.has(img.deviceId)) byDevice.set(img.deviceId, []);
    byDevice.get(img.deviceId).push(img);
  }

  const written = [];
  const skipped = [];
  const removed = [];

  if (!dryRun) mkdirSync(targetDir, { recursive: true });

  for (const [deviceId, list] of byDevice) {
    // 只用来在输出里标注「抓取时页面默认色」，不再影响命名
    const currentImg = list.find((i) => i.isCurrentColor) || list[0];

    for (const img of list) {
      const colorSlug = img.color || "default";
      const stem = `${deviceId}.${colorSlug}`;
      const ext = extname(img.file).toLowerCase();
      const destName = `${stem}${ext}`;
      const dest = resolve(targetDir, destName);
      const src = resolve(fromRunDir, img.file);

      if (existsSync(dest) && !overwrite) {
        skipped.push({ dest: destName, reason: "已存在（加 --overwrite 可覆盖）" });
        continue;
      }

      // 清掉同名不同扩展的旧文件，避免扫描时互相覆盖
      for (const other of IMAGE_EXTS.filter((e) => e !== ext)) {
        const stale = resolve(targetDir, `${stem}${other}`);
        if (existsSync(stale)) {
          if (!dryRun) rmSync(stale);
          removed.push(basename(stale));
        }
      }

      if (!dryRun) copyFileSync(src, dest);
      written.push({
        dest: destName,
        from: img.file,
        color: colorSlug,
        colorName: img.colorName,
        isCurrentColor: img === currentImg
      });
    }
  }

  return { written, skipped, removed, dryRun };
}

/** 列一下目标目录现状，便于核对 */
export function listTarget(targetDir) {
  if (!existsSync(targetDir)) return [];
  return readdirSync(targetDir)
    .filter((f) => IMAGE_EXTS.includes(extname(f).toLowerCase()))
    .map((f) => {
      const s = statSync(resolve(targetDir, f));
      return { file: f, kb: Math.round(s.size / 1024) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}
