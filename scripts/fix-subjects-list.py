#!/usr/bin/env python3
"""
修复并写入科目清单 data/subjects.json。

为什么要单独一个脚本：
  科目清单是**所有科目共用**的一份，每个科目只知道自己是谁，
  合并逻辑散在各脚本里很容易把别的科目覆盖掉（踩过：
  推经济法时把财管的条目写成了 name='?'）。
  这里集中处理，且对已知科目用固定信息兜底。
"""
import json
import os
import sys

KNOWN = {
    "cwc": {"name": "财管", "color": "#2f5fd0", "volumeCount": 3},
    "sts": {"name": "税法", "color": "#0b7a4b", "volumeCount": 3},
    "eco": {"name": "经济法", "color": "#6b3ba8", "volumeCount": 3},
}


def main() -> int:
    list_path = sys.argv[1]
    subjects = []
    if os.path.exists(list_path):
        try:
            subjects = json.load(open(list_path, encoding="utf-8"))
        except Exception:
            subjects = []

    by_id = {s.get("id"): s for s in subjects if isinstance(s, dict)}

    # 合并各科目的章节数（从各自的 index.json 读）
    for sid, info in KNOWN.items():
        idx_path = os.path.join(os.path.dirname(list_path), "subjects", sid, "index.json")
        chapters = info.get("chapterCount", 0)
        if os.path.exists(idx_path):
            try:
                chapters = len(json.load(open(idx_path, encoding="utf-8")).get("chapters", []))
            except Exception:
                pass
        if chapters <= 0:
            # 还没做的科目不进清单 —— 切换器里出现一个空科目，
            # 点了进去是空白页，比没有更糟。
            by_id.pop(sid, None)
            continue
        entry = by_id.get(sid, {})
        entry.update({
            "id": sid,
            "name": info["name"],
            "volumeCount": info["volumeCount"],
            "chapterCount": chapters,
            "color": info["color"],
        })
        by_id[sid] = entry

    out = [by_id[k] for k in sorted(by_id)]
    json.dump(out, open(list_path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print("  科目清单:", [(s["id"], s["name"], s["chapterCount"]) for s in out])
    return 0


if __name__ == "__main__":
    sys.exit(main())
