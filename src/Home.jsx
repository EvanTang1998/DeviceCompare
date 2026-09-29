import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { phones } from "./data.js";
import { normSearch, fuzzyHit } from "./search.js";

// 「热门机型」口径：每个品牌取最新 HOT_PER_BRAND 台，**按品牌轮转**排成一列
// （6 个品牌各出最新的一台 = 第 1 轮，再各出第二新的 = 第 2 轮……）。
//
// 为什么不按日期混排：下面要把网格铺满固定行数，按日期排的话最后一行可能整行都是同一家，
// 轮转之后**每一行都会把六个品牌走一遍**，这也正好满足"每个品牌都露脸"。
//
// 池子取 8 台/品牌 = 48 台，是配合底部「显示更多」定的：
//   首屏铺 3 行（6 列时 18 张）→ 点一次 +3 行（36）→ 再点一次 +3 行（48，取空）。
//   48 恰好 = 6 列 × 8 行，所以在宽屏上任何一次停下来都是整行，不会剩半截空行。
//   品牌里最少的一加也有 12 台，8 台/品牌取不满的风险没有（真取不满也只会少几台，不会报错）。
// 不写人工名单 —— 每次抓完新机自动跟上，要改口径只动这几个常量。
// 这三个常量连同 HOT_POOL 一起导出给 scripts/ssr-check.mjs 用，避免"改了一处忘了另一处"。
export const HOT_PER_BRAND = 8;
// 首屏铺的行数，也是「显示更多」每次追加的行数。实际渲染几张由"当前一行能放几列"决定
// （见下面的 cols），所以窄屏会少放几张、宽屏多放几张 —— 任何设备上都是整行，
// 不会出现半截的空行。
export const HOT_ROWS = 3;
// 宽屏下每行最多几列（CSS 里 .home-grid 的 minmax 下限已经把它顶在 6）。
// 服务端渲染（scripts/ssr-check.mjs）量不到容器宽度，退化用这个列数。
export const DEFAULT_COLS = 6;

export const HOT_POOL = (() => {
  const byBrand = new Map(); // 品牌 -> 该品牌最新的若干台（phones 已按发布时间从近到远排）
  for (const p of phones) {
    if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
    const arr = byBrand.get(p.brand);
    if (arr.length < HOT_PER_BRAND) arr.push(p);
  }
  const lists = [...byBrand.values()];
  const out = [];
  for (let round = 0; round < HOT_PER_BRAND; round += 1) {
    for (const arr of lists) if (arr[round]) out.push(arr[round]);
  }
  return out;
})();

/**
 * 首页：大标题 + 搜索框 + 机型网格。
 *
 * 搜索是**全局**的（不限品牌），输入即实时过滤下方的网格 —— 复用机型选择弹框的
 * 模糊匹配（normSearch/fuzzyHit），所以「iphone17」「iphone-16-e」这类写法照样能命中。
 * 想要完整的分品牌浏览，走右下角的「浏览全部机型」（打开的是原来那个机型选择弹框）。
 *
 * 卡片上的"操作"与"状态"分开处理，这是这块最容易改错的地方：
 *   - 操作（添加对比）：平时透明，hover / 键盘聚焦才浮现；但**高度一直占着**，
 *     所以浮出来时卡片不会被撑高、整页不跳一下。
 *     按钮配色只有两档、且**只由"加没加"决定**（未加 = 实心蓝底白字，已加 = 淡蓝底蓝字，
 *     与参数浮窗里的「加入对比 / 已加入」同一套）；尺寸只由"鼠标在不在按钮上"决定。
 *     两件事彻底拆开，所以按钮从小胶囊长到整条时颜色一动不动 —— 用户反馈过"颜色跳一下很割裂"。
 *   - 卡片本身 hover 时**原地放大**约 3%（不是位移）：位移会把鼠标从卡片身下抽走、
 *     导致 hover 反复触发，放大则只把四条边往外推，光标丢不了。详见 index.css 的注释。
 *   - 状态（已添加）：**常显**，不依赖 hover。整卡换成淡蓝底 + 蓝描边 + 底部按钮转为
 *     「已添加」并常驻显示。这两个位置各管一件事：底色负责"一屏扫过去就知道哪几台在表里"，
 *     按钮负责"点这里可以撤下来"，所以不再额外挂一枚右上角徽标（会和按钮重复）。
 *   - 「查看详情」不是按钮：点卡片任意位置就能开参数浮窗，所以只要一枚**跟着光标走**的
 *     浮动提示来告诉用户"这里可以点"。不用卡片内的固定胶囊：那个位置压着手机图、
 *     又和"添加对比"按钮是两个风格，看着突兀。
 *     跟随实现见 placeHint —— 定位直接写 DOM transform，**不进 React 状态**；
 *     mousemove 用 rAF 合帧，一次重渲染都不该有。
 */
export default function Home({ onOpenDetail, onAddCompare, onBrowseAll, compareIds }) {
  const [keyword, setKeyword] = useState("");
  const inputRef = useRef(null);
  const gridRef = useRef(null);
  const [cols, setCols] = useState(DEFAULT_COLS);
  // 热门区是**分批往下铺**的：首屏 HOT_ROWS 行，底部点一次「显示更多」再加 HOT_ROWS 行，
  // 直到热门池取空（此时按钮自己消失）。
  // 存的是"批数"而不是"张数"：一行几列由 CSS auto-fill 决定，窗口一变列数就变，
  // 存张数会留下半截行；存批数则永远按整行往下长。
  // 没做分页：分页要往地址栏加 page 参数、还得管翻页后的滚动位置，而对"扫一眼 → 点进去看"
  // 这种动作来说，"下一页/上一页"本身就是多余的一道决策；真要精确找某一台，走「浏览全部机型」。
  const [batches, setBatches] = useState(1);

  // 网格一行能放几列，由 CSS 的 auto-fill 决定；这里读回来，是为了渲染「列数 × 行数」张卡片，
  // 保证任何视口宽度下都是整整 HOT_ROWS 行、最后一行不留半截。
  // 不用 ResizeObserver 盯网格自身：卡片数量变化会让它自己变高，容易触发观察回调回声；
  // 网格宽度只跟窗口宽度有关，所以监听窗口就够了。
  useLayoutEffect(() => {
    const measure = () => {
      const el = gridRef.current;
      if (!el) return;
      const tracks = getComputedStyle(el).gridTemplateColumns;
      const n = tracks && tracks !== "none" ? tracks.trim().split(/\s+/).length : DEFAULT_COLS;
      if (n > 0) setCols((prev) => (prev === n ? prev : n));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ---- 跟随光标的「查看详情」提示 ----
  // 光标位置走 ref + 直接写 transform，不经过 useState：mousemove 每帧都触发，
  // 一旦进 React 状态就会带着 18 张卡片一起重渲染，越滑越卡。
  const hintRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const [hintOn, setHintOn] = useState(false);

  // 光标的右下角是默认落点；贴到视口右边/下边时翻到另一侧，别让提示跑出屏幕
  const placeHint = (x, y) => {
    const el = hintRef.current;
    if (!el) return;
    const w = el.offsetWidth || 80;
    const h = el.offsetHeight || 26;
    let px = x + 16;
    let py = y + 18;
    if (px + w > window.innerWidth - 8) px = x - w - 16;
    if (py + h > window.innerHeight - 8) py = y - h - 18;
    el.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0)`;
  };

  const onCardEnter = (e) => {
    placeHint(e.clientX, e.clientY); // 先在光标处就位再淡入，否则会从上一个位置飞过来
    setHintOn(true);
  };

  const onCardMove = (e) => {
    posRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      placeHint(posRef.current.x, posRef.current.y);
    });
  };

  const onCardLeave = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setHintOn(false);
  };

  const query = normSearch(keyword.trim());
  const searching = Boolean(query);
  // 搜索时给出**全部命中**（不截断、不铺行）；没搜索时才是"热门机型"，按批往下铺
  const perBatch = cols * HOT_ROWS;
  const shown = Math.min(perBatch * batches, HOT_POOL.length);
  const remaining = HOT_POOL.length - shown;
  const hot = useMemo(() => HOT_POOL.slice(0, shown), [shown]);
  const list = useMemo(
    () => (searching ? phones.filter((p) => fuzzyHit(p, query)) : hot),
    [searching, query, hot]
  );

  // 浮窗要「从点击处放大」，所以这里把被点元素的屏幕位置一并交出去
  const open = (phone, el) => {
    const r = el.getBoundingClientRect();
    onOpenDetail(phone, { left: r.left, top: r.top, width: r.width, height: r.height });
  };

  return (
    <div className="home">
      <header className="home-hero">
        {/* 站名后面挂上"手机对比"：光一个"灵眸"外人看不出这站是干什么的。
            两段**同一格式**（同字号/同字重/同色，中间一个空格隔开）——
            最初后缀是缩小的浅色小字，用户反馈"这几个字格式不一样"，统一成一体。
            文案和顶栏的「灵眸 · 手机对比」一致（顶栏那处中间带点，是因为它挤在一行小字里）。 */}
        <h1 className="home-title">灵眸 手机对比</h1>
        <p className="home-sub">{phones.length} 台手机的参数对比</p>
        <div className="home-search">
          <svg
            className="home-search-icon"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索机型，比如 iPhone 17、Find X9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="搜索机型"
          />
          {keyword && (
            <button
              type="button"
              className="overlay-search-clear"
              onClick={() => {
                setKeyword("");
                inputRef.current?.focus();
              }}
              aria-label="清空搜索"
            >
              ×
            </button>
          )}
        </div>
      </header>

      <section className="home-section">
        <div className="home-section-head">
          <h2>{searching ? `搜索结果 · ${list.length} 台` : "热门机型"}</h2>
          <button type="button" className="home-browse" onClick={onBrowseAll}>
            浏览全部机型
          </button>
        </div>

        <div className="home-grid" ref={gridRef}>
          {list.map((p) => {
            const added = compareIds.includes(p.id);
            return (
              <div
                className={`hot-card${added ? " is-added" : ""}`}
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`查看 ${p.name} 参数`}
                onClick={(e) => open(p, e.currentTarget)}
                onMouseEnter={onCardEnter}
                onMouseMove={onCardMove}
                onMouseLeave={onCardLeave}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(p, e.currentTarget);
                  }
                }}
              >
                {p.isNew && <span className="model-card-new">新</span>}
                <div className="hot-card-media">
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" />
                  ) : (
                    <span className="hot-card-ph" />
                  )}
                </div>
                <div className="hot-card-foot">
                  <span className="hot-card-name">{p.name}</span>
                  <div className="hot-card-actions">
                    <button
                      type="button"
                      // 按钮的 className 不按"是否已添加"分支（没有 is-on 之类的变体类）：
                      // 状态一律由卡片上的 is-added 承载，配色规则挂在 `.hot-card.is-added .hot-action`
                      // 上（见 index.css）；这里只管"大小"—— 平时小胶囊、鼠标压上来才长大。
                      className="hot-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddCompare(p.id);
                      }}
                      aria-label={added ? `把 ${p.name} 移出对比` : `把 ${p.name} 加入对比`}
                    >
                      {added && (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 12.5l5.5 5.5L20 6.5" />
                        </svg>
                      )}
                      {added ? "已添加" : "添加对比"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {list.length === 0 && <div className="model-empty">没有匹配的机型</div>}

        {/* 网格底部的「显示更多」：一次多铺 HOT_ROWS 行，取空热门池后自己消失。
            副标里带上"还剩多少台"—— 不给数字的话，用户不知道后面还有没有、还剩多少，
            容易一路点下去；给了数字就能自己判断"点到这就够了"。
            搜索时不出现：搜索结果是**全部命中**，本来就没有"更多"可给。 */}
        {!searching && remaining > 0 && (
          <div className="home-more">
            <button type="button" className="home-more-btn" onClick={() => setBatches((b) => b + 1)}>
              显示更多
              <span className="home-more-count">还有 {remaining} 台</span>
            </button>
          </div>
        )}
      </section>

      {/* 跟随光标的提示：常驻 DOM（靠 opacity 切显隐），这样进入卡片的瞬间
          就已经量得到自身尺寸、能一次定位到位，不必等挂载后再跳一下。
          fixed 定位 + pointer-events:none，不参与卡片布局也不吃点击。 */}
      <span ref={hintRef} className={`cursor-hint${hintOn ? " is-on" : ""}`} aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.2 12S5.6 5.6 12 5.6 21.8 12 21.8 12 18.4 18.4 12 18.4 2.2 12 2.2 12z" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
        查看详情
      </span>
    </div>
  );
}
