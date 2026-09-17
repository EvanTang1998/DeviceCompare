// 机型数据装载层
// 约定：src/data/devices/<id>.json 是参数，src/data/images/<id>.<png|jpg|webp> 是产品图
//   例：devices/iphone-17-pro.json  +  images/iphone-17-pro.png
// 文件名（去掉扩展名）即机型 id，页面上选择器、图片、参数表都靠这个 id 关联

const specs = import.meta.glob("./data/devices/*.json", { eager: true, import: "default" });
const images = import.meta.glob("./data/images/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default"
});

// "./data/devices/iphone-17-pro.json" -> "iphone-17-pro"
const idOf = (path) => path.split("/").pop().replace(/\.(json|png|jpe?g|webp)$/i, "");

const imageIndex = new Map(Object.entries(images).map(([path, url]) => [idOf(path), url]));

// 按 id 排序，保证每次加载顺序一致（想调顺序就改文件名前缀，如 01-iphone-17-pro）
export const phones = Object.entries(specs)
  .map(([path, spec]) => {
    const id = idOf(path);
    return {
      id,
      name: spec.name,
      brand: spec.brand ?? "其他",
      image: imageIndex.get(id) ?? null,
      data: spec
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export const brands = [...new Set(phones.map((p) => p.brand))];
