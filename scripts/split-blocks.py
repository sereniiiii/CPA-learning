#!/usr/bin/env python3
"""
把教材页面按知识点/例题切成独立图片。

为什么要切：
  整页截图等于让用户自己翻书 —— 没有结构、没有定位、没有检索价值。
  按「考点」「例题」切成独立块，每块一张图，才能分类、定位、复习。

原理：
  1. pypdf 的 visitor 拿到每个文字块的坐标（y/x）
  2. 找出「考点NN」「【例题N·类型】」等标题块的 y 坐标 → 这些是切分边界
  3. 用 PdfWriter 设置 cropbox，把每块裁成独立 PDF
  4. sips 把裁剪后的 PDF 转成 PNG（矢量文字渲染，比截图清晰）

输出：build/blocks/<科目>/<类型>-<ID>.png
      + build/blocks/manifest.json（每个块的元数据与归属）
"""
import json
import os
import re
import subprocess
import sys
from datetime import date

from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

# ---------- 识别切分点 ----------
POINT_TITLE = re.compile(r'^考点\s*\d{1,2}\b')
EXAMPLE_TITLE = re.compile(r'【\s*例题\s*(\d+)')
SECTION_TITLE = re.compile(r'^第[一二三四五六七八九十]+节')
ANSWER_ROW = re.compile(r'例题\s*[-－—]\s*答案')
# 「解析」「点拨」这类小标签也要当切分点 ——
# 否则上一块的正文会从它们中间被切开（比如页底的解析标签被切掉半行）。
LABEL_TITLE = re.compile(r'^(解析|点拨|辨析|说明|注意|小结)\s*$')

# 页面上下安全边界（排除页眉/页脚）
CONTENT_TOP = 792.0     # 高于此为页眉
CONTENT_BOTTOM = 42.0   # 低于此为页脚/水印

SUBJECTS = {
    "up": "财管",
    "mid": "财管",
    "down": "财管",
}


def page_items(path):
    """提取页面上所有文字块及其坐标"""
    r = PdfReader(path)
    page = r.pages[0]
    W = float(page.mediabox.width)
    H = float(page.mediabox.height)
    items = []
    seen = set()

    def visitor(text, cm, tm, font_dict, font_size):
        t = text.strip()
        if not t:
            return
        key = (round(tm[5], 1), round(tm[4], 1), t[:30])
        if key in seen:
            return
        seen.add(key)
        items.append({"y": float(tm[5]), "x": float(tm[4]), "text": t, "size": font_size or 10})

    page.extract_text(visitor_text=visitor)
    return r, page, W, H, items


def find_boundaries(items):
    """
    找出这一页上的切分点。

    返回按 y 降序排列的边界列表：
      {y, kind: 'point'|'example', label, num}
    """
    marks = []
    for it in items:
        t = it["text"].strip()
        y = it["y"]
        if not (CONTENT_BOTTOM < y < CONTENT_TOP):
            continue
        size = it.get("size") or 11.0
        if POINT_TITLE.match(t):
            marks.append({"y": y, "size": size, "kind": "point", "label": t, "num": None})
        elif EXAMPLE_TITLE.match(t):
            m = EXAMPLE_TITLE.match(t)
            marks.append({"y": y, "size": size, "kind": "example", "label": t, "num": int(m.group(1))})
        elif LABEL_TITLE.match(t):
            marks.append({"y": y, "size": size, "kind": "label", "label": t, "num": None})
    # 按 y 降序（从上往下）
    marks.sort(key=lambda m: -m["y"])
    # 同一 y 只留一个
    out = []
    for m in marks:
        if out and abs(out[-1]["y"] - m["y"]) < 3:
            continue
        out.append(m)
    return out


def crop_page(page, W, H, y_top, y_bottom, out_pdf):
    """把页面裁成 [y_bottom, y_top] 的独立 PDF"""
    y_bottom = max(0, min(H - 10, y_bottom))
    y_top = max(y_bottom + 10, min(H, y_top))
    w = PdfWriter()
    w.add_page(page)
    w.pages[0].mediabox = RectangleObject((0, y_bottom, W, y_top))
    w.pages[0].cropbox = RectangleObject((0, y_bottom, W, y_top))
    with open(out_pdf, "wb") as f:
        w.write(f)
    return y_top - y_bottom


def render(pdf_path, png_path, width=1500):
    subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(width), pdf_path, "--out", png_path],
        capture_output=True,
    )
    return os.path.exists(png_path)


def main():
    base = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
    pages_root = os.path.join(base, "build/pdf-pages")
    out_root = os.path.join(base, "build/blocks")
    tmp_dir = os.path.join(base, "build/_crops")
    os.makedirs(out_root, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)

    manifest = []
    stats = {"pages": 0, "blocks": 0, "rendered": 0}
    # 跨页上下文：考点/例题常跨页延续
    current_point = None      # "up-0027-00" 形式：册-页-序
    current_example = None

    for vol in ("up", "mid", "down"):
        vdir = os.path.join(pages_root, vol)
        if not os.path.isdir(vdir):
            continue
        subject = SUBJECTS[vol]
        sdir = os.path.join(out_root, subject)
        os.makedirs(sdir, exist_ok=True)

        for fname in sorted(os.listdir(vdir)):
            if not fname.endswith(".pdf"):
                continue
            page_seq = int(re.search(r"page-(\d+)", fname).group(1))
            src = os.path.join(vdir, fname)
            stats["pages"] += 1

            try:
                r, page, W, H, items = page_items(src)
            except Exception as exc:
                print(f"  [{vol}] {fname} 读取失败：{exc}")
                continue

            bounds = find_boundaries(items)
            stats["blocks"] += len(bounds) + (1 if bounds else 0)

            # 上下文逐块推进：
            #   point  块 → 归属它自己开启的考点
            #   example 块 → 归属它自己开启的例题
            #   label  块 → 归属上一个考点（点拨/辨析是考点的延续）

            # 逐块裁剪
            #
            # 坐标要点：visitor 给的 y 是文字「基线」，
            # 文字上边界 ≈ 基线 + 字号×0.82，下边界 ≈ 基线 − 字号×0.22。
            # 切分时必须按这个算，否则标题行会被切掉半行字。
            ctx_point = current_point
            ctx_example = current_example
            for i, b in enumerate(bounds):
                if b["kind"] == "point":
                    ctx_point = f"{vol}-{page_seq:04d}-{i:02d}"
                    ctx_example = None
                elif b["kind"] == "example":
                    ctx_example = f"{vol}-{page_seq:04d}-{i:02d}"

                y_top = b["y"] + b.get("size", 12) * 0.82 + 2
                if i + 1 < len(bounds):
                    nb = bounds[i + 1]
                    y_bottom = nb["y"] + nb.get("size", 12) * 0.82 - 4
                else:
                    y_bottom = CONTENT_BOTTOM
                if y_top - y_bottom < 40:
                    continue

                kind = b["kind"]
                label = re.sub(r'[^\w一-鿿]', '', b["label"])[:18]
                out_name = f"{kind}-{vol}-{page_seq:04d}-{i:02d}.png"
                png_path = os.path.join(sdir, out_name)
                # 注意：不能因为文件已存在就跳过 ——
                # manifest 必须记录每个块，否则归并会漏。
                # 已存在只跳过渲染，不跳过记录。
                already = os.path.exists(png_path)

                # 临时 PDF 复用同一文件名（覆盖写），避免产生/删除大量文件
                tmp_pdf = os.path.join(tmp_dir, "crop.pdf")
                if not already:
                    try:
                        crop_page(page, W, H, y_top, y_bottom, tmp_pdf)
                        if render(tmp_pdf, png_path):
                            stats["rendered"] += 1
                    except Exception as exc:
                        print(f"  裁剪失败 {out_name}：{exc}")

                manifest.append({
                    "file": f"{subject}/{out_name}",
                    "kind": kind,
                    "volume": vol,
                    "pdfPage": page_seq,
                    "label": b["label"][:60],
                    "exampleNo": b["num"],
                    # 归属：当前考点（跨页延续）与当前例题
                    "pointKey": ctx_point,
                    "exampleKey": ctx_example if b["kind"] == "example" else ctx_example,
                })

            # 页内最后一个切分点决定本页结束时的上下文
            if bounds:
                last = bounds[-1]
                if last["kind"] == "point":
                    current_point = f"{vol}-{page_seq:04d}-{len(bounds)-1:02d}"
                    current_example = None
                elif last["kind"] == "example":
                    current_example = f"{vol}-{page_seq:04d}-{len(bounds)-1:02d}"

            if stats["pages"] % 50 == 0:
                print(f"  已处理 {stats['pages']} 页，产出 {stats['rendered']} 张", flush=True)

    with open(os.path.join(out_root, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {"generatedAt": date.today().isoformat()}, "blocks": manifest},
                  f, ensure_ascii=False, indent=1)

    print(f"完成：{stats['pages']} 页 → {stats['rendered']} 张切块")
    print(f"→ {out_root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
