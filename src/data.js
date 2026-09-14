import iphone13pro from "../static/iphone13pro_specs.json";
import iphone17 from "../static/iphone17_specs.json";
import iphone17pro from "../static/iphone17pro_specs.json";
import oneplusAce6 from "../static/oneplus_ace6_specs.json";

// 自动收集 src/assets/phones/ 下的图片，文件名 = 机型的 id（如 iphone-17-pro.png）
const images = import.meta.glob("./assets/phones/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default"
});

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");

const brandOf = (name) => {
  if (name.includes("iPhone")) return "苹果";
  if (name.includes("一加")) return "一加";
  return "其他";
};

const raw = [iphone17pro, iphone17, iphone13pro, oneplusAce6];

export const phones = raw.map((obj) => {
  const name = Object.keys(obj)[0];
  const id = slugify(name);
  return {
    id,
    brand: brandOf(name),
    name,
    image: images[`./assets/phones/${id}.png`] || images[`./assets/phones/${id}.jpg`] || null,
    data: obj[name]
  };
});

export const brands = [...new Set(phones.map((p) => p.brand))];
