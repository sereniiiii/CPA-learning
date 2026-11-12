#!/usr/bin/env bash
# 补齐 index.json 的科目元信息 + 修正科目清单 + 推送。
set -e
cd "$(dirname "$0")/../.."

: "${SUBJECT_ID:=eco}"
: "${SUBJECT_NAME:=经济法}"
: "${SUBJECT_COLOR:=#6b3ba8}"
: "${SUBJECT_TITLE:=2026 注会 CPA《轻一》· 经济法}"
: "${SUBJECT_SOURCE:=东奥《2026 年注册会计师考试应试考点及同步习题 · 经济法》上/中/下册}"

ROOT="/Users/seren/WorkBuddy/2026-11-12-00-20-32"
WORK="$ROOT/build/$SUBJECT_ID"
REPO="/tmp/data-branch"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

# 补 meta
python3 - "$WORK/upload/subjects/$SUBJECT_ID/index.json" "$SUBJECT_ID" "$SUBJECT_NAME" "$SUBJECT_COLOR" "$SUBJECT_TITLE" "$SUBJECT_SOURCE" <<'PY'
import json, sys
p, sid, name, color, title, source = sys.argv[1:7]
d = json.load(open(p, encoding="utf-8"))
d["meta"].update({
    "subjectId": sid, "subjectName": name, "color": color,
    "title": title, "source": source,
})
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("  meta:", json.dumps(d["meta"], ensure_ascii=False)[:130])
PY

cp "$WORK/upload/subjects/$SUBJECT_ID/index.json" "$REPO/data/subjects/$SUBJECT_ID/"
cp "$WORK/upload/subjects/$SUBJECT_ID/blocks.json" "$REPO/data/subjects/$SUBJECT_ID/"
cp "$WORK/upload/subjects/$SUBJECT_ID/chapters/"*.json "$REPO/data/subjects/$SUBJECT_ID/chapters/"

# 修科目清单
python3 "$ROOT/study-hub/scripts/fix-subjects-list.py" "$REPO/data/subjects.json"

cd "$REPO"
git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "科目 $SUBJECT_NAME（$SUBJECT_ID）：meta 与科目清单修正" 2>&1 | tail -1
git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push origin data 2>&1 | tail -2
