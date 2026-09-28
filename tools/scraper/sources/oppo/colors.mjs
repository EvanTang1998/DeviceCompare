// OPPO 配色 slug 映射表（35 台全量）
//
// 为什么需要这张表：OPPO 官网不给英文色名，而图片文件名约定是
//   <机型 id>.<slug>.<角度>.jpg
// slug 必须稳定、跨机型可读，且与商城接口返回的中文色名能对上。
//
// 命名规则（2026-09 与用户确认）：中文色名的英文翻译，全小写、无连字符，
// 与最初 3 台（iceblue / moonwhite / titanium / black / orange）风格一致。
//
// key 用**归一化后的色名**：官网 specs 页会给色名加材质后缀（如「金色传说（锻造碳）」
// 「大漠银月（皮革）」），商城接口不带，所以统一去掉括号后缀后再查表。
// 归一化规则见 normColor()。

/**
 * 去掉官网色名的材质后缀与首尾空白。
 * 「云墨黑（玻璃）」→「云墨黑」；「星野黑」→「星野黑」
 * @param {string} s
 */
export function normColor(s) {
  return String(s)
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

/**
 * 机型 id → { 归一化色名: slug }
 * 覆盖 35 台目标机型：既有配色来自商城接口（有图的 23 台），
 * 也有仅官网 specs 页有列出的配色（图片留空的 12 台）。
 */
export const COLOR_SLUGS = {
  // ---- 首批入库（2026-09-23 前，用户手动核对过的命名）----
  "oppo-find-x10": { 冰蓝: "iceblue", 清橙: "orange", 浅钛: "titanium" },
  "oppo-find-x10-pro-max": { 月白: "moonwhite", 暖橙: "warmorange", 浅钛: "titanium" },
  "oppo-find-n6": { 深黑: "black", 金橙: "orange", 原钛: "titanium" },

  // ---- Find X 系列 ----
  "oppo-find-x10-e": { 冰蓝: "iceblue", 浅钛: "titanium" },
  "oppo-find-x9": { 追光红: "chasered", 绒光钛: "velvettitanium", 霜白: "frostwhite", 雾黑: "mistblack" },
  "oppo-find-x9-pro": { 追光红: "chasered", 绒砂钛: "sandtitanium", 霜白: "frostwhite" },
  "oppo-find-x9-pro-satellite": { 追光红: "chasered", 绒砂钛: "sandtitanium", 霜白: "frostwhite" },
  "oppo-find-x9-ultra": { 绒砂峡谷: "canyon", 极地冰川: "glacier", 大地苔原: "tundra" },
  "oppo-find-x9s-pro": { 原生钛: "nativetitanium", 自在白: "freewhite", 元气橙: "vitalorange", 乘风青: "windcyan" },
  "oppo-find-x8": { 星野黑: "starblack", 浮光白: "glowwhite", 追风蓝: "windblue", 气泡粉: "bubblepink" },
  "oppo-find-x8-pro": { 星野黑: "starblack", 漫步云端: "cloudwalk", 晴空航线: "skyroute" },
  "oppo-find-x8-pro-satellite": { 星野黑: "starblack", 漫步云端: "cloudwalk", 晴空航线: "skyroute" },
  "oppo-find-x8-ultra": { 星野黑: "starblack", 月光白: "moonwhite", 晨曦微光: "dawnlight" },
  "oppo-find-x8s": { 星野黑: "starblack", 月光白: "moonwhite", 海岛蓝: "islandblue", 落樱粉: "sakurapink" },
  "oppo-find-x8s-plus": { 星野黑: "starblack", 月光白: "moonwhite", 风信紫: "hyacinth" },
  "oppo-find-x7": { 星空黑: "starryblack", 烟云紫: "smokepurple", 白日梦想家: "daydreamer", 大漠银月: "desertsilver", 海阔天空: "seasky" },
  "oppo-find-x7-ultra": { 松影墨韵: "pineink", 大漠银月: "desertsilver", 海阔天空: "seasky" },
  "oppo-find-x6": { 飞泉绿: "springgreen", 星空黑: "starryblack", 雪山金: "snowgold" },
  "oppo-find-x6-pro": { 云墨黑: "cloudink", 飞泉绿: "springgreen", 大漠银月: "desertsilver" },

  // ---- Find N 系列 ----
  "oppo-find-n5": { 缎黑: "satinblack", 玉白: "jadewhite", 暮紫: "duskpurple" },

  // ---- Reno 系列 ----
  "oppo-reno16": { 月夜黑: "moonnight", 星河紫: "galaxypurple", 怦然星动: "starbeat", 半夏青: "summercyan" },
  "oppo-reno16-pro": { 月夜黑: "moonnight", 梦境蓝: "dreamblue", 怦然星动: "starbeat" },
  "oppo-reno15": { 可露丽棕: "caramelbrown", 极光蓝: "aurorablue", 星光蝴蝶结: "starbow", 星星粉: "starpink" },
  "oppo-reno15-pro": { 可露丽棕: "caramelbrown", 星光蝴蝶结: "starbow", 蜜糖金: "honeygold" },
  "oppo-reno15c": { 学院蓝: "campusblue", 极光蓝: "aurorablue", 星光蝴蝶结: "starbow" },

  // ---- K 系列 ----
  "oppo-k15-pro": { 金色传说: "goldlegend", 光尘粉: "dustpink", 起源灰: "origingray", 赛博光翼: "cyberwing" },
  "oppo-k15-pro-plus": { 光尘粉: "dustpink", 起源灰: "origingray", 赛博光翼: "cyberwing" },
  "oppo-k13-turbo": { 黑武士: "blacksamurai", 初号紫: "unitpurple", 骑士白: "knightwhite" },
  "oppo-k13-turbo-pro": { 黑武士: "blacksamurai", 初号紫: "unitpurple", 骑士银: "knightsilver" },

  // ---- A 系列 ----
  "oppo-a7-pro": { 大漠棕: "desertbrown", 步步生花: "flowerstep", 乘风破浪: "windsurfer" },
  "oppo-a7-pro-max": { 远山黑: "distantblack", 前橙似锦: "futureorange", 乘风破浪: "windsurfer" },
  "oppo-a6": { 丝绒灰: "velvetgray", 蓝海浮光: "oceanblue", 粉梦生花: "pinkdream" },
  "oppo-a6-pro": { 墨玉黑: "inkblack", 青云平步: "cloudstep", 流水生金: "flowgold" },
  "oppo-a6k": { 暮光蓝: "duskblue", 海贝白: "shellwhite", 曙光金: "dawngold" },
  "oppo-a6m": { 墨竹黑: "bambooblack", 紫气东来: "purpleglory", 青出于蓝: "beyondblue" },
  "oppo-a6s-pro": { 夜月生辉: "moonglow", 好运莲莲: "luckylotus", 青云直上: "skyreach" },
  "oppo-a6t": { 墨竹黑: "bambooblack", 紫气东来: "purpleglory", 青出于蓝: "beyondblue" },
  "oppo-a6x": { 墨竹黑: "bambooblack", 紫气东来: "purpleglory", 青出于蓝: "beyondblue" },
};

/** 取某机型的 slug；色名不在表里返回 null */
export function slugOf(id, colorName) {
  const table = COLOR_SLUGS[id];
  if (!table) return null;
  return table[normColor(colorName)] ?? null;
}
