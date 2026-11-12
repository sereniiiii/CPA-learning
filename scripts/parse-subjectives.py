#!/usr/bin/env python3
"""
解析下册「第三部分 主观题集训」的 17 个专题。

结构（实测）：
  - 页眉是「专题一 财务报表分析和财务预测」这样的形式
  - 每个专题跨若干页，内容是「历年主观题回顾 + 精编主观题演练」
  - 专题内的题也是「N. 题干 … 要求：…」，无选项

输出：专题列表（id / 序号 / 标题 / 起止页）+ 每页正文
"""
import json
import os
import re
import sys

CN = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
    "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
    "十四": 14, "十五": 15, "十六": 16, "十七": 17,
}

TOPIC_RE = re.compile(r"^专题([一二三四五六七八九十]+)\s+(\S.*?)\s*$")


def parse(text_dir: str, out_path: str) -> int:
    data = json.load(open(os.path.join(text_dir, "down.json"), encoding="utf-8"))
    pages = data["pages"]

    # 找主观题集训起点
    start = None
    for i, p in enumerate(pages):
        if "主观题集训" in p["text"]:
            start = i
            break
    if start is None:
        print("未找到主观题集训起点")
        return 1

    topics = []
    cur = None
    for p in pages[start:]:
        t = p["text"]
        head = ""
        for ln in t.split("\n"):
            if ln.strip():
                head = ln.strip()
                break
        m = TOPIC_RE.match(head)
        if m:
            num = CN.get(m.group(1), 0)
            if num and (not topics or topics[-1]["num"] != num):
                cur = {
                    "id": f"topic{num:02d}",
                    "num": num,
                    "title": m.group(2).strip(),
                    "source": {
                        "volume": "下册",
                        "pdfPage": p["seq"],
                        "printPage": p["seq"],
                    },
                    "pages": [],
                }
                topics.append(cur)
        if cur is not None:
            cur["pages"].append({
                "pdfPage": p["seq"],
                "text": t,
            })

    # 去掉首尾空白页
    for t in topics:
        t["pages"] = [p for p in t["pages"] if p["text"].strip()]
        if t["pages"]:
            t["source"]["pdfPage"] = t["pages"][0]["pdfPage"]

    print(f"专题数：{len(topics)}")
    for t in topics:
        print(f"  专题{t['num']:2d} {t['title'][:26]:28} {len(t['pages']):3d} 页 (PDF p{t['source']['pdfPage']})")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"topics": topics}, f, ensure_ascii=False, indent=1)
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python3 parse-subjectives.py <text_dir> <out.json>")
        sys.exit(1)
    sys.exit(parse(sys.argv[1], sys.argv[2]))
