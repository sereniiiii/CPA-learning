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

from subject_config import SUBJECT_COLOR, SUBJECT_ID, SUBJECT_NAME

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"

# 工作目录（按科目隔离，避免多科内容互相覆盖）
WORK = os.environ.get("WORK_DIR", f"{BASE}/build")
VOL = {"上册": "up", "中册": "mid", "下册": "down"}


def main():
    manifest = json.load(open(f"{WORK}/blocks/manifest.json", encoding="utf-8"))
    blocks = manifest["blocks"]
    page_answers = manifest.get("pageAnswers", {})

    # 块按 (册, 页, 序) 排序
    def block_key(b):
        # 文件名格式：<kind>-<vol>-<page>-<idx>.png
        parts = b["file"].split("/")[-1].rsplit(".", 1)[0].split("-")
        return (parts[1], int(parts[2]), int(parts[3]))

    blocks.sort(key=block_key)

    # 教材考点列表（按全局顺序）：(volume, pdfPage, chapterId, pointNum)
    book = json.load(open(f"{WORK}/textbook.json", encoding="utf-8"))
    points_seq = []
    # 全局唯一序号。
    #
    # **不能用 (章, 节, 考点号) 做 key** —— 战略教材的考点编号本身是乱的
    # （同一节里出现 1,3,2,1,3,2,3,5,4，教材按「考点剖析」分块、每块重新编号）。
    # 重复的号会让多个考点共用一个 key → 归并统计对不上，
    # 章节文件里同一批块被多个考点重复引用。序号唯一且稳定。
    global_idx = 0
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
                    "idx": global_idx,
                    "point": p,
                })
                global_idx += 1

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
        # fallback：章首页是从「考点起始页」推的，经济法/税法的
        # 考点来自正文热点标题，起始页可能不准 → 落到范围外。
        # 找最近的章，别把内容丢掉。
        best = None
        best_d = 10 ** 9
        for (v, start), (cid, s, e) in chapter_ranges.items():
            if v != vol:
                continue
            d = min(abs(page - s), abs(page - (e - 1)))
            if d < best_d:
                best_d = d
                best = cid
        return best

    # 按章聚合例题答案。
    #
    # 例题号是**每章重新从 01 开始**的（和考点编号一样），
    # 所以答案必须按章归属 —— 全局混会把不同章的同号例题搞混。
    chapter_answers = {}
    for key, ans_map in page_answers.items():
        vol, page = key.split("-")[0], int(key.split("-")[1])
        cid = find_chapter(vol, page)
        if cid:
            chapter_answers.setdefault(cid, {}).update(ans_map)

    # 考点在章内的序号 → (章ID, 考点号)
    chapter_points = defaultdict(list)
    for bp in points_seq:
        chapter_points[bp["chapterId"]].append(bp)

    # 同章内「考点NN」可能重复（每节重新编号），
    # 所以归属时要用「章节内出现顺序」而不是只按编号。
    # 记录每个考点在章内的序号，供消歧。

    # 章内 point 块的出现序号（按教材顺序 = 按正文顺序）
    point_block_index = {}
    _ch_pt_counter = defaultdict(int)
    for b in blocks:
        if b["kind"] != "point":
            continue
        parts = b["file"].split("/")[-1].rsplit(".", 1)[0].split("-")
        vol, page = parts[1], int(parts[2])
        cid = find_chapter(vol, page)
        if not cid:
            continue
        point_block_index[(cid, b["file"])] = _ch_pt_counter[cid]
        _ch_pt_counter[cid] += 1

    assignment = {}
    used_keys = set()
    cur_key = None
    for b in blocks:
        parts = b["file"].split("/")[-1].rsplit(".", 1)[0].split("-")
        vol, page = parts[1], int(parts[2])

        if b["kind"] == "point":
            cid = find_chapter(vol, page)
            if not cid:
                continue

            # 归属依据：**章内出现顺序**。
            #
            # 原来靠 label 里的「考点NN」匹配题号，但经济法/税法的正文
            # 考点标题是「考点名 5年热点N次」—— 没有题号，正则匹配不到，
            # 结果所有 point 块都被跳过（归并率只有 25%）。
            #
            # 改成按顺序：教材解析出的考点列表与切块产出的 point 块
            # 都是按正文出现顺序生成的，第 N 个对第 N 个。
            cands = chapter_points[cid]
            if not cands:
                continue

            # 归属：按**章内序号**对应。
            #
            # 「章内第 N 个 point 块 ↔ 章内第 N 个考点」——
            # 财管/税法/会计/审计实测都对（221/222 有块）。
            # 试过改成「按页码最近」，财管立刻掉到 174/222 —— 不行。
            #
            # 但**框架页也会切出 point 块**（战略的框架页形如
            # 「考点 01）公司战略的定义」），插在正文块中间会打乱序号。
            # 所以只在序号对得上时用序号，对不上再退回按题号匹配。
            idx = point_block_index.get((cid, b["file"]))
            if idx is not None and idx < len(cands):
                chosen = cands[idx]
            elif idx is not None:
                # 序号超出考点列表长度 → 归到该章最后一个考点，别丢内容
                chosen = cands[-1]
            else:
                m = re.search(r"考点\s*(\d+)", b["label"])
                if not m:
                    continue
                pnum = int(m.group(1))
                cands2 = [
                    p
                    for p in cands
                    if p["pointNum"] == pnum
                    and (cid, p["idx"]) not in used_keys
                ] or [p for p in cands if p["pointNum"] == pnum]
                if not cands2:
                    continue
                chosen = cands2[0]
            used_keys.add((cid, chosen["idx"]))
            cur_key = (cid, chosen["idx"])
        else:
            if cur_key is None:
                # fallback：这块没跟在任何考点起点后面。
                #
                # 财管的正文每个考点都有独立小标题，所以不会走到这里；
                # 经济法/税法的正文是连续排版的（考点标题只在章首的
                # 框架页出现），切出来的是页级大块 —— 硬丢掉就等于丢内容。
                # 这里归到「该页所属章里，页码最接近的考点」。
                cid = find_chapter(vol, page)
                if not cid:
                    continue
                cands = chapter_points[cid]
                if not cands:
                    continue
                best = min(
                    cands,
                    key=lambda p: abs(p["page"] - page),
                )
                cur_key = (cid, best["idx"])

        assignment.setdefault(cur_key, []).append(b)

    # 写回教材内容库
    out = f"{WORK}/upload"
    index = {
        "meta": book["meta"],
        "chapters": [
            {
                "id": c["id"], "num": c["num"], "title": c["title"], "volume": c["volume"],
                # 资料来源：教材正文是「轻一」。轻二/轻三 的内容会挂在别的位置，
                # 界面上要一眼看出这块内容出自哪本书。
                "sourceLevel": c.get("sourceLevel", "轻一"),
                "info": c["info"],
                "sections": [
                    {
                        "num": s["num"], "title": s["title"],
                        "points": [
                            {
                                "num": p["num"], "title": p["title"],
                                "difficulty": p["difficulty"], "hot": p["hot"],
                                "exampleCount": len(p["examples"]),
                            "exampleAnswers": {
                                str(e["no"]): chapter_answers.get(c["id"], {}).get(str(e["no"]))
                                for e in p["examples"]
                                if chapter_answers.get(c["id"], {}).get(str(e["no"]))
                            },
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

    os.makedirs(f"{out}/subjects/{SUBJECT_ID}/chapters", exist_ok=True)
    json.dump(index, open(f"{out}/subjects/{SUBJECT_ID}/index.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # 章节详情：带上块列表
    # 每个考点在全局序列里的位置（与 points_seq 的 idx 一致）
    _pos = {}
    _gi = 0
    for _ch in book["chapters"]:
        for _sec in _ch["sections"]:
            for _pi, _p in enumerate(_sec["points"]):
                _pos[(_ch["id"], _sec["num"], _pi)] = _gi
                _gi += 1

    for ch in book["chapters"]:
        detail = json.loads(json.dumps(ch))
        detail["sourceLevel"] = ch.get("sourceLevel", "轻一")
        # 章末习题页的块（命名规则与 split-exercise-pages.py 一致）
        for ex in detail.get("exercises", []):
            vol = VOL[ch["volume"]]
            ex["block"] = f"exercise-{vol}-{ex['source']['pdfPage']:04d}.png"
        for sec in detail["sections"]:
            for _pi, p in enumerate(sec["points"]):
                p["blocks"] = [
                    b["file"].split("/")[-1]
                    for b in assignment.get((ch["id"], _pos[(ch["id"], sec["num"], _pi)]), [])
                ]
                # 例题带答案（按章匹配题号）
                chap_ans = chapter_answers.get(ch["id"], {})
                for ex in p["examples"]:
                    ex["answer"] = chap_ans.get(str(ex["no"]))
        json.dump(detail, open(f"{out}/subjects/{SUBJECT_ID}/chapters/{ch['id']}.json", "w",
                              encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # 科目清单 —— **合并**而不是覆盖。
    # 每次只处理一门课，直接写会把别的科目从清单里抹掉，
    # 切换器就只剩一科可选。
    subjects = []
    subjects_path = f"{out}/subjects.json"
    if os.path.exists(subjects_path):
        try:
            subjects = json.load(open(subjects_path, encoding="utf-8"))
        except Exception:
            subjects = []
    entry = {
        "id": SUBJECT_ID,
        "name": SUBJECT_NAME,
        "volumeCount": 3,
        "chapterCount": len(book["chapters"]),
        "color": SUBJECT_COLOR,
    }
    subjects = [x for x in subjects if x.get("id") != SUBJECT_ID]
    subjects.append(entry)
    subjects.sort(key=lambda x: x.get("id", ""))
    json.dump(subjects, open(subjects_path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # 块索引（前端按需取图）
    #
    # 带 __version：图片内容变了但文件名不变时，浏览器/边缘缓存
    # （Cache-Control: immutable）会一直返回旧图。
    # 前端把 version 拼到图片 URL 上，内容一变 URL 就变，缓存自然失效。
    import hashlib

    h = hashlib.sha1()
    for b in blocks:
        h.update(b["file"].encode())
        src_file = os.path.join(BASE, "{WORK}/blocks", b["file"])
        try:
            h.update(str(os.path.getsize(src_file)).encode())
        except OSError:
            pass
    content_version = h.hexdigest()[:12]

    block_index = {
        "__version": content_version,
        **{b["file"].split("/")[-1]: {
            "kind": b["kind"],
            "volume": b["volume"],
            "pdfPage": b["pdfPage"],
            "label": b["label"],
            "exampleNo": b.get("exampleNo"),
        } for b in blocks},
    }
    json.dump(block_index, open(f"{out}/subjects/{SUBJECT_ID}/blocks.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    assigned = sum(len(v) for v in assignment.values())
    with_blocks = sum(
        1
        for p in points_seq
        if assignment.get((p["chapterId"], p["idx"]))
    )
    print(f"块总数 {len(blocks)}，已归并 {assigned}（{assigned/len(blocks)*100:.0f}%）")
    print(f"有块的考点: {with_blocks}/{len(points_seq)}")
    print(f"→ {out}/subjects/{SUBJECT_ID}/")


if __name__ == "__main__":
    main()
