// 机型数据装载层
//
// 约定（文件名即机型 id，三处靠 id 自动关联）：
//   src/data/devices/<id>.json              参数，其中 colors 数组声明配色与默认色
//   src/data/images/<id>.<颜色slug>.<ext>   每个配色各一张，文件名与颜色严格绑定
//   src/data/images/<id>.<ext>              仅用于「没有配色维度」的机型（第三方来源单图）
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

// "./data/images/iphone-17.sage.jpg" -> { id: "iphone-17", slug: "sage" }
// "./data/images/iphone-13-pro.jpg"  -> { id: "iphone-13-pro", slug: null }
const splitName = (path) => {
  const base = path.split("/").pop().replace(/\.(json|png|jpe?g|webp)$/i, "");
  const dot = base.lastIndexOf(".");
  return dot === -1 ? { id: base, slug: null } : { id: base.slice(0, dot), slug: base.slice(dot + 1) };
};

const bareImages = new Map(); // 机型 id -> 无配色维度的那张唯一图
const colorImages = new Map(); // 机型 id -> Map(配色 slug -> url)

for (const [path, url] of Object.entries(images)) {
  const { id, slug } = splitName(path);
  if (slug === null) {
    bareImages.set(id, url);
  } else {
    if (!colorImages.has(id)) colorImages.set(id, new Map());
    colorImages.get(id).set(slug, url);
  }
}

// 把 JSON 声明的配色与实际存在的图片对齐
//   有声明 → 按声明顺序输出，每色只认自己的 <id>.<slug> 图
//   没声明 → 退化成「目录里实际存在的配色图」，中文名与色值空缺
const resolveColors = (id, declared) => {
  const found = colorImages.get(id) ?? new Map();

  if (declared.length) {
    return declared.map((c) => ({
      slug: c.slug,
      name: c.name ?? c.slug,
      hex: c.hex ?? null,
      isDefault: Boolean(c.is_default),
      image: found.get(c.slug) ?? null
    }));
  }

  return [...found.entries()].map(([slug, url]) => ({
    slug,
    name: slug,
    hex: null,
    isDefault: false,
    image: url
  }));
};

// 按 id 排序，保证每次加载顺序一致（想调顺序就改文件名前缀，如 01-iphone-17-pro）
export const phones = Object.entries(specs)
  .map(([path, spec]) => {
    const id = splitName(path).id;
    const colors = resolveColors(id, Array.isArray(spec.colors) ? spec.colors : []);
    const defaultColor = colors.find((c) => c.isDefault);

    return {
      id,
      name: spec.name,
      brand: spec.brand ?? "其他",
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
  .sort((a, b) => a.id.localeCompare(b.id));

export const brands = [...new Set(phones.map((p) => p.brand))];
