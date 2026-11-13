#!/usr/bin/env python3
"""
把三册教材解析成结构化内容库。

严格遵循《财务成本管理学习网页设计与落地清单》：
  - 2.2 每章固定四段式：考情速览 → 考点框架 → 考点剖析 → 同步习题
  - 2.3 教材自带的七项优先级信号直接复用，不自造排序规则
  - 3.4 两类题分开：教材例题挂所属考点，同步习题挂章下
  - 3.5 主观题单独成线（下册第三部分）
  - 4.1 OCR 文字不可信：涉及数字/公式/行列关系的内容改为截图
  - 6   每条内容标注来源（册别 + 印刷页码）与版本日期

两阶段结构：
  阶段一：切章 —— 扫页序，章号单调递增处即章界
  阶段二：章内解析 —— 逐行归位（节 / 考点 / 例题 / 正文）

输出 JSON：{ meta, chapters, subjectives }
"""
import json
import os
import re
import sys

from subject_config import SUBJECT_TITLE, SUBJECT_SOURCE
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_points import parse_point_line, parse_section_line

CN_NUM = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
    "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
    "十四": 14, "十五": 15, "十六": 16, "十七": 17, "十八": 18,
    "十九": 19, "二十": 20,
}

VOLUMES = {"up": "上册", "mid": "中册", "down": "下册"}

# ---------- 识别不清 → 走截图（文档 4.1） ----------
UNCLEAR_PATTERNS = [
    re.compile(r"[\u25a1■□]{2,}"),
    re.compile(r"[?？]\s*[\d．.]"),
    re.compile(r"\d{6,}"),
    re.compile(r"例题\s*[-－—]\s*答案"),
]
TABLE_ROW_RE = re.compile(r"\S{2,}\s{6,}\S{2,}\s{6,}\S{2,}")
EXAMPLE_RE = re.compile(r"【\s*例题\s*(\d+)\s*[·.．]\s*([^\]】]+)\s*】")
HEADER_PAGE_RE = re.compile(r"2026年注册会计师考试\s*\|\s*应试考点及同步习题")
PRINT_PAGE_RE = re.compile(r"^\s*(\d{1,4})\s+2026年注册会计师考试")
# 框架页右列的难度标记
DIFF_TAIL_RE = re.compile(r"([●○0oO•·]{2,4})\s*(易|中|难)\s*$")
# 框架页的 5 年热点次数
HOT_RE = re.compile(r"5\s*年热点\s*[|｜I l 1]?\s*(\d{1,2})\s*[次I l 1]?")


def is_unclear(text: str) -> bool:
    return any(p.search(text) for p in UNCLEAR_PATTERNS)


def has_table(text: str) -> bool:
    rows = [ln for ln in text.split("\n") if TABLE_ROW_RE.search(ln)]
    return len(rows) >= 3


def head_line(text: str) -> str:
    for ln in (text or "").split("\n"):
        if ln.strip():
            return ln.strip()
    return ""


def strip_running(text: str) -> str:
    """去掉页眉行（含印刷页码）与页脚推广行"""
    lines = []
    for ln in (text or "").split("\n"):
        s = ln.strip()
        if not s:
            lines.append("")
            continue
        if HEADER_PAGE_RE.search(s):
            continue
        if PRINT_PAGE_RE.match(s):
            continue
        if re.match(r"^\d{1,4}\s*\|?\s*$", s):
            continue
        if "最新教材" in s and "微信" in s:
            continue
        if re.match(r"^第[一二三四五六七八九十]+章\s+\S+\s+\d{1,4}$", s):
            continue
        lines.append(ln.rstrip())
    out, blanks = [], 0
    for ln in lines:
        if not ln.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        out.append(ln)
    return "\n".join(out)


def extract_print_page(text: str, fallback: int) -> int:
    m = re.search(r"第[一二三四五六七八九十]+章\s*\S+\s+(\d{1,4})\s*$", text, re.M)
    if m:
        return int(m.group(1))
    m = re.search(r"^\s*(\d{1,4})\s+2026年注册会计师考试", text, re.M)
    if m:
        return int(m.group(1))
    return fallback


# ---------------------------------------------------------------- 阶段一：切章

def split_chapters_by_header(pages: list) -> list:
    """
    通用切章：按**页眉章号变化**分界。

    为什么需要这个：
      split_chapters() 依赖「考情速览」锚点，那是财管教材的编排特色。
      经济法/税法没有这一节，锚点不全 → 解析出 0 章。
      但每页页眉都带「第X章 章名」，这个是所有 CPA 教材共有的。

    排除目录页：目录页的页眉也是章名，但内容是章目列表。
      判据是「该页含考点框架或考情速览」——章首页才有这些。
    """
    starts = []
    cur_num = 0
    cur_title = ""
    cur_idx = None
    seen_nums = set()

    for i, p in enumerate(pages):
        text = p.get("text", "")
        if not text:
            continue
        # 页眉章名：扫描所有行。
        # OCR 的行序不是阅读序（页码、目录项、页眉交错），
        # 页眉可能出现在任何位置 —— 所以不能只看前几行。
        # 误判风险由「章首页必须含考点框架」这条约束兜住。
        num = 0
        title = ""
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^第([一二三四五六七八九十]+)章\s+(\S+)", line)
            if m:
                cand = CN_NUM.get(m.group(1), 0)
                if cand:
                    num = cand
                    title = re.sub(r"\d{1,4}$", "", m.group(2).strip()).strip()
                    break

        if num == 0:
            continue

        # 章首页判据：含「考点」或「考情速览」——目录页没有
        is_chapter_start = bool(
            re.search(r"考点\s*\d{1,2}\b", text) or "考情速览" in text
        )

        if num != cur_num:
            if cur_idx is not None and cur_title:
                starts.append({"pageIndex": cur_idx, "num": cur_num, "title": cur_title})
            cur_num = num
            cur_title = title
            cur_idx = i if is_chapter_start else None
            seen_nums.add(num)
        elif cur_idx is None and is_chapter_start:
            cur_idx = i
            if not cur_title:
                cur_title = title

    if cur_idx is not None and cur_title:
        starts.append({"pageIndex": cur_idx, "num": cur_num, "title": cur_title})

    return starts


def split_chapters(pages: list, titles: dict | None = None, last_num: int = 0) -> tuple[list, int]:
    """
    按页序扫描，章号单调递增处即章界。

    教材奇偶页页眉交替：
      偶数页页眉 = 「第一章 财务管理概述」
      奇数页页眉 = 「12  2026年注册会计师考试 | 应试考点及同步习题…」
    偶数页页眉带章名 —— 它正是考情速览/考点框架所在页，即章首页。
    """
    # 章首页 = 含「考情速览」的页。
    #
    # 实测：三册共 20 个「考情速览」页，与 20 章一一对应，是最可靠的锚点。
    # 不能用「首行是第X章」判断——教材奇偶页页眉交替，
    # 奇数页页眉是「页码 2026年注册会计师考试 | 应试考点及同步习题…」，
    # 而考情速览恰好落在这种页上。
    # 章首页 = 含「考情速览」的页。
    #
    # 实测：三册共 20 个「考情速览」页，与 20 章一一对应，是最可靠的锚点。
    # 这些页的页眉不一定是章名（奇数页页眉是「页码 2026年注册会计师考试 |…」），
    # 所以章号按出现顺序推断，章名另行从带章名页眉的页取。
    kq_pages = [i for i, p in enumerate(pages) if "考情速览" in p["text"]]

    # 章名表：页序 → 章名（来自带章名页眉的页）
    titles_by_num = dict(titles or {})
    for i, p in enumerate(pages):
        head = head_line(p["text"])
        m = re.match(r"^第([一二三四五六七八九十]+)章\s+(\S+)", head)
        if not m:
            continue
        num = CN_NUM.get(m.group(1), 0)
        if num == 0 or num in titles_by_num:
            continue
        title = m.group(2).strip()
        title = re.sub(r"\d{1,4}$", "", title).strip()
        if title:
            titles_by_num[num] = title

    # 章号：不能靠「考情速览页顺序」推断——实测 mid 册第 9 个考情速览页（p258）
    # 其实是第 15 章的（教材里该章考情速览重复出现），按序推断会整体错位。
    # 改为在考情速览页及其后若干页内直接搜「第X章」。
    # 章号归属：
    #   考情速览页的页眉不一定是本章名（奇偶页页眉交替），
    #   章名页眉既可能在它前面也可能在它后面。
    #   判据：就近范围内，章号必须单调递增 —— 这是最硬的约束。
    #   （实测 mid 册 p258 是第 15 章、p286 是第 16 章，
    #     若按「离得近」取会误判，必须靠单调性纠正。）
    starts = []
    used = set()
    for i in kq_pages:
        num = 0
        title = ""
        # 章号判定（实测得出，最可靠的组合）：
        #
        # 教材每章的「学习指南」会写「本章经常会和第X章…结合考查」，
        # 里面引用的章号都不是本章。所以：
        #   1. 取学习指南里引用的章号集合 R
        #   2. 在 R ∪ {附近页眉章号} ∪ {上一章+1} 的候选中，
        #      取「不属于 R、且大于上一章号」的最小值
        #   3. 若仍不确定，用「附近页眉章号」兜底
        body = p["text"]
        guide_m = re.search(r"学习指南\s*(.+?)(?=教材主要变化|考点框架)", body, re.S)
        guide_txt = guide_m.group(1) if guide_m else ""
        guide_refs = {
            CN_NUM.get(x, 0)
            for x in re.findall(r"第([一二三四五六七八九十]+)章", guide_txt)
        }
        guide_refs.discard(0)

        # 附近页眉章号
        header_cands = set()
        for j in range(max(0, i - 6), min(i + 7, len(pages))):
            head = head_line(pages[j]["text"])
            m = re.match(r"^第([一二三四五六七八九十]+)章\s+(\S+)", head)
            if m:
                cand = CN_NUM.get(m.group(1), 0)
                if cand:
                    header_cands.add(cand)

        candidates = sorted(
            (header_cands | guide_refs | {last_num + 1})
            - {0}
        )
        # 优先：不在学习指南引用里的、且大于上一章的
        num = 0
        for cand in candidates:
            if cand > last_num and cand not in guide_refs:
                num = cand
                break
        if num == 0:
            for cand in candidates:
                if cand > last_num:
                    num = cand
                    break

        # 章名：全局章名表
        title = titles_by_num.get(num, "") if num else ""
        if not title:
            for j in range(max(0, i - 6), min(i + 7, len(pages))):
                head = head_line(pages[j]["text"])
                m = re.match(r"^第([一二三四五六七八九十]+)章\s+(\S+)", head)
                if m and CN_NUM.get(m.group(1), 0) == num:
                    title = re.sub(r"\d{1,4}$", "", m.group(2).strip()).strip()
                    break
        if num == 0 or not title:
            continue
        # 同一章只保留第一个考情速览页
        # （实测 mid 册 p258 是第 15 章的重复考情速览页，应丢弃）
        if num in used:
            continue
        used.add(num)
        last_num = num
        starts.append({"pageIndex": i, "num": num, "title": title})

    # fallback：上面的逻辑依赖「考情速览 + 学习指南」这些**财管教材特有**的结构，
    # 其他教材（经济法/税法）没有 → 切不出章时改用通用的「页眉章号变化」法。
    if not starts:
        alt = split_chapters_by_header(pages)
        if alt:
            return alt, max((x["num"] for x in alt), default=0)

    return starts, last_num


# ---------------------------------------------------------------- 阶段二：章内解析

def parse_exam_info(text: str) -> dict:
    """考情速览五项（文档 7.2）"""
    info = {}
    # layout 模式下难度字与「建议学习时长」之间常有空格，且难度字可能被推到行首
    # 时长可能带小数（如「8.5小时」），用浮点解析
    m = re.search(r"([易中难])\s*[，,]\s*建议学习时长\s*(\d+(?:\.\d+)?)\s*小时", text)
    if m:
        info["difficulty"] = m.group(1)
        info["studyHours"] = float(m.group(2))

    # 常考题型与平均分值在同一行、用大空格分隔：
    #   '易，建议学习时长7小时    客观题    2.5分'
    # 表头「常考题型」和「近5年考试平均分值」在上一行，不能按行取。
    for ln in text.split("\n"):
        if not re.search(r"建议学习时长", ln):
            continue
        # 切列：难度段 / 题型段 / 分值段
        cols = [c.strip() for c in re.split(r"\s{8,}", ln) if c.strip()]
        for c in cols:
            if re.search(r"客观题|主观题", c) and "examTypes" not in info:
                types = "".join(re.findall(r"客观题|主观题", c))
                info["examTypes"] = types
            m2 = re.search(r"([\d.]+)\s*分", c)
            if m2 and "avgScore" not in info:
                info["avgScore"] = float(m2.group(1))
        break

    m = re.search(r"近\s*5\s*年考试平均分值\s+([\d.]+)\s*分", text)
    if m:
        info["avgScore"] = float(m.group(1))

    m = re.search(r"学习指南\s*(.+?)(?=\n\s*(?:教材主要变化|考点框架|$))", text, re.S)
    if m:
        guide = " ".join(m.group(1).split())
        if len(guide) > 4:
            info["guide"] = guide[:400]

    m = re.search(r"教材主要变化\s*(.+?)(?=\n\s*(?:考点框架|考点剖析|$))", text, re.S)
    if m:
        changes = []
        for ln in m.group(1).split("\n"):
            ln = ln.strip()
            if not ln:
                continue
            if re.match(r"^\(?\d+\)?[．.、]", ln) or ln.startswith("("):
                changes.append(ln)
        if changes:
            info["changes"] = changes

    return info


def parse_framework(text: str) -> list:
    """
    解析考点框架：考点名 + 难度 + 5年热点次数。

    版式是三列：左列=节名，中列=考点名，右列=难度标记。
    唯一可靠的信号：**带难度标记的行才是考点行**，节名行不带标记。
    （实测：第 1 章框架里「财务管理概述」是节名，无标记；其余 19 行都有 ●○○易）

    折行：节名与考点名都可能折成两行，且仍占原来的列。
    靠缩进位置区分左右列（跨列间距 ≥33 空格，同列 <10）。
    """
    m = re.search(r"考点框架\s*(.+?)(?=\n\s*考点剖析|$)", text, re.S)
    if not m:
        return []
    block = m.group(1)

    rows = []
    for raw in block.split("\n"):
        if not raw.strip():
            continue
        hot = None
        difficulty = None

        hm = HOT_RE.search(raw)
        if hm:
            hot = int(hm.group(1))
            raw = raw[: hm.start()].rstrip()

        dm = DIFF_TAIL_RE.search(raw)
        if dm:
            difficulty = dm.group(2)
            raw = raw[: dm.start()].rstrip()

        cols = []
        for seg in re.split(r"\s{10,}", raw):
            if not seg.strip():
                continue
            indent = len(seg) - len(seg.lstrip())
            cols.append((indent, seg.strip()))

        rows.append({
            "cols": cols,
            "difficulty": difficulty,
            "hot": hot,
            "has_mark": difficulty is not None or hot is not None,
        })

    points = []
    section = ""
    for row in rows:
        cols = row["cols"]
        if not cols:
            continue

        if not row["has_mark"]:
            # 无标记 → 节名（可能是折行的第二段）
            text = cols[0][1]
            if len(cols) >= 2:
                section = cols[0][1]
            else:
                section = (section + text).strip() if section and not points else text
            continue

        # 带标记 → 考点行
        if len(cols) >= 2:
            # [节名, 考点名]；若首列缩进更大说明切分错位，交换
            left, name = cols[0][1], cols[1][1]
            if cols[0][0] > cols[1][0]:
                left, name = name, left
            section = left
        else:
            name = cols[0][1]

        points.append({
            "name": name,
            "difficulty": row["difficulty"],
            "hot": row["hot"],
            "section": section,
        })

    return points


# 「考点名 5年热点N次」—— 经济法/税法正文里的考点小标题。
#
# 财管正文用「考点NN 标题」，所以财管走 POINT_TITLE 那条路；
# 经济法/税法没有「考点NN」标题，只有这种带热点统计的加粗行。
# 两种教材的正文都用它建考点，归并时才能一一对应。
HOT_POINT = re.compile(r"^(.{2,30}?)\s*5\s*年\s*热\s*点\s*[\d|丨l]+\s*次")
HOT_POINT_LOOSE = re.compile(r"^(.{2,30}?)\s*5\s*年\s*热\s*点")


def build_chapter(volume_key: str, pages: list, meta: dict) -> dict:
    vol = VOLUMES[volume_key]
    full = "\n".join(strip_running(p["text"]) for p in pages)

    info = parse_exam_info(full)
    framework = parse_framework(full)

    sections = []
    cur_section = None
    cur_point = None
    in_analysis = False   # 是否已进入「考点剖析」区
    seq_no = 0           # 章内考点序号（按正文出现顺序）

    def ensure_section(title: str, num: int):
        nonlocal cur_section, cur_point
        cur_section = {"num": num, "title": title, "points": []}
        sections.append(cur_section)
        cur_point = None

    def ensure_point(num: int, title: str, difficulty, hot, seq: int, print_page: int,
                     broken_mark: bool = False):
        nonlocal cur_point, cur_section
        # 正文一律用原书截图呈现，OCR 文字层不可信且冗余 —— 不入库。
        # 保留的只有：考点名、难度、热点次数、来源页码（决定显示哪张截图）。
        point = {
            "num": num,
            "title": title,
            "difficulty": difficulty,
            "hot": hot,
            "examples": [],
            "source": {"volume": vol, "pdfPage": seq, "printPage": print_page},
            "status": "待核",
            "render": "screenshot",
        }
        # 考点号去重。
        #
        # 战略教材的考点编号本身是乱的 —— 同一节里出现 1,3,2,1,3,2,3,5,4
        # （教材按「考点剖析」分块，每块重新编号，且块间有重叠）。
        # 考点号是归并块时的 key，重复就�� key 撞车 →
        # 归并计数和章节文件都对不上。直接按出现顺序重编。
        if cur_section is not None:
            used = {pt["num"] for pt in cur_section["points"]}
            if num in used:
                mx = max(used) if used else 0
                while num in used:
                    mx += 1
                    num = mx

        if cur_section is None:
            if sections:
                # 章里已经有节了 → 这个考点出现在第一个节标题之前
                # （比如「税法总论」的第 1 个考点在「第一节」之前）。
                # 归到第一个节，不要单开一个「第0节」。
                cur_section = sections[0]
            else:
                # 还没有任何节标题 —— 先挂一个**临时节**（num=-1），
                # 等第一个真节出现时合并进去。
                # 直接建第 0 节会在界面上留下难看的「第0节（未分节）」。
                ensure_section("（章首）", -1)
        cur_section["points"].append(point)
        cur_point = point
        return point

    # 预扫描：标出「考点框架页」。
    #
    # 框架页上会一次性列出本章所有考点（每个都是「考点名 5年热点N次」格式），
    # 正文页通常只有 1 个。不区分的话，框架页的考点会被当成正文考点
    # 建一遍，正文再建一遍 → 考点重复、编号乱序（实测出现 1,24,19,17…）。
    framework_pages = set()
    for p in pages:
        n = 0
        for line in strip_running(p["text"]).split("\n"):
            st = line.strip()
            # 两种框架页：
            #   经济法/税法：考点标题带「5年热点N次」
            #   战略      ：「考点 01）公司战略的定义」—— **没有热点标记**
            # 都不加的话，框架页的考点会被当正文考点建一遍，
            # 导致同一节里考点号重复（战略 ch01 第2节出现 1,3,2,1,3,2）。
            if (HOT_POINT.match(st) or HOT_POINT_LOOSE.match(st)
                    or re.match(r"^考点\s*\d{1,2}\s*[)）]?", st)):
                n += 1
        if n >= 3:
            framework_pages.add(p["seq"])

    for p in pages:
        t = strip_running(p["text"])
        if not t:
            continue
        seq = p["seq"]
        print_page = extract_print_page(p["text"], seq)

        # 框架页的考点由 parse_framework 统一处理，这里跳过
        if seq in framework_pages:
            continue

        lines = t.split("\n")
        i = 0
        # 最近一次看到的「5年热点N次」。
        # 审计教材的热点行排在考点号**上面**一行（考点行本身没有热点），
        # 建考点时用「最近看到的」值兜底。
        last_hot = None
        while i < len(lines):
            s = lines[i].strip()
            if not s:
                i += 1
                continue

            hm2 = re.search(r"5\s*年\s*热\s*点\s*[|｜I l 1]?\s*(\d{1,2})", s)
            if hm2:
                last_hot = int(hm2.group(1))

            if s == "考点剖析":
                in_analysis = True
                i += 1
                continue

            # 热点标题 → 新考点（经济法/税法正文里的考点起点）
            hm = HOT_POINT.match(s) or HOT_POINT_LOOSE.match(s)
            if hm:
                in_analysis = True
                name = hm.group(1).strip()
                # 名字可能带「考点NN）」前缀
                pm = re.match(r"^.{0,3}?考点\s*([0-9]{1,2})", name)
                if pm:
                    name = name[pm.end():].strip(" ）)】]") or name
                hot_m = re.search(r"5\s*年\s*热\s*点\s*([\d|丨l]+)", s)
                # OCR 可能把数字认成纯符号（| 丨 l），
                # 去掉非数字后可能是空串 —— int('') 会抛异常，
                # 而异常会让整章解析失败（之前只剩 4 章就是这个原因）。
                hot = None
                if hot_m:
                    digits = re.sub(r"\D", "", hot_m.group(1))
                    if digits:
                        hot = int(digits)
                seq_no += 1
                ensure_point(seq_no, name, None, hot, seq, print_page)
                i += 1
                continue

            if s.startswith("同步习题"):
                in_analysis = False
                i += 1
                continue

            # 「考点NN」本身就能开启分析区。
            # 财管/税法有「考点剖析」这个标题做分界，**审计教材没有** ——
            # 正文直接就是「大纲要求 / 考点03 / 保证程度」。
            # 没有这一条，审计整章的考点都会被挡在外面。
            if re.match(r"^考点\s*\d{1,2}\b", s):
                in_analysis = True

            if not in_analysis:
                i += 1
                continue

            sec = parse_section_line(s)
            if sec and len(s) < 40:
                ensure_section(sec[1], CN_NUM.get(sec[0], 0))
                i += 1
                continue

            if re.match(r"^考点\s*\d{1,2}\b", s):
                pm3 = re.match(r"^考点\s*(\d{1,2})\b", s)
                parsed = parse_point_line(s)
                if parsed is None and pm3:
                    # 审计教材：考点号是**光杆一行**（「考点03」），
                    # 名称在**上一行或下一行**（取决于排版）：
                    #   上一行：「审计的产生和发展」→ 「考点01」
                    #   下一行：「考点03」→「保证程度」
                    # parse_point_line 要求名称同行，匹配不上会返回 None，
                    # 所以这里自己构造，名称上下都找。
                    title = ""
                    for off in (-1, 1):
                        k = i + off
                        if k < 0 or k >= len(lines):
                            continue
                        cand = lines[k].strip()
                        if (cand and len(cand) <= 30
                                and not re.match(r"^考点\s*\d", cand)
                                and not re.match(r"^第[一二三四五六七八九十]+[节章单元]", cand)
                                and not re.match(r"^大纲要求", cand)
                                and not re.match(r"^5\s*年\s*热", cand)
                                and not re.match(r"^[（(]", cand)
                                and "2026年注册会计师" not in cand
                                and not re.match(r"^\d{1,4}\s+2026", cand)):
                            title = cand
                            if off == 1:
                                i += 1   # 下一行当标题 → 消费掉
                            # off == -1（上一行）**不要动 i**：
                            # 上一行在上一轮循环里已经处理过了，
                            # 再减回去会无限循环（内存爆掉被 kill）。
                            break
                    parsed = {"num": int(pm3.group(1)), "title": title,
                              "difficulty": None, "hot": None,
                              "brokenMark": False}
                if parsed:
                    title = parsed["title"]
                    # 有些教材考点号与名称仍分两行（parsed 有编号但标题为空）
                    if not title.strip() and i + 1 < len(lines):
                        nxt = lines[i + 1].strip()
                        if (nxt and len(nxt) <= 30
                                and not re.match(r"^考点\s*\d", nxt)
                                and not re.match(r"^第[一二三四五六七八九十]+[节章单元]", nxt)
                                and not re.match(r"^大纲要求", nxt)):
                            title = nxt
                            i += 1
                    ensure_point(parsed["num"], title,
                                 parsed["difficulty"],
                                 parsed["hot"] if parsed["hot"] is not None else last_hot,
                                 seq, print_page,
                                 parsed.get("brokenMark", False))
                    i += 1
                    continue

            em = EXAMPLE_RE.search(s)
            if em:
                seg_lines = [s[em.end():]]
                j = i + 1
                while j < len(lines):
                    nxt = lines[j].strip()
                    # 例题段落在下一个例题、考点标题或节标题处结束。
                    # 若只遇到下一个例题就停，会把中间的考点标题行一起吞掉，
                    # 导致该考点丢失。
                    if EXAMPLE_RE.search(lines[j]):
                        break
                    if re.match(r"^考点\s*\d{1,2}\b", nxt):
                        break
                    if parse_section_line(nxt) and len(nxt) < 40:
                        break
                    seg_lines.append(lines[j])
                    j += 1
                seg = "\n".join(seg_lines)
                # 例题只留元数据；题干与解析一律看原书截图
                item = {
                    "no": int(em.group(1)),
                    "type": em.group(2).strip(),
                    "source": {"volume": vol, "pdfPage": seq, "printPage": print_page},
                    "status": "待核",
                    "render": "screenshot",
                }
                if cur_point is not None:
                    cur_point["examples"].append(item)
                i = j
                continue

            i += 1

    # 用考点框架信息补全难度与热点
    for fp in framework:
        for sec in sections:
            for po in sec["points"]:
                if po["title"] == fp["name"]:
                    if po["difficulty"] is None:
                        po["difficulty"] = fp["difficulty"]
                    if po["hot"] is None:
                        po["hot"] = fp["hot"]

    # 同步习题：章末独立成章（文档 3.4「两类题必须分开」）
    #
    # 判据说明：
    #   「同步习题」独占一行不可靠——目录页也会这么排；
    #   「含题型名」也不可靠——考点剖析里的例题也会出现题型名。
    # 可靠做法：习题区在「考点剖析」区之后开始，
    #   以「同步习题」标题或题型标题出现为起点，
    #   到下一个「考点剖析 / 考情速览」标志（下一章首页）为止。
    # 同步习题：章末独立成章（文档 3.4「两类题必须分开」）
    #
    # 判据（实测得出，比标题特征可靠）：
    #   考点剖析区的题带「【例题N·题型】」标记；
    #   章末同步习题区的题没有这个标记，只有裸题号 + A/B/C/D 选项。
    # 所以：不含【例题】标记、且含题号行的页，即习题页。
    # 「同步习题」「单项选择题」等标题在不同章排版不一致，不作判据。
    exercises = []
    hit_part3 = False
    for p in pages:
        raw = p["text"]
        t = strip_running(raw)
        if not t:
            continue
        # 「第三部分 主观题集训」开始后，本章习题结束（文档 2.1：它是独立于 20 章之外的部分）
        if re.search(r"第三部分", raw):
            hit_part3 = True
        if hit_part3:
            continue
        # 仍带例题标记 → 属于考点剖析区
        if re.search(r"【\s*例题\s*\d+", raw):
            continue
        # 必须有裸题号行才算习题
        if not re.search(r"^\s*\d{1,2}[\.、．]", t, re.M):
            continue
        exercises.append({
            "source": {"volume": vol, "pdfPage": p["seq"],
                        "printPage": extract_print_page(raw, p["seq"])},
            "status": "待核",
        })

    # 清理临时节（章首那批考点）。
    #
    # 章首的考点出现在第一个节标题之前 —— 它们先挂在 num=-1 的临时节上，
    # 现在：如果后面有真正的节，就把它们挪到第一节；
    # 如果整章都没有节标题，就改成「本章内容」（而不是难看的「第0节」）。
    temp = [sec for sec in sections if sec["num"] < 0]
    if temp:
        rest = [sec for sec in sections if sec["num"] >= 0]
        temp_pts = [pt for sec in temp for pt in sec["points"]]
        if rest:
            rest[0]["points"] = temp_pts + rest[0]["points"]
            sections = rest
        else:
            for sec in temp:
                sec["num"] = 0
                sec["title"] = "本章内容"
            sections = temp

    return {
        "id": f"ch{meta['num']:02d}",
        "num": meta["num"],
        "title": meta["title"],
        "volume": vol,
        "info": info,
        "pointsFramework": framework,
        "sections": sections,
        "exercises": exercises,
        "pdfPages": [p["seq"] for p in pages],
        "needScreenshot": is_unclear(full) or has_table(full),
        "status": "待核",
    }


def main() -> int:
    if len(sys.argv) < 3:
        print("用法: python3 parse-textbook.py <text_dir> <out.json>")
        return 1

    text_dir, out_path = sys.argv[1], sys.argv[2]
    chapters = []
    subjectives = []

    # 全局章名表：先扫三册的带章名页眉，建立 章号 → 章名
    global_titles = {}
    for key in ("up", "mid", "down"):
        kpath = os.path.join(text_dir, f"{key}.json")
        if not os.path.exists(kpath):
            continue
        kdata = json.load(open(kpath, encoding="utf-8"))
        for p in kdata["pages"]:
            head = head_line(p["text"])
            m = re.match(r"^第([一二三四五六七八九十]+)章\s+(\S+)", head)
            if not m:
                continue
            num = CN_NUM.get(m.group(1), 0)
            if num == 0 or num in global_titles:
                continue
            title = re.sub(r"\d{1,4}$", "", m.group(2).strip()).strip()
            if title:
                global_titles[num] = title

    global_last_num = 0

    for key in ("up", "mid", "down"):
        path = os.path.join(text_dir, f"{key}.json")
        if not os.path.exists(path):
            continue
        data = json.load(open(path, encoding="utf-8"))
        pages = data["pages"]

        starts, global_last_num = split_chapters(pages, global_titles, global_last_num)
        for i, meta in enumerate(starts):
            end = starts[i + 1]["pageIndex"] if i + 1 < len(starts) else len(pages)
            try:
                ch = build_chapter(key, pages[meta["pageIndex"]:end], meta)
            except Exception as exc:
                print(f"  [{key}] 第{meta['pageIndex']}页 解析失败：{exc}")
                continue
            chapters.append(ch)

        # 主观题集训（下册第三部分，文档 3.5）
        if key == "down":
            subj = []
            started = False
            for p in pages:
                t = strip_running(p["text"])
                if "主观题集训" in t:
                    started = True
                if started:
                    subj.append({
                        "source": {"volume": VOLUMES[key], "pdfPage": p["seq"],
                                    "printPage": extract_print_page(p["text"], p["seq"])},
                        "text": t,
                        "status": "待核",
                    })
            subjectives = subj

    out = {
        "meta": {
            "title": SUBJECT_TITLE,
                "source": SUBJECT_SOURCE,
            "version": "2026-11",
            "generatedAt": date.today().isoformat(),
            "chapterCount": len(chapters),
        },
        "chapters": chapters,
        "subjectives": subjectives,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"章节：{len(chapters)} 章")
    for c in chapters:
        pts = sum(len(s["points"]) for s in c["sections"])
        exs = sum(len(p["examples"]) for s in c["sections"] for p in s["points"])
        print(f"  第{c['num']:2d}章 {c['title'][:20]:22} "
              f"节{len(c['sections']):2d} 考点{pts:3d} 例题{exs:3d} "
              f"习题{len(c['exercises']):2d} 难度={c['info'].get('difficulty','?')} "
              f"时长={c['info'].get('studyHours','?')}h")
    print(f"主观题页：{len(subjectives)}")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
