import { useEffect, useRef, useState } from "react";

/**
 * 机型图片廊：配色选择 + 同色多角度轮播 + 加载态 + 空闲预取。
 *
 * 对比表的表头（PhoneHeader）与参数浮窗（PhoneDetailOverlay）用的是同一套行为，
 * 所以抽到这里 —— 两边只是外层排版不同，但「图从哪来、什么时候把角度重置回第一张、
 * 什么时候预取」必须保持一致，否则同一个机型在两个地方会出现切色后一个回到第一张、
 * 另一个还停在上一张这种分歧。
 */
export function useGallery(phone) {
  const colors = phone?.colors ?? [];
  const [picked, setPicked] = useState(null);

  // 用户点过就用他点的那一色，否则用 JSON 里标记为默认的那一色
  const active = colors.find((c) => c.slug === picked) ?? colors.find((c) => c.isDefault) ?? null;
  const fallback = active?.image ?? phone?.image ?? null;
  const altText = active && phone ? `${phone.name} · ${active.name}` : phone?.name;

  // 同一配色的多角度图 + 整机裸名图，手动轮播；换配色/机型回到第 1 张。
  // 裸名图（phone.bare）只在机型有分色图时追加（华为 vmall 正背组合图，补正面机位；
  // 小米/OPPO 的裸名机型本身没有分色图，fallback 已是裸名图，不能再追加重复的）
  const images = [
    ...(active?.images ?? (fallback ? [fallback] : [])),
    ...(phone?.bare && active?.image ? [phone.bare] : []),
  ];
  const [angle, setAngle] = useState(0);
  useEffect(() => setAngle(0), [active?.slug, phone?.id]);
  const angleIdx = Math.min(angle, images.length - 1);
  const cur = images.length ? images[angleIdx] : fallback;

  // 图片加载反馈：图在外网 CDN，切色/切角度要等好几秒，没有提示会让人以为页面卡死
  const imgRef = useRef(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!cur) return undefined;
    setLoading(true);
    // 命中的是缓存图时，onLoad 可能在本次 effect 之前就已触发，这里补判一次
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setLoading(false);
    return undefined;
  }, [cur]);

  // 空闲时预取本机型的其它图：先其它配色的首图（最可能被点的那张），再剩余角度，
  // 让切色/切角度接近瞬时（图片在外网 CDN，冷请求要等好几秒）
  useEffect(() => {
    if (!phone) return undefined;
    const list = phone.colors ?? [];
    const firsts = list.filter((c) => c.slug !== active?.slug).map((c) => c.images?.[0]);
    const rest = list.flatMap((c) => (c.images ?? []).slice(1));
    const urls = [...new Set([...firsts, ...rest].filter(Boolean))];
    if (!urls.length) return undefined;
    const timer = setTimeout(() => {
      for (const url of urls) {
        const im = new Image();
        im.src = url;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [phone?.id, active?.slug]);

  return {
    colors,
    active,
    picked,
    setPicked,
    images,
    angleIdx,
    setAngle,
    cur,
    altText,
    loading,
    setLoading,
    imgRef
  };
}
