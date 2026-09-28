// 华为配色名 → slug 映射表（官网不给英文色名，与 vivo/OPPO 同一套约定）
//
// 华为官网参数页的配色 <img> 文件名只是 gold/black 这类通用词（同机型内唯一），
// 但不同机型的「金」对应的中文色名不同（晨曦金/极昼金），所以 slug 以中文色名为准。
// 新机型先跑 specs 页看 color-text 与 <img alt>，新色名在这里补。

export const COLOR_SLUGS = {
  // Mate 80 / 80 Pro
  云杉绿: "sprucegreen",
  晨曦金: "dawngold",
  雪域白: "snowwhite",
  曜石黑: "obsidianblack",
  // Mate 80 Pro Max / 风驰版
  极昼金: "polargold",
  极光青: "auroragreen",
  极地银: "polarsilver",
  极夜黑: "polarnightblack",
  // Mate 80 RS 非凡大师
  槿紫: "hibiscuspurple",
  皓白: "brightwhite",
  玄黑: "deepblack",
  // Mate 70 / 70 Pro / 70 Pro 优享版
  风信紫: "hyacinthpurple",
  // Mate 70 Pro+
  金丝银锦: "goldbrocade",
  飞天青: "skycyan",
  羽衣白: "featherwhite",
  墨韵黑: "inkblack",
  // Mate 70 Air
  曜金黑: "obsidiangold",
  // Mate 70 RS 非凡大师
  瑞红: "auspiciousred",
  // Mate 60 / 60 Pro（60 系列官网参数页已下架，色名来自官方存档页）
  雅川青: "gracegreen",
  白沙银: "whitesilver",
  南糯紫: "sweetpurple",
  雅丹黑: "yardangblack",
  // Mate 60 Pro+
  宣白: "xuanwhite",
  砚黑: "inkstoneblack",
  // Pura 90
  罗兰紫: "violet",
  丝绒黑: "frostedblack",
  // Pura 90 Pro
  粉红芭乐: "pinkguava",
  橘子汽水: "orangesoda",
  椰青白: "coconutwhite",
  桑果黑: "mulberryblack",
  // Pura 90 Pro Max
  橘子海: "orangeocean",
  霞光紫: "sunglowpurple",
  翡翠湖: "emeraldlake",
  // Pura 80（官网英文站口径：Frosted Gold / White / Black）
  丝绒金: "frostedgold",
  丝绒绿: "frostedgreen",
  丝绒白: "frostedwhite",
  // Pura 80 Pro / Pro+（官网英文站口径：Glazed Red / White / Black）
  釉金: "glazedgold",
  釉白: "glazedwhite",
  釉黑: "glazedblack",
  釉红: "glazedred",
  釉青: "glazedcyan",
  // Pura 80 Ultra（官网英文站口径：Prestige Gold / Golden Black）
  鎏光金: "prestigegold",
  鎏光黑: "goldenblack",
  // Pura X View（阔直板，官网未上英文站，按中文名直译）
  跃影红: "leapred",
  亚麻灰: "linengray",
  零度白: "zerowhite",
  幻夜黑: "nightblack",
};

export function slugOf(colorName) {
  return COLOR_SLUGS[colorName] ?? null;
}
