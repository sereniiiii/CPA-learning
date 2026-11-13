#!/usr/bin/env bash
# 把各科的内容块/主观题/模考卷装进仓库并推送。
#
# 背景：push-all.sh 里 `rm -f blocks/*.jpg` 之后 cp 选错了目录（财管的图在根目录），
#       set -e 直接退出 → 仓库的图被清空没补上。
#       这个脚本不删，只增量补。
set -e
ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
REPO="/tmp/data-branch"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

cd "$REPO"

for spec in "cwc:财管" "eco:经济法" "sts:税法" "kj:会计" "sj:审计" "zl:战略"; do
  S=${spec%%:*}; N=${spec##*:}
  # **必须排除 subjectives/ 和 papers/** —— 它们也有 index.json，
  # find 会挑到它们，把章节目录冲掉（审计的 index.json 一度变成 papers 的索引）。
  SRC=$(find "$ROOT/build/$S" -maxdepth 5 -name "index.json" -path "*upload*" \
        -not -path "*/subjectives/*" -not -path "*/papers/*" \
        2>/dev/null | head -1 | xargs dirname)
  [ -n "$SRC" ] && [ -d "$SRC" ] || { echo "  跳过 $N"; continue; }

  mkdir -p "data/subjects/$S/chapters" "data/subjects/$S/blocks" "data/subjects/$S/papers"
  cp "$SRC/chapters/"*.json "data/subjects/$S/chapters/" 2>/dev/null || true
  cp "$SRC/index.json" "$SRC/blocks.json" "data/subjects/$S/" 2>/dev/null || true
  [ -d "$SRC/subjectives" ] && cp "$SRC/subjectives/"*.json "data/subjects/$S/subjectives/" 2>/dev/null || true
  [ -d "$SRC/papers" ] && cp "$SRC/papers/"*.json "data/subjects/$S/papers/" 2>/dev/null || true

  # 块图：子目录优先（财管的图直接在 blocks/ 根下）
  BLOCK_DIR="$ROOT/build/$S/blocks/$N"
  if [ -z "$(ls "$BLOCK_DIR"/*.jpg 2>/dev/null | head -1)" ]; then
    BLOCK_DIR="$ROOT/build/$S/blocks"
  fi
  cp "$BLOCK_DIR"/*.jpg "data/subjects/$S/blocks/" 2>/dev/null || true

  n=$(ls "data/subjects/$S/blocks/"*.jpg 2>/dev/null | wc -l | tr -d ' ')
  echo "  $N（$S）: $n 张图"
done

python3 "$ROOT/study-hub/scripts/fix-subjects-list.py" data/subjects.json

git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "来源标记（轻一/轻二/轻三）+ 轻二小题篇 + 模考卷

界面区分资料来源（用户要求）：
- 统一 sourceLevel 字段 + SourceTag 组件（颜色区分）
  轻一=蓝 / 轻二·大题篇=橙 / 轻二·小题篇=青 / 轻二·套卷=紫 / 轻三=红
- 教材库章节行、习题组 tab、主观题列表三处都标来源

新增内容：
- 轻二·小题篇：24 专题 → 20 章，360 条题（215 条题答配对）
- 轻三·最后六套题：163 页（新建「模考」通道，整卷连续翻）
- 轻二·套卷一/二：27 页" 2>&1 | tail -1

for i in 1 2 3 4 5; do
  out=$(git -c http.proxy=http://127.0.0.1:65532 \
      -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
      -c credential.helper= push origin data 2>&1 | tail -1)
  echo "  push$i: $out"
  echo "$out" | grep -q "data -> data" && break
  sleep 15
done
du -sh .git
