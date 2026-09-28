// 地址栏状态同步。
//
// 参数只有三个，顺序固定（cart → view → phone），所以同一个状态永远得到同一个地址，
// 用户复制的链接和别人的地址栏能精确对上：
//   /            首页、暂存区空
//   ?cart=a,b    首页、暂存区有 a b 两台
//   ?cart=a,b&view=compare    对比页
//   ?cart=a,b&phone=x         首页 + x 的参数浮窗
//
// 为什么是查询参数、不是 /compare 这种路径：
//   GitHub Pages 是纯静态托管，没有服务端 rewrite，它只会"照着路径去找文件"。
//   真去访问 /compare 会 404。而查询参数永远指向同一个 index.html，
//   刷新、分享、直接打开都不会 404 —— 这也是 hash（#/compare）之外唯一不花钱的路子。
//
// 为什么不用 hash：查询参数分享出去更像一条正常链接，参数名还能自解释
//   （?cart=...&view=compare 一眼看得懂），不值得为了少几个字符换成井号。
//
// 这里只做「字符串 ⇄ 状态对象」的纯转换，不碰 history、不碰 React，
// 于是能被 ssr-check 直接 import，也能在浏览器里单独验。

const K_CART = "cart";
const K_VIEW = "view";
const K_PHONE = "phone";
const VIEW_COMPARE = "compare";

/** 状态对象 → 查询串（含前导 ?，无内容时返回空串） */
export function buildSearch({ view, ids, phoneId }) {
  // 手拼而不是用 URLSearchParams：它会把 cart 里的逗号转义成 %2C，
  // 分享出去的链接就变成 cart=a%2Cb 这种没法读的样子。逗号在 query 里本来就是合法字符。
  // 每个 id 仍然单独过一遍 encodeURIComponent（对 [a-z0-9-] 是无操作，
  // 但万一将来出现别的字符也不会拼出一条坏链接）。
  const parts = [];
  if (ids?.length) parts.push(`${K_CART}=${ids.map(encodeURIComponent).join(",")}`);
  if (view === VIEW_COMPARE) parts.push(`${K_VIEW}=${VIEW_COMPARE}`);
  if (phoneId) parts.push(`${K_PHONE}=${encodeURIComponent(phoneId)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * 查询串 → 状态对象，并就地做三件清洗：
 *   - 丢掉不存在的机型 id（链接可能被手改，也可能撞上机型被下架）
 *   - 去重（同一台在 cart 里出现两次会渲染出重复列）
 *   - 截到上限，与界面「最多 4 台」的口径保持一致
 */
export function readFromSearch(search, phones, maxSlots) {
  const p = new URLSearchParams(search ?? "");
  const known = new Set(phones.map((x) => x.id));

  const ids = [];
  for (const raw of (p.get(K_CART) ?? "").split(",")) {
    const id = raw.trim();
    if (!id || !known.has(id) || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= maxSlots) break;
  }

  const phoneId = p.get(K_PHONE);

  return {
    view: p.get(K_VIEW) === VIEW_COMPARE ? VIEW_COMPARE : "home",
    ids,
    phoneId: phoneId && known.has(phoneId) ? phoneId : null
  };
}

/** 状态是否等价 —— 用来判断"地址栏是不是已经代表了这个状态"，避免无谓的 history 写入 */
export function sameState(a, b) {
  if (!a || !b) return false;
  if (a.view !== b.view || a.phoneId !== b.phoneId) return false;
  if (a.ids.length !== b.ids.length) return false;
  return a.ids.every((id, i) => id === b.ids[i]);
}
