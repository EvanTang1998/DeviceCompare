#!/usr/bin/env python3
"""OPPO 产品图归一化（商城分色图版 + 参数页多色图兜底）。

用法：
    python3 normalize.py '<JSON 数组>'

输入数组每项（由 shop.mjs 生成），两种模式：
1. 分色角度图（来自官方商城接口，每张独立 1440x1440 透明 PNG）：
    {"raw": 原图路径, "out": 输出路径, "slug": 颜色slug, "n": 角度序号}
2. 整机裸名图（来自参数页 productColorImg 官方多色拼图，商城下架机型的兜底）：
    {"raw": 原图路径, "out": 输出路径, "bare": true}
   与小米 12/11/10 系列同口径：画布跟随图片比例（横构图），最大 760x570，不取色。

处理（与 vivo / 一加同一套规格）：
1. RGBA 打开 → 按 alpha 裁紧
2. 铺白 → 等比缩放进 612x760 画布（高 85%、宽 92% 上限）居中；裸名图缩放进 760x570
3. 存 JPEG quality=88，文件名 <id>.<slug>.<n>.jpg 或 <id>.jpg

输出：最后一行打印 JSON 报告 [{"out": ..., "slug": ..., "n": ...}, ...]
"""
import json
import sys

from PIL import Image

CW, CH = 612, 760
BARE_W, BARE_H = 760, 570  # 裸名图（参数页多色拼图，横构图）的最大画幅
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


def normalize_bare(im, out_path):
    body = crop_alpha(im)
    scale = min(BARE_W / body.width, BARE_H / body.height, 1.0)
    nw, nh = max(1, round(body.width * scale)), max(1, round(body.height * scale))
    resized = body.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (nw, nh), WHITE)
    canvas.paste(resized, (0, 0), resized)
    canvas.save(out_path, "JPEG", quality=88)


def main():
    payload = json.loads(sys.argv[1])
    report = []
    for item in payload:
        im = Image.open(item["raw"]).convert("RGBA")
        if item.get("bare"):
            normalize_bare(im, item["out"])
            report.append({"out": item["out"], "bare": True})
        else:
            normalize_one(im, item["out"])
            report.append({"out": item["out"], "slug": item["slug"], "n": item["n"]})
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
