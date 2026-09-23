#!/usr/bin/env python3
"""一加产品图归一化 + 取色。

用法：
    python3 sources/oneplus/normalize.py '<JSON 数组>'

输入数组每项：{"raw": 原图路径, "swatch": 色卡路径|null, "out": 输出 jpg 路径}

处理（官网 specs 产品图是 1080x1080 纯黑底）：
1. 四角采样底色；非白底 → 从边缘种子点洪泛填充为白（thresh 覆盖轻微渐晕）
2. 裁掉白边 → 内容缩放进 612x760 画布（高 85%、宽 92% 上限）居中 → quality 88 存 jpg
3. hex 取色：优先色卡（swatch）中心区域中值；无色卡时取产品图
   背板干净区（内容左下方，摄像头 Deco 之下）的中值

输出：最后一行打印 JSON 报告 { "<raw>": {"hex": "#rrggbb", "out": "<out>"} }
"""
import json
import sys

from PIL import Image, ImageChops, ImageDraw

CW, CH = 612, 760
WHITE = (255, 255, 255)
# 背板干净区（相对内容 bbox 的坐标）：左下方一块不带 Deco 和文字的区域
BACK_BOX = (0.10, 0.60, 0.38, 0.88)


def corner_color(im):
    W, H = im.size
    pts = [(3, 3), (W - 4, 3), (3, H - 4), (W - 4, H - 4)]
    px = [im.getpixel(p) for p in pts]
    r = sorted(p[0] for p in px)[2]
    g = sorted(p[1] for p in px)[2]
    b = sorted(p[2] for p in px)[2]
    return (r, g, b)


def to_white_bg(im):
    """黑底 → 白底（洪泛填充边缘连通区域）。白底/透明底直接铺白。"""
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, WHITE + (255,))
        bg.alpha_composite(rgba)
        im = bg.convert("RGB")
    else:
        im = im.convert("RGB")
    c = corner_color(im)
    if all(ch > 240 for ch in c):
        return im
    # 非白底（黑/纯色底）：从 8 个边缘种子点把底色洪泛成白
    W, H = im.size
    seeds = [(2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3), (W // 2, 2), (W // 2, H - 3), (2, H // 2), (W - 3, H // 2)]
    for seed in seeds:
        try:
            ImageDraw.floodfill(im, seed, WHITE, thresh=60)
        except ValueError:
            pass
    return im


def median_hex(im, box_frac=BACK_BOX) -> str:
    W, H = im.size
    x0, y0 = int(W * box_frac[0]), int(H * box_frac[1])
    x1, y1 = int(W * box_frac[2]), int(H * box_frac[3])
    return region_median_hex(im.crop((x0, y0, x1, y1)))


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


def swatch_hex(path) -> str:
    im = Image.open(path).convert("RGB")
    W, H = im.size
    return region_median_hex(im.crop((int(W * 0.42), int(H * 0.42), int(W * 0.58), int(H * 0.58))))


def main() -> None:
    jobs = json.loads(sys.argv[1])
    report = {}
    for job in jobs:
        im = to_white_bg(Image.open(job["raw"]))

        # 裁白边
        diff = ImageChops.difference(im, Image.new("RGB", im.size, WHITE))
        bbox = diff.convert("L").point(lambda p: 255 if p > 12 else 0).getbbox()
        content = im.crop(bbox) if bbox else im
        w, h = content.size
        s = min(CH * 0.85 / h, CW * 0.92 / w, 1.0)
        if s < 1.0:
            content = content.resize((round(w * s), round(h * s)), Image.LANCZOS)
        canvas = Image.new("RGB", (CW, CH), WHITE)
        canvas.paste(content, ((CW - content.width) // 2, (CH - content.height) // 2))
        canvas.save(job["out"], quality=88)

        hexv = swatch_hex(job["swatch"]) if job.get("swatch") else median_hex(content)
        report[job["raw"]] = {"hex": hexv, "out": job["out"]}
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
