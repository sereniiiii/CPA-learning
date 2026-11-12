#!/usr/bin/env python3
"""
提取文字层，缺文字层的页用 OCR 结果补上。

为什么要合：
  扫描版 PDF 常常**部分页有 OCR 文字层、部分页是纯图片**。
  原始文字层更准（是出版方 OCR 的结果），所以优先用它；
  只有当某页几乎提取不到文字时，才用 macOS Vision 的 OCR 结果。

输出（供 parse-textbook.py 与 split-blocks.py 共用）：
  {
    "pages": [
      {
        "file": "page-0011.pdf", "seq": 11,
        "text": "整页文字（按行）",
        "chars": 123,
        "blocks": [ { "y": 812.3, "x": 60.0, "size": 11.0, "text": "..." } ],
        "source": "native" | "ocr"
      }
    ]
  }

用法：
    python3 extract-with-ocr.py <单页PDF目录> <输出.json> [ocr.json]
"""
import json
import os
import sys

from pypdf import PdfReader

# 少于这个数就认为「这页没有文字层」
MIN_BLOCKS = 4
MIN_CHARS = 20


def native_blocks(path: str):
    """从 PDF 原始文字层拿文本块（pypdf visitor）"""
    reader = PdfReader(path)
    page = reader.pages[0]
    blocks = []
    seen = set()

    def visitor(text, cm, tm, font_dict, font_size):
        t = text.strip()
        if not t:
            return
        key = (round(tm[5], 1), round(tm[4], 1), t[:24])
        if key in seen:
            return
        seen.add(key)
        blocks.append({
            "y": round(float(tm[5]), 2),
            "x": round(float(tm[4]), 2),
            "size": round(float(font_size or 11.0), 2),
            "text": t,
        })

    page.extract_text(visitor_text=visitor)
    blocks.sort(key=lambda b: (-b["y"], b["x"]))
    return blocks


def clean_line(line: str) -> str:
    """去掉页眉页脚污染"""
    import re

    line = re.sub(r"^\s*\d{1,4}\s*$", "", line)          # 纯页码行
    line = re.sub(r"[.…]{3,}\s*\d{1,4}\s*$", "", line)     # 目录点线
    return line.strip()


def main() -> int:
    if len(sys.argv) < 3:
        print("用法: python3 extract-with-ocr.py <单页PDF目录> <输出.json> [ocr.json]")
        return 1

    pages_dir = sys.argv[1]
    out_path = sys.argv[2]
    ocr_path = sys.argv[3] if len(sys.argv) > 3 else None

    ocr_pages = {}
    if ocr_path and os.path.exists(ocr_path):
        data = json.load(open(ocr_path, encoding="utf-8"))
        for p in data.get("pages", []):
            ocr_pages[p["file"]] = p
        print(f"  OCR 结果：{len(ocr_pages)} 页")

    files = sorted(f for f in os.listdir(pages_dir) if f.endswith(".pdf"))
    pages = []
    n_ocr = 0
    n_native = 0

    for i, name in enumerate(files, 1):
        path = os.path.join(pages_dir, name)
        blocks = []
        source = "native"
        try:
            blocks = native_blocks(path)
        except Exception:
            blocks = []

        text = " ".join(b["text"] for b in blocks)
        if len(blocks) < MIN_BLOCKS or len(text) < MIN_CHARS:
            op = ocr_pages.get(name)
            if op and op.get("blocks"):
                blocks = op["blocks"]
                source = "ocr"
                n_ocr += 1
            else:
                source = "empty"
        else:
            n_native += 1

        lines = [clean_line(b["text"]) for b in blocks]
        lines = [l for l in lines if l]
        pages.append({
            "file": name,
            "seq": i,
            "text": "\n".join(lines),
            "chars": sum(len(l) for l in lines),
            "blocks": blocks,
            "source": source,
        })
        if i % 50 == 0:
            print(f"  已处理 {i}/{len(files)}")

    out_dir = os.path.dirname(os.path.abspath(out_path))
    os.makedirs(out_dir, exist_ok=True)
    json.dump({"pages": pages}, open(out_path, "w", encoding="utf-8"),
              ensure_ascii=False)

    total = sum(p["chars"] for p in pages)
    print(f"完成：{len(pages)} 页，共 {total} 字符")
    print(f"  原始文字层 {n_native} 页 | OCR 补 {n_ocr} 页")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
