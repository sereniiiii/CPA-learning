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

    # 教材的主观题
    #
    # **从 topic*.json 文件重建，不读 index.json** ——
    # index.json 会被 build-q2-daqian.py 覆盖成大题篇的索引，
    # 读它会把大题篇当成教材（id 全变成 dq01…）。
    idx_path = os.path.join(d, "index.json")
    for fname in sorted(os.listdir(d)):
        if not (fname.startswith("topic") and fname.endswith(".json")):
            continue
        try:
            t = json.load(open(os.path.join(d, fname), encoding="utf-8"))
        except Exception as e:
            print(f"  ⚠️ {fname} 读取失败：{e}")
            continue
        topics.append({
            "id": t["id"],
            "num": t.get("num", 0),
            "title": t["title"],
            "source": t.get("source", {}),
            "pageCount": len(t.get("pages", [])),
            "hasAnswer": False,
            "group": "教材主观题",
            "sourceLevel": "轻一",
        })

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
            "sourceLevel": t.get("sourceLevel", "轻二·大题篇"),
        })
    topics.extend(dq)

    json.dump({"topics": topics}, open(idx_path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"  合并后 {len(topics)} 个专题"
          f"（教材 {len(topics) - len(dq)} + 大题篇 {len(dq)}）→ {idx_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
