#!/usr/bin/env bash
# 跑一門課的完整内容流水线。
#
# 用法：
#   SUBJECT_ID=sts SUBJECT_NAME=税法 ./scripts/build-subject.sh
#
# 环境变量：
#   SUBJECT_ID     科目 id（cwc / sts / eco）
#   SUBJECT_NAME   科目名（财管 / 税法 / 经济法）—— 也是块目录名
#   SUBJECT_TITLE  页面标题
#   SUBJECT_SOURCE 教材来源说明
#   SKIP_SPLIT     设为 1 跳过切块（只重新归并）

set -e
cd "$(dirname "$0")/../.."

: "${SUBJECT_ID:=cwc}"
: "${SUBJECT_NAME:=财管}"
: "${SUBJECT_TITLE:=2026 注会 CPA《轻一》}"
: "${SUBJECT_SOURCE:=}"
: "${SKIP_SPLIT:=0}"

ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
WORK="$ROOT/build/$SUBJECT_ID"
S="$ROOT/study-hub/scripts"

export SUBJECT_ID SUBJECT_NAME SUBJECT_TITLE SUBJECT_SOURCE
export WORK_DIR="$WORK"

mkdir -p "$WORK"

echo "════ 科目：$SUBJECT_NAME（$SUBJECT_ID） 工作目录 $WORK"

if [ "$SKIP_SPLIT" != "1" ]; then
  echo "── 1/6 提取文本"
  for v in up mid down; do
    if [ ! -f "$WORK/text/$v.json" ]; then
      # 合并提取：原生文字层优先，缺文字层的页用 Vision OCR 补
      python3 "$S/extract-with-ocr.py" \
        "$WORK/pdf-pages/$v" "$WORK/text/$v.json" \
        "$WORK/ocr/$v.json"
    else
      echo "   （$v 已存在，跳过）"
    fi
  done

  echo "── 2/6 解析教材"
  python3 "$S/parse-textbook.py" "$WORK/text" "$WORK/textbook.json"

  echo "── 3/6 解析主观题"
  python3 "$S/parse-subjectives.py" "$WORK/text" "$WORK/subjectives.json"
fi

echo "── 4/6 切块"
python3 "$S/split-blocks.py"

echo "── 5/6 归并"
python3 "$S/merge-blocks.py"

echo "── 6/6 习题 + 整页 + 主观题导出"
python3 "$S/split-exercises.py"
python3 "$S/split-full-pages.py"
python3 "$S/export-subjectives.py" "$WORK/subjectives.json" "$SUBJECT_ID"

echo "════ 完成：$WORK/upload/subjects/$SUBJECT_ID"
