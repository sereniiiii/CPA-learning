#!/usr/bin/env bash
# 一键推送：data 分支（内容库）+ main 分支（前端）
#
# 用法：先启动代理（nano.app），然后
#   bash /Users/seren/WorkBuddy/2026-11-12-00-20-32/study-hub/scripts/flush-push.sh
#
# 背景：2026-11-13 凌晨代理进程挂掉，WorkBuddy 沙箱里 push 不上去，
#       但所有内容都已经在本地 commit 好了，就差最后一次 push。

set -e
TOKEN=$(cat ~/.config/study-hub/gh-token)
AUTH="Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64)"
PROXY="http://127.0.0.1:65532"

push_one() {
  local dir=$1 branch=$2
  echo "──── 推送 $dir（$branch）"
  cd "$dir"
  git -c http.proxy="$PROXY" -c "http.extraheader=$AUTH" -c credential.helper= \
      push origin "$branch" 2>&1 | tail -2
}

# 代理连通性自检
echo "──── 代理自检"
if ! curl -s -o /dev/null --max-time 12 -x "$PROXY" https://github.com; then
  echo "  ❌ 代理不通 —— 先把 nano.app 打开（可能要点一下连接/选节点）"
  exit 1
fi
echo "  ✓ 代理正常"

push_one /tmp/data-branch data
push_one /Users/seren/WorkBuddy/2026-11-12-00-20-32/study-hub main

echo "──── 完成。等 Vercel 自动部署（约 1-2 分钟）"
