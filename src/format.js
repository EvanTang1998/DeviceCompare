// 官网查不到的参数一律留空：数据里若残留「未公开」这类占位文案，也按空处理，
// 页面上只显示「—」，不出现任何解释性文字。
const PLACEHOLDER = /^(未公开|未公布|暂无|待补充|官方未)/;

/**
 * 参数值的统一呈现：空值/占位文案一律「—」，数组按行用「 / 」连起来。
 * 对比表与参数浮窗共用 —— 同一个值在两处必须长得一样。
 */
export const fmt = (v) => {
  if (v === null || v === undefined || v === "" || v === 0) return "—";
  if (Array.isArray(v)) {
    const parts = v.map(fmt).filter((x) => x !== "—");
    return parts.length ? parts.join(" / ") : "—";
  }
  return PLACEHOLDER.test(String(v).trim()) ? "—" : String(v);
};
