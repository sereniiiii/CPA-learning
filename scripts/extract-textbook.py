#!/usr/bin/env python3
"""
从拆好的单页 PDF 批量提取文本（layout 模式）。

为什么必须用 layout 模式：
  默认模式会把双栏正文与例题框内容交错，题目、选项、解析互相串行；
  layout 模式能还原阅读顺序与表格列关系。

同时清理 OCR 常见污染：
  - 页眉（如「第一章 财务管理概述」）与页码
  - 行尾印刷页码
  - 目录页的点线引导

用法：
    python3 extract-textbook.py build/pdf-pages/up out/up.json
"""
import json
import os
import re
import sys

from pypdf import PdfReader

# 印刷页眉/页码清理规则
HEADER_RE = re.compile(r"^\s*(第[一二三四五六七八九十百]+章\s*\S{0,20}|C\s*ONTENTS\s*)$")
PAGE_NUM_RE = re.compile(r"\s+\d{1,4}\s*$")
DOTS_RE = re.compile(r"[.…]{3,}\s*\d{1,4}\s*$")


def clean_page(text: str) -> str:
    lines = text.split("\n")
    out = []
    for line in lines:
        stripped = line.rstrip()
        if not stripped.strip():
            out.append("")
            continue
        # 去掉纯页眉行
        if HEADER_RE.match(stripped.strip()):
            continue
        # 去掉目录引导点线 + 页码
        cleaned = DOTS_RE.sub("", stripped)
        cleaned = PAGE_NUM_RE.sub("", cleaned)
        out.append(cleaned.rstrip())
    # 压缩连续空行
    result = []
    blanks = 0
    for line in out:
        if not line.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        result.append(line)
    return "\n".join(result).strip()


def main() -> int:
    if len(sys.argv) != 3:
        print("用法: python3 extract-textbook.py <pages_dir> <out.json>")
        return 1

    pages_dir, out_path = sys.argv[1], sys.argv[2]
    files = sorted(f for f in os.listdir(pages_dir) if f.endswith(".pdf"))
    if not files:
        print(f"{pages_dir} 里没有 PDF")
        return 1

    pages = []
    for i, fname in enumerate(files):
        path = os.path.join(pages_dir, fname)
        try:
            reader = PdfReader(path)
            text = reader.pages[0].extract_text(extraction_mode="layout") or ""
        except Exception as exc:
            print(f"  [{fname}] 失败：{exc}")
            text = ""
        cleaned = clean_page(text)
        pages.append({
            "file": fname,
            "seq": i + 1,
            "text": cleaned,
            "chars": len(cleaned),
        })
        if (i + 1) % 50 == 0:
            print(f"  已处理 {i + 1}/{len(files)}")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"pages": pages}, f, ensure_ascii=False, indent=1)

    total = sum(p["chars"] for p in pages)
    print(f"完成：{len(pages)} 页，共 {total} 字符 → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
