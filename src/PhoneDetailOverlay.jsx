import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmt } from "./format.js";
import { useGallery } from "./useGallery.js";
import GalleryControls from "./GalleryControls.jsx";

// 与 CSS 里 .detail-panel / .detail-backdrop 的过渡时长一致：
// 关闭时先播完回缩动画再卸载，否则浮窗会「啪」地消失，回到原处的效果就没了。
const CLOSE_MS = 200;

/**
 * 参数浮窗：左边图（轮播 + 配色），右边参数分区。
 *
 * 几个刻意的做法：
 * 1. **不铺满**——面板尺寸由 CSS 封顶（两侧留白、上下留小空隙），背景做轻微模糊，
 *    让底下的列表还看得见轮廓，人的位置感才不会丢。
 * 2. **从点击处放大**——transform-origin 直接取「被点卡片中心」在面板内的坐标，
 *    再配合 scale(0.14) → scale(1)。缩放是绕 origin 做的，所以面板看起来就是从那张
 *    卡片里长出来的；关闭时反着走一遍，回到原处。
 * 3. 关掉的方式给三种：右上角 ×、点两侧空白、Esc。
 */
export default function PhoneDetailOverlay({
  phone,
  sections,
  originRect,
  onClose,
  onAddCompare,
  inCompare
}) {
  const panelRef = useRef(null);
  const [origin, setOrigin] = useState("50% 50%");
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const {
    colors,
    active,
    setPicked,
    images,
    angleIdx,
    setAngle,
    cur,
    altText,
    loading,
    setLoading,
    imgRef
  } = useGallery(phone);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel && originRect) {
      // 面板由 flex 居中在视口里，所以未缩放的左上角 = 视口中心 − 面板一半。
      // 这里不能用 getBoundingClientRect：此刻面板已经带上 scale，量到的是缩放后的框。
      const left = (window.innerWidth - panel.offsetWidth) / 2;
      const top = (window.innerHeight - panel.offsetHeight) / 2;
      const cx = originRect.left + originRect.width / 2;
      const cy = originRect.top + originRect.height / 2;
      setOrigin(`${Math.round(cx - left)}px ${Math.round(cy - top)}px`);
    }
    // 下一帧再切到展开态，让浏览器先按 scale(0.14) 布一次局，过渡才会真的发生
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [originRect]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setOpen(false);
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const expanded = open && !closing;

  return (
    <div
      className={`detail-backdrop${expanded ? " is-open" : ""}`}
      onMouseDown={(e) => {
        // 只在「按在空白处」时关，按在面板里拖到外面松手不算
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`detail-panel${expanded ? " is-open" : ""}`}
        ref={panelRef}
        style={{ transformOrigin: origin }}
        role="dialog"
        aria-modal="true"
        aria-label={`${phone.name} 参数`}
      >
        <button type="button" className="detail-close" onClick={close} aria-label="关闭">
          ×
        </button>

        <div className="detail-media">
          <div className="detail-shot">
            {cur ? (
              <img
                ref={imgRef}
                src={cur}
                alt={altText}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
              />
            ) : (
              <div className="image-placeholder">
                <span>{phone.name}</span>
              </div>
            )}

            {cur && loading && (
              <span className="image-loading" role="status" aria-live="polite">
                loading
                <span className="image-loading-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            )}

            <GalleryControls images={images} angleIdx={angleIdx} setAngle={setAngle} />
          </div>

          {colors.length > 1 && (
            <div className="color-swatches" role="group" aria-label="选择配色">
              {colors.map((c) => {
                const on = c.slug === active?.slug;
                return (
                  <span className="swatch-slot" key={c.slug}>
                    <button
                      type="button"
                      className={`swatch${on ? " is-active" : ""}`}
                      style={c.hex ? { "--swatch": c.hex } : undefined}
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={on}
                      disabled={!c.image}
                      onClick={() => setPicked(c.slug)}
                    />
                    {on && (
                      <span className="color-name" aria-live="polite">
                        {c.name}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="detail-specs">
          <header className="detail-head">
            <span className="detail-kicker">
              {phone.brand} · {phone.series}
            </span>
            <h2 className="detail-name">{phone.name}</h2>
          </header>

          <div className="detail-actions">
            <button
              type="button"
              className={`detail-add${inCompare ? " is-on" : ""}`}
              onClick={() => onAddCompare(phone.id)}
            >
              {inCompare ? "已加入对比" : "加入对比"}
            </button>
          </div>

          {sections.map((section) => (
            <section className="detail-section" key={section.title}>
              <h3>{section.title}</h3>
              <dl className="detail-rows">
                {section.rows.map((row) => {
                  const v = row.get(phone.data);
                  return (
                    <div className="detail-row" key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>
                        {v === null || v === undefined ? (
                          <span className="empty">—</span>
                        ) : Array.isArray(v) ? (
                          v.map((line, i) => (
                            <div className="line" key={i}>
                              {line}
                            </div>
                          ))
                        ) : (
                          fmt(v)
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
