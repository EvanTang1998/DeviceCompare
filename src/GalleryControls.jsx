/**
 * 图片轮播控件：上一张 / 下一张 / 圆点。
 * 只有一张图时直接不渲染 —— 调用方铺上这个组件即可，不用自己判长度。
 * 对比表表头与参数浮窗共用（样式沿用 .carousel-btn / .carousel-dots）。
 */
export default function GalleryControls({ images, angleIdx, setAngle }) {
  if (images.length <= 1) return null;
  return (
    <>
      <button
        type="button"
        className="carousel-btn is-prev"
        aria-label="上一张角度"
        onClick={() => setAngle((angleIdx + images.length - 1) % images.length)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3L5 8l5 5" />
        </svg>
      </button>
      <button
        type="button"
        className="carousel-btn is-next"
        aria-label="下一张角度"
        onClick={() => setAngle((angleIdx + 1) % images.length)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3l5 5-5 5" />
        </svg>
      </button>
      <div className="carousel-dots" role="group" aria-label="角度切换">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`carousel-dot${i === angleIdx ? " is-active" : ""}`}
            aria-label={`第 ${i + 1} 张`}
            aria-pressed={i === angleIdx}
            onClick={() => setAngle(i)}
          />
        ))}
      </div>
    </>
  );
}
