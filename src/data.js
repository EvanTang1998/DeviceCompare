import iphone13pro from "../static/iphone13pro_specs.json";
import iphone17 from "../static/iphone17_specs.json";
import iphone17pro from "../static/iphone17pro_specs.json";
import oneplusAce6 from "../static/oneplus_ace6_specs.json";

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
  return {
    id: slugify(name),
    brand: brandOf(name),
    name,
    image: null,
    data: obj[name]
  };
});

export const brands = [...new Set(phones.map((p) => p.brand))];
