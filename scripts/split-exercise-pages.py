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


def crop_page(page, W, H, y_top, y_bottom, out_pdf):
    w = PdfWriter()
    w.add_page(page)
    w.pages[0].mediabox = RectangleObject((0, y_bottom, W, y_top))
    w.pages[0].cropbox = RectangleObject((0, y_bottom, W, y_top))
    with open(out_pdf, "wb") as f:
        w.write(f)


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
    tmp_pdf = os.path.join(tmp_dir, "ex.pdf")

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
            page_obj = r.pages[0]
            W = float(page_obj.mediabox.width)
            H = float(page_obj.mediabox.height)
            crop_page(page_obj, W, H, CONTENT_TOP, CONTENT_BOTTOM, tmp_pdf)
            subprocess.run(
                ["sips", "-s", "format", "png", "-Z", "1500", tmp_pdf, "--out", dst],
                capture_output=True,
            )
            if os.path.exists(dst):
                made.append((vol, page, chid, out_name))
        except Exception as exc:
            print(f"  失败 {out_name}: {exc}")

    # 写回章节数据：exercises 带上图名
    for ch in book["chapters"]:
        for ex in ch.get("exercises", []):
            vol = VOL[ch["volume"]]
            page = ex["source"]["pdfPage"]
            ex["block"] = f"exercise-{vol}-{page:04d}.png"

    out = f"{BASE}/build/upload"
    os.makedirs(f"{out}/subjects/cwc/chapters", exist_ok=True)
    for ch in book["chapters"]:
        json.dump(ch, open(f"{out}/subjects/cwc/chapters/{ch['id']}.json", "w",
                           encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    print(f"习题页块: {len(made)} 张（去重前 {len(pages)}）")
    print(f"→ {sdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
