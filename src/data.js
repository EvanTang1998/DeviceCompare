// 机型数据装载层
// 约定：src/data/devices/ 下「同名」的 JSON 与图片属于同一台手机
//   例：iphone-17-pro.json（参数） + iphone-17-pro.png（产品图）
// 文件名（去掉扩展名）即机型的 id，页面上选择器、图片、参数表都靠这个 id 关联

const specs = import.meta.glob("./data/devices/*.json", { eager: true, import: "default" });
const images = import.meta.glob("./data/devices/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default"
});

// "./data/devices/iphone-17-pro.json" -> "iphone-17-pro"
const idOf = (path) => path.split("/").pop().replace(/\.(json|png|jpe?g|webp)$/i, "");

const BRAND_RULES = [
  { test: /iphone/i, brand: "苹果" },
  { test: /oneplus|一加/i, brand: "一加" }
];

const brandOf = (name) => BRAND_RULES.find((r) => r.test.test(name))?.brand ?? "其他";

const imageIndex = new Map(Object.entries(images).map(([path, url]) => [idOf(path), url]));

// 按 id 排序，保证每次加载顺序一致（改名即改顺序，如想固定顺序就给文件名加 01-、02- 前缀）
export const phones = Object.entries(specs)
  .map(([path, obj]) => {
    const id = idOf(path);
    const name = Object.keys(obj)[0];
    return {
      id,
      brand: brandOf(name),
      name,
      image: imageIndex.get(id) ?? null,
      data: obj[name]
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export const brands = [...new Set(phones.map((p) => p.brand))];
