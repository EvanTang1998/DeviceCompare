import { Fragment, useMemo, useState } from "react";
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
  const lines = [cam.sensor];
  const spec = [
    cam.resolution_mp ? `${cam.resolution_mp}MP` : null,
    cam.aperture,
    cam.focal_length_mm ? `${cam.focal_length_mm}mm` : null
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
        { label: "发布时间", get: (p) => (p.release_year ? `${p.release_year}年` : null) }
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

  for (const type of cameraTypes) {
    sections.push({
      title: `摄像头 · ${type}`,
      rows: [
        {
          label: type,
          get: (p) => cameraCell(p, type),
          lines: true
        }
      ]
    });
  }

  return sections;
};

function PhonePicker({ value, phones, onChange }) {
  const [keyword, setKeyword] = useState("");
  const current = phones.find((p) => p.id === value);
  const brand = current?.brand ?? "";

  const handleBrand = (e) => {
    const b = e.target.value;
    const first = phones.find((p) => p.brand === b);
    if (first) onChange(first.id);
  };

  const modelOptions = phones.filter(
    (p) =>
      (!brand || p.brand === brand) &&
      (!keyword || p.name.toLowerCase().includes(keyword.toLowerCase()))
  );

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
      <select value={current ? value : ""} onChange={(e) => onChange(e.target.value)} aria-label="型号">
        <option value="" disabled>
          选择型号
        </option>
        {modelOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="搜索型号…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        aria-label="搜索型号"
      />
    </div>
  );
}

function PhoneHeader({ value, phones, onChange }) {
  const phone = phones.find((p) => p.id === value);
  return (
    <div className="phone-header">
      <div className="phone-image">
        {phone?.image ? (
          <img src={phone.image} alt={phone?.name} />
        ) : (
          <div className="image-placeholder">
            <span>{phone?.name ?? "未选择"}</span>
          </div>
        )}
      </div>
      <PhonePicker value={value} phones={phones} onChange={onChange} />
    </div>
  );
}

export default function App() {
  const [slots, setSlots] = useState(phones.slice(0, SLOT_COUNT).map((p) => p.id));

  const selectedPhones = useMemo(
    () => slots.map((id) => phones.find((p) => p.id === id) ?? null),
    [slots]
  );

  const sections = useMemo(
    () => buildSections(selectedPhones.filter(Boolean).map((p) => p.data)),
    [selectedPhones]
  );

  const setSlot = (idx, id) =>
    setSlots((prev) => prev.map((v, i) => (i === idx ? id : v)));

  const isDiff = (values) => {
    const valid = values.filter((v) => v !== null);
    const keys = valid.map((v) => (Array.isArray(v) ? v.join("\n") : String(v)));
    return new Set(keys).size > 1;
  };

  return (
    <div className="page">
      <header className="site-header">
        <h1>灵眸 · 手机对比</h1>
        <p>选择多台手机，并排看清关键参数差异</p>
      </header>

      <div className="compare-scroll">
        <div className="compare-grid">
          <div className="corner-cell">
            <span className="corner-label">参数</span>
          </div>
          {slots.map((id, i) => (
            <div className="header-cell" key={i}>
              <PhoneHeader value={id} phones={phones} onChange={(nid) => setSlot(i, nid)} />
            </div>
          ))}

          {sections.map((section) => (
            <SectionBlock key={section.title} section={section} phones={selectedPhones} isDiff={isDiff} />
          ))}
        </div>
      </div>

      <footer className="site-footer">
        数据来源：官方规格与公开拆解资料 · MVP 演示版本
      </footer>
    </div>
  );
}

function SectionBlock({ section, phones, isDiff }) {
  return (
    <>
      <div className="section-cell">
        <h2>{section.title}</h2>
      </div>
      {phones.map((_, i) => (
        <div className="section-cell" key={i} aria-hidden="true"></div>
      ))}

      {section.rows.map((row) => {
        const values = phones.map((p) => (p ? row.get(p.data) : null));
        const diff = isDiff(values);
        return (
          <Fragment key={row.label}>
            <div className="label-cell">{row.label}</div>
            {values.map((v, i) => (
              <div className={`value-cell${diff ? " diff" : ""}`} key={i}>
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
