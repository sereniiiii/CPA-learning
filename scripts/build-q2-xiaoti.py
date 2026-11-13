#!/usr/bin/env python3
"""
把「轻二·小题篇」挂成各章的习题组。

结构：24 个专题，每个两个 PDF ——「N专题名-题.pdf」+「N专题名-答案.pdf」，
全是图片（无文字层），一页可能含多道小题 → **按页挂**，不按题切。

产物：
  build/sj/blocks/审计/xt2-<专题>-<页>.jpg          题页
  build/sj/blocks/审计/xt2-<专题>-<页>-ans.jpg      答案页
  各章 chapters/*.json 的 exerciseGroups 追加 item

专题 → 章的映射：
  先按「章名包含专题名」自动匹配；
  教材里没有独立节的几个（内部控制审计/质量管理/审计工作底稿/可持续信息鉴证）
  走手工表。
"""
import json
import os
import re
import subprocess
import sys

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
SRC = "/Users/seren/Desktop/26注会审计轻一/26注会审计轻二/小题篇"

# 教材里没有同名节的专题 → 手工指定章号
MANUAL = {
    "企业内部控制审计": 8,
    "会计师事务所业务质量管理": 19,
    "审计工作底稿": 19,
    "企业可持续信息鉴证": 18,
}


def render(pdf: str, out_jpg: str, width: int = 1100) -> bool:
    """PDF 单页 → JPEG"""
    # 临时文件放 /tmp —— 放在块目录里会在删除时触发批量删除保护
    import tempfile
    tmp = os.path.join(tempfile.gettempdir(), os.path.basename(out_jpg) + ".tmp.png")
    r = subprocess.run(["sips", "-s", "format", "png", "-Z", str(width), pdf, "--out", tmp],
                       capture_output=True)
    if r.returncode != 0 or not os.path.exists(tmp):
        return False
    r2 = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90",
                         tmp, "--out", out_jpg], capture_output=True)
    os.remove(tmp)
    return r2.returncode == 0 and os.path.exists(out_jpg)


def render_page(pdf: str, page_index: int, out_jpg: str) -> bool:
    """PDF 的第 page_index 页（0 起）→ JPEG"""
    from pypdf import PdfReader, PdfWriter
    r = PdfReader(pdf)
    w = PdfWriter()
    w.add_page(r.pages[page_index])
    import tempfile
    tmp_pdf = os.path.join(tempfile.gettempdir(), os.path.basename(out_jpg) + ".tmp.pdf")
    with open(tmp_pdf, "wb") as fh:
        w.write(fh)
    ok = render(tmp_pdf, out_jpg)
    os.remove(tmp_pdf)
    return ok


def match_chapter(title: str, chapters) -> int | None:
    """专题名 → 章号"""
    if title in MANUAL:
        return MANUAL[title]
    t = title.replace(" ", "")
    best = None
    for c in chapters:
        ct = c["title"].replace("\\", "").strip()
        if t in ct or ct.startswith(t[:6]):
            best = c["num"]
            break
    return best


def main() -> int:
    subject = sys.argv[1] if len(sys.argv) > 1 else "sj"
    subject_name = sys.argv[2] if len(sys.argv) > 2 else "审计"

    work = f"{BASE}/build/{subject}"
    chap_dir = f"{work}/upload/subjects/{subject}/chapters"
    block_dir = f"{work}/blocks/{subject_name}"
    os.makedirs(block_dir, exist_ok=True)

    book = json.load(open(f"{work}/textbook.json", encoding="utf-8"))
    chapters = book["chapters"]

    # 收集 PDF
    #
    # **key 用专题名，不用编号**。
    # 小题篇的编号不是专题标识 —— 同一编号下有不同专题名
    # （「10信息技术对审计的影响」和「10销售与收款循环的审计」），
    # 按编号 setdefault 会把先来的覆盖掉，丢一半内容。
    #
    # 而且同名专题有多个编号（「1审计概述」「2审计概述」）= 同一专题的不同版本，
    # 全部并进同一个习题组。
    items = {}
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".pdf"):
            continue
        m = re.match(r"^(\d+)(.+?)-(题|答案)\.pdf$", f)
        if not m:
            print(f"  ⚠️ 不认识的命名：{f}")
            continue
        num = int(m.group(1))
        title = m.group(2).strip()
        kind = "题" if m.group(3) == "题" else "答案"
        it = items.setdefault(title, {"title": title, "files": []})
        it["files"].append((num, kind, f))
        # 同一专题名下的多个编号要按编号排序，保证题/答案配对顺序稳定
    for it in items.values():
        it["files"].sort(key=lambda x: (x[0], 0 if x[1] == "题" else 1))

    # 渲染
    #
    # **题和答案按编号配对**：同一编号的「N专题-题.pdf」和「N专题-答案.pdf」
    # 页序一一对应（题第 1 页 ↔ 答案第 1 页）。
    # 配成一条 item（block=题页，answerBlock=答案页），
    # 前端就能「先做再看答案」，跟大题篇一个逻辑。
    rendered = {}   # 专题名 → {"title", "items": [{"img","ansImg"}]}
    seq = 0
    from pypdf import PdfReader
    for title in sorted(items):
        it = items[title]
        # 按编号分组：num → {kind: fname}
        by_num = {}
        for num, kind, fname in it["files"]:
            by_num.setdefault(num, {})[kind] = fname

        entries = []
        for num in sorted(by_num):
            pair = by_num[num]
            q_pdf = pair.get("题")
            a_pdf = pair.get("答案")
            n_q = len(PdfReader(os.path.join(SRC, q_pdf)).pages) if q_pdf else 0
            n_a = len(PdfReader(os.path.join(SRC, a_pdf)).pages) if a_pdf else 0
            for pg in range(max(n_q, n_a)):
                seq += 1
                img = ans_img = None
                if q_pdf and pg < n_q:
                    img = f"xt2-{seq:03d}-{pg + 1:02d}.jpg"
                    out = os.path.join(block_dir, img)
                    if not os.path.exists(out) and not render_page(
                            os.path.join(SRC, q_pdf), pg, out):
                        print(f"  ❌ 渲染失败 {q_pdf} p{pg + 1}")
                        img = None
                if a_pdf and pg < n_a:
                    ans_img = f"xt2-{seq:03d}-{pg + 1:02d}-ans.jpg"
                    out = os.path.join(block_dir, ans_img)
                    if not os.path.exists(out) and not render_page(
                            os.path.join(SRC, a_pdf), pg, out):
                        print(f"  ❌ 渲染失败 {a_pdf} p{pg + 1}")
                        ans_img = None
                if img or ans_img:
                    entries.append({"img": img, "ansImg": ans_img})
        rendered[title] = {"title": title, "entries": entries}

    # 归章
    by_chapter = {}
    unmatched = []
    for title, r in rendered.items():
        cn = match_chapter(title, chapters)
        if cn is None:
            unmatched.append(title)
            continue
        by_chapter.setdefault(cn, []).append((title, r))

    if unmatched:
        print(f"  ⚠️ 没匹配到章：{unmatched}")

    # 写进章节 JSON
    changed = 0
    for cn, groups in sorted(by_chapter.items()):
        path = os.path.join(chap_dir, f"ch{cn:02d}.json")
        if not os.path.exists(path):
            print(f"  ⚠️ 找不到章节文件 {path}")
            continue
        ch = json.load(open(path, encoding="utf-8"))
        eg = ch.setdefault("exerciseGroups", [])
        for title, r in groups:
            # 已有同名组就并进去，否则新建
            grp = next((g for g in eg if g.get("title") == title), None)
            if grp is None:
                grp = {"chapterNum": cn,
                       "chapterTitle": next(c["title"] for c in chapters if c["num"] == cn),
                       "title": title,
                       "sourceLevel": "轻二·小题篇",
                       "items": []}
                eg.append(grp)
            no = 0
            for e in r["entries"]:
                no += 1
                grp["items"].append({
                    "no": no,
                    "stem": f"{title} 第{no}题",
                    "block": e["img"],
                    "page": no,
                    "answer": None,
                    "answerBlock": e["ansImg"],
                })
        json.dump(ch, open(path, "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        changed += 1
        print(f"  第{cn}章 ← {len(groups)} 个专题")

    # 汇总
    total_items = sum(len(g["items"]) for cn in groups for g in [])
    print(f"  小题篇：{len(rendered)} 个专题 → {changed} 章，{total_items} 页题目")
    return 0


if __name__ == "__main__":
    sys.exit(main())
