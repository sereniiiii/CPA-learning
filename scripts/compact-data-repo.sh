#!/usr/bin/env bash
# 重建 data 分支为单条历史，压缩仓库体积。
#
# 为什么需要：
#   反复推送 200MB+ 的图片，git 会把每个版本都存下来 ——
#   .git 涨到 1.7GB（内容其实只有 ~400MB）。
#   GitHub 建议仓库 < 1GB，而且每次 push 都要传整个 pack。
#
# 安全：只保留**最新一次提交**。
#   线上部署读的是分支最新版本，历史只是备份。
#   你的学习记录在 data/userdata.json（最新版本完整保留）。
#
# 用法：./scripts/compact-data-repo.sh
set -e
REPO="/tmp/data-branch"

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

cd "$REPO"

echo "════ 压缩前"
du -sh .git

git checkout --orphan compact-tmp
git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -m "重建：压缩仓库体积（保留最新内容，历史版本不再保留）"
git branch -f data compact-tmp
git branch -D compact-tmp
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "════ 压缩后"
du -sh .git

git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push --force origin data 2>&1 | tail -2

echo "════ 完成"
