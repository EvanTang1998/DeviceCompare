// 小米配色 slug 映射
//
// 小米商城接口只给中文色名（不给色值、不给英文），slug 统一用英文翻译
// （与 OPPO colors.mjs 同一约定：漫步云端 → cloudwalk）。色名是跨机型复用的
// 基础词（黑色 / 白色 / 冷烟紫 …），所以映射按「色名 → slug」而不是按机型分组。
//
// normColor 会剥掉「（玻璃）/（钛金属）」之类的材质后缀再查表。

const COLOR_SLUGS = {
  黑色: "black",
  白色: "white",
  冰蓝: "iceblue",
  冰融蓝: "iceblue",
  雪山粉: "snowpink",
  冷烟紫: "coolsmokepurple",
  森野绿: "forestgreen",
  星空绿: "starrygreen",
  像素黑: "pixelblack",
  晴空蓝: "skyblue",
  午夜蓝: "midnightblue",
  星云紫: "nebulapurple",
  幻彩白: "iridewhite",
  冰莓紫: "iceberrypurple",
  米白色: "offwhite",
  黑银色: "blacksilver",
  // 15 系列
  浅草绿: "grassgreen",
  丁香紫: "lilacpurple",
  亮银版: "brightsilver",
  大象灰: "elephantgrey",
  橙色: "orange",
  冰川白: "glacierwhite",
  岩石灰: "rockgrey",
  云杉绿: "sprucegreen",
  经典黑银: "blacksilver",
  松柏绿: "pinegreen",
  樱花粉: "sakurapink",
  微风蓝: "breezeblue",
  鸢尾紫: "irispurple",
  金棕色: "goldbrown",
  远空蓝: "skyblue",
  龙鳞纤维版: "dragonfiber",
  // 14 系列
  岩石青: "jadegreen",
  钛金属特别版: "titanium",
  龙晶蓝: "crystalblue",
  // 13 系列
  远山蓝: "mountainblue",
  旷野绿: "floragreen",
  陶瓷黑: "ceramicblack",
  陶瓷白: "ceramicwhite",
  橄榄绿: "olivegreen",
  // 12/11/10 系列（老机型，配色名来自官网概述页/参数页多色图色标，
  // 不走商城接口 —— 见 shop.mjs 的 LEGACY_MODELS）
  蓝色: "blue",
  绿色: "green",
  紫: "purple",
  紫色: "purple",
  黑: "black",
  蓝: "blue",
  白: "white",
  原野绿: "meadowgreen",
  经典黑: "classicblack",
  冷杉绿: "firgreen",
  卡其: "khaki",
  烟紫: "smokepurple",
  雷军签名特别版: "leijunspecial",
  大理石纹特别版: "marblespecial",
  透明版: "transparent",
  亮银版: "brightsilver",
  冰峰黑提: "blackgrape",
  清甜荔枝: "lycheewhite",
  奇异果香: "kiwigreen",
  樱花蜜粉: "honeypink",
  清凉薄荷: "mintblue",
  夏日柠檬: "lemonyellow",
  黑巧风暴: "chocostorm",
  蓝莓薄荷: "blueberrymint",
  桃子西柚: "peachgrapefruit",
  四季春奶绿: "milkteagreen",
  白桃乌龙: "whitepeachoolong",
  // 小米10 / 10 Pro 走 UK 站，色名是官方英文（全球版与国行色名不一致）
  "Coral Green": "coralgreen",
  "Twilight Grey": "twilightgrey",
  "Alpine White": "alpinewhite",
  "Solstice Grey": "solsticegrey",
};

/** 剥掉材质后缀：「像素黑（玻纤）」→「像素黑」 */
export function normColor(s) {
  return String(s).replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g).trim();
}

/** 色名 → slug；查不到返回 null（调用方决定报错还是跳过） */
export function slugOf(colorName) {
  return COLOR_SLUGS[normColor(colorName)] ?? null;
}
