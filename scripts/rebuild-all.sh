#!/usr/bin/env bash
# 把所有科目装进 data 分支，并彻底重建仓库（压缩体积）。
#
# 逐个 push 的话，每次都要传整个 pack（1.7GB）→ 慢到不可用。
# 一次性把所有科目放进工作区，重建单条历史，一次 push 搞定。
set -e
ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
REPO="/tmp/data-branch"
BACKUP=$(mktemp -d)

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

echo "════ 备份现有 data/（含 userdata.json）"
cd "$REPO"
cp -a data "$BACKUP/data"

echo "════ 装入各科目产物"
for spec in "cwc:财管" "eco:经济法" "sts:税法" "kj:会计"; do
  SID=${spec%%:*}; NAME=${spec##*:}
  # 产物目录位置不统一：找 build/<sid> 下含 index.json 的 upload 目录
  SRC=$(find "$ROOT/build/$SID" -maxdepth 5 -name "index.json" -path "*upload*" \
        2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
  if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
    echo "  跳过 $NAME（无产物）"; continue
  fi

  mkdir -p "$REPO/data/subjects/$SID/chapters"
  cp "$SRC/chapters/"*.json "$REPO/data/subjects/$SID/chapters/" 2>/dev/null || true
  cp "$SRC/index.json" "$REPO/data/subjects/$SID/" 2>/dev/null || true
  [ -f "$SRC/blocks.json" ] && cp "$SRC/blocks.json" "$REPO/data/subjects/$SID/"
  if [ -d "$SRC/subjectives" ]; then
    mkdir -p "$REPO/data/subjects/$SID/subjectives"
    cp "$SRC/subjectives/"*.json "$REPO/data/subjects/$SID/subjectives/" 2>/dev/null || true
  fi

  # 块图：**只传 jpg**。
  # PNG 留在本地作备份（转 JPEG 时没删，避免触发批量删除保护），
  # 两者都传会让仓库翻倍（3.2GB 而不是 931MB）。
  BLOCK_DIR="$ROOT/build/$SID/blocks/$NAME"
  [ -d "$BLOCK_DIR" ] || BLOCK_DIR="$ROOT/build/$SID/blocks"
  mkdir -p "$REPO/data/subjects/$SID/blocks"
  rm -f "$REPO/data/subjects/$SID/blocks/"*.jpg 2>/dev/null || true
  rm -f "$REPO/data/subjects/$SID/blocks/"*.png 2>/dev/null || true
  if ls "$BLOCK_DIR/"*.jpg >/dev/null 2>&1; then
    cp "$BLOCK_DIR/"*.jpg "$REPO/data/subjects/$SID/blocks/"
  else
    cp "$BLOCK_DIR/"*.png "$REPO/data/subjects/$SID/blocks/" 2>/dev/null || true
  fi

  n=$(ls "$REPO/data/subjects/$SID/blocks/" 2>/dev/null | wc -l | tr -d ' ')
  sz=$(du -sh "$REPO/data/subjects/$SID/blocks" 2>/dev/null | cut -f1)
  echo "  $NAME（$SID）: $n 张图, $sz"
done

echo "════ 修正科目清单"
python3 "$ROOT/study-hub/scripts/fix-subjects-list.py" "$REPO/data/subjects.json"

echo "════ 重建仓库"
cd "$REPO"
rm -rf .git
git init -q
git checkout -q -b data
git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -q -m "重建仓库：四科目内容库（财管/税法/经济法/会计）+ 图转 JPEG 压缩体积"
git remote add origin https://github.com/sereniiiii/CPA-learning.git

echo "════ 推送"
git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push --force origin data 2>&1 | tail -3

echo "════ 结果"
du -sh .git
du -sh data
rm -rf "$BACKUP"
