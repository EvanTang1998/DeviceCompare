#!/usr/bin/env python3
"""小米产品图归一化 + 取色。

用法：
    python3 normalize.py '<JSON 数组>'

输入数组每项（由 shop.mjs 生成）：
    {"raw": 原图路径, "out": 输出 jpg 路径, "slug": 颜色slug}
    {"raw": 原图路径, "out": 输出 jpg 路径, "bare": true}   # 老机型的多色裸名图

背景：
    分色产品图来自商城商品接口（见 shop.mjs），每张是**独立**的
    800x800 透明 PNG，构图固定为「背面在左 + 正面在右」双面并排，
    不需要任何切分。原图已在 shop.mjs 阶段备份到 out/<run>/xiaomi-raw/。

    bare（裸名图）是老机型（12/11/10 系列）的「多色全家福」，横构图，
    若硬塞进 612x760 竖版画布会缩得极小，所以**画布跟随图片比例**，
    只限制在 760x570 以内；hex 取色对多色拼图无意义，跳过。

处理（与 OPPO 归一化同一套规格，外加取色）：
1. RGBA 打开 → 按 alpha 裁紧
2. 铺白 → 等比缩放进画布（分色图 612x760 竖版 / 裸名图 ≤760x570 横版）居中
3. 存 JPEG quality=88，文件名 <id>.<slug>.jpg / <id>.jpg
4. hex 取色：取内容左下方（背板下半段、避开摄像头 Deco）的中值色，
   与一加 normalize.py 的背板采样同一套逻辑（裸名图跳过）

输出：最后一行打印 JSON 报告 { "<raw path>": {"hex": "#rrggbb", "out": "<out>"} }
"""
import json
import sys

from PIL import Image

CW, CH = 612, 760
BARE_W, BARE_H = 760, 570  # 裸名图（多色全家福，横构图）的最大画幅
WHITE = (255, 255, 255)
# 背板干净区（相对裁紧后内容的比例坐标）：小米构图背面在左，
# 左下 1/3 是背板下半段，不含 Deco 和 logo
BACK_BOX = (0.05, 0.55, 0.35, 0.90)


def crop_alpha(im):
    """按 alpha>0 裁掉四周透明边。"""
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def region_median_hex(region) -> str:
    """取区域内各通道的中值 → hex。

    用 tobytes() 而不是 getdata()：后者在 Pillow 11 起被弃用、Pillow 14 会移除。
    RGB 模式下 tobytes() 就是 R,G,B 交错排列，按步长 3 切片即可拿到三个通道。
    """
    region = region.convert("RGB")
    raw = region.tobytes()
    n = len(raw) // 3
    r = sorted(raw[0::3])[n // 2]
    g = sorted(raw[1::3])[n // 2]
    b = sorted(raw[2::3])[n // 2]
    return "#%02x%02x%02x" % (r, g, b)


def main():
    payload = json.loads(sys.argv[1])
    report = {}
    for item in payload:
        im = crop_alpha(Image.open(item["raw"]).convert("RGBA"))

        if item.get("bare"):
            # 裸名图：画布跟随图片比例（横构图），只限最大 760x570；不取色
            scale = min(BARE_W / im.width, BARE_H / im.height, 1.0)
            nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
            resized = im.resize((nw, nh), Image.LANCZOS)
            canvas = Image.new("RGB", (nw, nh), WHITE)
            canvas.paste(resized, (0, 0), resized)
            canvas.save(item["out"], "JPEG", quality=88)
            report[item["raw"]] = {"hex": None, "out": item["out"]}
            continue

        scale = min((CW * 0.92) / im.width, (CH * 0.85) / im.height, 1.0)
        nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
        resized = im.resize((nw, nh), Image.LANCZOS)

        canvas = Image.new("RGB", (CW, CH), WHITE)
        canvas.paste(resized, ((CW - nw) // 2, (CH - nh) // 2), resized)
        canvas.save(item["out"], "JPEG", quality=88)

        w, h = im.size
        x0, y0, x1, y1 = BACK_BOX
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        report[item["raw"]] = {"hex": region_median_hex(box), "out": item["out"]}
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
