import { useState } from "react";
import { phones } from "./data.js";

/**
 * 暂存区浮标：右下角那个「对比」入口。
 *
 * 一台都没加时**也照样显示**（计数为 0）—— 入口时有时无的话，用户根本没机会形成
 * "这里可以发起对比"的印象。但这时点它不跳转（对比页空着没意义），改成让图标抖一下，
 * 用动作代替文案说明"现在还不能对比"。空态下也不摊开清单，因为里面没东西可看。
 *
 * 有内容时：悬停摊开已添加机型（可逐个移除，顶上「清空」一次撤完），点按钮进对比页。
 */
export default function CompareDock({ slots, max, onRemove, onClear, onGo }) {
  const items = slots.map((id) => phones.find((p) => p.id === id)).filter(Boolean);
  const empty = items.length === 0;
  const [shake, setShake] = useState(false);

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
        {/* key 跟着数量走：数字一变就重挂载、重播一次 pop，加减都有反馈 */}
        <span className="dock-count" key={items.length}>
          {items.length}
        </span>
      </button>
    </div>
  );
}
