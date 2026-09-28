import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { phones, brands, seriesRank } from "./data.js";
import { fmt } from "./format.js";
import { normSearch, fuzzyHit } from "./search.js";
import { useGallery } from "./useGallery.js";
import GalleryControls from "./GalleryControls.jsx";
import Home from "./Home.jsx";
import PhoneDetailOverlay from "./PhoneDetailOverlay.jsx";
import CompareDock from "./CompareDock.jsx";
import { buildSearch, readFromSearch, sameState } from "./urlState.js";

const SLOT_COUNT = 4;

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

/** 屏幕/副屏共用的行定义（getDisp 决定取主屏还是副屏） */
const displayRows = (getDisp) => [
  { label: "尺寸", get: (p) => (getDisp(p)?.size_inch ? `${getDisp(p).size_inch} 英寸` : null) },
  { label: "分辨率", get: (p) => getDisp(p)?.resolution },
  { label: "像素密度", get: (p) => (getDisp(p)?.ppi ? `${getDisp(p).ppi} ppi` : null) },
  { label: "刷新率", get: (p) => getDisp(p)?.refresh_rate },
  { label: "面板", get: (p) => getDisp(p)?.panel },
  { label: "形态", get: (p) => getDisp(p)?.form },
  {
    label: "最大亮度",
    get: (p) => {
      const b = getDisp(p)?.max_brightness_nits;
      if (!b) return null;
      if (typeof b === "number") return `${b} nit`;
      const parts = [];
      if (b.typical) parts.push(`${b.typical} nit（典型）`);
      if (b.hdr) parts.push(`${b.hdr} nit（HDR）`);
      if (b.outdoor_peak) parts.push(`${b.outdoor_peak} nit（户外峰值）`);
      return parts.join(" / ") || null;
    }
  },
  { label: "HDR", get: (p) => getDisp(p)?.hdr_formats }
];

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
        {
          label: "折叠态尺寸",
          get: (p) => {
            const d = p.body?.dimensions_folded_mm;
            return d ? `${d.height} × ${d.width} × ${d.depth} mm` : null;
          }
        },
        { label: "边框材质", get: (p) => p.body?.frame_material },
        { label: "后盖材质", get: (p) => p.body?.back_material },
        { label: "正面盖板", get: (p) => p.body?.front_material },
        { label: "三防等级", get: (p) => p.body?.water_resistance }
      ]
    },
    {
      title: "屏幕",
      rows: displayRows((p) => p.display)
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

  // 副屏：折叠屏机型才有（如 Find N6），选中里没有就不显示这个分区
  if (selectedPhones.some((p) => p.display_secondary)) {
    sections.push({
      title: "副屏",
      rows: displayRows((p) => p.display_secondary)
    });
  }

  // 系统与连接：OPPO 起新增的字段（老机型缺这些字段，选中里没人有就不显示）
  if (selectedPhones.some((p) => p.os || p.biometric || p.cellular || p.nfc)) {
    sections.push({
      title: "系统与连接",
      rows: [
        { label: "操作系统", get: (p) => p.os },
        { label: "指纹识别", get: (p) => p.biometric?.fingerprint },
        { label: "面部识别", get: (p) => p.biometric?.face_unlock },
        { label: "SIM 卡", get: (p) => p.cellular?.sim },
        {
          label: "eSIM",
          get: (p) =>
            p.cellular?.esim === undefined || p.cellular?.esim === null
              ? null
              : p.cellular.esim
                ? "支持"
                : "不支持"
        },
        { label: "网络频段", get: (p) => p.cellular?.bands ?? null },
        { label: "卫星通信", get: (p) => p.cellular?.satellite },
        { label: "NFC", get: (p) => (p.nfc ? p.nfc.split("\n") : null) }
      ]
    });
  }

  return sections;
};

// 机型下拉菜单：贴在触发框正下方展开（圆角 + 留白，拉高可滚动）
// options = 允许展示的候选机型（调用方决定是否按品牌过滤），不做任何二次筛选
// 定位规则：高度 = min(内容实际高度, 98% 视口高)；优先贴触发框正下方，下方不够则整体上翻，
//          两侧都装不下时保持封顶高度、位置贴到视口极限（不是按数量估算，而是量真实高度）
function ModelMenu({ value, options, onPick, onClose, anchorEl }) {
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const list = listRef.current;
    if (!list) return;

    const GAP = 8; // 与触发框之间的间距
    const EDGE = 12; // 与视口边缘的最小留白

    const place = (e) => {
      // 面板内部滚动不需要重算（列表自身滚动不改变位置）
      if (e?.target && panelRef.current?.contains(e.target)) return;
      const r = anchorEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const natural = list.scrollHeight + 1; // 内容完整高度（含面板 0.5px 上边框）
      // 封顶：内容再多也不超过 98% 视口高（上下各留 1%）
      const maxH = Math.min(natural, vh * 0.98, vh - EDGE * 2);
      const below = vh - r.bottom - GAP - EDGE; // 触发框下方的可用高度
      const above = r.top - GAP - EDGE; // 触发框上方的可用高度
      const left = Math.max(EDGE, Math.min(r.left, vw - r.width - EDGE));

      let top;
      if (maxH <= below) {
        // 装得下：贴正下方，高度即内容高度
        top = r.bottom + GAP;
      } else if (maxH <= above) {
        // 下方装不下、上方装得下：整体上翻，底边贴触发框上方
        top = r.top - GAP - maxH;
      } else {
        // 机型多到两侧都装不下：保持封顶高度，位置贴到视口极限（尽量靠近触发框下方）
        top = Math.max(EDGE, Math.min(r.bottom + GAP, vh - EDGE - maxH));
      }

      setPos({ position: "fixed", left, width: r.width, top, maxHeight: Math.max(maxH, 120) });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorEl]);

  const newModels = options.filter((p) => p.isNew);
  const moreModels = options.filter((p) => !p.isNew);

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
      <div
        ref={panelRef}
        className="model-menu"
        style={pos ?? { visibility: "hidden" }}
        role="dialog"
        aria-modal="true"
        aria-label="选择机型"
      >
        <div className="model-menu-list" ref={listRef}>
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

// 下滑越过表头后才出现的置顶机型栏：每列一个按钮，点击弹出与「点主图」完全同一个机型选择弹框
// （弹框状态由 App 持有并在根部渲染，避免被 sticky 栏的层叠上下文/裁剪影响）
function SlotPickerBar({ slots, phones, onOpenPicker }) {
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
              aria-label={`更换第 ${i + 1} 列机型：${p?.name ?? "未选择"}`}
              onClick={() => onOpenPicker(i)}
            >
              <span>{p?.name ?? "—"}</span>
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>
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
  const bodyRef = useRef(null);
  // 系列默认只铺 2 行，行末放「显示更多」。每行卡片数跟 overlay-body 宽度走：
  // 算法与 .model-grid 的 repeat(auto-fill, minmax(172px), 12px 间距) 同参数，保证和实际渲染一致。
  const [cols, setCols] = useState(6);
  // 手动展开的系列（key = 品牌|系列名）。弹框关闭即卸载，状态自动复位。
  const [expanded, setExpanded] = useState(() => new Set());

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setCols(Math.max(1, Math.floor((el.clientWidth + 12) / (172 + 12))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 打开即聚焦搜索，Esc 关闭
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 搜索是全局的：输入关键词后不再受品牌 chip 限制，活动标签自动切到「搜索结果」
  const searching = Boolean(keyword.trim());
  const modelOptions = phones.filter(
    (p) => (searching || !brand || p.brand === brand) && fuzzyHit(p, normSearch(keyword))
  );

  // 按「品牌 → 系列」两级分组，品牌顺序沿用 phones 的发布时间从近到远。
  //
  // 系列**不能**沿用这个顺序：弹框里每组按「主流旗舰高端 → 低端」排（用户要求），
  // 依据是 data.js 的 SERIES_ORDER 产品线定位表，排不进的系列落到该品牌末尾、
  // 内部保持原有的发布时间从近到远（Array.sort 稳定）。
  const groups = (() => {
    const byBrand = new Map();
    for (const p of modelOptions) {
      if (!byBrand.has(p.brand)) byBrand.set(p.brand, new Map());
      const seriesMap = byBrand.get(p.brand);
      if (!seriesMap.has(p.series)) seriesMap.set(p.series, []);
      seriesMap.get(p.series).push(p);
    }
    return [...byBrand].map(([brandName, seriesMap]) => ({
      brand: brandName,
      seriesList: [...seriesMap]
        .map(([series, items]) => ({ series, items }))
        .sort((a, b) => {
          const ra = seriesRank(brandName, a.series);
          const rb = seriesRank(brandName, b.series);
          // 未配权重的一律沉底（undefined 不参与减法，否则会算出 NaN）
          if (ra === undefined) return rb === undefined ? 0 : 1;
          if (rb === undefined) return -1;
          return ra - rb;
        })
    }));
  })();

  const renderCard = (p) => (
    <button
      key={p.id}
      type="button"
      className={`model-card${p.id === value ? " is-active" : ""}`}
      onClick={() => onPick(p.id)}
    >
      {p.isNew && <span className="model-card-new">新</span>}
      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="model-card-ph" />}
      <span className="model-card-name">{p.name}</span>
    </button>
  );

  // 浏览态组尾的「查看更多」：进入该品牌的完整分组列表
  const renderMoreCard = (brandName, restCount) => (
    <button
      key={`more-${brandName}`}
      type="button"
      className="model-card model-card-more"
      onClick={() => setBrand(brandName)}
      aria-label={`查看更多${brandName}机型`}
    >
      <span className="model-card-name">查看更多</span>
      {restCount > 0 && <span className="model-card-hint">还有 {restCount} 台</span>}
    </button>
  );

  // 系列尾的「显示更多 / 收起」：同系列机型越来越多，默认每系列只铺 2 行
  // （2 行 - 1 格留给按钮），点击展开全部、再点收起。卡片 img 本就 loading="lazy"，
  // 折叠后未展开的机型不进 DOM，弹框初始的节点数与图片请求都随之变少。
  const renderSeriesMore = (key, rest) => {
    const isOpen = expanded.has(key);
    return (
      <button
        key={`more-series-${key}`}
        type="button"
        className="model-card model-card-more"
        onClick={() =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        aria-expanded={isOpen}
        aria-label={isOpen ? "收起该系列" : `显示同系列其余 ${rest} 台`}
      >
        <span className="model-card-name">{isOpen ? "收起" : "显示更多"}</span>
        {!isOpen && rest > 0 && <span className="model-card-hint">还有 {rest} 台</span>}
      </button>
    );
  };

  // 浏览态（没选品牌、没输关键词）：按品牌分组，每组只铺最新的 4 台
  // （phones 已按发布时间降序），组尾放「查看更多」卡片跳到该品牌完整列表。
  // 注意不能用「最新系列」当口径——vivo 全部 X 机型共用一个 series，会把 18 台全放进来。
  const browsing = !brand && !keyword.trim();
  const featuredSet = new Set();
  if (browsing) {
    const per = new Map();
    for (const p of phones) {
      const n = per.get(p.brand) ?? 0;
      if (n < 4) {
        featuredSet.add(p.id);
        per.set(p.brand, n + 1);
      }
    }
  }
  // 「全部」这个口径下卡片必须按发布时间从近到远排。
  // 不能直接展开上面按系列优先级排好的 seriesList —— 那样顺序会被系列定位带偏。
  const recencyRank = new Map(phones.map((p, i) => [p.id, i]));

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
          <div className="overlay-search">
            <input
              ref={inputRef}
              type="text"
              placeholder="搜索机型…"
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
          <button type="button" className="overlay-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="brand-chips" role="group" aria-label="筛选品牌">
          <button
            type="button"
            className={`brand-chip${brand === "" && !searching ? " is-active" : ""}`}
            onClick={() => {
              setBrand("");
              setKeyword("");
            }}
          >
            全部
          </button>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              className={`brand-chip${brand === b && !searching ? " is-active" : ""}`}
              onClick={() => {
                // 选中品牌即退出搜索态（清空关键词，回到该品牌完整列表）
                setBrand(b);
                setKeyword("");
              }}
            >
              {b}
            </button>
          ))}
          {/* 搜索结果独立成页：输入关键词即自动切过来；点它则聚焦搜索框 */}
          <button
            type="button"
            className={`brand-chip${searching ? " is-active" : ""}`}
            onClick={() => inputRef.current?.focus()}
          >
            搜索结果
          </button>
        </div>

        <div className="overlay-body" ref={bodyRef}>
          {browsing ? (
            groups.map((g) => {
              const feat = g.seriesList
                .flatMap((s) => s.items)
                .filter((p) => featuredSet.has(p.id))
                .sort((a, b) => recencyRank.get(a.id) - recencyRank.get(b.id));
              const restCount = g.seriesList.reduce(
                (n, s) => n + s.items.filter((p) => !featuredSet.has(p.id)).length,
                0
              );
              return (
                <Fragment key={g.brand}>
                  <div className="overlay-brand-title">{g.brand}</div>
                  <div className="model-grid">
                    {feat.map(renderCard)}
                    {restCount > 0 && renderMoreCard(g.brand, restCount)}
                  </div>
                </Fragment>
              );
            })
          ) : (
            <>
              {groups.map((g) => (
                <Fragment key={g.brand}>
                  {/* 全局视图（全部 / 搜索结果）下给出一级标题，避免不同品牌的同名系列混在一起 */}
                  {(!brand || searching) && <div className="overlay-brand-title">{g.brand}</div>}
                  {g.seriesList.map((s) => {
                    const key = `${g.brand}|${s.series}`;
                    // 搜索时不折叠 —— 搜索就是为了精确定位，折叠会把结果藏起来
                    // 折叠时只铺 2 行，末格留给「显示更多」（不足 2 行全铺）
                    const limit = Math.max(0, cols * 2 - 1);
                    const visible =
                      searching || expanded.has(key) ? s.items : s.items.slice(0, limit);
                    const rest = s.items.length - visible.length;
                    return (
                      <Fragment key={s.series}>
                        <div className="overlay-series-title">{s.series}</div>
                        <div className="model-grid">
                          {visible.map(renderCard)}
                          {/* 展开态 rest=0 但要给「收起」，所以按 expanded 再放行一次 */}
                          {(rest > 0 || expanded.has(key)) && renderSeriesMore(key, rest)}
                        </div>
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </>
          )}
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

  // 当前品牌下的全部机型 —— 型号下拉面板只展示这些
  const brandModels = phones.filter((p) => !brand || p.brand === brand);
  // 搜索候选词：在品牌范围内再叠加关键词模糊匹配，最多 8 条
  const candidates = keyword
    ? brandModels.filter((p) => fuzzyHit(p, normSearch(keyword))).slice(0, 8)
    : [];

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
          options={brandModels}
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
  const [picking, setPicking] = useState(false);
  // 配色选择 / 多角度轮播 / 加载态 / 空闲预取统一走 useGallery ——
  // 参数浮窗（PhoneDetailOverlay）用的是同一个 hook，两处行为不会再走偏
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

        {/* 图片没到位时给个轻提示（浅色胶囊 + 动态省略号） */}
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

        {/* 多角度轮播：不自动播放，点击箭头/圆点切换（控件与参数浮窗共用） */}
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

export default function App({ initialView, initialSlots, initialPhoneId }) {
  // 初始状态有两个来源，优先级：显式传参（ssr-check 与将来的构建期预渲染）> 地址栏。
  // 地址栏读取必须守住 typeof window —— ssr-check 是在 Node 里 renderToString 的，没有 window，
  // 少了这道判断整个渲染会直接崩（effect 不执行，但 useMemo 会）。
  const boot = useMemo(() => {
    const byProps =
      initialView !== undefined || initialSlots !== undefined || initialPhoneId !== undefined;
    if (byProps) {
      const known = new Set(phones.map((p) => p.id));
      const ids = (initialSlots ?? []).filter((id) => known.has(id)).slice(0, SLOT_COUNT);
      return {
        view: initialView === "compare" ? "compare" : "home",
        ids,
        phoneId: initialPhoneId && known.has(initialPhoneId) ? initialPhoneId : null
      };
    }
    if (typeof window === "undefined") return { view: "home", ids: [], phoneId: null };
    return readFromSearch(window.location.search, phones, SLOT_COUNT);
  }, []);

  // 视图切换：首页 ↔ 对比页
  const [view, setView] = useState(boot.view);
  // 对比清单 = 首页右下角那个「暂存区」。一份状态两处用，不再拆成两份，否则两边会不一致。
  const [slots, setSlots] = useState(boot.ids);
  const [showDiff, setShowDiff] = useState(true);
  const firstHeaderRef = useRef(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  // 置顶栏点开的机型选择弹框：记录是第几列（null = 未打开）
  const [pickingSlot, setPickingSlot] = useState(null);
  // 空位列：点击打开机型选择弹框（与点主图是同一个），选中后追加一列
  const [addingSlot, setAddingSlot] = useState(false);
  // 首页「浏览全部机型」→ 打开的就是同一套机型选择弹框
  const [browsingAll, setBrowsingAll] = useState(false);
  // 「复制链接」按钮的短暂回显（1.6s 后自己变回去）
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(0);
  // 参数浮窗：{ phone, originRect }。originRect 决定「从哪张卡片放大、关回哪里」；
  // 从分享链接直接打开时没有点击位置，传 null —— 浮窗退化成从面板中心放大。
  const [detail, setDetail] = useState(() => {
    const p = boot.phoneId ? phones.find((x) => x.id === boot.phoneId) : null;
    return p ? { phone: p, originRect: null } : null;
  });

  // 地址栏同步的基准：记住「当前地址栏代表的是哪个状态」。
  // 用一个 ref 而不是 state —— 它只是比对用的影子，不该触发重渲染。
  const urlRef = useRef(boot);
  // slots 的最新值。popstate 监听器只注册一次，闭包里读不到更新后的 slots，
  // 只能用 ref 拿（赋值放在渲染期是"latest ref"惯例，比放进 effect 更不容易读到旧值）。
  const slotsRef = useRef(boot.ids);
  slotsRef.current = slots;

  // ---- 状态 → 地址栏 ----
  // 关键在于**什么时候压历史、什么时候就地改**：
  //   换页（首页↔对比页、浮窗开合）→ pushState，后退键才有意义；
  //   增删对比机型 → replaceState，否则每加一台就多一条历史，
  //                用户按后退会变成"一台一台往下撤"，比没有后退还难受。
  useEffect(() => {
    const next = { view, ids: slots, phoneId: detail?.phone.id ?? null };
    if (sameState(urlRef.current, next)) return;

    const url = window.location.pathname + buildSearch(next);
    const prev = urlRef.current;
    const nav = prev.view !== next.view || prev.phoneId !== next.phoneId;

    // 关浮窗：如果当前这条历史就是"开浮窗"时压进去的，要退回去而不是再压一条 ——
    // 否则按后退会在开/关之间来回弹。state 里的 dcModal 就是给这个判断用的。
    if (nav && prev.phoneId && !next.phoneId && window.history.state?.dcModal) {
      urlRef.current = next; // 先把影子对齐，等 popstate 回来再确认一次
      window.history.back();
      return;
    }

    if (nav) {
      window.history.pushState({ dcModal: Boolean(next.phoneId) }, "", url);
    } else {
      // 保留原 state：浮窗开着时增删机型，dcModal 标记不能被冲掉
      window.history.replaceState(window.history.state, "", url);
    }
    urlRef.current = next;
  }, [view, slots, detail]);

  // ---- 地址栏 → 状态（后退 / 前进）----
  // 关键取舍：**后退只跟 view 和 phone，不跟暂存区**。
  // 道理在于"后退"到底该还原什么：它该还原"我在哪一页"，而不是"我挑过哪几台"。
  // 历史里那些更早的条目是**当时**的快照，里面可能还没有 cart；一旦照搬，
  // 就会出现"在浮窗里点了加入对比 → 关掉浮窗 → 暂存区凭空清空"这种最难受的失败。
  // 所以这里不动 slots，地址栏随后由上面那个 effect 就地修正成含当前 cart 的样子。
  // （初次打开、分享链接是另一条路 —— 那不是 popstate，走的是 boot，照收地址里的 cart。）
  useEffect(() => {
    const onPop = () => {
      const fromUrl = readFromSearch(window.location.search, phones, SLOT_COUNT);
      // 暂存区不从历史里还原（理由见上），保留内存里的那份 —— 这就是上面 slotsRef 存在的意义：
      // popstate 的监听器只注册一次，拿不到最新的 slots，只能通过 ref 读。
      const next = { view: fromUrl.view, ids: slotsRef.current, phoneId: fromUrl.phoneId };
      urlRef.current = next;
      setView(next.view);
      setDetail(
        next.phoneId ? { phone: phones.find((p) => p.id === next.phoneId), originRect: null } : null
      );
      // 地址与内存状态不符（后退落到了更早、还没记下 cart 的那条）→ 就地补回正确地址。
      // 必须在这儿写，不能指望上面那个同步 effect：这几行 setState 传的常常是同值，
      // React 不会重渲染，effect 根本不会被触发，地址栏就会一直停在错的那条上。
      if (!sameState(fromUrl, next)) {
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + buildSearch(next)
        );
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 挂载时把地址栏规范化一次：手改过、或链接里带了已下架机型的 id，会被 readFromSearch 洗掉，
  // 这时地址栏要和清洗后的状态对齐（replace，别在历史里留一条脏地址）。
  useEffect(() => {
    const clean = buildSearch(boot);
    if (window.location.search !== clean) {
      window.history.replaceState(window.history.state, "", window.location.pathname + clean);
    }
  }, []);

  // 切页回到顶部，否则从很长的对比表切回首页会停在半空
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  // 表头（第一列的手机图头）完全滚出视口顶部后，才显示置顶机型栏。
  // 首页没有表头，所以这里要显式把状态清掉（不能只 if (!el) return，那会留着上一次的值）。
  useEffect(() => {
    const onScroll = () => {
      const el = firstHeaderRef.current;
      setShowStickyBar(Boolean(el) && el.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [view]);

  const selectedPhones = useMemo(
    () => slots.map((id) => phones.find((p) => p.id === id) ?? null),
    [slots]
  );

  const sections = useMemo(
    () => buildSections(selectedPhones.filter(Boolean).map((p) => p.data)),
    [selectedPhones]
  );

  // 参数浮窗的分区只按「浮窗里这一台」算 —— 所以副屏、系统与连接这类
  // 「选中里有人有才显示」的分区，在浮窗里该出现就出现、跟对比表选了谁无关。
  const detailSections = useMemo(
    () => (detail ? buildSections([detail.phone.data]) : []),
    [detail]
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

  const appendSlot = (id) =>
    setSlots((prev) => (prev.length < SLOT_COUNT ? [...prev, id] : prev));

  // 「添加对比」是个开关：已在清单里再点一次就撤下来。
  // 不做成开关的话，在首页反复点同一台毫无反馈，也找不到取消的地方。
  const toggleCompare = (id) =>
    setSlots((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < SLOT_COUNT
          ? [...prev, id]
          : prev
    );

  const isDiff = (values) => {
    const valid = values.filter((v) => v !== null);
    const keys = valid.map((v) => (Array.isArray(v) ? v.join("\n") : String(v)));
    return new Set(keys).size > 1;
  };

  // 分享：复制当前地址。地址里带着暂存区和当前视图，对方打开看到的就是你眼前这一屏。
  // clipboard API 在非安全上下文（http 且非 localhost）会不存在，兜底走 execCommand，
  // 免得点了没反应、又不知道为什么。
  const copyLink = async () => {
    const url = window.location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (!ok) return;
    setCopied(true);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="page">
      <header className="site-header">
        <div className="site-header-left">
          {view === "compare" && (
            <button type="button" className="back-home" onClick={() => setView("home")}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
              返回首页
            </button>
          )}
          <button
            type="button"
            className={`site-title${view === "compare" ? " is-link" : ""}`}
            onClick={() => setView("home")}
          >
            灵眸 · 手机对比
          </button>
        </div>
        {view === "compare" ? (
          <div className="header-actions">
            <button
              type="button"
              className={`copy-link-btn${copied ? " is-done" : ""}`}
              onClick={copyLink}
              aria-label="复制当前对比链接"
              title="复制当前对比链接"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="11.5" height="11.5" rx="2.4" />
                <path d="M5.6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.6" />
              </svg>
              <span className="copy-link-label">{copied ? "已复制" : "复制链接"}</span>
            </button>
            <label className="diff-toggle">
              <input
                type="checkbox"
                checked={showDiff}
                onChange={(e) => setShowDiff(e.target.checked)}
              />
              高亮差异项
            </label>
          </div>
        ) : (
          <button type="button" className="nav-compare-btn" onClick={() => setView("compare")}>
            对比表
            {slots.length > 0 && <span className="nav-compare-count">{slots.length}</span>}
          </button>
        )}
      </header>

      {view === "home" ? (
        <>
          <Home
            onOpenDetail={(phone, originRect) => setDetail({ phone, originRect })}
            onAddCompare={toggleCompare}
            onBrowseAll={() => setBrowsingAll(true)}
            compareIds={slots}
          />
          <CompareDock
            slots={slots}
            max={SLOT_COUNT}
            onRemove={toggleCompare}
            onClear={() => setSlots([])}
            onGo={() => setView("compare")}
          />
        </>
      ) : (
        <>
          {/* 置顶机型栏：仅在下滑越过表头后出现 */}
          {showStickyBar && (
            <SlotPickerBar slots={slots} phones={phones} onOpenPicker={setPickingSlot} />
          )}

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

              {/* 空位占位列：浅色圆圈加号，纵向贯穿整表，点击进入机型选择弹框 */}
              {Array.from({ length: SLOT_COUNT - slots.length }, (_, k) => (
                <button
                  key={`ghost-${k}`}
                  type="button"
                  className="ghost-col"
                  style={{ gridColumn: slots.length + 2 + k, gridRow: `1 / span ${totalRows}` }}
                  onClick={() => setAddingSlot(true)}
                  aria-haspopup="dialog"
                  aria-label="添加机型"
                >
                  <span className="ghost-inner">
                    <span className="ghost-plus" aria-hidden="true">
                      <svg width="30" height="30" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <path d="M7 1.5v11M1.5 7h11" />
                      </svg>
                    </span>
                    <span>添加机型</span>
                  </span>
                </button>
              ))}

              {/* 空位列专用的机型选择弹框（挂在网格外，避免被 overflow 容器裁剪） */}

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
        </>
      )}

      {/* 置顶机型栏点开的选择弹框（与点主图、点空位列是同一个弹框） */}
      {pickingSlot !== null && (
        <ModelOverlay
          value={slots[pickingSlot] ?? null}
          phones={phones}
          onPick={(id) => {
            setSlot(pickingSlot, id);
            setPickingSlot(null);
          }}
          onClose={() => setPickingSlot(null)}
        />
      )}

      {/* 空位列点击后弹出机型选择（与点主图是同一个弹框） */}
      {addingSlot && (
        <ModelOverlay
          value={null}
          phones={phones}
          onPick={(id) => {
            appendSlot(id);
            setAddingSlot(false);
          }}
          onClose={() => setAddingSlot(false)}
        />
      )}

      {/* 首页「浏览全部机型」：同一个机型选择弹框，选中后直接进这台机的参数浮窗 */}
      {browsingAll && (
        <ModelOverlay
          value={null}
          phones={phones}
          onPick={(id) => {
            setBrowsingAll(false);
            const phone = phones.find((p) => p.id === id);
            if (phone) setDetail({ phone, originRect: null });
          }}
          onClose={() => setBrowsingAll(false)}
        />
      )}

      {/* 参数浮窗：首页点卡片 / 点「详细参数」/ 浏览全部里选中，都走这一个 */}
      {detail && (
        <PhoneDetailOverlay
          phone={detail.phone}
          sections={detailSections}
          originRect={detail.originRect}
          inCompare={slots.includes(detail.phone.id)}
          onAddCompare={toggleCompare}
          onClose={() => setDetail(null)}
        />
      )}

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
