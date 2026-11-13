#!/usr/bin/env bash
# 重切所有科目的块（坐标归一化后），归并，转 JPEG。
set -e
ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
cd "$ROOT"

for spec in "cwc:财管" "eco:经济法" "sts:税法" "kj:会计" "sj:审计" "zl:战略"; do
  S=${spec%%:*}; N=${spec##*:}
  export SUBJECT_ID=$S SUBJECT_NAME=$N
  export WORK_DIR="$ROOT/build/$S"
  echo "════ $N（$S）"

  # 旧的块目录改名（不删，避免触发批量删除保护）
  if [ -d "build/$S/blocks/$N" ]; then
    mv "build/$S/blocks/$N" "build/$S/blocks/旧-$(date +%H%M%S)" 2>/dev/null || true
  fi
  # 财管的块在 blocks/ 根下
  if [ "$S" = "cwc" ]; then
    mkdir -p "build/$S/blocks/财管"
  fi

  python3 study-hub/scripts/split-blocks.py 2>&1 | tail -1
  python3 study-hub/scripts/merge-blocks.py 2>&1 | grep -E "块总数|有块的考点"
  python3 study-hub/scripts/split-exercises.py 2>&1 | tail -1
done
