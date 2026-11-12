#!/usr/bin/env python3
"""
把主观题解析结果按科目目录拆分输出。

API 期望：
  data/subjects/<科目>/subjectives/index.json   专题索引（精简）
  data/subjects/<科目>/subjectives/topicNN.json  单个专题详情

之前这些文件没生成，导致主观题功能线上 404。
"""
import json
import os
import sys

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else f"{BASE}/build/subjectives.json"
    subject = sys.argv[2] if len(sys.argv) > 2 else "cwc"

    data = json.load(open(src, encoding="utf-8"))
    topics = data["topics"]

    out_dir = f"{BASE}/build/upload/subjects/{subject}/subjectives"
    os.makedirs(out_dir, exist_ok=True)

    index = {
        "topics": [
            {
                "id": t["id"],
                "num": t["num"],
                "title": t["title"],
                "source": t["source"],
                "pageCount": len(t.get("pages", [])),
            }
            for t in topics
        ]
    }
    json.dump(index, open(f"{out_dir}/index.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    for t in topics:
        json.dump(t, open(f"{out_dir}/{t['id']}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))

    total_pages = sum(len(t.get("pages", [])) for t in topics)
    print(f"主观题：{len(topics)} 个专题 / {total_pages} 页 → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
