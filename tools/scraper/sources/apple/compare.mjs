// 苹果官网对比页适配器：用 UI 自动化打开对比页，监听它自己发出的产品图请求并落盘
//
// 为什么用"监听请求"而不是"拼 URL"：
//   图片地址形如 compare_iphone_18_pro_black__f7t3q1k8wfiq_large_2x.jpg，中间那段哈希
//   （f7t3q1k8wfiq）是苹果构件的指纹，没法预测。但它一定会被页面自己请求，监听即可全拿到。
//
// 机型 → 配色的权威映射来自 DOM（.colornav-wrapper / .colornav-swatch / .colornav-label），
// 而不是从文件名反推，因此中文色名和配色归属都可靠。

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser, newPage, autoScroll, sleep } from "../../lib/browser.mjs";
import { buildModelIndex, parseCompareImageUrl, imageIdentity } from "./images.mjs";
import { appleModelToDeviceId, colorSlug, norm } from "./naming.mjs";

const BASE_URL = "https://www.apple.com.cn/iphone/compare/";

/** 苹果对比页最多同时对比 3 台，超了会自动分批 */
const DEFAULT_BATCH_SIZE = 3;

export const buildCompareUrl = (models, base = BASE_URL) =>
  `${base}?modelList=${models.map(appleUrlSegment).join(",")}`;

// 苹果的 modelList 对个别机型的段名与我们的 id 不一致（如 16e 苹果写作 iphone-16e，
// 我们是 iphone-16-e；传错会被页面静默回退到默认机型）。例外在这里登记。
const APPLE_URL_ALIASES = {
  "iphone-16-e": "iphone-16e"
};

const appleUrlSegment = (model) =>
  APPLE_URL_ALIASES[String(model).toLowerCase()] ?? model;

/**
 * 主入口
 * @param {object} opts
 * @param {string[]} opts.models        机型（苹果 slug 或我们的 id 都行，如 iphone-18-pro）
 * @param {string}   [opts.url]         直接指定完整 URL，覆盖 models
 * @param {string}   opts.outDir        输出根目录
 * @param {boolean}  [opts.headless]    是否无头
 * @param {number}   [opts.dpr]         设备像素比，2 可拿到 _large_2x 高清图
 * @param {string}   [opts.channel]     浏览器通道，默认自动探测系统 Chrome
 * @param {string}   [opts.chromePath]  Chrome 可执行文件路径
 * @param {number}   [opts.timeoutMs]   单次导航超时
 * @param {number}   [opts.batchSize]   每批对比的机型数，0 表示不分批
 * @param {boolean}  [opts.clickSwatches] 是否逐个点击配色按钮（强制加载所有配色，更全但更慢）
 */
export async function scrapeAppleCompare(opts) {
  const {
    models,
    url,
    outDir,
    headless = true,
    dpr = 2,
    channel,
    chromePath,
    timeoutMs = 60000,
    batchSize = DEFAULT_BATCH_SIZE,
    clickSwatches = true
  } = opts;

  const modelIndex = buildModelIndex(models);
  const batches = url ? [[url]] : chunk(models, batchSize);

  const sink = new Map(); // url -> { parsed, buffer, error }
  const pending = [];
  const failures = [];

  const browser = await launchBrowser({ channel, headless, chromePath });
  const { context, page } = await newPage(browser, { dpr });

  // 监听所有响应，命中产品图规律的就立刻读 body
  page.on("response", (res) => {
    const u = res.url();
    if (sink.has(u)) return;
    const parsed = parseCompareImageUrl(u, modelIndex);
    if (!parsed) return;
    const ctype = res.headers()["content-type"] || "";
    if (ctype && !ctype.startsWith("image/")) return;

    const entry = { parsed, buffer: null, error: null };
    sink.set(u, entry);
    pending.push(
      (async () => {
        try {
          const body = await res.body();
          if (!body || !body.length) throw new Error("空响应体");
          entry.buffer = body;
        } catch (err) {
          entry.error = firstLine(err.message);
        }
      })()
    );
  });

  page.on("requestfailed", (req) => {
    const u = req.url();
    if (parseCompareImageUrl(u, modelIndex)) {
      failures.push({ url: u, stage: "request", error: req.failure()?.errorText || "unknown" });
    }
  });

  const colorMaps = [];
  try {
    for (const [i, batch] of batches.entries()) {
      const target = batch.length === 1 && String(batch[0]).startsWith("http") ? batch[0] : buildCompareUrl(batch);
      console.log(`\n[${i + 1}/${batches.length}] 打开 ${target}`);

      await page.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(1200);

      await autoScroll(page);
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(600);

      // 先读一次配色表。此时页面还停留在"初始默认配色"，
      // 只有这一份数据里的 isCurrent 才代表页面真正的默认色 ——
      // 因为下面遍历点击色板会把"当前色"改成最后点到的那个。
      const mapBefore = await readColorMap(page);

      if (clickSwatches) {
        const clicked = await clickAllSwatches(page);
        console.log(`  点击配色按钮 ${clicked} 个`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await sleep(800);
      }

      // 点完再读一次，只用于补齐点击后才出现的配色
      const mapAfter = await readColorMap(page);
      const map = mergeColorMaps(mapBefore, mapAfter);
      colorMaps.push(...map);
      console.log(`  识别到机型 ${map.length} 个、配色 ${map.reduce((n, m) => n + m.colors.length, 0)} 个`);
    }
  } finally {
    await Promise.allSettled(pending);
    // 兜底：个别响应读不到 body（例如命中磁盘缓存），改用 API 请求直取
    await refetchMissing(context, sink, failures, modelIndex);
    await browser.close();
  }

  // ---- 组装结果 ----
  const domIndex = buildDomIndex(colorMaps);

  // 同机型同配色可能抓到多个尺寸，保留优先级最高的一个
  const best = new Map(); // identity -> entry
  for (const entry of sink.values()) {
    if (!entry.buffer) continue;
    const { deviceId, color } = entry.parsed;
    if (!deviceId) continue;
    const id = imageIdentity(deviceId, color);
    const prev = best.get(id);
    if (!prev || entry.parsed.rank > prev.parsed.rank) best.set(id, entry);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = resolve(outDir, stamp);
  const imgDir = resolve(runDir, "images");
  mkdirSync(imgDir, { recursive: true });

  const images = [];
  for (const entry of best.values()) {
    const { parsed } = entry;
    const dom = domIndex.get(imageIdentity(parsed.deviceId, parsed.color));
    const scaleTag = `${parsed.size}${parsed.scale}`;
    const colorPart = parsed.color || "unknown-color";
    const fileName = `${parsed.deviceId}__${colorPart}__${scaleTag}.${parsed.ext}`;
    writeFileSync(resolve(imgDir, fileName), entry.buffer);

    images.push({
      deviceId: parsed.deviceId,
      color: colorPart,
      colorName: dom?.label ?? null,
      isCurrentColor: dom?.isCurrent ?? false,
      file: `images/${fileName}`,
      bytes: entry.buffer.length,
      size: parsed.size,
      scale: parsed.scale,
      width_hint: parsed.rank,
      sourceUrl: parsed.url
    });
  }

  images.sort((a, b) => a.deviceId.localeCompare(b.deviceId) || a.color.localeCompare(b.color));

  // 同一 URL 的响应被读 body 失败、又补取失败的情况，也要如实记录
  for (const entry of sink.values()) {
    if (!entry.buffer) {
      failures.push({ url: entry.parsed.url, stage: "body", error: entry.error || "未知" });
    }
  }

  const report = {
    capturedAt: new Date().toISOString(),
    source: "apple-compare",
    dpr,
    requestedModels: models,
    colorMap: colorMaps,
    images,
    failures,
    stats: {
      matchedRequests: sink.size,
      savedImages: images.length,
      unmatched: [...sink.values()].filter((e) => !e.parsed.deviceId).length
    }
  };

  writeFileSync(resolve(runDir, "index.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(runDir, "report.md"), renderReport(report));

  return { runDir, report };
}

// ---------- 内部实现 ----------

/** 逐个点击配色按钮，强制页面把所有配色的大图都加载出来 */
async function clickAllSwatches(page) {
  let count = 0;
  const total = await page.locator(".colornav-link").count().catch(() => 0);
  for (let i = 0; i < total; i++) {
    const btn = page.locator(".colornav-link").nth(i);
    try {
      await btn.scrollIntoViewIfNeeded({ timeout: 2000 });
      await btn.click({ timeout: 3000 });
      await page.waitForTimeout(350);
      count++;
    } catch {
      // 个别按钮被遮挡或已失效，跳过即可，不影响整体
    }
  }
  return count;
}

/** 从 DOM 读「机型 → 配色」权威映射：含机型显示名、配色中文名、当前选中色 */
async function readColorMap(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const out = [];

    document.querySelectorAll(".colornav-wrapper").forEach((wrap) => {
      const wrapperCls = Array.from(wrap.classList).find(
        (c) => c.startsWith("colornav-wrapper-") && c !== "colornav-wrapper"
      );
      const modelSlug = wrapperCls ? wrapperCls.replace("colornav-wrapper-", "") : null;

      const list = wrap.querySelector("ul.colornav-items");
      const ariaLabel = clean(list?.getAttribute("aria-label")); // 选择 iPhone 18 Pro 的外观
      const name = ariaLabel.replace(/^选择\s*/, "").replace(/\s*的外观$/, "") || null;

      const colors = [];
      wrap.querySelectorAll("li.colornav-item").forEach((li) => {
        const btn = li.querySelector("button.colornav-link");
        const swatch = li.querySelector("figure.colornav-swatch");
        const swatchCls = Array.from(swatch?.classList || []).find(
          (c) => c.startsWith("colornav-swatch-") && c !== "colornav-swatch"
        );
        colors.push({
          slug: swatchCls ? swatchCls.replace("colornav-swatch-", "") : null,
          label: clean(li.querySelector(".colornav-label")?.textContent),
          isCurrent: Boolean(btn?.classList.contains("current")) || btn?.getAttribute("aria-selected") === "true"
        });
      });

      out.push({ modelSlug, name, colors });
    });

    return out;
  });
}

/**
 * 合并点击前/点击后两份配色表
 * 规则：点击前的是权威来源（isCurrent 才代表页面默认色），点击后的只用于补齐新增配色
 */
function mergeColorMaps(before, after) {
  const byModel = new Map(); // 归一化机型标识 -> { modelSlug, name, colors: Map }

  const absorb = (list, authoritative) => {
    for (const m of list) {
      const mk = norm(m.modelSlug || m.name || "");
      if (!mk) continue;
      if (!byModel.has(mk)) byModel.set(mk, { modelSlug: m.modelSlug, name: m.name, colors: new Map() });
      const target = byModel.get(mk);
      if (!target.name && m.name) target.name = m.name;
      if (!target.modelSlug && m.modelSlug) target.modelSlug = m.modelSlug;

      for (const c of m.colors) {
        if (!c.slug) continue;
        const ck = norm(c.slug);
        const existing = target.colors.get(ck);
        if (!existing) {
          target.colors.set(ck, { ...c, isCurrent: authoritative ? Boolean(c.isCurrent) : false });
        } else if (authoritative) {
          existing.isCurrent = Boolean(c.isCurrent);
          if (!existing.label && c.label) existing.label = c.label;
        }
      }
    }
  };

  absorb(before, true);
  absorb(after, false);

  return [...byModel.values()].map((m) => ({
    modelSlug: m.modelSlug,
    name: m.name,
    colors: [...m.colors.values()]
  }));
}

/** 把 DOM 的配色表转成 identity -> 配色信息 的索引 */
function buildDomIndex(colorMaps) {  const idx = new Map();
  for (const m of colorMaps) {
    const deviceId = appleModelToDeviceId(m.modelSlug || m.name || "");
    for (const c of m.colors) {
      if (!c.slug) continue;
      idx.set(imageIdentity(deviceId, c.slug), {
        label: c.label,
        isCurrent: c.isCurrent,
        modelName: m.name,
        deviceId
      });
    }
  }
  return idx;
}

/** 对没读到 body 的请求补一次直取（命中缓存时 Playwright 拿不到 body） */
async function refetchMissing(context, sink, failures, modelIndex) {
  const missing = [...sink.values()].filter((e) => !e.buffer);
  if (!missing.length) return;
  console.log(`\n补取 ${missing.length} 个未读到内容的图片…`);
  for (const entry of missing) {
    try {
      const res = await context.request.get(entry.parsed.url, { timeout: 20000 });
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
      const body = await res.body();
      if (!body.length) throw new Error("空响应体");
      entry.buffer = body;
      entry.error = null;
    } catch (err) {
      entry.error = firstLine(err.message);
      failures.push({ url: entry.parsed.url, stage: "refetch", error: entry.error });
    }
  }
}

function renderReport(report) {
  const lines = [];
  lines.push(`# 苹果对比页抓取报告`);
  lines.push("");
  lines.push(`- 抓取时间：${report.capturedAt}`);
  lines.push(`- 设备像素比：${report.dpr}${report.dpr >= 2 ? "（已拿到 2x 高清图）" : ""}`);
  lines.push(`- 命中产品图请求：${report.stats.matchedRequests} 个，成功保存 ${report.stats.savedImages} 张`);
  if (report.stats.unmatched) lines.push(`- 未能归属机型：${report.stats.unmatched} 个（多为 og:image 等杂项）`);
  if (report.failures.length) lines.push(`- 失败：${report.failures.length} 条，见 index.json`);
  lines.push("");
  lines.push(`## 配色清单`);
  lines.push("");
  for (const m of report.colorMap) {
    lines.push(`### ${m.name || m.modelSlug}`);
    for (const c of m.colors) {
      lines.push(`- ${c.label || c.slug}（${c.slug}）${c.isCurrent ? " ← 页面默认色" : ""}`);
    }
    lines.push("");
  }
  lines.push(`## 已保存图片`);
  lines.push("");
  lines.push(`| 机型 id | 配色 | 中文名 | 文件 | 大小 |`);
  lines.push(`|---|---|---|---|---|`);
  for (const img of report.images) {
    lines.push(
      `| ${img.deviceId} | ${img.color} | ${img.colorName || "—"} | ${img.file} | ${(img.bytes / 1024).toFixed(0)} KB |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

const chunk = (arr, size) => {
  if (!size || size <= 0) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const firstLine = (s) => String(s).split("\n")[0].trim();
