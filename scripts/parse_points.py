#!/usr/bin/env python3
"""
解析「考点NN」行的结构。

layout 模式下考点行形如（列间用大量空格分隔）：
    ' 考点01            财务管理的目标                5年热点|3次          考点难度     ●00 易'

难点：
  - 行首有缩进，正则 ^ 会漏
  - 名称与右侧标记被空格分开，非贪婪正则会把标记吃进名称
  - 「5年热点|3次」里的竖线是 OCR 把「次」识别错了

做法：先切列，再按列内容判别。
"""
import re

# 考点行：任意空白 + 考点 + 两位数字
POINT_HEAD_RE = re.compile(r"考点\s*(\d{1,2})\b")

# 标记区
# OCR 常把「次」认成 I/l/1，故用宽松字符类
HOT_RE = re.compile(r"5\s*年热点\s*[|｜I l 1]?\s*(\d{1,2})\s*[次I l 1]?")
# 难度标记在「考点难度」之后，可能与易/中/难之间有空格（layout 模式）
DIFF_RE = re.compile(r"考点难度\s*[●○0oO•·(（]{2,5}\s*(易|中|难)?")
# 兜底：行尾孤立的难度标记（三个符号 + 易/中/难）
DIFF_TAIL_RE = re.compile(r"([●○0oO•·]{2,4})\s*(易|中|难)\s*$")


def split_columns(line: str) -> list:
    """按 3 个以上空格切成列"""
    parts = re.split(r"\s{3,}", line.strip())
    return [p.strip() for p in parts if p.strip()]


def parse_point_line(line: str):
    """解析一行考点标题 → {num, title, difficulty, hot} 或 None"""
    m = POINT_HEAD_RE.search(line)
    if not m:
        return None

    num = int(m.group(1))
    rest = line[m.end():]

    hot = None
    difficulty = None

    hm = HOT_RE.search(rest)
    if hm:
        hot = int(hm.group(1))

    dm = DIFF_RE.search(rest)
    if dm:
        difficulty = dm.group(1)  # 「考点难度」后的易/中/难
    else:
        # 列切分后看最后一列
        cols = split_columns(rest)
        if cols:
            tm = DIFF_TAIL_RE.search(cols[-1])
            if tm:
                difficulty = tm.group(2)

    # 标题：先整体抹掉两类标记，再压缩空白。
    # 顺序很重要：先删「5年热点」会与「考点难度」之间留下空格碎片，
    # 所以一次性替换掉整段标记文本。
    title = rest
    title = re.sub(r"5\s*年热点\s*[|｜I l 1]?\s*\d{1,2}\s*[次I l 1]?", " ", title)
    title = re.sub(r"考点难度\s*[●○0oO•·(（]{0,6}\s*[易中难]?", " ", title)
    title = re.sub(r"[●○0oO•·]{2,}", " ", title)
    title = re.sub(r"\s{2,}", " ", title).strip()
    # 去掉尾部残留的孤立难度字与 OCR 垃圾
    title = re.sub(r"\s[易中难]$", "", title).strip()
    title = re.sub(r"[（(]\s*[^\s]{0,4}$", "", title).strip()

    if not title:
        return None

    return {"num": num, "title": title, "difficulty": difficulty, "hot": hot}


def parse_section_line(line: str):
    """解析「第X节 标题」"""
    m = re.search(r"第([一二三四五六七八九十]+)节\s+(.+?)\s*$", line)
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
    samples = [
        " 考点01             长期投资                                                                          考点难度 ●(心如",
        ' 考点01            财务管理的目标                5年热点|3次                                          考点难度     ●00 易',
        " 考点02           利益相关者的要求                                                              考点难度 ●00易",
        "  考点04            资本市场效率               5年热点I2次                                            考点难度   ●○0中",
        " 考点03            营运资本管理                                                                  考点难度 000易",
    ]
    for s in samples:
        print(repr(s[:60]), "→", parse_point_line(s))
