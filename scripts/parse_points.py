#!/usr/bin/env python3
"""
解析「考点NN」行。

layout 模式下的实际形态（行首有缩进，列间大量空格）：

    ' 考点01            财务管理的目标   5年热点|3次     考点难度     ●00 易'
    ' 考点03            营运资本管理                   考点难度 000易'
    ' 考点01             长期投资                       考点难度 ●(心如'   ← OCR 损坏

要抽出四样：编号、名称、5年热点次数、难度（易/中/难）。
难点：
  - OCR 常把「次」认成 I/l/1
  - OCR 常把难度符号读成汉字（如「心如」），此时判定为「识别不清」，
    名称尾部会粘进乱码，需要剔除
"""
import re

# 考点行开头：考点 + 1~2 位数字
POINT_HEAD_RE = re.compile(r"考点\s*(\d{1,2})\b")

# 5年热点次数（OCR 把「次」认成 I/l/1）
HOT_RE = re.compile(r"5\s*年热点\s*[|｜I l 1]?\s*(\d{1,2})\s*[次I l 1]?")

# 「考点难度」及其后的符号与难度字。
# 关键：符号段必须非空（真实标记至少有 2 个符号），
# 且「考点难度」与符号之间不能有换行造成的断裂。
DIFF_RE = re.compile(r"考点难度\s*([●○0oO•·(（]{1,6})\s*(易|中|难)?\s*$")

# 行尾孤立的难度标记（无「考点难度」前缀时）
DIFF_TAIL_RE = re.compile(r"([●○0oO•·]{2,4})\s*(易|中|难)\s*$")


def parse_point_line(line: str):
    """
    解析一行考点标题。
    返回 {num, title, difficulty, hot, brokenMark} 或 None。

    brokenMark=True 表示难度标记 OCR 损坏 —— 按设计文档 4.1 应改走截图。
    """
    m = POINT_HEAD_RE.search(line)
    if not m:
        return None

    num = int(m.group(1))
    rest = line[m.end():]

    # ---- 抽 5 年热点次数（在名称段内找）----
    hot = None
    hm = None

    # ---- 抽难度标记 ----
    # 关键做法：先按字面「考点难度」切分，左边是名称、右边是标记段。
    # 用正则匹配整行时，\s* 会吞掉名称里的空格，导致名称被截断。
    difficulty = None
    broken_mark = False
    mark_text = ""

    cut = rest.find("考点难度")
    if cut >= 0:
        name_part = rest[:cut]
        mark_text = rest[cut:]
        # 关键：先把「考点难度」这个标签本身去掉，再找难度字。
        # 否则「难**度**」里的「难」会被误当成难度标记。
        mark_body = mark_text[len("考点难度"):]
        tm = re.search(r"(易|中|难)", mark_body)
        if tm:
            difficulty = tm.group(1)
        else:
            broken_mark = True  # 出现「考点难度」却读不出难度字 → 损坏
        # 标记段里出现「易/中/难」以外的汉字（OCR 把符号读成字）→ 损坏。
        # 注意要排除难度字本身，否则「000易」会被误判成损坏。
        junk = re.sub(r"[易中难]", "", mark_body)
        if re.search(r"[\u4e00-\u9fff]", junk):
            broken_mark = True
    else:
        name_part = rest
        tm = DIFF_TAIL_RE.search(rest)
        if tm:
            difficulty = tm.group(2)
            mark_text = tm.group(0)

    # ---- 抽名称：抹掉热点标记 ----
    # 注意：hot 匹配必须在 name_part 上做，
    # 用 rest 的下标去切 name_part 会错位截断名称。
    title = name_part
    hm = HOT_RE.search(title)
    if hm:
        hot = int(hm.group(1))
        title = title[: hm.start()] + title[hm.end():]

    title = re.sub(r"5\s*年热点\s*[|｜I l 1]?\s*\d{1,2}\s*[次I l 1]?", " ", title)
    title = re.sub(r"考点难度", " ", title)
    title = re.sub(r"[●○0oO•·(（]{2,}", " ", title)
    title = re.sub(r"\s{2,}", " ", title).strip()
    title = re.sub(r"\s[易中难]$", "", title).strip()

    # 名称段不做尾部剔除：乱码只出现在标记段（如「考点难度 ●(心如」），
    # 名称段是完整的（实测「长期投资」不会被截断）。
    # 损坏标记只影响 difficulty —— 该考点按设计文档 4.1 走截图。
    # 括号残渣
    title = re.sub(r"[（(]\s*[^\s]{0,4}$", "", title).strip()

    if not title:
        return None

    return {
        "num": num,
        "title": title,
        "difficulty": difficulty,
        "hot": hot,
        "brokenMark": broken_mark,
    }


def parse_section_line(line: str):
    """
    解析节标题。

    两种教材写法：
      财管/税法/会计：「第X节 标题」
      经济法         ：「第X单元 标题」（没有「节」这个层级）
    """
    m = re.search(r"第([一二三四五六七八九十]+)节\s+(.+?)\s*$", line)
    if not m:
        m = re.search(r"第([一二三四五六七八九十]+)单元\s+(.+?)\s*$", line)
    if not m:
        return None
    return m.group(1), m.group(2).strip()


def parse_chapter_line(line: str):
    """解析「第X章 标题」"""
    m = re.search(r"第([一二三四五六七八九十]+)章\s+(.+?)\s*$", line)
    if not m:
        return None
    return m.group(1), m.group(2).strip()


if __name__ == "__main__":
    tests = [
        " 考点01             长期投资                                                                          考点难度 ●(心如",
        "  考点03            营运资本管理                                                                  考点难度 000易",
        "  考点01            财务管理的目标                5年热点|3次                                          考点难度     ●00 易",
        "  考点04            资本市场效率               5年热点I2次                                            考点难度   ●○0中",
        "  考点02           利益相关者的要求                                                              考点难度 ●00易",
    ]
    for t in tests:
        r = parse_point_line(t)
        if r:
            print(f"  {r['title']:22} 难度={r['difficulty']} 热点={r['hot']} 损坏={r['brokenMark']}")
        else:
            print("  解析失败:", t[:40])
