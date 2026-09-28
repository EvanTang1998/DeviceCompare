// 模糊匹配：忽略空格与连字符，"iphone17" 能命中 "iPhone 17"、"iphone-16-e" 能命中 "16e"
export const normSearch = (s) => s.toLowerCase().replace(/[\s-]+/g, "");

export const fuzzyHit = (p, query) =>
  !query || normSearch(p.name).includes(query) || normSearch(p.id).includes(query);
