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

输出：{WORK}/blocks/<科目>/<类型>-<ID>.png
      + {WORK}/blocks/manifest.json（每个块的元数据与归属）
"""
import json
import os
import re
import struct
import subprocess
import sys
from datetime import date

from pypdf import PdfReader, PdfWriter

from subject_config import VOL_DIR

# ---------- 工作目录（按科目隔离，避免多科内容互相覆盖） ----------
ROOT = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
WORK = os.environ.get("WORK_DIR", f"{ROOT}/build")
from pypdf.generic import RectangleObject

# ---------- 识别切分点 ----------
# 考点标题。
#
# OCR 文本有噪声：数字可能被认成中文（1 → 一）、前面可能粘上别的字
# （「一考点10 …」「- 考点07 …」）、数字与文字间可能有空格。
# 所以允许少量前缀噪声 + 中英文数字。
POINT_TITLE = re.compile(r'^.{0,3}?考点\s*([0-9]{1,2}|[一二三四五六七八九十]{1,2})(?:\b|(?=\s))')
EXAMPLE_TITLE = re.compile(r'【\s*例题\s*(\d+)')
SECTION_TITLE = re.compile(r'^第[一二三四五六七八九十]+节')
ANSWER_ROW = re.compile(r'例题.{0,4}答案')
# 「解析」「点拨」这类小标签也要当切分点 ——
# 否则上一块的正文会从它们中间被切开（比如页底的解析标签被切掉半行）。
#
# 两类处理不同：
#   解析   → 紧跟在例题后面，必须并入例题（用户要求：例题和解析要在一起）
#   点拨等 → 是知识点的补充，独立成块，归到所属考点
LABEL_TITLE = re.compile(r'^(解析|点拨|辨析|说明|注意|小结)\s*$')

# 「考点名 5年热点N次」—— 经济法/税法正文里的考点小标题。
#
# 财管正文用的是「考点NN 标题」，经济法/税法用的是「考点名 5年热点N次」
# 这种加粗行（有时还带「考点NN）」前缀）。两种都要认。
HOT_TITLE = re.compile(r'^(.{2,30}?)\s*5\s*年\s*热\s*点\s*[\d|丨l]+\s*次')
HOT_TITLE_LOOSE = re.compile(r'^(.{2,30}?)\s*5\s*年\s*热\s*点')
ANSWER_LABEL = re.compile(r'^解析\s*$')

# 页面上下安全边界（排除页眉/页脚）
CONTENT_TOP = 792.0     # 高于此为页眉
CONTENT_BOTTOM = 42.0   # 低于此为页脚/水印

SUBJECTS = {
    "up": VOL_DIR["up"],
    "mid": VOL_DIR["mid"],
    "down": VOL_DIR["down"],
}


# 预加载 pages.json 的文字块（原生文字层 + OCR 合并结果）
_PAGE_BLOCKS = {}

# OCR 坐标表（扫描版 PDF 没有原生文字层时用）
_OCR_BLOCKS: dict = {}


def load_ocr_blocks(ocr_json) -> int:
    # 载入 Vision OCR 的坐标表（text + x/y/size），返回页数。
    #
    # 为什么需要：
    #   扫描版教材（会计/税法/经济法/战略）的 PDF **没有原生文字层**，
    #   pypdf 的 visitor 拿不到任何文字 → 找不到「考点NN」「【例题N】」
    #   这些切分点 → 只能整页切，考点级结构全丢。
    _OCR_BLOCKS.clear()
    if not ocr_json or not os.path.exists(ocr_json):
        return 0
    try:
        data = json.load(open(ocr_json, encoding="utf-8"))
    except Exception as exc:
        print(f"  OCR 读取失败：{exc}")
        return 0
    for p in data.get("pages", []):
        fname = os.path.basename(p.get("file", ""))
        blocks = p.get("blocks") or []
        if fname and blocks:
            _OCR_BLOCKS[fname] = blocks
    return len(_OCR_BLOCKS)


def load_page_blocks(text_dir):
    """
    载入 extract-with-ocr.py 产出的 pages.json。

    为什么不用直接读 PDF：
      扫描版 PDF 部分页没有文字层，直接读会漏掉整页的切分点。
      pages.json 里已经合并了「原生文字层 + Vision OCR」，坐标口径一致。
    """
    _PAGE_BLOCKS.clear()
    if not text_dir or not os.path.isdir(text_dir):
        return
    for name in sorted(os.listdir(text_dir)):
        if not name.endswith(".json"):
            continue
        data = json.load(open(os.path.join(text_dir, name), encoding="utf-8"))
        for p in data.get("pages", []):
            blocks = p.get("blocks") or []
            if blocks:
                _PAGE_BLOCKS[p["file"]] = blocks


def page_items(path, text_dir=None):
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

    # 优先用 pages.json（合并了 OCR）
    fname = os.path.basename(path)
    merged = _PAGE_BLOCKS.get(fname)
    if merged:
        # **大尺寸页面要归一化坐标**。
        #
        # pages.json 里存的是「原生文字层优先、OCR 兜底」的 blocks，
        # 坐标是 PDF 原始坐标。扫描版按 300dpi 输出，页面高 2339，
        # 而 CONTENT_TOP/CONTENT_BOTTOM 是按 A4（高 842）写死的
        # → 所有块的 y 都在 1900 上下，全被过滤掉 → 一页都找不到切分点。
        #
        # 页面高度明显不是 A4 时，按实际高度缩放到 842 坐标系。
        if H > 900:
            scale = 842.0 / H
            merged = [
                {**b, "y": float(b.get("y", 0)) * scale,
                 "size": float(b.get("size", 10)) * scale}
                for b in merged
            ]
        return r, page, W, H, merged

    # 原生文字层是空的（扫描版）→ 用 OCR 坐标
    if len(items) < 3 and _OCR_BLOCKS:
        ocr_items = _OCR_BLOCKS.get(fname)
        if ocr_items:
            # **坐标归一化到 A4 坐标系**。
            #
            # CONTENT_TOP / CONTENT_BOTTOM 是按 A4（高 842）写死的页眉页脚边界，
            # 但扫描版 PDF 是按 300dpi 输出的 —— 页面高度 2339，
            # 所有 OCR 块的 y 都在 1900 上下 → 全被
            # `CONTENT_BOTTOM < y < CONTENT_TOP` 过滤掉 →
            # 一页都找不到切分点 → 退化成「整页切一块」，考点级切分全丢。
            #
            # 所以按页面实际高度把 y 和字号缩放到 842 的坐标系。
            scale = 842.0 / H if H else 1.0
            norm = []
            for b in ocr_items:
                bb = dict(b)
                bb["y"] = float(b.get("y", 0)) * scale
                bb["size"] = float(b.get("size", 10)) * scale
                norm.append(bb)
            return r, page, W, H, norm

    return r, page, W, H, items


def find_boundaries(items):
    """
    找出这一页上的切分点。

    返回按 y 降序排列的边界列表：
      {y, kind: 'point'|'example', label, num}
    """
    # 框架页判定：一页里有多个「考点NN」标题 = 章首的考点框架页。
    #
    # 框架页把本章所有考点列一遍，正文没有对应的「考点NN」小标题。
    # 如果把它也当成考点边界切出来，这些**框架块的序号会插在正文块中间**，
    # 归并时「章内第 N 个块 ↔ 章内第 N 个考点」的对应就全错位了
    # （战略：112 个考点只有 43 个能挂到块）。
    #
    # 所以框架页上不切 point 边界（只切其他边界）。
    n_point_titles = sum(
        1 for it in items
        if POINT_TITLE.match(it["text"].strip())
        and CONTENT_BOTTOM < it["y"] < CONTENT_TOP
    )
    is_framework = n_point_titles >= 3

    marks = []
    for it in items:
        t = it["text"].strip()
        y = it["y"]
        if not (CONTENT_BOTTOM < y < CONTENT_TOP):
            continue
        size = it.get("size") or 11.0
        if POINT_TITLE.match(t) and not is_framework:
            m2 = POINT_TITLE.match(t)
            num = int(m2.group(1)) if m2.groups() else None
            marks.append({"y": y, "size": size, "kind": "point", "label": t, "num": num})
        elif HOT_TITLE.match(t) or HOT_TITLE_LOOSE.match(t):
            m2 = HOT_TITLE.match(t) or HOT_TITLE_LOOSE.match(t)
            name = m2.group(1).strip()
            # 名字里可能带「考点NN）」前缀，取出题号
            pm = re.match(r'^.{0,3}?考点\s*([0-9]{1,2})', name)
            num = int(pm.group(1)) if pm else None
            marks.append({"y": y, "size": size, "kind": "point", "label": name, "num": num})
        elif EXAMPLE_TITLE.match(t):
            m = EXAMPLE_TITLE.match(t)
            marks.append({"y": y, "size": size, "kind": "example", "label": t, "num": int(m.group(1))})
        elif LABEL_TITLE.match(t):
            kind = "answer" if ANSWER_LABEL.match(t) else "label"
            marks.append({"y": y, "size": size, "kind": kind, "label": t, "num": None})
    # 按 y 降序（从上往下）
    marks.sort(key=lambda m: -m["y"])
    # 同一 y 只留一个
    out = []
    for m in marks:
        if out and abs(out[-1]["y"] - m["y"]) < 3:
            continue
        out.append(m)
    return out


def png_size(path):
    """读 PNG 尺寸（只看 IHDR，不解码）"""
    with open(path, "rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def render_page(pdf_path, png_path, width=1500):
    """整页渲染成 PNG"""
    subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(width), pdf_path, "--out", png_path],
        capture_output=True,
    )
    return png_size(png_path)


def parse_answers(items):
    """
    从页面的「例题-答案」行解析出 例题号 → 答案。

    格式：例题-答案 I 4.ABCD 5.ABCD
    例题号是全书连续的（跨章接着排），可以直接对应到例题。
    答案行可能被拆成多个文本块 → 按 y 坐标邻近合并。
    """
    rows = [it for it in items if ANSWER_ROW.search(it["text"])]
    answers = {}
    for row in rows:
        text = row["text"]
        y = row["y"]
        # 同一行的其他块（答案常被拆开）
        for it in items:
            if it is row:
                continue
            if abs(it["y"] - y) < 3 and it["x"] > row["x"]:
                text += " " + it["text"]
        text = ANSWER_ROW.sub(" ", text)
        for m in re.finditer(r"(\d{1,2})\s*[.．、]\s*([A-Za-z]{1,6})", text):
            answers[int(m.group(1))] = m.group(2).upper()
    return answers


def crop_png(full_png, out_png, pdf_h, y_top, y_bottom):
    """
    从整页 PNG 里按像素裁出 [y_bottom, y_top] 这段。

    为什么不直接用 PDF cropbox：
      sips 渲染带 cropbox 的 PDF 时，内容位置会偏移
      （实测裁 [262.81, 431.97] 得到的是从「解析」行开始的内容，上方留白 45%）。
      整页渲染是准的 —— 像素映射已用文字块位置验证过。
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
    # 边界收敛
    top_px = max(0, min(ph - height_px, top_px))
    height_px = min(height_px, ph - top_px)
    width_px = pw

    subprocess.run(
        ["sips", "-c", str(height_px), str(width_px),
         "--cropOffset", str(top_px), "0",
         full_png, "--out", out_png],
        capture_output=True,
    )
    return os.path.exists(out_png)


def main():
    base = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
    pages_root = os.path.join(WORK, "pdf-pages")
    out_root = os.path.join(WORK, "blocks")
    tmp_dir = os.path.join(WORK, "_crops")
    os.makedirs(out_root, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)

    manifest = []
    stats = {"pages": 0, "blocks": 0, "rendered": 0}
    # 跨页上下文：考点/例题常跨页延续
    text_dir = os.path.join(WORK, "text")
    load_page_blocks(text_dir)

    current_point = None      # "up-0027-00" 形式：册-页-序
    current_example = None
    page_answers = {}        # "册-页" → {例题号: 答案}

    for vol in ("up", "mid", "down"):
        vdir = os.path.join(pages_root, vol)
        if not os.path.isdir(vdir):
            continue
        # OCR 坐标回退：扫描版 PDF 没有原生文字层，
        # 用 Vision OCR 的坐标当切分点依据（每册一份，册内文件名唯一）。
        load_ocr_blocks(os.path.join(WORK, "ocr", f"{vol}.json"))
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
                r, page, W, H, items = page_items(src, text_dir)
            except Exception as exc:
                print(f"  [{vol}] {fname} 读取失败：{exc}")
                continue

            # 收集本页的例题答案。
            # 注意：例题号是**每章重新从 01 开始**的（和考点编号一样），
            # 所以答案必须按页记录，归并时再按章聚合 —— 全局混会串章。
            pa = parse_answers(items)
            if pa:
                page_answers[f"{vol}-{page_seq:04d}"] = {str(k): v for k, v in pa.items()}

            bounds = find_boundaries(items)
            if not bounds:
                # 这一页没识别到任何切分点 —— 但**内容不能丢**。
                # 经济法下册有一百多页是纯正文（没有考点小标题、
                # 没有例题编号），不切就等于这部分内容从系统里消失。
                # 所以按整页切一块，kind 用 label（归属到上一个考点）。
                bounds = [{
                    "y": CONTENT_TOP,
                    "size": 12.0,
                    "kind": "label",
                    "label": "本页内容",
                    "num": None,
                }]
            stats["blocks"] += len(bounds)
            full_png = None
            full_page = None
            page_px = None

            # 上下文逐块推进：
            #   point  块 → 归属它自己开启的考点
            #   example 块 → 归属它自己开启的例题
            #   label  块 → 归属上一个考点（点拨/辨析是考点的延续）

            # 逐块裁剪
            #
            # 坐标要点：visitor 给的 y 是文字「基线」，
            # 文字上边界 ≈ 基线 + 字号×0.82，下边界 ≈ 基线 − 字号×0.22。
            # 切分时必须按这个算，否则标题行会被切掉半行字。
            # 「解析」块并入它前面的例题 —— 例题必须带解析。
            # 做法：把 answer 边界从「切分点」降级为「附属标签」，
            # 该例题块的下边界延伸到 answer 之后。
            merged_bounds = []
            skip_answer = set()
            for i, b in enumerate(bounds):
                if b["kind"] == "answer":
                    # 前一个是例题 → 合并（标记跳过，独立渲染）
                    prev = merged_bounds[-1] if merged_bounds else None
                    if prev and prev["kind"] == "example":
                        skip_answer.add(i)
                        prev["merge_until"] = i
                        continue
                    # 没有前置例题（解析属于知识点）→ 当普通标签
                    b = {**b, "kind": "label"}
                merged_bounds.append(b)

            ctx_point = current_point
            ctx_example = current_example
            for i, b in enumerate(merged_bounds):
                if b["kind"] == "point":
                    ctx_point = f"{vol}-{page_seq:04d}-{i:02d}"
                    ctx_example = None
                elif b["kind"] == "example":
                    ctx_example = f"{vol}-{page_seq:04d}-{i:02d}"

                y_top = b["y"] + b.get("size", 12) * 0.82 + 2
                if i + 1 < len(merged_bounds):
                    nb = merged_bounds[i + 1]
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

                if not already:
                    try:
                        # 每页只渲染一次整页，后续块都从它裁
                        if full_png is None or full_page != page_seq:
                            full_png = os.path.join(tmp_dir, "full.png")
                            page_px = render_page(src, full_png)
                            full_page = page_seq
                        if page_px and crop_png(full_png, png_path, H, y_top, y_bottom):
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
        json.dump(
            {
                "meta": {"generatedAt": date.today().isoformat()},
                "blocks": manifest,
                "pageAnswers": page_answers,
            },
            f,
            ensure_ascii=False,
            indent=1,
        )

    print(f"解析到答案 {sum(len(v) for v in page_answers.values())} 条"
          f"（分布在 {len(page_answers)} 页）")

    print(f"完成：{stats['pages']} 页 → {stats['rendered']} 张切块")
    print(f"→ {out_root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
