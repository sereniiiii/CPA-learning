#!/usr/bin/env python3
"""
把章末习题按「一道题一张图」切开，并关联教材答案。

关键点：
  - 题目页只取各章 chapter.exercises 列出的页 —— 全局扫描会把正文里的
    「1. 2. 3.」编号也当成习题（实测会把 324 页扫成 1129 组）。
  - 答案页全局扫描（含「【答案】」行且题号行很少的页），
    但 chapter.exercises 的页列表会漏掉中间的答案页，所以要单独找。
  - 答案页按章归属（页码落在哪章范围内），章内配对。
  - 配对依据是**题号集合覆盖度**，不是出现顺序。

输出：
  build/blocks/财管/ex-<册>-<页>-g<组>-<项>.png    题目块
  build/blocks/财管/ans-<册>-<页>-g<组>-<项>.png   答案块
章节 JSON：exercises → exerciseGroups
"""
import json
import os
import re
import struct
import subprocess
import sys
from collections import defaultdict

from pypdf import PdfReader

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
VOL = {"上册": "up", "中册": "mid", "下册": "down"}
CONTENT_TOP = 792.0
CONTENT_BOTTOM = 42.0
NUM_RE = re.compile(r"^(\d{1,2})\s*[.．、]\s*(.*)$", re.S)


# ---------- 渲染 ----------
def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


def render_page(pdf_path, png_path, width=1500):
    subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(width), pdf_path, "--out", png_path],
        capture_output=True,
    )
    return png_size(png_path)


def crop_png(full_png, out_png, pdf_h, y_top, y_bottom):
    size = png_size(full_png)
    if not size:
        return False
    pw, ph = size
    scale = ph / pdf_h
    top_px = int(round((pdf_h - y_top) * scale))
    height_px = int(round((y_top - y_bottom) * scale))
    if height_px < 8:
        return False
    top_px = max(0, min(ph - height_px, top_px))
    height_px = min(height_px, ph - top_px)
    subprocess.run(
        ["sips", "-c", str(height_px), str(pw),
         "--cropOffset", str(top_px), "0", full_png, "--out", out_png],
        capture_output=True,
    )
    return os.path.exists(out_png)


# ---------- 页面解析 ----------
def page_rows(path):
    r = PdfReader(path)
    rows = []
    seen = set()

    def visitor(text, cm, tm, font_dict, font_size):
        t = text.strip()
        if not t:
            return
        key = (round(tm[5], 1), round(tm[4], 1), t[:24])
        if key in seen:
            return
        seen.add(key)
        rows.append((float(tm[5]), float(tm[4]), t))

    r.pages[0].extract_text(visitor_text=visitor)
    rows.sort(key=lambda v: -v[0])
    return rows


def classify(rows, min_len=12):
    """
    → ('q'|'a', y, x, no, text)

    min_len 过滤掉「知识点框架页」——
    教材每章开头的提纲长这样：「1.含义」「2.年金的种类」，
    题号后是短标题；真正的习题题号后是完整题干（长句）。
    不区分的话会把提纲当习题，切出几百个「1 道题」的碎片。
    """
    out = []
    for y, x, t in rows:
        if not (CONTENT_BOTTOM < y < CONTENT_TOP):
            continue
        m = NUM_RE.match(t)
        if not m:
            continue
        no = int(m.group(1))
        if "【答案】" in t:
            out.append(("a", y, x, no, t))
            continue
        if len(t.strip()) < min_len:
            continue
        out.append(("q", y, x, no, t))
    return out


def group_rows(kind_rows):
    """题号连续递增；遇回退 → 新组"""
    groups = []
    cur = []
    max_no = 0
    for y, x, no, text in kind_rows:
        if cur and no <= max_no:
            groups.append(cur)
            cur = []
            max_no = 0
        cur.append((y, x, no, text))
        max_no = max(max_no, no)
    if cur:
        groups.append(cur)
    return groups


def merge_cross_page(seq):
    """同册、跨页相邻、首题号连续 → 合并成一组"""
    out = []
    for page, grp in seq:
        if out:
            last_page, last_grp = out[-1]
            if (last_page[0] == page[0]
                    and page[1] == last_page[1] + 1
                    and grp[0][2] == last_grp[-1][2] + 1):
                last_grp.extend(grp)
                continue
        out.append((page, grp))
    return out


def match_answer(qgroup, agroups, used):
    """
    给题目组找答案组。

    用 Jaccard（交集 / max(两侧题号数)）而不是覆盖率 ——
    覆盖率会让「{1,2}」同时和「{1,2,3,4,5}」「{1,2}」打平，
    会抢走本该属于别人的答案组。Jaccard 让完全相等的组得分最高。
    """
    qnos = {it[2] for it in qgroup}
    best, best_score = None, 0.0
    for i, (_, agrp) in enumerate(agroups):
        if i in used:
            continue
        anos = {it[2] for it in agrp}
        inter = len(qnos & anos)
        if not inter:
            continue
        score = inter / max(len(qnos), len(anos))
        if score > best_score:
            best, best_score = i, score
    if best is None or best_score < 0.45:
        return None, None
    return best, agroups[best][1]


def page_height(vol, page):
    src = f"{BASE}/build/pdf-pages/{vol}/page-{page:04d}.pdf"
    return float(PdfReader(src).pages[0].mediabox.height)


def cut_block(vol, page, gi, ii, y, y_bottom, prefix, out_dir, full):
    """裁一块出来，返回文件名"""
    name = f"{prefix}-{vol}-{page:04d}-g{gi:03d}-{ii:02d}.png"
    dst = os.path.join(out_dir, name)
    if os.path.exists(dst):
        return name
    src = f"{BASE}/build/pdf-pages/{vol}/page-{page:04d}.pdf"
    if not os.path.exists(src):
        return None
    if not render_page(src, full):
        return None
    y_top = y + 12 * 0.82 + 2
    if y_top - y_bottom < 30:
        return None
    crop_png(full, dst, page_height(vol, page), y_top, y_bottom)
    return name if os.path.exists(dst) else None


def process_chapter(ch, a_pages, out_dir, full, find_chapter):
    """处理一章，返回该章的题目组"""
    vol = VOL[ch["volume"]]

    # 题目组：只取本章 chapter.exercises 列出的页
    q_seq = []
    for ex in ch.get("exercises", []):
        page = ex["source"]["pdfPage"]
        src = f"{BASE}/build/pdf-pages/{vol}/page-{page:04d}.pdf"
        if not os.path.exists(src):
            continue
        rows = page_rows(src)
        rows_k = classify(rows)
        for grp in group_rows(
            [(r[1], r[2], r[3], r[4]) for r in rows_k if r[0] == "q"]
        ):
            q_seq.append(((vol, page), grp))
    q_groups = merge_cross_page(q_seq)

    # 答案组：本章的答案页
    # 注意**不要跨页合并** —— 答案页里每个答案组都从题号 1 重新开始，
    # 跨页的相邻组是「不同的题目组」，不是同一组。
    a_groups = []
    for page, ans_rows in a_pages.get(ch["id"], []):
        for grp in group_rows([(r[1], r[2], r[3], r[4]) for r in ans_rows]):
            a_groups.append((page, grp))

    used = set()
    groups_out = []
    for gi, ((v2, page), gitems) in enumerate(q_groups):
        ai, agrp = match_answer(gitems, a_groups, used)
        if ai is not None:
            used.add(ai)

        items = []
        for ii, (y, x, no, text) in enumerate(gitems):
            y_bottom = (
                gitems[ii + 1][0] - 4 - 6 if ii + 1 < len(gitems) else CONTENT_BOTTOM
            )
            block = cut_block(v2, page, gi, ii, y, y_bottom, "ex", out_dir, full)
            if not block:
                continue
            item = {"no": no, "stem": text[:80], "block": block,
                    "page": page, "answer": None, "answerBlock": None}

            if agrp:
                a_page = a_groups[ai][0][1]
                for idx, (ay, ax, ano, atext) in enumerate(agrp):
                    if ano != no:
                        continue
                    m = re.search(r"【答案】\s*([A-Za-z]{1,6})", atext)
                    item["answer"] = m.group(1).upper() if m else None
                    ay_bottom = agrp[idx + 1][0] - 4 if idx + 1 < len(agrp) else CONTENT_BOTTOM
                    aname = cut_block(vol, a_page, gi, idx, ay, ay_bottom,
                                      "ans", out_dir, full)
                    item["answerBlock"] = aname
                    break
            items.append(item)

        if items:
            groups_out.append({
                "chapterNum": ch["num"],
                "chapterTitle": ch["title"],
                "items": items,
            })
    return groups_out


def verify_chapters():
    """
    校验章节文件的关键字段都在。

    血泪教训：多个脚本写同一个输出文件时，后跑的会冲掉先跑的字段。
    这个检查放在最后跑，任何脚本冲掉字段都会在这里被发现。
    """
    out = f"{BASE}/build/upload/subjects/cwc/chapters"
    problems = []
    for f in sorted(os.listdir(out)):
        if not f.endswith(".json"):
            continue
        ch = json.load(open(f"{out}/{f}", encoding="utf-8"))
        points = [p for s in ch.get("sections", []) for p in s.get("points", [])]
        no_blocks = [p for p in points if not p.get("blocks")]
        if no_blocks:
            problems.append(f"{f}: {len(no_blocks)}/{len(points)} 个考点缺 blocks")
        if not ch.get("exerciseGroups"):
            problems.append(f"{f}: 缺 exerciseGroups")
    if problems:
        print("\n❌ 章节文件校验失败：")
        for p in problems[:10]:
            print("   ", p)
        return 1
    print("✅ 章节文件校验通过（blocks + exerciseGroups 都在）")
    return 0


def main():
    tmp_dir = f"{BASE}/build/_crops"
    os.makedirs(tmp_dir, exist_ok=True)
    full = os.path.join(tmp_dir, "full.png")
    out_dir = f"{BASE}/build/blocks/财管"
    os.makedirs(out_dir, exist_ok=True)

    book = json.load(open(f"{BASE}/build/textbook.json", encoding="utf-8"))

    # 全书习题页序列（按册+页排序）→ 用来给答案页归章。
    #
    # 规则：答案页 p 归属 = 页码 ≤ p 且最近的习题页所属的章。
    # 比「考点页范围」准 —— 章末习题往往在最后一个考点之后很远，
    # 用考点范围会把答案页判给别的章。
    exercise_pages = []   # [(vol, page, chId)]
    for ch in book["chapters"]:
        vol = VOL[ch["volume"]]
        for ex in ch.get("exercises", []):
            exercise_pages.append((vol, ex["source"]["pdfPage"], ch["id"]))
    exercise_pages.sort(key=lambda v: (v[0], v[1]))

    def find_chapter(vol, page):
        """答案页归章：取页码 ≤ page 且最近的习题页"""
        best = None
        for v, pg, cid in exercise_pages:
            if v != vol:
                continue
            if pg <= page:
                best = (pg, cid)
            else:
                break
        return best[1] if best else None

    # 全局找答案页
    a_pages = defaultdict(list)
    for vol in ("up", "mid", "down"):
        d = f"{BASE}/build/pdf-pages/{vol}"
        for f in sorted(os.listdir(d)):
            if not f.endswith(".pdf"):
                continue
            seq = int(re.search(r"page-(\d+)", f).group(1))
            rows = page_rows(f"{d}/{f}")
            rows_k = classify(rows)
            ans_rows = [r for r in rows_k if r[0] == "a"]
            q_rows = [r for r in rows_k if r[0] == "q"]
            if not ans_rows:
                continue
            # 答案页：含【答案】行；题号行数不应超过答案行数
            if len(q_rows) > len(ans_rows):
                continue
            cid = find_chapter(vol, seq)
            if cid:
                a_pages[cid].append(((vol, seq), ans_rows))

    total_q = total_a = 0
    for ch in book["chapters"]:
        groups = process_chapter(ch, a_pages, out_dir, full, find_chapter)
        ch["exerciseGroups"] = groups
        nq = sum(len(g["items"]) for g in groups)
        na = sum(1 for g in groups for i in g["items"] if i.get("answer"))
        total_q += nq
        total_a += na
        print(f"  第{ch['num']:2}章 {ch['title'][:16]:18} 组 {len(groups):2} 题 {nq:3} 答案 {na:3}", flush=True)

    print(f"\n合计：{total_q} 道题，{total_a} 道有答案 ({total_a/max(total_q,1)*100:.0f}%)")

    # 写回章节 JSON。
    #
    # 关键：**必须基于 merge-blocks.py 已经写好的章节文件**，
    # 只把 exerciseGroups 加进去。
    # 之前直接写 build/textbook.json 的原章数据，
    # 把 merge 写的 blocks 字段冲掉了 —— 教材内容区块整个消失。
    out = f"{BASE}/build/upload"
    os.makedirs(f"{out}/subjects/cwc/chapters", exist_ok=True)
    for ch in book["chapters"]:
        path = f"{out}/subjects/cwc/chapters/{ch['id']}.json"
        if os.path.exists(path):
            merged = json.load(open(path, encoding="utf-8"))
            merged["exerciseGroups"] = ch.get("exerciseGroups", [])
            json.dump(merged, open(path, "w", encoding="utf-8"),
                      ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(ch, open(path, "w", encoding="utf-8"),
                      ensure_ascii=False, separators=(",", ":"))
    print(f"→ {out}/subjects/cwc/chapters/")
    return verify_chapters()


if __name__ == "__main__":
    sys.exit(main())
