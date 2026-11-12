#!/usr/bin/env python3
"""
解析「主观题集训」专题 —— 通用化，支持不同教材的编排。

为什么重写：
  原版只认「下册 + 标题含『主观题集训』 + 专题标题形如『专题一 XXX』」——
  这是财管教材的编排。
  实际各科不一样：
    经济法：下册「主观题集训—一企业破产法的案例分析题」（**没有专题编号**）
    税法  ：下册「主观题集训」，内部是「主观题考点透视」
    会计  ：下册「精编主观题演练」
  所以起点关键词、专题标题格式都得放宽。

策略：
  1. 起点：在一册里找第一个含主观题关键词的页；找不到就换下一册
  2. 专题：把该页之后所有「像专题标题」的行都当作专题起点
  3. 每个专题收集其后的页

输出：专题列表（id / 序号 / 标题 / 起止页）+ 每页正文
"""
import json
import os
import re
import sys

CN = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
    "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
    "十四": 14, "十五": 15, "十六": 16, "十七": 17, "十八": 18,
    "十九": 19, "二十": 20,
}

# 主观题部分的起点关键词（按优先级）
START_KEYS = [
    "主观题集训",
    "精编主观题演练",
    "历年主观题回顾",
    "主观题考点透视",
]

# 专题标题：各种形态
TOPIC_PATTERNS = [
    # 专题一 XXX / 专题一：XXX
    re.compile(r"^专题\s*([一二三四五六七八九十]+)\s*[、：:．.\s]*\s*(.+)$"),
    # 主观题集训—XXX / 主观题集训—一XXX
    re.compile(r"^主观题集训\s*[—\-–~至]+\s*(?:[一二三四五六七八九十]+\s*)?(.+)$"),
    # 精编主观题演练—XXX
    re.compile(r"^精编主观题演练\s*[—\-–~至]+\s*(?:[一二三四五六七八九十]+\s*)?(.+)$"),
    # 历年主观题回顾—XXX
    re.compile(r"^历年主观题回顾\s*[—\-–~至]+\s*(?:[一二三四五六七八九十]+\s*)?(.+)$"),
    # 第N章 XXX —— 会计的主观题部分**按章组织**（第二十三章 财务报告…）
    re.compile(r"^第([一二三四五六七八九十]+)章\s*[、：:．.\s]*\s*(\S.*)$"),
]

# 明显不是专题标题的行（页眉、页码、广告）
NOISE_RE = re.compile(
    r"^(初级|中级|注会|税务师|网课|讲义|押题|微信|xs\d+|20\d{2}年注册会计师"
    r"|\d{1,4}\s*$|C\s*ONTENTS|应试考点及同步习题)"
)


def is_topic_title(line: str):
    """判断一行是不是专题标题，返回 (序号, 标题) 或 None"""
    line = line.strip()
    if not line or len(line) > 40 or NOISE_RE.match(line):
        return None
    for pat in TOPIC_PATTERNS:
        m = pat.match(line)
        if not m:
            continue
        groups = m.groups()
        if len(groups) == 2:
            num = CN.get(groups[0], 0)
            title = groups[1].strip()
        else:
            num = 0
            title = groups[0].strip()
        title = re.sub(r"[（(].*?[)）]\s*$", "", title).strip()
        # 去掉尾部的印刷页码（如「财务报告\671」「企业破产法律制度\603」）
        title = re.sub(r"[\\\s]*\d{1,4}\s*$", "", title).strip()
        # OCR 常把「一」粘在标题开头（页眉「主观题集训—一企业破产法…」）
        title = re.sub(r"^[一二三四五六七八九十]\s*(?=[\u4e00-\u9fff])", "", title)
        title = re.sub(r"\s{2,}", " ", title)
        if len(title) < 2:
            return None
        return (num, title)
    return None


def find_start(text_dir: str):
    """在各册里找主观题部分的起点"""
    for vol in ("down", "mid", "up"):
        path = os.path.join(text_dir, f"{vol}.json")
        if not os.path.exists(path):
            continue
        pages = json.load(open(path, encoding="utf-8"))["pages"]
        for i, p in enumerate(pages):
            for key in START_KEYS:
                if key in p["text"]:
                    return vol, pages, i, key
    return None, [], -1, ""


def parse(text_dir: str, out_path: str) -> int:
    vol, pages, start, key = find_start(text_dir)
    if start < 0:
        print("未找到主观题起点")
        return 1
    print(f"  起点：{vol} 册 第 {start + 1} 页（关键词「{key}」）")

    # 先扫出所有候选标题页，再按「组织方式」挑一套。
    #
    # 三科的主观题组织方式完全不同：
    #   财管：专题一~专题十七（跨章）
    #   税法：专题六「消费税及其他小税种的主观题」（跨章）
    #   会计：**按章**（第二十三章 财务报告 → 第三十一章…）
    #   经济法：按案例类型（「主观题集训—企业破产法的案例分析题」，在页眉里）
    #
    # 优先级：专题N > 主观题集训—XXX > 第N章
    candidates = {k: [] for k in ("topic", "case", "chapter")}
    for p in pages[start:]:
        for line in p["text"].split("\n"):
            st = line.strip()
            if not st or len(st) > 40:
                continue
            if re.match(r"^专题\s*[一二三四五六七八九十]", st):
                candidates["topic"].append((p, st))
                break
            if re.match(r"^(主观题集训|精编主观题演练|历年主观题回顾)\s*[—\-–~至]", st):
                candidates["case"].append((p, st))
                break
            if re.match(r"^第[一二三四五六七八九十]+章\s", st):
                candidates["chapter"].append((p, st))
                break

    mode = "topic" if candidates["topic"] else (
        "case" if candidates["case"] else "chapter")
    hits = candidates[mode]
    print(f"  组织方式：{mode}（候选 {len(hits)} 处）")

    topics = []
    cur = None
    seen_titles = set()
    for p, raw in hits:
        hit = is_topic_title(raw)
        if not hit:
            continue
        num, title = hit
        if title in seen_titles:
            # 同一标题在多页重复出现（页眉），不重复建专题
            continue
        seen_titles.add(title)
        cur = {
            "id": f"topic{len(topics) + 1:02d}",
            "num": num or (len(topics) + 1),
            "title": title,
            "source": {
                "volume": {"down": "下册", "mid": "中册", "up": "上册"}[vol],
                "pdfPage": p["seq"],
                "printPage": p["seq"],
            },
            "pages": [],
        }
        topics.append(cur)

    # 每个专题收录「起点页 → 下一个专题起点页」之间的所有页
    for i, t in enumerate(topics):
        end = topics[i + 1]["source"]["pdfPage"] if i + 1 < len(topics) else 10 ** 9
        for p in pages[start:]:
            if t["source"]["pdfPage"] <= p["seq"] < end:
                t["pages"].append({"pdfPage": p["seq"], "text": p["text"]})

    if not topics:
        print("找到起点但没识别出专题")
        return 1

    out = {"volume": vol, "topics": topics}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    total = sum(len(t["pages"]) for t in topics)
    print(f"专题数：{len(topics)}，共 {total} 页")
    for t in topics[:8]:
        print(f"  {t['id']} {t['title'][:30]:32} {len(t['pages'])} 页")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python3 parse-subjectives.py <text_dir> <out.json>")
        sys.exit(1)
    sys.exit(parse(sys.argv[1], sys.argv[2]))
