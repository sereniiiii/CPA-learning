#!/usr/bin/env python3
"""
把切好的知识块并入教材内容库。

块 → 考点的映射靠「章 + 起始页」：
  1. 教材内容库里的每个考点有 source.pdfPage（它正文所在的第一页）
  2. 切块 manifest 里 kind=point 的块，其 label 就是「考点NN」
  3. 一个考点可能跨页 → 它的块包括：自己的 point 块 + 后续归属到它的 label/example 块

做法：按页序遍历，把块依次分配给「最近遇到的 point 块所代表的考点」。
由于 point 块的 label 只有「考点NN」（没有章号），需要靠页序 + 教材章节的页范围定位。

简化：教材内容库里考点已按顺序排列，其 source.pdfPage 单调不减。
切块也是按页序。所以两边可以「顺序对齐」：
  - 遍历教材的所有考点（按章内顺序）
  - 遍历切块（按页序）
  - 把块分配给「页序上最接近的、且尚未分配的考点」
"""
import json
import os
import re
from collections import defaultdict

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
VOL = {"上册": "up", "中册": "mid", "下册": "down"}


def main():
    manifest = json.load(open(f"{BASE}/build/blocks/manifest.json", encoding="utf-8"))
    blocks = manifest["blocks"]

    # 块按 (册, 页, 序) 排序
    def block_key(b):
        # 文件名格式：<kind>-<vol>-<page>-<idx>.png
        parts = b["file"].split("/")[-1].replace(".png", "").split("-")
        return (parts[1], int(parts[2]), int(parts[3]))

    blocks.sort(key=block_key)

    # 教材考点列表（按全局顺序）：(volume, pdfPage, chapterId, pointNum)
    book = json.load(open(f"{BASE}/build/textbook.json", encoding="utf-8"))
    points_seq = []
    for ch in book["chapters"]:
        vol = VOL[ch["volume"]]
        for sec in ch["sections"]:
            for p in sec["points"]:
                points_seq.append({
                    "vol": vol,
                    "page": p["source"]["pdfPage"],
                    "chapterId": ch["id"],
                    "sectionNum": sec["num"],
                    "pointNum": p["num"],
                    "point": p,
                })

    # 归属算法：
    #   point 块   → 它自己的考点（按 label「考点NN」+ 所在章定位）
    #   其他块     → manifest 里的 pointKey（该块所在页的当前考点上下文）
    #
    # pointKey 形如 "up-0027-00"，其中 00 是该页内切分点的序号。
    # 要把它映射到具体考点，需要知道该页上哪个切分点对应哪个考点 ——
    # 用「页内切分点序号 → 考点」的映射表来解。
    #
    # 步骤：
    #   1. 遍历所有块，维护「当前考点」上下文：
    #        遇到 point 块 → 当前考点 = 该块所属考点
    #        遇到其他块 → 归属当前考点
    #   2. point 块属于哪个考点？按 label（考点NN）+ 章节页范围匹配。

    # 建立 (册, 页) → 该页上所有考点（按教材顺序）
    page_points = defaultdict(list)
    for bp in points_seq:
        page_points[(bp["vol"], bp["page"])].append(bp)

    # 章节页范围：章首页 → 下一章首页
    chapter_ranges = {}
    for ci, ch in enumerate(book["chapters"]):
        vol = VOL[ch["volume"]]
        start = min(
            (p["source"]["pdfPage"] for s in ch["sections"] for p in s["points"]),
            default=0,
        )
        end = 10**9
        for cj in range(ci + 1, len(book["chapters"])):
            nc = book["chapters"][cj]
            if VOL[nc["volume"]] != vol:
                break
            nxt = min(
                (p["source"]["pdfPage"] for s in nc["sections"] for p in s["points"]),
                default=10**9,
            )
            if nxt > start:
                end = nxt
                break
        chapter_ranges[(vol, start)] = (ch["id"], start, end)

    def find_chapter(vol, page):
        for (v, start), (cid, s, e) in chapter_ranges.items():
            if v == vol and s <= page < e:
                return cid
        return None

    # 考点在章内的序号 → (章ID, 考点号)
    chapter_points = defaultdict(list)
    for bp in points_seq:
        chapter_points[bp["chapterId"]].append(bp)

    # 同章内「考点NN」可能重复（每节重新编号），
    # 所以归属时要用「章节内出现顺序」而不是只按编号。
    # 记录每个考点在章内的序号，供消歧。

    assignment = {}
    used_keys = set()
    cur_key = None
    for b in blocks:
        parts = b["file"].split("/")[-1].replace(".png", "").split("-")
        vol, page = parts[1], int(parts[2])

        if b["kind"] == "point":
            # label 形如「考点01」，找同章同号的考点
            m = re.search(r"考点\s*(\d+)", b["label"])
            if not m:
                continue
            pnum = int(m.group(1))
            cid = find_chapter(vol, page)
            if not cid:
                continue
            # 同章内可能有多个「考点NN」（每节重新编号），
            # 取该章内编号匹配且尚未用过的第一个。
            cands = [
                p
                for p in chapter_points[cid]
                if p["pointNum"] == pnum
                and (cid, p["sectionNum"], p["pointNum"]) not in used_keys
            ]
            if not cands:
                # 该编号已被前面的节用掉 → 找下一个同号候选
                cands = [p for p in chapter_points[cid] if p["pointNum"] == pnum]
            if not cands:
                continue
            chosen = cands[0]
            used_keys.add((cid, chosen["sectionNum"], chosen["pointNum"]))
            cur_key = (cid, chosen["sectionNum"], chosen["pointNum"])
        else:
            if cur_key is None:
                continue

        assignment.setdefault(cur_key, []).append(b)

    # 写回教材内容库
    out = f"{BASE}/build/upload"
    index = {
        "meta": book["meta"],
        "chapters": [
            {
                "id": c["id"], "num": c["num"], "title": c["title"], "volume": c["volume"],
                "info": c["info"],
                "sections": [
                    {
                        "num": s["num"], "title": s["title"],
                        "points": [
                            {
                                "num": p["num"], "title": p["title"],
                                "difficulty": p["difficulty"], "hot": p["hot"],
                                "exampleCount": len(p["examples"]),
                                "blockCount": len(
                                    assignment.get((c["id"], s["num"], p["num"]), [])
                                ),
                                "blocks": [
                                    b["file"].split("/")[-1]
                                    for b in assignment.get(
                                        (c["id"], s["num"], p["num"]),
                                        [],
                                    )
                                ],
                            }
                            for p in s["points"]
                        ],
                    }
                    for s in c["sections"]
                ],
            }
            for c in book["chapters"]
        ],
        "subjectiveCount": len(book["subjectives"]),
    }

    os.makedirs(f"{out}/subjects/cwc/chapters", exist_ok=True)
    json.dump(index, open(f"{out}/subjects/cwc/index.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # 章节详情：带上块列表
    for ch in book["chapters"]:
        detail = json.loads(json.dumps(ch))
        # 章末习题页的块（命名规则与 split-exercise-pages.py 一致）
        for ex in detail.get("exercises", []):
            vol = VOL[ch["volume"]]
            ex["block"] = f"exercise-{vol}-{ex['source']['pdfPage']:04d}.png"
        for sec in detail["sections"]:
            for p in sec["points"]:
                p["blocks"] = [
                    b["file"].split("/")[-1]
                    for b in assignment.get((ch["id"], sec["num"], p["num"]), [])
                ]
                # 例题也带块
                for ex in p["examples"]:
                    ex["blocks"] = []
        json.dump(detail, open(f"{out}/subjects/cwc/chapters/{ch['id']}.json", "w",
                              encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # 科目清单
    subjects = [{
        "id": "cwc",
        "name": "财管",
        "volumeCount": 3,
        "chapterCount": len(book["chapters"]),
        "color": "#2f5fd0",
    }]
    json.dump(subjects, open(f"{out}/subjects.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # 块索引（前端按需取图）
    block_index = {b["file"].split("/")[-1]: {
        "kind": b["kind"],
        "volume": b["volume"],
        "pdfPage": b["pdfPage"],
        "label": b["label"],
        "exampleNo": b.get("exampleNo"),
    } for b in blocks}
    json.dump(block_index, open(f"{out}/subjects/cwc/blocks.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    assigned = sum(len(v) for v in assignment.values())
    with_blocks = sum(
        1
        for p in points_seq
        if assignment.get((p["chapterId"], p["sectionNum"], p["pointNum"]))
    )
    print(f"块总数 {len(blocks)}，已归并 {assigned}（{assigned/len(blocks)*100:.0f}%）")
    print(f"有块的考点: {with_blocks}/{len(points_seq)}")
    print(f"→ {out}/subjects/cwc/")


if __name__ == "__main__":
    main()
