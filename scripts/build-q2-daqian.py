#!/usr/bin/env python3
"""
把「轻二·大题篇」做成主观题专题。

结构：10 个专题，每个两个 PDF ——「N专题名-题.pdf」+「N专题名-答案.pdf」。
每页都是纯图片（无文字层），所以整页渲染成图。

产物：
  build/<科目>/upload/subjects/<科目>/subjectives/dq01.json … dq10.json
  build/<科目>/blocks/<科目>/dq2-<专题号>-<页>.jpg

页块命名带 `dq2-` 前缀，和教材下册的 `down-XXXX.jpg` 区分开 ——
两套页码体系（教材页码 vs 练习册页码）不能混。
"""
import json
import os
import re
import subprocess
import sys

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
SRC = "/Users/seren/Desktop/26注会审计轻一/26注会审计轻二/大题篇"

CN = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
    "八": 8, "九": 9, "十": 10,
}


def render(pdf: str, out_jpg: str, width: int = 1100) -> bool:
    """PDF 单页 → JPEG（先转 PNG 再转 JPEG，sips 不能一步到位质量可控）"""
    tmp = out_jpg + ".tmp.png"
    r = subprocess.run(
        ["sips", "-s", "format", "png", "-Z", str(width), pdf, "--out", tmp],
        capture_output=True,
    )
    if r.returncode != 0 or not os.path.exists(tmp):
        return False
    r2 = subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", tmp, "--out", out_jpg],
        capture_output=True,
    )
    os.remove(tmp)
    return r2.returncode == 0 and os.path.exists(out_jpg)


def main() -> int:
    subject = sys.argv[1] if len(sys.argv) > 1 else "sj"
    subject_name = sys.argv[2] if len(sys.argv) > 2 else "审计"

    work = f"{BASE}/build/{subject}"
    out_dir = f"{work}/upload/subjects/{subject}/subjectives"
    block_dir = f"{work}/blocks/{subject_name}"
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(block_dir, exist_ok=True)

    # 收集：编号 → {标题, 题文件, 答案文件}
    items = {}
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".pdf"):
            continue
        m = re.match(r"^(\d+)(.+?)-(题|答案)\.pdf$", f)
        if not m:
            print(f"  ⚠️ 跳过不认识的命名：{f}")
            continue
        num = int(m.group(1))
        title = m.group(2).strip()
        kind = "题" if m.group(3) == "题" else "答案"
        items.setdefault(num, {"title": title, "题": None, "答案": None})[kind] = f

    topics = []
    for num in sorted(items):
        it = items[num]
        pages = []
        # 先题后答案
        for kind in ("题", "答案"):
            fname = it[kind]
            if not fname:
                continue
            pdf = os.path.join(SRC, fname)
            from pypdf import PdfReader
            n = len(PdfReader(pdf).pages)
            for pg in range(1, n + 1):
                img_name = f"dq2-{num:02d}-{len(pages) + 1:02d}.jpg"
                out = os.path.join(block_dir, img_name)
                if not os.path.exists(out):
                    # sips 只能取第一页 → 先拆单页
                    from pypdf import PdfReader as R, PdfWriter
                    r = R(pdf)
                    w = PdfWriter()
                    w.add_page(r.pages[pg - 1])
                    tmp_pdf = os.path.join(block_dir, f".tmp-{num}-{pg}.pdf")
                    with open(tmp_pdf, "wb") as fh:
                        w.write(fh)
                    ok = render(tmp_pdf, out)
                    os.remove(tmp_pdf)
                    if not ok:
                        print(f"  ❌ 渲染失败：{fname} p{pg}")
                        continue
                pages.append({
                    "pdfPage": len(pages) + 1,
                    "text": "",
                    "image": img_name,
                    "kind": kind,
                })
        topics.append({
            "id": f"dq{num:02d}",
            "num": num,
            "title": it["title"],
            "source": {
                "volume": "轻二·大题篇",
                "pdfPage": num,
                "printPage": num,
            },
            "pages": pages,
            "hasAnswer": any(p["kind"] == "答案" for p in pages),
        })
        print(f"  专题{num:02d} {it['title'][:24]:26} {len(pages)} 页")

    for t in topics:
        with open(os.path.join(out_dir, f"{t['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(t, f, ensure_ascii=False, separators=(",", ":"))

    # 索引
    index = {
        "topics": [
            {
                "id": t["id"],
                "num": t["num"],
                "title": t["title"],
                "source": t["source"],
                "pageCount": len(t["pages"]),
                "hasAnswer": t["hasAnswer"],
                "sourceLevel": t.get("sourceLevel", "轻二·大题篇"),
            }
            for t in topics
        ]
    }
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    total = sum(len(t["pages"]) for t in topics)
    print(f"  大题篇：{len(topics)} 个专题 / {total} 页 → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
