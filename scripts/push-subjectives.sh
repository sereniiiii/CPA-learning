#!/usr/bin/env bash
# 增量推送各科的主观题数据 + 主观题页块。
# （教材块图已在仓库里，这里只加新增的，避免重建 .git 耗时 40 分钟）
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
  SRC="$ROOT/build/$SID/upload/subjects/$SID/subjectives"
  [ -d "$SRC" ] || { echo "  $NAME: 无主观题数据"; continue; }

  mkdir -p "data/subjects/$SID/subjectives"
  cp "$SRC/"*.json "data/subjects/$SID/subjectives/"

  # 主观题页块（down-XXXX.jpg）
  BLOCK_DIR="$ROOT/build/$SID/blocks/$NAME"
  [ -d "$BLOCK_DIR" ] || BLOCK_DIR="$ROOT/build/$SID/blocks"
  n=$(ls "$BLOCK_DIR"/down-*.jpg 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" -gt 0 ]; then
    cp "$BLOCK_DIR"/down-*.jpg "data/subjects/$SID/blocks/" 2>/dev/null || true
  fi
  echo "  $NAME（$SID）: 主观题 $(ls "$SRC"/*.json 2>/dev/null | wc -l | tr -d ' ') 个 JSON, $n 张页块"
done

git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "四科主观题数据 + 主观题页块（down-*.jpg）" 2>&1 | tail -1
git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push origin data 2>&1 | tail -2
du -sh .git
