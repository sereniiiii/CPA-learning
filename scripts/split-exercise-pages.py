#!/usr/bin/env python3
"""
给章末习题页单独出图。

习题是跨考点的连续内容，不能按知识点切 —— 整页去掉页眉页脚就是一块。
（之前的整页截图 data/shots/ 已删除，习题区需要自己的图。）

边界：
  上 = 页眉下沿（PDF y > 792 是页眉）
  下 = 页脚/水印上沿（PDF y < 42）
"""
import json
import os
import re
import subprocess
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
CONTENT_TOP = 792.0
CONTENT_BOTTOM = 42.0
VOL = {"上册": "up", "中册": "mid", "下册": "down"}


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    import struct
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def render_page(pdf_path, png_path, width=1500):
    subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(width), pdf_path, "--out", png_path],
        capture_output=True,
    )
    return png_size(png_path)


def crop_png(full_png, out_png, pdf_h, y_top, y_bottom):
    """
    整页渲染 + 像素裁剪。

    不要用 PDF cropbox —— sips 渲染带 cropbox 的 PDF 时内容位置会偏移
    （整页渲染是准的，像素映射已用文字块位置验证）。
    """
    size = png_size(full_png)
    if not size:
        return False
    pw, ph = size
    scale = ph / pdf_h
    top_px = int(round((pdf_h - y_top) * scale))
    height_px = int(round((y_top - y_bottom) * scale))
    if height_px < 8:
        return False
    top_px = max(0, min(ph - height_px, top_px))
    height_px = min(height_px, ph - top_px)
    subprocess.run(
        ["sips", "-c", str(height_px), str(pw),
         "--cropOffset", str(top_px), "0", full_png, "--out", out_png],
        capture_output=True,
    )
    return os.path.exists(out_png)


def main():
    book = json.load(open(f"{BASE}/build/textbook.json", encoding="utf-8"))
    out_root = f"{BASE}/build/blocks"
    tmp_dir = f"{BASE}/build/_crops"
    os.makedirs(tmp_dir, exist_ok=True)

    # 收集所有习题页
    pages = []
    for ch in book["chapters"]:
        vol = VOL[ch["volume"]]
        for ex in ch.get("exercises", []):
            pages.append((vol, ex["source"]["pdfPage"], ch["id"]))

    # 去重
    seen = set()
    uniq = []
    for vol, page, chid in pages:
        if (vol, page) in seen:
            continue
        seen.add((vol, page))
        uniq.append((vol, page, chid))

    sdir = os.path.join(out_root, "财管")
    os.makedirs(sdir, exist_ok=True)

    made = []
    for vol, page, chid in uniq:
        src = f"{BASE}/build/pdf-pages/{vol}/page-{page:04d}.pdf"
        if not os.path.exists(src):
            print(f"  缺源 {src}")
            continue
        out_name = f"exercise-{vol}-{page:04d}.png"
        dst = os.path.join(sdir, out_name)
        if os.path.exists(dst):
            made.append((vol, page, chid, out_name))
            continue
        try:
            r = PdfReader(src)
            H = float(r.pages[0].mediabox.height)
            full = os.path.join(tmp_dir, "full.png")
            if not render_page(src, full):
                continue
            if crop_png(full, dst, H, CONTENT_TOP, CONTENT_BOTTOM):
                made.append((vol, page, chid, out_name))
        except Exception as exc:
            print(f"  失败 {out_name}: {exc}")

    # 注意：这里**不要**写 chapters/*.json ——
    # 那会用原始教材数据覆盖 merge-blocks.py 写的 blocks 字段，
    # 导致线上考点没有块列表 → 前端 point.blocks.length 崩 → 白屏。
    # 习题块的命名规则已写进 merge-blocks.py。

    print(f"习题页块: {len(made)} 张（去重前 {len(pages)}）")
    print(f"→ {sdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
