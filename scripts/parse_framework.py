#!/usr/bin/env python3
"""
解析「考点框架」区块。

版式是三列（layout 模式下的横向位置）：
    左列 = 节名        中列 = 考点名        右列 = 难度标记 / 5年热点次数

例：
    财务管理的主要内容         长期投资            ●○0易
    财务管理的目标与利益       财务管理的目标      ●○0易
         相关者的要求           利益相关者的要求    ●○o易

关键：节名与考点名都可能折成两行，且折行后仍占同样的列。
所以：
  - 右列标记（●○○易）用来定位列边界
  - 切分后：≥3 列 → [节名, 考点名]；2 列 → [节名续行, 考点名]；1 列 → 视上一行而定
  - 「中列」才是考点名，「首列」永远是节名的一部分
"""
import re

# 右列标记：难度符号 + 易/中/难
DIFF_MARK = re.compile(r"([●○0oO•·]{2,4})\s*(易|中|难)\s*$")
# 5年热点次数
HOT_MARK = re.compile(r"5\s*年热点\s*[|｜I l 1]?\s*(\d{1,2})\s*[次I l 1]?")
# 列间距：同列相邻字符 <10，跨列 ≥33
COL_GAP = re.compile(r"\s{10,}")


def parse_framework(text: str) -> list:
    """返回 [{name, difficulty, hot, section}]"""
    m = re.search(r"考点框架\s*(.+?)(?=\n\s*考点剖析|$)", text, re.S)
    if not m:
        return []
    block = m.group(1)

    # 第一步：逐行抽出右列标记，切成列
    raw_rows = []
    for raw in block.split("\n"):
        if not raw.strip():
            continue
        hot = None
        difficulty = None

        hm = HOT_MARK.search(raw)
        if hm:
            hot = int(hm.group(1))
            raw = raw[: hm.start()].rstrip()

        dm = DIFF_MARK.search(raw)
        if dm:
            difficulty = dm.group(2)
            raw = raw[: dm.start()].rstrip()

        # 记录每列的起始缩进 —— 缩进位置决定它属于左列（节名）还是中列（考点名）
        cols = []
        for m in COL_GAP.split(raw):
            if not m.strip():
                continue
            indent = len(m) - len(m.lstrip())
            cols.append((indent, m.strip()))
        raw_rows.append({
            "cols": cols,
            "difficulty": difficulty,
            "hot": hot,
            "has_mark": difficulty is not None or hot is not None,
        })

    # 第二步：逐行归位
    points = []
    section = ""
    pending_name = ""

    # 中列缩进起点：取所有行里「带标记列」之前的最大缩进，
    # 小于它的算左列（节名），大于它的算中列（考点名）。
    mid_start = 0
    for row in raw_rows:
        if row["has_mark"] and len(row["cols"]) >= 2:
            mid_start = max(mid_start, row["cols"][-1][0])

    for row in raw_rows:
        cols = row["cols"]
        if not cols:
            continue

        if len(cols) >= 2:
            # 有左列 + 中列
            left = cols[0][1]
            name = cols[1][1]
            # 若左列缩进比中列还大，说明切分错位 —— 交换
            if cols[0][0] > cols[1][0]:
                left, name = name, left
            section = left
            points.append({
                "name": name,
                "difficulty": row["difficulty"],
                "hot": row["hot"],
                "section": section,
            })
            pending_name = name
            continue

        # 单列
        indent, text = cols[0]
        if row["has_mark"]:
            # 带标记 → 一定是考点名（中列）
            points.append({
                "name": text,
                "difficulty": row["difficulty"],
                "hot": row["hot"],
                "section": section,
            })
            pending_name = text
        elif indent < mid_start and mid_start > 0:
            # 缩进在左列 → 节名（可能是节名的第二行）
            if points and pending_name:
                # 已有考点在列 → 本行是节名，说明换节了
                section = text
            else:
                section = (section + text).strip() if section else text
            pending_name = ""
        else:
            # 缩进在中列 → 考点名的续行
            if points:
                points[-1]["name"] = (points[-1]["name"] + text).strip()
                pending_name = points[-1]["name"]
                if row["difficulty"]:
                    points[-1]["difficulty"] = row["difficulty"]
                if row["hot"] is not None:
                    points[-1]["hot"] = row["hot"]
            else:
                points.append({
                    "name": text,
                    "difficulty": row["difficulty"],
                    "hot": row["hot"],
                    "section": section,
                })
                pending_name = text

    return [p for p in points if p.get("name")]


if __name__ == "__main__":
    demo = """考点框架

                                           财务管理概述
                                                 长期投资                                   ●○0易
 财务管理的主要内容                                       长期筹资                                   ●○0易
                                               营运资本管理                                   00易
财务管理的目标与利益                                   财务管理的目标                                    ●○0易
     相关者的要求                                 利益相关者的要求                                    ●○o易
                                             可持续发展目标                                    ●○0易
财务管理的基础概念和                                 财务管理的基础概念                                    ●00易
        基本理论                               财务管理的基本理论                                    ●○0易"""

    for p in parse_framework(demo):
        print(f"  [{p['section'][:14]:16}] {p['name'][:22]:24} 难度={p['difficulty']} 热点={p['hot']}")
