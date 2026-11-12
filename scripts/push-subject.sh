#!/usr/bin/env bash
# 把一門課的產物推到 data 分支，并合并科目清单。
#
# 用法：
#   SUBJECT_ID=eco ./scripts/push-subject.sh
#
# 注意：科目清单 data/subjects.json 必须**合并**而不是覆盖 ——
#       每門課只处理一次，覆盖会把别的科目从切换器里抹掉。

set -e
cd "$(dirname "$0")/../.."

: "${SUBJECT_ID:=cwc}"
: "${SUBJECT_NAME:=财管}"

ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
WORK="$ROOT/build/$SUBJECT_ID"
REPO="/tmp/data-branch"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

echo "════ 推送 $SUBJECT_NAME（$SUBJECT_ID）"

mkdir -p "$REPO/data/subjects/$SUBJECT_ID/chapters"
cp "$WORK/upload/subjects/$SUBJECT_ID/chapters/"*.json \
   "$REPO/data/subjects/$SUBJECT_ID/chapters/"
cp "$WORK/upload/subjects/$SUBJECT_ID/index.json" \
   "$REPO/data/subjects/$SUBJECT_ID/"
cp "$WORK/upload/subjects/$SUBJECT_ID/blocks.json" \
   "$REPO/data/subjects/$SUBJECT_ID/"

# 块图片
mkdir -p "$REPO/data/subjects/$SUBJECT_ID/blocks"
BLOCK_DIR="$WORK/blocks/$SUBJECT_NAME"
if [ -d "$BLOCK_DIR" ]; then
  rm -f "$REPO/data/subjects/$SUBJECT_ID/blocks/"*.png
  cp "$BLOCK_DIR/"*.png "$REPO/data/subjects/$SUBJECT_ID/blocks/"
fi

# 主观题（如果有）
if [ -d "$WORK/upload/subjects/$SUBJECT_ID/subjectives" ]; then
  mkdir -p "$REPO/data/subjects/$SUBJECT_ID/subjectives"
  cp "$WORK/upload/subjects/$SUBJECT_ID/subjectives/"*.json \
     "$REPO/data/subjects/$SUBJECT_ID/subjectives/"
fi

# 合并科目清单
python3 - "$REPO/data/subjects.json" "$WORK/upload/subjects/$SUBJECT_ID/index.json" <<'PY'
import json, sys, os

list_path, idx_path = sys.argv[1], sys.argv[2]
subjects = []
if os.path.exists(list_path):
    try:
        subjects = json.load(open(list_path, encoding="utf-8"))
    except Exception:
        subjects = []

meta = json.load(open(idx_path, encoding="utf-8")).get("meta", {})
entry = {
    "id": meta.get("subjectId", "cwc"),
    "name": meta.get("subjectName", "?"),
    "volumeCount": 3,
    "chapterCount": meta.get("chapterCount", 0),
    "color": meta.get("color", "#2f5fd0"),
}
subjects = [s for s in subjects if s.get("id") != entry["id"]]
subjects.append(entry)
subjects.sort(key=lambda s: s.get("id", ""))
json.dump(subjects, open(list_path, "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("  科目清单:", [(s["id"], s["name"], s["chapterCount"]) for s in subjects])
PY

cd "$REPO"
git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "新增科目 $SUBJECT_NAME（$SUBJECT_ID）的内容库" 2>&1 | tail -1

git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push origin data 2>&1 | tail -2

echo "════ 完成"
