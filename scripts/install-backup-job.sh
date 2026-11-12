#!/bin/bash
#
# 安装每日备份定时任务。
#
# 在你自己的 Terminal 里运行：
#     bash /Users/seren/WorkBuddy/2026-11-12-00-20-32/study-hub/scripts/install-backup-job.sh
#
# 做三件事：
#   1. 把 plist 复制到 ~/Library/LaunchAgents/
#   2. 注册到 launchd（开机自动生效）
#   3. 立即跑一次，确认能工作

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.serenii.cpa-backup.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.serenii.cpa-backup.plist"
LABEL="com.serenii.cpa-backup"

echo "=== 1. 安装 plist ==="
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"
echo "  已复制到 $PLIST_DST"

echo "=== 2. 注册定时任务 ==="
# 先卸载旧的（可能不存在，忽略错误）
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
if launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>&1; then
  echo "  ✓ 注册成功"
else
  echo "  ✗ 注册失败，试试："
  echo "      launchctl load $PLIST_DST"
  exit 1
fi

echo "=== 3. 验证状态 ==="
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state|program|runs" | head -5

echo "=== 4. 立即跑一次 ==="
bash "$SCRIPT_DIR/local-backup.sh"

echo ""
echo "完成。每天 12:30 自动备份到 ~/Documents/CPA-learning-backup/"
echo "查看日志： tail -f ~/Library/Logs/cpa-backup.log"
echo "手动跑：   bash $SCRIPT_DIR/local-backup.sh"
echo "卸载：     launchctl bootout gui/$(id -u)/$LABEL"
