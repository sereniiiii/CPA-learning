#!/usr/bin/env python3
"""
生成「模考卷」通道的数据。

三类卷子：
  轻三·最后六套题   26审计DA-轻三.pdf（163 页，纯图片）
                    → 作为一个整体入口，页码连续翻
  轻二·套卷一/二    套卷一 -题.pdf + 套卷一 -答案.pdf（各 6-8 页）

为什么要单独一条通道：
  模考是「整套卷连续做」，跟「章 → 节 → 考点」的结构不搭；
  而且轻三的页眉（套名）只在部分页出现，OCR 识别不可靠，
  强行拆成 6 套容易错位 —— 不如整体呈现，卷名由标题说明。

产物：
  build/sj/upload/subjects/sj/papers/index.json
  build/sj/upload/subjects/sj/papers/<id>.json
  build/sj/blocks/审计/q3-<页>.jpg / tc<套>-<页>.jpg
"""
import json
import os
import subprocess
import sys
import tempfile

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
Q3_PDF = "/Users/seren/Desktop/26注会审计轻一/26注会审计轻三/26审计DA-轻三.pdf"
TJ_DIR = "/Users/seren/Desktop/26注会审计轻一/26注会审计轻二/套卷"


def render_page(pdf: str, page_index: int, out_jpg: str, width: int = 1100) -> bool:
    from pypdf import PdfReader, PdfWriter
    r = PdfReader(pdf)
    w = PdfWriter()
    w.add_page(r.pages[page_index])
    tmp_pdf = os.path.join(tempfile.gettempdir(), os.path.basename(out_jpg) + ".pdf")
    with open(tmp_pdf, "wb") as fh:
        w.write(fh)
    tmp_png = os.path.join(tempfile.gettempdir(), os.path.basename(out_jpg) + ".png")
    ok = False
    r1 = subprocess.run(["sips", "-s", "format", "png", "-Z", str(width), tmp_pdf, "--out", tmp_png],
                        capture_output=True)
    if r1.returncode == 0 and os.path.exists(tmp_png):
        r2 = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88",
                              tmp_png, "--out", out_jpg], capture_output=True)
        ok = r2.returncode == 0 and os.path.exists(out_jpg)
    for f in (tmp_pdf, tmp_png):
        if os.path.exists(f):
            os.remove(f)
    return ok


def main() -> int:
    subject = sys.argv[1] if len(sys.argv) > 1 else "sj"
    subject_name = sys.argv[2] if len(sys.argv) > 2 else "审计"

    work = f"{BASE}/build/{subject}"
    out_dir = f"{work}/upload/subjects/{subject}/papers"
    block_dir = f"{work}/blocks/{subject_name}"
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(block_dir, exist_ok=True)

    papers = []

    # ---------- 轻三：最后六套题 ----------
    if os.path.exists(Q3_PDF):
        from pypdf import PdfReader
        n = len(PdfReader(Q3_PDF).pages)
        pages = []
        for i in range(n):
            img = f"q3-{i + 1:03d}.jpg"
            out = os.path.join(block_dir, img)
            if not os.path.exists(out):
                if not render_page(Q3_PDF, i, out):
                    print(f"  ❌ 渲染失败 轻三 p{i + 1}")
                    continue
            pages.append({"image": img, "kind": "题", "page": i + 1})
        papers.append({
            "id": "q3",
            "title": "最后六套题·审计",
            "sourceLevel": "轻三",
            "kind": "冲刺卷",
            "pageCount": len(pages),
            "pages": pages,
        })
        print(f"  轻三·最后六套题：{len(pages)} 页")

    # ---------- 轻二·套卷 ----------
    import re
    files = sorted(os.listdir(TJ_DIR)) if os.path.isdir(TJ_DIR) else []
    groups = {}
    for f in files:
        m = re.match(r"^(套卷[一二三四五六七八九十])\s*-(题|答案)\.pdf$", f)
        if not m:
            continue
        groups.setdefault(m.group(1), {})[m.group(2)] = f

    for gi, (name, pair) in enumerate(sorted(groups.items()), 1):
        pages = []
        for kind in ("题", "答案"):
            fname = pair.get(kind)
            if not fname:
                continue
            pdf = os.path.join(TJ_DIR, fname)
            from pypdf import PdfReader
            n = len(PdfReader(pdf).pages)
            for i in range(n):
                suffix = "" if kind == "题" else "-ans"
                img = f"tc{gi}-{kind}-{i + 1:02d}.jpg"
                out = os.path.join(block_dir, img)
                if not os.path.exists(out):
                    if not render_page(pdf, i, out):
                        print(f"  ❌ 渲染失败 {fname} p{i + 1}")
                        continue
                pages.append({"image": img, "kind": kind, "page": i + 1})
        papers.append({
            "id": f"tc{gi}",
            "title": name,
            "sourceLevel": "轻二·套卷",
            "kind": "模拟卷",
            "pageCount": len(pages),
            "pages": pages,
        })
        print(f"  {name}：{len(pages)} 页")

    # ---------- 写文件 ----------
    index = {
        "papers": [
            {k: p[k] for k in ("id", "title", "sourceLevel", "kind", "pageCount")}
            for p in papers
        ]
    }
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    for p in papers:
        with open(os.path.join(out_dir, f"{p['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, separators=(",", ":"))

    print(f"  共 {len(papers)} 套卷 → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
