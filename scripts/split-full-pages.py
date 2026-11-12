#!/usr/bin/env python3
"""
生成「整页块」—— 去掉页眉与页脚水印的整页图。

用于两类内容（它们跨页/跨考点，不适合按知识点切）：
  - 主观题页 → down-XXXX.png
  - 章末习题页 → exercise-<册>-XXXX.png

渲染方式：整页渲染 PNG + 按像素裁剪。
不要用 PDF cropbox —— sips 渲染带 cropbox 的 PDF 时内容位置会偏移。
"""
import json
import os
import struct
import subprocess
import sys

from pypdf import PdfReader

from subject_config import SUBJECT_NAME

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"

# 工作目录（按科目隔离，避免多科内容互相覆盖）
WORK = os.environ.get("WORK_DIR", f"{BASE}/build")
CONTENT_TOP = 792.0
CONTENT_BOTTOM = 42.0
VOL = {"上册": "up", "中册": "mid", "下册": "down"}


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def render_page(pdf_path, png_path, width=1500):
    subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(width), pdf_path, "--out", png_path],
        capture_output=True,
    )
    return png_size(png_path)


def crop_png(full_png, out_png, pdf_h, y_top, y_bottom):
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
    tmp_dir = f"{WORK}/_crops"
    os.makedirs(tmp_dir, exist_ok=True)
    full = os.path.join(tmp_dir, "full.png")
    out_dir = f"{WORK}/blocks/{SUBJECT_NAME}"
    os.makedirs(out_dir, exist_ok=True)

    book = json.load(open(f"{WORK}/textbook.json", encoding="utf-8"))

    # ---- 主观题页 ----
    subs = json.load(open(f"{WORK}/subjectives.json", encoding="utf-8"))
    sub_pages = set()
    for t in subs["topics"]:
        for p in t.get("pages", []):
            sub_pages.add(int(p["pdfPage"]))

    made_sub = 0
    for page in sorted(sub_pages):
        src = f"{WORK}/pdf-pages/down/page-{page:04d}.pdf"
        if not os.path.exists(src):
            continue
        dst = os.path.join(out_dir, f"down-{page:04d}.png")
        if os.path.exists(dst):
            made_sub += 1
            continue
        try:
            r = PdfReader(src)
            H = float(r.pages[0].mediabox.height)
            if not render_page(src, full):
                continue
            if crop_png(full, dst, H, CONTENT_TOP, CONTENT_BOTTOM):
                made_sub += 1
        except Exception as exc:
            print(f"  主观题页失败 p{page}: {exc}")

    # ---- 章末习题页 ----
    made_ex = 0
    for ch in book["chapters"]:
        vol = VOL[ch["volume"]]
        for ex in ch.get("exercises", []):
            page = ex["source"]["pdfPage"]
            src = f"{WORK}/pdf-pages/{vol}/page-{page:04d}.pdf"
            if not os.path.exists(src):
                continue
            dst = os.path.join(out_dir, f"exercise-{vol}-{page:04d}.png")
            if os.path.exists(dst):
                made_ex += 1
                continue
            try:
                r = PdfReader(src)
                H = float(r.pages[0].mediabox.height)
                if not render_page(src, full):
                    continue
                if crop_png(full, dst, H, CONTENT_TOP, CONTENT_BOTTOM):
                    made_ex += 1
            except Exception as exc:
                print(f"  习题页失败 {vol}-{page:04d}: {exc}")

    print(f"主观题页块: {made_sub} 张")
    print(f"习题页块:   {made_ex} 张")
    print(f"→ {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
