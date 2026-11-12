"""科目配置 —— 各脚本统一从这里取，避免到处硬编码。

用法：
    SUBJECT_ID=sts SUBJECT_NAME=税法 python3 scripts/split-blocks.py

默认是财管（cwc），保持既有行为不变。
"""
import os

SUBJECT_ID = os.environ.get("SUBJECT_ID", "cwc")
SUBJECT_NAME = os.environ.get("SUBJECT_NAME", "财管")
SUBJECT_TITLE = os.environ.get("SUBJECT_TITLE", "")
SUBJECT_SOURCE = os.environ.get("SUBJECT_SOURCE", "")

# 科目封面色（导航标识）—— 每个科目一个颜色，切换时一眼分清
SUBJECT_COLOR = os.environ.get("SUBJECT_COLOR", {
    "cwc": "#2f5fd0",   # 财管 · 蓝
    "sts": "#0b7a4b",   # 税法 · 绿
    "eco": "#6b3ba8",   # 经济法 · 紫
    "kj": "#9a5b00",    # 会计 · 橙
}.get(SUBJECT_ID, "#2f5fd0"))

# 卷册 → 科目块目录名（切块产物放在 build/blocks/<科目名>/）
VOL_DIR = {
    "up": SUBJECT_NAME,
    "mid": SUBJECT_NAME,
    "down": SUBJECT_NAME,
}
