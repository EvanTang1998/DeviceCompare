// 机型数据装载层
//
// 约定（文件名即机型 id，三处靠 id 自动关联）：
//   src/data/devices/<id>.json                       参数，其中 colors 数组声明配色与默认色
//   src/data/images/<id>.<颜色slug>.<ext>            每个配色各一张，文件名与颜色严格绑定
//   src/data/images/<id>.<颜色slug>.<角度n>.<ext>     同一配色的多角度图（n 从 1 开始），
//                                                    仅 OPPO 等官方提供多角度图的机型使用
//   src/data/images/<id>.<ext>                       仅用于「没有配色维度」的机型（第三方来源单图）
//
// 「默认色」不进文件名 —— 它由 colors[].is_default 决定，只是页面上初始选中哪一色。
// 若把它写进文件名，苹果改一次默认色（实测确实会变），同名文件的内容就被静默替换了。
//
// 例：devices/iphone-17.json + images/iphone-17.lavender.jpg + images/iphone-17.sage.jpg
// 机型 id 内部只用连字符（不含点），所以按「最后一个点」切分文件名即可

const specs = import.meta.glob("./data/devices/*.json", { eager: true, import: "default" });
const images = import.meta.glob("./data/images/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default"
});

// "./data/images/iphone-17.sage.jpg"        -> { id: "iphone-17", slug: "sage", angle: null }
// "./data/images/oppo-find-n6.jincheng.2.png" -> { id: "oppo-find-n6", slug: "jincheng", angle: 2 }
// "./data/images/iphone-13-pro.jpg"         -> { id: "iphone-13-pro", slug: null, angle: null }
const splitName = (path) => {
  const base = path.split("/").pop().replace(/\.(json|png|jpe?g|webp)$/i, "");
  const parts = base.split(".");
  // 末段是纯数字 = 多角度序号（机型 id 内部不含点，倒数第二段才是颜色 slug）
  if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
    return {
      id: parts.slice(0, -2).join("."),
      slug: parts[parts.length - 2],
      angle: Number(parts[parts.length - 1])
    };
  }
  const dot = base.lastIndexOf(".");
  return dot === -1
    ? { id: base, slug: null, angle: null }
    : { id: base.slice(0, dot), slug: base.slice(dot + 1), angle: null };
};

const bareImages = new Map(); // 机型 id -> 无配色维度的那张唯一图
const colorImages = new Map(); // 机型 id -> Map(配色 slug -> [{angle, url}] 按角度升序)

for (const [path, url] of Object.entries(images)) {
  const { id, slug, angle } = splitName(path);
  if (slug === null) {
    bareImages.set(id, url);
  } else {
    if (!colorImages.has(id)) colorImages.set(id, new Map());
    const slots = colorImages.get(id);
    if (!slots.has(slug)) slots.set(slug, []);
    slots.get(slug).push({ angle: angle ?? 1, url });
  }
}
for (const slots of colorImages.values()) {
  for (const list of slots.values()) list.sort((a, b) => a.angle - b.angle);
}

// 把 JSON 声明的配色与实际存在的图片对齐
//   有声明 → 按声明顺序输出，每色只认自己的 <id>.<slug> 图
//   没声明 → 退化成「目录里实际存在的配色图」，中文名与色值空缺
const resolveColors = (id, declared) => {
  const found = colorImages.get(id) ?? new Map();
  const urls = (slug) => (found.get(slug) ?? []).map((x) => x.url);

  if (declared.length) {
    return declared.map((c) => {
      const list = urls(c.slug);
      return {
        slug: c.slug,
        name: c.name ?? c.slug,
        hex: c.hex ?? null,
        isDefault: Boolean(c.is_default),
        image: list[0] ?? null,
        // 同一配色的全部角度图（多数机型只有 1 张）
        images: list.length ? list : null
      };
    });
  }

  return [...found.entries()].map(([slug, list]) => ({
    slug,
    name: slug,
    hex: null,
    isDefault: false,
    image: list[0].url,
    images: list.length > 1 ? list.map((x) => x.url) : null
  }));
};

// 「新款机型」= 上市 3 个月内（按 JSON 的 release_date 动态判定，随时间自动过期）
const NEW_WINDOW_MS = 3 * 30 * 24 * 60 * 60 * 1000;

const parseRelease = (p) => {
  // release_date 形如 "2026-09"，容错只填了年份
  const raw = p.data.release_date ?? (p.data.release_year ? String(p.data.release_year) : null);
  if (!raw) return null;
  const [y, m] = raw.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).getTime();
};

const isNewRelease = (p) => {
  const t = p.releaseTime;
  return t !== null && Date.now() - t <= NEW_WINDOW_MS;
};

// 按发布时间从近到远排序（没有日期的排最后），同日发布的保持 id 顺序稳定
export const phones = Object.entries(specs)
  .map(([path, spec]) => {
    const id = splitName(path).id;
    const colors = resolveColors(id, Array.isArray(spec.colors) ? spec.colors : []);
    const defaultColor = colors.find((c) => c.isDefault);

    return {
      id,
      name: spec.name,
      brand: spec.brand ?? "其他",
      // 系列（如「iPhone 17 系列」「X 系列」「Turbo 系列」），由 JSON 声明，
      // 供机型选择弹框按系列分组；缺失时归入「其他」
      series: spec.series ?? "其他",
      releaseTime: parseRelease({ data: spec }),
      // 主图：优先用「标记为默认色」那一项的图；单图机型退回裸名图
      image:
        defaultColor?.image ??
        colors.find((c) => c.image)?.image ??
        bareImages.get(id) ??
        null,
      colors,
      data: spec
    };
  })
  .map((p) => ({ ...p, isNew: isNewRelease(p) }))
  .sort((a, b) => (b.releaseTime ?? 0) - (a.releaseTime ?? 0) || a.id.localeCompare(b.id));

export const brands = [...new Set(phones.map((p) => p.brand))];
