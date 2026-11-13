#!/usr/bin/env bash
# 增量推送各科的章节结构（index.json + chapters/*.json + blocks.json）。
# 结构变了（节层级、考点归属），但块图本身没变 → 增量传很快。
set -e
ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
REPO="/tmp/data-branch"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

cd "$REPO"
for spec in "cwc:财管" "eco:经济法" "sts:税法" "kj:会计"; do
  SID=${spec%%:*}; NAME=${spec##*:}
  # 注意：**必须排除 subjectives/**。
  # 主观题也有一个 index.json（专题索引），
  # 用宽泛的 find 会把它当成章节目录 cp 过去，把线上目录冲掉。
  SRC=$(find "$ROOT/build/$SID" -maxdepth 5 -name "index.json" -path "*upload*" \
        -not -path "*/subjectives/*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
  [ -n "$SRC" ] && [ -d "$SRC" ] || { echo "  跳过 $NAME"; continue; }

  mkdir -p "data/subjects/$SID/chapters"
  cp "$SRC/chapters/"*.json "data/subjects/$SID/chapters/" 2>/dev/null || true
  cp "$SRC/index.json" "$SRC/blocks.json" "data/subjects/$SID/" 2>/dev/null || true

  n=$(ls "data/subjects/$SID/chapters/"*.json 2>/dev/null | wc -l | tr -d ' ')
  echo "  $NAME（$SID）: $n 个章节文件"
done

python3 "$ROOT/study-hub/scripts/fix-subjects-list.py" data/subjects.json

git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "章节结构修正：消除「第0节（未分节）」

git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push origin data 2>&1 | tail -2
