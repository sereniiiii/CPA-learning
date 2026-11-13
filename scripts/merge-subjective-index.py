#!/usr/bin/env python3
"""
合并主观题索引：教材的「主观题集训」+ 轻二大题篇（dqNN）。

为什么要合并：
  两个来源各写一个 index.json，后写的会覆盖先写的。
  接口只读一个 index.json，所以必须合成一份。

用法：
    python3 merge-subjective-index.py <科目id>
"""
import json
import os
import sys

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"


def main() -> int:
    sid = sys.argv[1] if len(sys.argv) > 1 else "sj"
    d = f"{BASE}/build/{sid}/upload/subjects/{sid}/subjectives"
    if not os.path.isdir(d):
        print(f"  ❌ 没有目录 {d}")
        return 1

    topics = []

    # 教材的主观题（export-subjectives 产的 index.json）
    idx_path = os.path.join(d, "index.json")
    if os.path.exists(idx_path):
        try:
            data = json.load(open(idx_path, encoding="utf-8"))
            for t in data.get("topics", []):
                topics.append({
                    "id": t["id"],
                    "num": t.get("num", 0),
                    "title": t["title"],
                    "source": t.get("source", {}),
                    "pageCount": t.get("pageCount", 0),
                    "hasAnswer": False,
                    "group": "教材主观题",
                })
        except Exception as e:
            print(f"  ⚠️ 教材索引读取失败：{e}")

    # 轻二大题篇
    dq = []
    for f in sorted(os.listdir(d)):
        if not (f.startswith("dq") and f.endswith(".json")):
            continue
        t = json.load(open(os.path.join(d, f), encoding="utf-8"))
        dq.append({
            "id": t["id"],
            "num": t.get("num", 0),
            "title": t["title"],
            "source": t.get("source", {}),
            "pageCount": len(t.get("pages", [])),
            "hasAnswer": t.get("hasAnswer", False),
            "group": "轻二大题篇",
        })
    topics.extend(dq)

    json.dump({"topics": topics}, open(idx_path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"  合并后 {len(topics)} 个专题"
          f"（教材 {len(topics) - len(dq)} + 大题篇 {len(dq)}）→ {idx_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
