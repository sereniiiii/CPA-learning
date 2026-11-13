#!/usr/bin/env bash
# 推送一个新科目（审计）：产物 + 块图 + 科目清单。
set -e
ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
REPO="/tmp/data-branch"
SID="${1:-sj}"
NAME="${2:-审计}"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

cd "$REPO"
SRC=$(find "$ROOT/build/$SID" -maxdepth 5 -name "index.json" -path "*upload*" \
      -not -path "*/subjectives/*" 2>/dev/null | head -1 | xargs dirname)
echo "  产物目录: $SRC"

mkdir -p "data/subjects/$SID/chapters" "data/subjects/$SID/blocks"
cp "$SRC/chapters/"*.json "data/subjects/$SID/chapters/" 2>/dev/null || true
cp "$SRC/index.json" "$SRC/blocks.json" "data/subjects/$SID/" 2>/dev/null || true
if [ -d "$SRC/subjectives" ]; then
  mkdir -p "data/subjects/$SID/subjectives"
  cp "$SRC/subjectives/"*.json "data/subjects/$SID/subjectives/"
fi

BLOCK_DIR="$ROOT/build/$SID/blocks/$NAME"
[ -d "$BLOCK_DIR" ] || BLOCK_DIR="$ROOT/build/$SID/blocks"
rm -f "data/subjects/$SID/blocks/"*.jpg 2>/dev/null || true
cp "$BLOCK_DIR/"*.jpg "data/subjects/$SID/blocks/" 2>/dev/null || true
n=$(ls "data/subjects/$SID/blocks/"*.jpg 2>/dev/null | wc -l | tr -d ' ')
echo "  $NAME：$n 张图，$(du -sh "data/subjects/$SID/blocks" | cut -f1)"

python3 "$ROOT/study-hub/scripts/fix-subjects-list.py" data/subjects.json

git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "新增科目 $NAME（$SID）：教材内容库 + 习题" 2>&1 | tail -1
git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push origin data 2>&1 | tail -2
du -sh .git
