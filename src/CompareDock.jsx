import { useEffect, useState } from "react";
import { phones } from "./data.js";

/**
 * 暂存区浮标：右下角那个「对比」入口。
 *
 * 一台都没加时**也照样显示**（计数为 0）—— 入口时有时无的话，用户根本没机会形成
 * "这里可以发起对比"的印象。但这时点它不跳转（对比页空着没意义），改成让图标抖一下，
 * 用动作代替文案说明"现在还不能对比"。空态下也不摊开清单，因为里面没东西可看。
 *
 * 有内容时：悬停摊开已添加机型（可逐个移除，顶上「清空」一次撤完），点按钮进对比页。
 *
 * 满员拒绝：用户在已满 4 台时又去点别家的「添加对比」，反馈必须出现在**结果发生地**
 * （右下角浮标），而不是被点的那个按钮上 —— 那个按钮语义是"添加"，它自己没有失败能力；
 * 浮标摇一下 + 计数徽章红闪一下，和空态的"摇 = 不可操作"是同一种语言。
 * rejectPulse 是 App 那边的脉冲计数器：每满员拒绝一次 +1，这里靠数值变化重播动画。
 */
export default function CompareDock({ slots, max, rejectPulse = 0, onRemove, onClear, onGo }) {
  const items = slots.map((id) => phones.find((p) => p.id === id)).filter(Boolean);
  const empty = items.length === 0;
  const [shake, setShake] = useState(false);
  const [fullFlash, setFullFlash] = useState(false);

  useEffect(() => {
    if (rejectPulse === 0) return; // 初次挂载不算
    setShake(true);
    setFullFlash(true);
  }, [rejectPulse]);

  const go = () => {
    if (empty) {
      setShake(true); // 摇一下就行，动画播完由 onAnimationEnd 收回来
      return;
    }
    onGo();
  };

  return (
    <div className="compare-dock">
      {!empty && (
        <div className="dock-list" role="group" aria-label="待对比机型">
          <div className="dock-list-head">
            <span>
              待对比 {items.length}/{max}
            </span>
            <button type="button" className="dock-clear" onClick={onClear}>
              清空
            </button>
          </div>
          {items.map((p) => (
            <div className="dock-item" key={p.id}>
              {p.image ? (
                <img className="dock-thumb" src={p.image} alt="" loading="lazy" />
              ) : (
                <span className="dock-thumb dock-thumb-ph" />
              )}
              <span className="dock-item-name">{p.name}</span>
              <button
                type="button"
                className="dock-item-remove"
                onClick={() => onRemove(p.id)}
                aria-label={`从对比中移除 ${p.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`dock-btn${empty ? " is-empty" : ""}${shake ? " is-shake" : ""}`}
        onClick={go}
        /* 震动动画挂在内层图标上，事件冒泡到这里；按名字过滤，免得被计数徽章的动画误清 */
        onAnimationEnd={(e) => {
          if (e.animationName === "dock-shake") setShake(false);
          if (e.animationName === "dock-full") setFullFlash(false);
        }}
        title={empty ? "还没有添加机型" : undefined}
        aria-label={empty ? "还没有添加机型，无法对比" : `查看对比（已添加 ${items.length} 台）`}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="7" height="16" rx="1.5" />
          <rect x="14" y="4" width="7" height="16" rx="1.5" />
        </svg>
        <span>对比</span>
        {/* key 跟着数量走：数字一变就重挂载、重播一次 pop，加减都有反馈。
            满员拒绝时叠加红闪（is-full），"满了"用颜色说，比文案快。 */}
        <span className={`dock-count${fullFlash ? " is-full" : ""}`} key={items.length}>
          {items.length}
        </span>
      </button>
    </div>
  );
}
