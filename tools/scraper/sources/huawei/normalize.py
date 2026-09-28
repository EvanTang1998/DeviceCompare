#!/usr/bin/env python3
"""华为产品图归一化。

用法：
    python3 sources/huawei/normalize.py '<JSON 数组>'

输入数组每项：{"raw": 原图路径, "out": 输出 jpg 路径, "hex": 官网色值|null}

背景：
    华为官网参数页顶部的配色选择器自带**每色一张**的透明底 PNG
    （/content/dam/.../pdp/phones/<slug>/specs/<file>.png，alt 即中文色名），
    官网不给色值 → 归一化时从背板干净区取中值（与 vivo 同一套规则）。

处理（与 vivo / 一加同一套规格）：
1. 透明底合成到白底
2. 裁掉白边 → 内容缩放进 612x760 画布（高 85%、宽 92% 上限）居中 → quality 88 存 jpg
3. hex：有官网色值就用官网的；没有才从背板干净区（内容左下方）取中值

输出：最后一行打印 JSON 报告 { "<raw>": {"hex": "#rrggbb", "out": "<out>"} }
"""
import json
import sys

from PIL import Image, ImageChops

CW, CH = 612, 760
# 裸名图（vmall 多色正背组合图，横构图）的最大画幅
BARE_W, BARE_H = 760, 570
WHITE = (255, 255, 255)
# 背板干净区（相对内容 bbox 的坐标）：左下方一块不带相机 Deco 和文字的区域
BACK_BOX = (0.10, 0.60, 0.38, 0.88)


def flatten_white(im) -> Image.Image:
    """任意底色 → 白底 RGB。透明底（华为官网图）直接合成到白。"""
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, WHITE + (255,))
        bg.alpha_composite(rgba)
        return bg.convert("RGB")
    return im.convert("RGB")


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


def sample_hex(im) -> str:
    W, H = im.size
    box = (int(W * BACK_BOX[0]), int(H * BACK_BOX[1]), int(W * BACK_BOX[2]), int(H * BACK_BOX[3]))
    return region_median_hex(im.crop(box))


def main() -> None:
    jobs = json.loads(sys.argv[1])
    bare_mode = len(sys.argv) > 2 and sys.argv[2] == "bare"
    report = {}
    for job in jobs:
        im = flatten_white(Image.open(job["raw"]))

        # 裁白边（对透明底图：按合成后的白底差找内容 bbox）
        diff = ImageChops.difference(im, Image.new("RGB", im.size, WHITE))
        bbox = diff.convert("L").point(lambda p: 255 if p > 12 else 0).getbbox()
        content = im.crop(bbox) if bbox else im

        if bare_mode or job.get("bare"):
            # 多色正背组合图：横构图，画布随内容，画幅上限 760x570；
            # 组合图包含多个配色，取色无意义，不回填 hex
            w, h = content.size
            s = min(BARE_W / w, BARE_H / h, 1.0)
            if s < 1.0:
                content = content.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
            canvas = Image.new("RGB", (content.width, content.height), WHITE)
            canvas.paste(content, (0, 0))
            canvas.save(job["out"], "JPEG", quality=88)
            report[job["raw"]] = {"out": job["out"], "bare": True}
            continue

        w, h = content.size
        s = min(CH * 0.85 / h, CW * 0.92 / w, 1.0)
        if s < 1.0:
            content = content.resize((round(w * s), round(h * s)), Image.LANCZOS)
        canvas = Image.new("RGB", (CW, CH), WHITE)
        canvas.paste(content, ((CW - content.width) // 2, (CH - content.height) // 2))
        canvas.save(job["out"], quality=88)

        hexv = job.get("hex") or sample_hex(content)
        report[job["raw"]] = {"hex": hexv, "out": job["out"]}
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
