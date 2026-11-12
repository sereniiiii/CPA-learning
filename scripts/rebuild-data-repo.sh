#!/usr/bin/env bash
# 彻底重建 data 分支仓库（单条历史）。
#
# 为什么 gc 不够：
#   `git gc --aggressive` 只重写 pack 里**可达**的对象；
#   反复 force-push 过的历史提交虽然不可达，但旧 pack 仍被保留，
#   .git 一直卡在 1.7GB（内容其实只有 ~450MB）。
#   干脆删掉 .git 重来 —— 远端只读最新版本，历史没有价值。
#
# 安全：只保留最新一次提交的内容（data/ 目录原样搬过去）。
#
# 用法：./scripts/rebuild-data-repo.sh
set -e
REPO="/tmp/data-branch"
BACKUP=$(mktemp -d)

export http_proxy=http://127.0.0.1:65532
export https_proxy=http://127.0.0.1:65532
export HTTP_PROXY=http://127.0.0.1:65532
export HTTPS_PROXY=http://127.0.0.1:65532
TOKEN=$(cat ~/.config/study-hub/gh-token)

cd "$REPO"
echo "════ 备份当前内容"
cp -a data "$BACKUP/data"
du -sh "$BACKUP/data"

echo "════ 删掉 .git，重建"
rm -rf .git
git init -q
git checkout -q -b data
cp -a "$BACKUP/data" ./data
git add -A
git -c user.name="sereniiiii" -c user.email="sereniiiii@users.noreply.github.com" \
    commit -q -m "重建仓库：压缩体积（内容为最新状态）"

git remote add origin https://github.com/sereniiiii/CPA-learning.git
git -c http.proxy=http://127.0.0.1:65532 \
    -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
    -c credential.helper= push --force origin data 2>&1 | tail -2

echo "════ 结果"
du -sh .git
du -sh data
rm -rf "$BACKUP"
