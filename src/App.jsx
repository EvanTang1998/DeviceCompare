import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { phones, brands } from "./data.js";

const SLOT_COUNT = 4;

const fmt = (v) => {
  if (v === null || v === undefined || v === "" || v === 0) return "—";
  if (Array.isArray(v)) return v.join(" / ");
  return String(v);
};

const brightnessText = (p) => {
  const b = p.display?.max_brightness_nits;
  if (!b) return "—";
  const parts = [];
  if (b.typical) parts.push(`${b.typical} nit（典型）`);
  if (b.hdr) parts.push(`${b.hdr} nit（HDR）`);
  if (b.outdoor_peak) parts.push(`${b.outdoor_peak} nit（户外峰值）`);
  return parts.join(" / ") || "—";
};

const cameraCell = (p, type) => {
  const cam = p.camera?.find((c) => c.type === type);
  if (!cam) return null;
  const lines = [cam.sensor, cam.feature].filter(Boolean);
  const spec = [
    cam.resolution_mp ? `${cam.resolution_mp}MP` : null,
    cam.aperture,
    cam.focal_length_mm ? `${cam.focal_length_mm}mm` : null,
    cam.zoom_ratio
  ]
    .filter(Boolean)
    .join(" · ");
  if (spec) lines.push(spec);
  const extra = [];
  if (cam.sensor_size_inch) extra.push(`${cam.sensor_size_inch}"`);
  if (cam.pixel_size_um) extra.push(`${cam.pixel_size_um}μm`);
  if (cam.field_of_view_deg) extra.push(`${cam.field_of_view_deg}°`);
  if (extra.length) lines.push(extra.join(" · "));
  if (cam.image_stabilization?.length) lines.push(cam.image_stabilization.join(" / "));
  return lines;
};

const CAMERA_ORDER = ["主摄", "超广角", "长焦", "前置"];

const buildSections = (selectedPhones) => {
  const cameraTypes = [...CAMERA_ORDER];
  for (const p of selectedPhones) {
    for (const c of p.camera || []) {
      if (!cameraTypes.includes(c.type)) cameraTypes.push(c.type);
    }
  }

  const sections = [
    {
      title: "基本信息",
      rows: [
        {
          label: "发布时间",
          get: (p) => {
            if (!p.release_date) return p.release_year ? `${p.release_year}年` : null;
            const [y, m] = p.release_date.split("-");
            return `${y}年${Number(m)}月`;
          }
        }
      ]
    },
    {
      title: "芯片组",
      rows: [
        { label: "芯片", get: (p) => p.chipset?.chip },
        { label: "内存", get: (p) => p.chipset?.ram },
        { label: "存储", get: (p) => p.chipset?.rom }
      ]
    },
    {
      title: "外观",
      rows: [
        {
          label: "尺寸（高×宽×厚）",
          get: (p) => {
            const d = p.body?.dimensions_mm;
            return d ? `${d.height} × ${d.width} × ${d.depth} mm` : null;
          }
        },
        { label: "重量", get: (p) => (p.body?.weight_g ? `${p.body.weight_g} g` : null) },
        { label: "边框材质", get: (p) => p.body?.frame_material },
        { label: "后盖材质", get: (p) => p.body?.back_material },
        { label: "正面盖板", get: (p) => p.body?.front_material },
        { label: "三防等级", get: (p) => p.body?.water_resistance }
      ]
    },
    {
      title: "屏幕",
      rows: [
        { label: "尺寸", get: (p) => (p.display?.size_inch ? `${p.display.size_inch} 英寸` : null) },
        { label: "分辨率", get: (p) => p.display?.resolution },
        { label: "像素密度", get: (p) => (p.display?.ppi ? `${p.display.ppi} ppi` : null) },
        { label: "刷新率", get: (p) => p.display?.refresh_rate },
        { label: "面板", get: (p) => p.display?.panel },
        { label: "形态", get: (p) => p.display?.form },
        { label: "最大亮度", get: brightnessText },
        { label: "HDR", get: (p) => p.display?.hdr_formats }
      ]
    },
    {
      title: "电池",
      rows: [
        { label: "电池容量", get: (p) => (p.battery?.capacity_mah ? `${p.battery.capacity_mah} mAh` : null) },
        { label: "有线充电", get: (p) => (p.battery?.charging_watt ? `${p.battery.charging_watt} W` : null) },
        {
          label: "无线充电",
          get: (p) => {
            const w = p.battery?.wireless_charging_watt;
            if (w === undefined || w === null) return null;
            return w > 0 ? `${w} W` : "不支持";
          }
        }
      ]
    }
  ];

  // 摄像头合并为一个分区：每个镜头一行（行名即镜头类型）
  sections.push({
    title: "摄像头",
    rows: cameraTypes.map((type) => ({
      label: type,
      get: (p) => cameraCell(p, type),
      lines: true
    }))
  });

  return sections;
};

// 模糊匹配：忽略空格与连字符，"iphone17" 能命中 "iPhone 17"、"iphone-16-e" 能命中 "16e"
const normSearch = (s) => s.toLowerCase().replace(/[\s-]+/g, "");
const fuzzyHit = (p, query) =>
  !query || normSearch(p.name).includes(query) || normSearch(p.id).includes(query);

// 机型下拉菜单：贴在触发按钮正下方展开，圆角 + 留白，拉高可滚动
function ModelMenu({ value, phones, onPick, onClose, anchorEl }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const newModels = phones.filter((p) => p.isNew);
  const moreModels = phones.filter((p) => !p.isNew);

  // 面板位置：左缘对齐所在列；高度占视口 98%，上下各留 1%（纯比例）
  const anchorStyle = anchorEl
    ? (() => {
        const r = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const left = Math.max(12, Math.min(r.left, vw - r.width - 12));
        return {
          position: "absolute",
          top: vh * 0.01,
          left,
          width: r.width,
          height: vh * 0.98
        };
      })()
    : undefined;

  const renderItem = (p) => (
    <button
      key={p.id}
      type="button"
      className={`model-item${p.id === value ? " is-active" : ""}`}
      onClick={() => onPick(p.id)}
    >
      {p.name}
    </button>
  );

  return createPortal(
    <div
      className="model-menu-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="model-menu" style={anchorStyle} role="dialog" aria-modal="true" aria-label="选择机型">
        <div className="model-menu-list">
          {newModels.length > 0 && (
            <>
              <div className="model-group-title">新款机型</div>
              {newModels.map(renderItem)}
            </>
          )}
          <div className="model-group-title">更多机型</div>
          {moreModels.map(renderItem)}
        </div>
      </div>
    </div>,
    document.body
  );
}

// 下滑越过表头后才出现的置顶机型栏：每列一个下拉按钮（点开竖向全屏下拉列表）
function SlotPickerBar({ slots, phones, onPick }) {
  const [openIdx, setOpenIdx] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  return (
    <div className="picker-bar">
      <div className="picker-bar-spacer" aria-hidden="true" />
      {slots.map((id, i) => {
        const p = phones.find((x) => x.id === id);
        return (
          <div className="picker-bar-cell" key={i}>
            <button
              type="button"
              className="model-select-btn"
              aria-haspopup="dialog"
              onClick={(e) => {
                setAnchorEl(e.currentTarget);
                setOpenIdx(openIdx === i ? null : i);
              }}
            >
              <span>{p?.name ?? "—"}</span>
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>

            {openIdx === i && (
              <ModelMenu
                value={id}
                phones={phones}
                onPick={(nid) => {
                  onPick(i, nid);
                  setOpenIdx(null);
                }}
                onClose={() => setOpenIdx(null)}
                anchorEl={anchorEl}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// 全屏覆盖式机型选择（对标苹果官网对比页的机型选择）
function ModelOverlay({ value, phones, onPick, onClose }) {
  const [keyword, setKeyword] = useState("");
  const [brand, setBrand] = useState("");
  const inputRef = useRef(null);

  // 打开即聚焦搜索，Esc 关闭
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modelOptions = phones.filter(
    (p) => (!brand || p.brand === brand) && fuzzyHit(p, normSearch(keyword))
  );
  const newModels = modelOptions.filter((p) => p.isNew);
  const moreModels = modelOptions.filter((p) => !p.isNew);

  const renderCard = (p) => (
    <button
      key={p.id}
      type="button"
      className={`model-card${p.id === value ? " is-active" : ""}`}
      onClick={() => onPick(p.id)}
    >
      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="model-card-ph" />}
      <span className="model-card-name">{p.name}</span>
    </button>
  );

  return (
    <div
      className="overlay-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="overlay-panel" role="dialog" aria-modal="true" aria-label="选择机型">
        <div className="overlay-header">
          <h2>选择机型</h2>
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索机型…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="搜索机型"
          />
          <button type="button" className="overlay-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="brand-chips" role="group" aria-label="筛选品牌">
          <button
            type="button"
            className={`brand-chip${brand === "" ? " is-active" : ""}`}
            onClick={() => setBrand("")}
          >
            全部
          </button>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              className={`brand-chip${brand === b ? " is-active" : ""}`}
              onClick={() => setBrand(b)}
            >
              {b}
            </button>
          ))}
        </div>

        <div className="overlay-body">
          {newModels.length > 0 && (
            <>
              <div className="overlay-group-title">新款机型</div>
              <div className="model-grid">{newModels.map(renderCard)}</div>
            </>
          )}
          <div className="overlay-group-title">更多机型</div>
          <div className="model-grid">{moreModels.map(renderCard)}</div>
          {modelOptions.length === 0 && (
            <div className="model-empty">没有匹配的机型</div>
          )}
        </div>
      </div>
    </div>
  );
}

// 列内机型选择器：品牌下拉框 + 型号下拉框（面板锚定本列，从上到下铺满）+ 搜索框（下方浮出候选词，最多 8 个）
function PhonePicker({ value, phones, onChange }) {
  const [keyword, setKeyword] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const current = phones.find((p) => p.id === value);
  const brand = current?.brand ?? "";

  const handleBrand = (e) => {
    const b = e.target.value;
    const first = phones.find((p) => p.brand === b);
    if (first) onChange(first.id);
  };

  const pick = (id) => {
    onChange(id);
    setKeyword("");
    setMenuOpen(false);
  };

  // 型号下拉：当前品牌（+搜索词）过滤出的全部机型；候选词列表再截取前 8 条
  const modelOptions = phones.filter(
    (p) => (!brand || p.brand === brand) && fuzzyHit(p, normSearch(keyword))
  );
  const candidates = keyword ? modelOptions.slice(0, 8) : [];

  return (
    <div className="picker">
      <select value={brand} onChange={handleBrand} aria-label="品牌">
        <option value="" disabled>
          选择品牌
        </option>
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      {/* 型号下拉：外观与原生 select 一致，点开面板锚定本列、从上到下铺满 */}
      <button
        type="button"
        className="picker-model-btn"
        aria-haspopup="dialog"
        onClick={(e) => {
          setAnchorEl(e.currentTarget);
          setMenuOpen(true);
        }}
      >
        <span>{current?.name ?? "选择型号"}</span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {menuOpen && (
        <ModelMenu
          value={value}
          phones={phones}
          onPick={pick}
          onClose={() => setMenuOpen(false)}
          anchorEl={anchorEl}
        />
      )}

      <div className="picker-search">
        <input
          type="text"
          placeholder="搜索型号…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          aria-label="搜索型号"
        />
        {candidates.length > 0 && (
          <ul className="picker-suggest" role="listbox" aria-label="候选机型">
            {candidates.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p.id)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PhoneHeader({ value, phones, onChange, onRemove }) {
  const phone = phones.find((p) => p.id === value);
  const colors = phone?.colors ?? [];
  const [picked, setPicked] = useState(null);
  const [picking, setPicking] = useState(false);

  // 用户点过就用他点的那一色，否则用 JSON 里标记为默认的那一色
  const active = colors.find((c) => c.slug === picked) ?? colors.find((c) => c.isDefault) ?? null;
  const src = active?.image ?? phone?.image ?? null;
  const altText = active && phone ? `${phone.name} · ${active.name}` : phone?.name;

  return (
    <div className="phone-header">
      {onRemove && (
        <button
          type="button"
          className="remove-slot-btn"
          title={`删除 ${phone?.name ?? ""}`}
          aria-label={`删除当前机型（${phone?.name ?? ""}）`}
          onClick={onRemove}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>
      )}
      <div className="phone-image">
        <button
          type="button"
          className="image-swap-btn"
          aria-label={`更换机型（当前：${phone?.name ?? "未选择"}）`}
          onClick={() => setPicking(true)}
        >
          {src ? (
            <img src={src} alt={altText} />
          ) : (
            <div className="image-placeholder">
              <span>{phone?.name ?? "未选择"}</span>
            </div>
          )}
          <span className="image-swap-overlay">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
            更换
          </span>
        </button>
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

      <PhonePicker value={value} phones={phones} onChange={onChange} />

      {picking && (
        <ModelOverlay
          value={value}
          phones={phones}
          onPick={(id) => {
            onChange(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  const [slots, setSlots] = useState(phones.slice(0, SLOT_COUNT).map((p) => p.id));
  const [showDiff, setShowDiff] = useState(true);
  const firstHeaderRef = useRef(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // 表头（第一列的手机图头）完全滚出视口顶部后，才显示置顶机型栏
  useEffect(() => {
    const onScroll = () => {
      const el = firstHeaderRef.current;
      if (!el) return;
      setShowStickyBar(el.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const selectedPhones = useMemo(
    () => slots.map((id) => phones.find((p) => p.id === id) ?? null),
    [slots]
  );

  const sections = useMemo(
    () => buildSections(selectedPhones.filter(Boolean).map((p) => p.data)),
    [selectedPhones]
  );

  // 表格总行数（表头 1 行 + 各分区标题行 + 参数行），供占位列纵向贯穿
  const totalRows = useMemo(
    () => 1 + sections.reduce((sum, s) => sum + 1 + s.rows.length, 0),
    [sections]
  );

  const setSlot = (idx, id) =>
    setSlots((prev) => prev.map((v, i) => (i === idx ? id : v)));

  // 删除一列（至少保留一列）
  const removeSlot = (idx) =>
    setSlots((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  // 末尾新增一列（最多 4 列）：优先选一个还没在对比里的机型
  const addSlot = () =>
    setSlots((prev) => {
      if (prev.length >= SLOT_COUNT) return prev;
      const next = phones.find((p) => !prev.includes(p.id));
      return [...prev, next?.id ?? phones[0].id];
    });

  const isDiff = (values) => {
    const valid = values.filter((v) => v !== null);
    const keys = valid.map((v) => (Array.isArray(v) ? v.join("\n") : String(v)));
    return new Set(keys).size > 1;
  };

  return (
    <div className="page">
      <header className="site-header">
        <span className="site-title">灵眸 · 手机对比</span>
        <label className="diff-toggle">
          <input
            type="checkbox"
            checked={showDiff}
            onChange={(e) => setShowDiff(e.target.checked)}
          />
          高亮差异项
        </label>
      </header>

      {/* 置顶机型栏：仅在下滑越过表头后出现 */}
      {showStickyBar && <SlotPickerBar slots={slots} phones={phones} onPick={setSlot} />}

      <div className="compare-scroll">
        <div className="compare-grid">
          <div className="corner-cell">
            <span className="corner-label">机型</span>
          </div>
          {slots.map((id, i) => (
            <div className="header-cell" key={i} ref={i === 0 ? firstHeaderRef : undefined}>
              <PhoneHeader
                key={id}
                value={id}
                phones={phones}
                onChange={(nid) => setSlot(i, nid)}
                onRemove={slots.length > 1 ? () => removeSlot(i) : null}
              />
            </div>
          ))}

          {/* 空位占位列：虚线框 + 添加按钮，纵向贯穿整表，补满 4 列 */}
          {Array.from({ length: SLOT_COUNT - slots.length }, (_, k) => (
            <button
              key={`ghost-${k}`}
              type="button"
              className="ghost-col"
              style={{ gridColumn: slots.length + 2 + k, gridRow: `1 / span ${totalRows}` }}
              onClick={addSlot}
              aria-label="新增一列"
            >
              <svg width="22" height="22" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                <path d="M7 1v12M1 7h12" />
              </svg>
              <span>添加机型</span>
            </button>
          ))}

          {(() => {
            let rowCursor = 0;
            return sections.map((section) => {
              const start = rowCursor;
              rowCursor += section.rows.length;
              return (
                <SectionBlock
                  key={section.title}
                  section={section}
                  phones={selectedPhones}
                  isDiff={isDiff}
                  showDiff={showDiff}
                  startRow={start}
                />
              );
            });
          })()}
        </div>
      </div>

      <footer className="site-footer">
        数据来源：官方规格与公开拆解资料 · MVP 演示版本
      </footer>
    </div>
  );
}

function SectionBlock({ section, phones, isDiff, showDiff, startRow }) {
  return (
    <>
      <div className="section-cell section-head">
        <h2>{section.title}</h2>
      </div>
      {phones.map((_, i) => (
        <div className="section-cell" key={i} aria-hidden="true"></div>
      ))}

      {section.rows.map((row, j) => {
        const values = phones.map((p) => (p ? row.get(p.data) : null));
        const diff = showDiff && isDiff(values);
        const zebra = (startRow + j) % 2 === 1;
        return (
          <Fragment key={row.label}>
            <div className={`label-cell${zebra ? " zebra" : ""}`}>{row.label}</div>
            {values.map((v, i) => (
              <div className={`value-cell${zebra && !diff ? " zebra" : ""}${diff ? " diff" : ""}`} key={i}>
                {v === null ? (
                  <span className="empty">—</span>
                ) : Array.isArray(v) ? (
                  <div className="lines">
                    {v.map((line, j) => (
                      <div className="line" key={j}>
                        {line}
                      </div>
                    ))}
                  </div>
                ) : (
                  fmt(v)
                )}
              </div>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
