#!/usr/bin/env python3
"""
把整册 PDF 拆成单页 PDF。

用法：
    python3 split-pdf.py <源PDF> <输出目录>

输出：<输出目录>/page-0001.pdf ...
每页一个独立 PDF，后续脚本（提取文本、切块）都基于这些单页处理。
"""
import os
import sys

from pypdf import PdfReader, PdfWriter


def main() -> int:
    if len(sys.argv) != 3:
        print("用法: python3 split-pdf.py <源PDF> <输出目录>")
        return 1
    src = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    reader = PdfReader(src)
    n = len(reader.pages)
    for i, page in enumerate(reader.pages, 1):
        dst = os.path.join(out_dir, f"page-{i:04d}.pdf")
        if os.path.exists(dst):
            continue
        writer = PdfWriter()
        writer.add_page(page)
        with open(dst, "wb") as f:
            writer.write(f)
        if i % 50 == 0:
            print(f"  已拆 {i}/{n}")

    print(f"完成：{n} 页 → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
