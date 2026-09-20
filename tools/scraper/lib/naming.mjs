// 命名规范化：把苹果的各种写法收敛成我们的机型 id / 配色 slug
//
// 背景：同一个东西在苹果那里有三种写法
//   我们的 id      iphone-18-pro
//   URL 里的机型段  iphone_18_pro   （下划线）
//   DOM 里的类名    colornav-wrapper-iphone-18-pro（连字符）
//   配色 URL 段     mist_blue
//   配色 DOM 类名   colornav-swatch-mistblue （没有下划线）
// 所以要有一个统一的归一化函数做"同一性判断"，另外有几个函数做"输出命名"

/** 归一化：只保留字母数字并小写，专用于"判断两个写法是不是同一个东西" */
export const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** 生成我们仓库里用的文件名/id：连字符形式、纯 ASCII 小写 */
export function slugify(input) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 把苹果的机型标识收敛成我们的机型 id（也是数据/图片文件名）
 *   iphone_18_pro -> iphone-18-pro
 *   iphone17      -> iphone-17
 *   iphone_duo    -> iphone-duo
 *   iPhone 18 Pro -> iphone-18-pro
 *   iphone17promax-> iphone-17-pro-max
 */
export function appleModelToDeviceId(model) {
  const compact = norm(model); // iphone18pro
  const m = /^iphone(\d+)?(.*)$/.exec(compact);
  if (!m) return slugify(model);

  const [, num, restRaw] = m;
  // pro max / pro / plus / max / duo / air / se / e 这些后缀拆开，保证跨机型命名一致
  const rest = restRaw
    .replace(/^promax/, "pro-max")
    .replace(/^plusmax/, "plus-max")
    .replace(/^pro(?=[a-z])/, "pro-");

  const parts = ["iphone"];
  if (num) parts.push(num);
  if (rest) parts.push(...rest.split("-").filter(Boolean));
  return parts.join("-");
}

/**
 * 生成一个机型在 URL 里可能出现的所有写法，用于"最长匹配"切分文件名
 *   iphone-18-pro -> iphone18pro / iphone-18-pro / iphone_18_pro / iphone18_pro / ...
 *
 * 关键：苹果同一个文件名里会把分隔符混着用，实测至少有这三种
 *   iphone_18_pro   （全下划线）
 *   iphone17        （无分隔符）
 *   iphone16_pro    （前半无分隔符 + 后半下划线）← 只列三种固定写法会漏掉它
 * 所以这里把每处分隔符的三种可能（- / _ / 省略）全量展开，交给最长匹配去挑。
 * 展开后同一个机型会有 3^(段数-1) 个键（iphone-16-pro → 9 个），量很小，可放心枚举。
 */
export function modelMatchKeys(model) {
  const id = appleModelToDeviceId(model); // 先收敛成规范 id：iphone-16-pro
  if (!id) return [];

  const parts = id.split("-");
  let combos = [parts[0]];
  for (const part of parts.slice(1)) {
    combos = combos.flatMap((c) => [`${c}-${part}`, `${c}_${part}`, `${c}${part}`]);
  }
  // 最后一个组合就是全省略形式（iphone16pro），已覆盖 norm(model) 的作用
  return [...new Set(combos)].filter(Boolean);
}

/** 配色 slug 统一成连字符形式（mist_blue -> mist-blue） */
export const colorSlug = (c) => slugify(c);
