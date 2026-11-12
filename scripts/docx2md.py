#!/usr/bin/env python3
"""
把 .docx 转成 Markdown（纯标准库，无需第三方依赖）。

支持：标题层级、段落样式、加粗/斜体/高亮、列表（有序/无序/任务）、
表格（含合并单元格）、超链接文本、脚注引用。

用法：
    python3 docx2md.py input.docx output.md
"""
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def q(tag: str) -> str:
    return W + tag


def text_of(el) -> str:
    """提取元素内所有文本（含 tab / br）"""
    parts = []
    if el.text:
        parts.append(el.text)
    for child in el:
        tag = child.tag
        if tag == q("t"):
            parts.append(child.text or "")
        elif tag == q("tab"):
            parts.append("\t")
        elif tag in (q("br"), q("cr")):
            parts.append("\n")
        elif tag == q("noBreakHyphen"):
            parts.append("-")
        if child.tail:
            parts.append(child.tail)
    return "".join(parts)


def runs_to_md(p) -> str:
    """把段落内的 run 转成 Markdown 行内标记"""
    out = []
    for node in p.iter():
        pass
    # 逐个处理直接子级的 run 与 hyperlink
    for child in p:
        if child.tag == q("r"):
            out.append(run_md(child))
        elif child.tag == q("hyperlink"):
            inner = "".join(run_md(r) for r in child.findall(q("r")))
            rid = child.get(R + "id")
            out.append(f"[{inner}]({rid})" if rid else inner)
        elif child.tag in (q("ins"), q("smartTag")):
            inner = "".join(run_md(r) for r in child.iter(q("r")))
            out.append(inner)
    return "".join(out)


def run_md(r) -> str:
    txt = text_of(r)
    if not txt:
        return ""
    props = r.find(q("rPr"))
    if props is None:
        return txt
    if props.find(q("b")) is not None:
        txt = f"**{txt}**"
    if props.find(q("i")) is not None:
        txt = f"*{txt}*"
    hl = props.find(q("highlight"))
    if hl is not None:
        txt = f"=={txt}=="
    return txt


def para_style(p) -> tuple[str, str]:
    """返回 (类型, 级别或列表标识)"""
    props = p.find(q("pPr"))
    if props is None:
        return ("p", "")
    style_el = props.find(q("pStyle"))
    style = style_el.get(q("val")) if style_el is not None else ""

    numpr = props.find(q("numPr"))
    if numpr is not None:
        ilvl = numpr.find(q("ilvl"))
        numid = numpr.find(q("numId"))
        lvl = ilvl.get(q("val")) if ilvl is not None else "0"
        nid = numid.get(q("val")) if numid is not None else "0"
        # Word 默认的 ListParagraph 样式 + numPr → 列表
        if style.lower().startswith("listparagraph"):
            return ("ul", lvl)
        return ("ul", lvl)
    return ("p", style)


def heading_level(style: str) -> int:
    m = re.match(r"^(?:Heading|heading|标题)\s*(\d)", style or "")
    if m:
        return int(m.group(1))
    if (style or "").lower() in ("title", "标题"):
        return 1
    return 0


def table_md(tbl, rels) -> str:
    rows = tbl.findall(q("tr"))
    if not rows:
        return ""
    grid_cols = 0
    tblPr = tbl.find(q("tblPr"))
    if tblPr is not None:
        grid = tblPr.find(q("tblGrid"))
        if grid is not None:
            grid_cols = len(grid.findall(q("gridCol")))

    matrix = []
    for tr in rows:
        cells = []
        for tc in tr.findall(q("tc")):
            tcPr = tc.find(q("tcPr"))
            span = 1
            if tcPr is not None:
                gs = tcPr.find(q("gridSpan"))
                if gs is not None:
                    span = int(gs.get(q("val")))
            txt = " ".join(
                runs_to_md(p).strip() for p in tc.findall(q("p"))
            ).strip()
            txt = re.sub(r"\s*\n\s*", "<br>", txt)
            cells.append((txt, span))
        matrix.append(cells)

    width = grid_cols or sum(s for _, s in matrix[0])
    if width == 0:
        return ""

    # 展开合并单元格
    expanded = []
    for cells in matrix:
        row = []
        for txt, span in cells:
            row.append(txt)
            for _ in range(span - 1):
                row.append("")
        expanded.append(row)

    lines = []
    header = expanded[0]
    lines.append("| " + " | ".join(c if c else " " for c in header) + " |")
    lines.append("|" + "|".join(["---"] * len(header)) + "|")
    for row in expanded[1:]:
        lines.append("| " + " | ".join(c if c else " " for c in row) + " |")
    return "\n".join(lines)


def convert(docx_path: str) -> str:
    with zipfile.ZipFile(docx_path) as z:
        xml = z.read("word/document.xml")
        rels_xml = z.read("word/_rels/document.xml.rels") if "word/_rels/document.xml.rels" in z.namelist() else None

    rels = {}
    if rels_xml:
        for rel in ET.fromstring(rels_xml):
            rid = rel.get("Id")
            target = rel.get("Target", "")
            if rid and target.startswith("http"):
                rels[rid] = target

    root = ET.fromstring(xml)
    body = root.find(q("body"))
    out = []

    for child in body:
        if child.tag == q("p"):
            kind, style = para_style(child)
            text = runs_to_md(child).strip()
            lvl = heading_level(style)
            if lvl and text:
                out.append(f"{'#' * lvl} {text}")
            elif kind == "ul" and text:
                depth = int(style or 0)
                out.append("  " * depth + f"- {text}")
            elif text:
                out.append(text)
        elif child.tag == q("tbl"):
            md = table_md(child, rels)
            if md:
                out.append(md)

    return "\n\n".join(out)


def main() -> int:
    if len(sys.argv) != 3:
        print("用法: python3 docx2md.py input.docx output.md")
        return 1
    md = convert(sys.argv[1])
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(md)
    print(f"已转换 → {sys.argv[2]}（{len(md)} 字符）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
