// 解析苹果对比页的产品图 URL
//
// 实测到的真实形态（同一个接口至少 4 种写法）：
//   .../overview/compare_iphone_18_pro_black__f7t3q1k8wfiq_large_2x.jpg   model=iphone_18_pro  color=black
//   .../overview/compare_iphone17_sage__edsxj53vsn0i_large_2x.jpg         model=iphone17       color=sage
//   .../overview/compare_iphone17_mist_blue__fjf0c9euujee_large_2x.jpg    model=iphone17       color=mist_blue
//   .../overview/compare_iphone_duo_star_white__f2s3n9ds95ay_large_2x.jpg model=iphone_duo     color=star_white
//   .../overview/compare__duu5jgjx6fue_og.png                             ← 空机型/空配色，必须过滤
//
// 规律：compare_{机型}_{配色}__{苹果的哈希}_{尺寸}[_2x].{扩展名}
// 注意「机型 + 配色」是连在一起的一整段，中间用下划线拼得很随意，
// 靠正则切不干净，所以改成「拿我们已知的机型列表去做最长匹配」

import { colorSlug, modelMatchKeys, norm } from "./naming.mjs";

/** 只认产品图，排除 og:image 那种空机型/空配色的杂项 */
const FILE_RE =
  /^compare_(?<key>.+?)__(?<hash>[a-z0-9]+)_(?<size>small|medium|large|xxxlarge)(?<scale>_2x|_3x)?\.(?<ext>png|jpe?g|webp)$/i;

export const isCompareImageUrl = (url) => FILE_RE.test(fileNameOf(url));

export const fileNameOf = (url) => (url.split("?")[0].split("/").pop() || "");

/** 从尺寸后缀推断分辨率优先级，越大约好 */
const SIZE_RANK = { xxxlarge: 4, large: 3, medium: 2, small: 1 };

/**
 * 解析一个产品图 URL。modelKeys 由 buildModelIndex 生成。
 * @returns {{raw, fileName, url, key, hash, size, scale, ext, deviceId, color, colorName, modelHint}|null}
 */
export function parseCompareImageUrl(url, modelIndex) {
  const fileName = fileNameOf(url);
  const m = FILE_RE.exec(fileName);
  if (!m) return null;

  const { key, hash, size, scale, ext } = m.groups;
  const { deviceId, color, modelHint } = splitKey(key, modelIndex);

  return {
    url,
    fileName,
    key,
    hash,
    size,
    scale: scale || "",
    ext: ext.toLowerCase(),
    deviceId,
    color, // 连字符形式的配色 slug，未知时为 ""
    colorName: null, // 中文色名稍后由 DOM 数据补上
    modelHint, // 命中的机型写法，便于排查
    rank: SIZE_RANK[size] ?? 0,
    dpr: scale === "_3x" ? 3 : scale === "_2x" ? 2 : 1
  };
}

/** 用"最长匹配"把 key 切成 机型 + 配色，避免 iphone17 抢走 iphone17pro 的图 */
function splitKey(key, modelIndex) {
  let best = null;
  for (const entry of modelIndex) {
    for (const mk of entry.matchKeys) {
      if (key === mk) {
        if (!best || mk.length > best.len) best = { len: mk.length, deviceId: entry.deviceId, modelHint: mk, rest: "" };
      } else if (key.startsWith(mk + "_")) {
        if (!best || mk.length > best.len)
          best = { len: mk.length, deviceId: entry.deviceId, modelHint: mk, rest: key.slice(mk.length + 1) };
      }
    }
  }
  if (!best) return { deviceId: null, color: "", modelHint: null };
  return { deviceId: best.deviceId, color: best.rest ? colorSlug(best.rest) : "", modelHint: best.modelHint };
}

/**
 * 为一组机型（Apple slug / 我们的 id 都可）建匹配索引
 * @param {string[]} models
 */
export function buildModelIndex(models) {
  return models.map((m) => ({ source: m, deviceId: m, matchKeys: modelMatchKeys(m) }));
}

/**
 * 图片身份键：机型 + 配色。DOM 侧和 URL 侧都用它做 join
 * 归一化掉下划线差异（URL 的 mist_blue 与 DOM 的 mistblue 视为同一个）
 */
export const imageIdentity = (deviceId, color) => `${norm(deviceId)}::${norm(color)}`;
