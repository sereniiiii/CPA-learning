#!/usr/bin/env bash
# 全科目转 JPEG + 推送 data 分支。
set -e
ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
REPO="/tmp/data-branch"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

cd "$ROOT"

# ---------- 1. 转 JPEG ----------
for spec in "cwc:财管" "eco:经济法" "sts:税法" "kj:会计" "sj:审计" "zl:战略"; do
  S=${spec%%:*}; N=${spec##*:}
  for D in "build/$S/blocks/$N" "build/$S/blocks"; do
    [ -d "$D" ] || continue
    if ls "$D"/*.png >/dev/null 2>&1; then
      sips -s format jpeg -s formatOptions 90 -Z 1100 "$D"/*.png --out "$D" >/dev/null 2>&1 || true
    fi
  done
done

# ---------- 2. 装入仓库 ----------
cd "$REPO"
for spec in "cwc:财管" "eco:经济法" "sts:税法" "kj:会计" "sj:审计" "zl:战略"; do
  S=${spec%%:*}; N=${spec##*:}
  SRC=$(find "$ROOT/build/$S" -maxdepth 5 -name "index.json" -path "*upload*" \
        -not -path "*/subjectives/*" 2>/dev/null | head -1 | xargs dirname)
  [ -n "$SRC" ] && [ -d "$SRC" ] || { echo "  跳过 $N"; continue; }

  mkdir -p "data/subjects/$S/chapters" "data/subjects/$S/blocks"
  cp "$SRC/chapters/"*.json "data/subjects/$S/chapters/" 2>/dev/null || true
  cp "$SRC/index.json" "$SRC/blocks.json" "data/subjects/$S/" 2>/dev/null || true
  if [ -d "$SRC/subjectives" ]; then
    mkdir -p "data/subjects/$S/subjectives"
    cp "$SRC/subjectives/"*.json "data/subjects/$S/subjectives/"
  fi

  # 块图：先找子目录，找不到就用根目录（财管是根目录布局）
  BLOCK_DIR="$ROOT/build/$S/blocks/$N"
  [ -d "$BLOCK_DIR" ] || BLOCK_DIR="$ROOT/build/$S/blocks"
  rm -f "data/subjects/$S/blocks/"*.jpg 2>/dev/null || true
  cp "$BLOCK_DIR"/*.jpg "data/subjects/$S/blocks/" 2>/dev/null || true

  n=$(ls "data/subjects/$S/blocks/"*.jpg 2>/dev/null | wc -l | tr -d ' ')
  echo "  $N（$S）: $n 张图, $(du -sh "data/subjects/$S/blocks" | cut -f1)"
done

python3 "$ROOT/study-hub/scripts/fix-subjects-list.py" data/subjects.json

git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "六科目内容库 + 扫描版坐标归一化重切

新增：战略（公司战略与风险管理，2 册 / 8 章 / 112 考点 / 736 块）

坐标归一化（重要修复）：
- split-blocks 的页眉页脚边界按 A4（高 842）写死，
  但扫描版 PDF 按 300dpi 输出（高 2339）→ OCR 块的 y 全在 1900 上下
  → 全被过滤 → 退化成整页切，考点级切分全丢
- 现在页面高度非 A4 时按实际高度缩放坐标
- 战略有块的考点 43/112 → 96/112；经济法/税法/会计同步受益

归并 key 改用全局唯一序号（不用考点号 —— 战略教材的编号本身是乱的，
同一节出现 1,3,2,1,3,2,3,5,4）" 2>&1 | tail -1

git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push origin data 2>&1 | tail -2
du -sh .git
