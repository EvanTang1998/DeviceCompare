import { phones } from "./data.js";

/**
 * 暂存区浮标：加了机型之后出现在右下角。
 *
 * 平时只是一个圆角按钮（带数量），鼠标移上去才把已添加的机型摊开 —— 列表里可以逐个移除，
 * 顶上的「清空」一次撤完，点按钮则带着这份清单进对比页。一台都没加时整个浮标不渲染。
 */
export default function CompareDock({ slots, max, onRemove, onClear, onGo }) {
  if (!slots.length) return null;
  const items = slots.map((id) => phones.find((p) => p.id === id)).filter(Boolean);

  return (
    <div className="compare-dock">
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

      <button type="button" className="dock-btn" onClick={onGo} aria-label={`查看对比（已添加 ${items.length} 台）`}>
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
        <span className="dock-count">{items.length}</span>
      </button>
    </div>
  );
}
