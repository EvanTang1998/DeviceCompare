#!/usr/bin/env python3
"""OPPO 产品图归一化（商城分色图版）。

用法：
    python3 normalize.py '<JSON 数组>'

输入数组每项（一张角度图一项，由 shop.mjs 生成）：
    {"raw": 原图路径, "out": 输出路径, "slug": 颜色slug, "n": 角度序号}

背景：
    分色产品图来自官方商城接口（见 shop.mjs），每张都是**独立**的
    1440x1440 透明 PNG，不需要任何切分。原图已在 shop.mjs 阶段备份到
    out/<run>/oppo-raw/，本脚本只做归一化。

处理（与 vivo / 一加同一套规格）：
1. RGBA 打开 → 按 alpha 裁紧
2. 铺白 → 等比缩放进 612x760 画布（高 85%、宽 92% 上限）居中
3. 存 JPEG quality=88，文件名 <id>.<slug>.<n>.jpg

输出：最后一行打印 JSON 报告 [{"out": ..., "slug": ..., "n": ...}, ...]
"""
import json
import sys

from PIL import Image

CW, CH = 612, 760
WHITE = (255, 255, 255)


def crop_alpha(im):
    """按 alpha>0 裁掉四周透明边。"""
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def normalize_one(im, out_path):
    body = crop_alpha(im)
    scale = min((CW * 0.92) / body.width, (CH * 0.85) / body.height, 1.0)
    nw, nh = max(1, round(body.width * scale)), max(1, round(body.height * scale))
    resized = body.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGB", (CW, CH), WHITE)
    canvas.paste(resized, ((CW - nw) // 2, (CH - nh) // 2), resized)
    canvas.save(out_path, "JPEG", quality=88)


def main():
    payload = json.loads(sys.argv[1])
    report = []
    for item in payload:
        im = Image.open(item["raw"]).convert("RGBA")
        normalize_one(im, item["out"])
        report.append({"out": item["out"], "slug": item["slug"], "n": item["n"]})
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
