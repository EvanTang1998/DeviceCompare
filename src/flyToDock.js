// 「添加对比」的飞入动效：一张缩略图从机型卡片（或参数浮窗里的图）飞向
// 右下角的暂存区浮标，落进去时缩到没有 —— 让"东西进到那个列表里了"变成看得见的事。
//
// 为什么是命令式的一段 DOM 动画，而不是一个 React 组件：
// 飞行每帧都在变位置，一旦进 state 就等于每帧重渲染整页（首页最多 48 张卡片）。
// 这里只创建**一个**游离的图片元素，动画播完自己摘掉，React 全程不知情 ——
// 和「跟随光标的查看详情提示」是同一套思路（见 Home.jsx 的 placeHint）。

// 飞行时长。够看清"从哪来、到哪去"，又不至于让人等它。
const DURATION = 720;
// 飞行中那张缩略图的边长。取卡片图（约 150px）的三分之一强：
// 出发时像从卡片里被"抽"出来的一小张，落点也不会大到盖住浮标。
const SIZE = 64;

let catchTimer = 0;

/**
 * 浮标"接住"的反应：轻微下沉再回弹。
 *
 * 刻意**不用** React 状态承载：这个类只活 0.42s，走状态要过一次重渲染，
 * 而它跟数据毫无关系，纯视觉。classList 就够了。
 */
const bump = () => {
  const dock = document.querySelector(".dock-btn");
  if (!dock) return;
  dock.classList.remove("is-catch");
  void dock.offsetWidth; // 强制重排：连点两次时让动画能重播，而不是被忽略
  dock.classList.add("is-catch");
  window.clearTimeout(catchTimer);
  catchTimer = window.setTimeout(() => dock.classList.remove("is-catch"), 460);
};

/**
 * 把一张缩略图从 from 飞到右下角浮标。
 *
 * @param {DOMRect|null} from  起点（机型卡片里的手机图 / 浮窗里的图；调用方在事件里同步取好）
 * @param {string|null}  image 缩略图的图片地址，缺省时飞一个中性小方块
 */
export function flyToDock({ from, image }) {
  if (!from || !from.width) return;
  // 浮标不在场（对比页没有它）就没得飞
  const dock = document.querySelector(".dock-btn");
  if (!dock) return;
  // 系统开了"减弱动态效果"就不飞：这类动效对前庭敏感人群不友好，
  // 直接跳过、也不补别的花活（浮标那边的计数照旧会弹一下，信息没丢）。
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const to = dock.getBoundingClientRect();
  if (!to.width) return;

  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const ex = to.left + to.width / 2;
  const ey = to.top + to.height / 2;

  const el = document.createElement(image ? "img" : "span");
  el.className = image ? "fly-thumb" : "fly-thumb is-ph";
  if (image) {
    el.src = image;
    el.alt = "";
    el.setAttribute("aria-hidden", "true");
  }
  // left/top 只在起飞时写一次（起点位置），移动全交给 transform ——
  // 这样每帧改的都是合成层属性，不触发重排。
  el.style.left = `${Math.round(sx - SIZE / 2)}px`;
  el.style.top = `${Math.round(sy - SIZE / 2)}px`;
  el.style.width = `${SIZE}px`;
  el.style.height = `${SIZE}px`;
  document.body.appendChild(el);

  // 抛物线：水平匀速，垂直在匀速之上叠一道抛物线项 4t(1-t)
  // （两端为 0、中间最大），于是路径是一条起落自然的弧，而不是直线插值那种"贴地平移"。
  // 弧高按两点距离取，再夹在 60~160px：挨得近时也要有弧，离得远时别甩到天上。
  const dist = Math.hypot(ex - sx, ey - sy);
  const arc = Math.min(160, Math.max(60, dist * 0.18));

  // 26 段足够平滑（浏览器还要在关键帧之间插值），又不用每帧都塞一个关键帧。
  const N = 26;
  const frames = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const x = sx + (ex - sx) * t;
    const y = sy + (ey - sy) * t - arc * 4 * t * (1 - t);
    // 越靠近浮标越小；配合后半段的淡出，收尾是"缩进浮标里"而不是"啪地消失"
    const scale = 1 - 0.62 * t * t;
    frames.push({
      transform: `translate3d(${(x - sx).toFixed(1)}px, ${(y - sy).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`,
      opacity: t < 0.72 ? 1 : Math.max(0, (1 - t) / 0.28)
    });
  }

  const anim = el.animate(frames, {
    duration: DURATION,
    // 关键帧自己已经描述了运动，插值必须是 linear ——
    // 再加一层缓动会把算好的抛物线扭曲成"先慢后快"，弧线就不匀了。
    easing: "linear",
    fill: "forwards"
  });

  const done = () => {
    el.remove();
    bump(); // 到货：浮标沉一下再弹回来
  };
  anim.finished.then(done).catch(done); // 动画被取消（用户切页）也要收场，别留下孤儿节点
}
