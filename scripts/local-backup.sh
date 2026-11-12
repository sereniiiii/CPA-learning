#!/bin/bash
#
# 本机备份：从 GitHub 拉取 data 分支的完整快照。
#
# 备份目标：~/Documents/CPA-learning-backup/
#   ├── latest/          当前最新快照（可直接查看）
#   └── snapshots/       按日期归档的历史快照（保留 30 份）
#
# 由 launchd 每日定时调用，也可在 Terminal 手动执行。

set -uo pipefail

BACKUP_ROOT="${CPA_BACKUP_ROOT:-$HOME/Documents/CPA-learning-backup}"
SNAPSHOT_DIR="$BACKUP_ROOT/snapshots"
LATEST_DIR="$BACKUP_ROOT/latest"
REPO="https://github.com/sereniiiii/CPA-learning.git"
BRANCH="data"
KEEP=30
PROXY="http://127.0.0.1:65532"   # 本机 GitHub 可用的代理端口

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

mkdir -p "$SNAPSHOT_DIR" "$LATEST_DIR"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 用 token 拉取私有仓库
TOKEN_FILE="$HOME/.config/study-hub/gh-token"
if [ ! -f "$TOKEN_FILE" ]; then
  log "错误：找不到 token 文件 $TOKEN_FILE"
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")

log "拉取 $BRANCH 分支…"
AUTH=$(printf 'x-access-token:%s' "$TOKEN" | base64)

if ! git -c http.proxy="$PROXY" \
        -c "http.extraheader=Authorization: Basic $AUTH" \
        clone --depth 1 --branch "$BRANCH" --single-branch \
        "$REPO" "$TMP/repo" 2>&1 | tail -3; then
  log "拉取失败（检查网络/代理）"
  exit 1
fi

if [ ! -d "$TMP/repo/data" ]; then
  log "错误：快照中没有 data 目录"
  exit 1
fi

STAMP=$(date '+%Y%m%d-%H%M%S')
DEST="$SNAPSHOT_DIR/$STAMP"

log "保存快照 → $DEST"
mkdir -p "$DEST"
cp -R "$TMP/repo/data" "$DEST/data"
# 记录快照信息，便于日后辨认
{
  echo "快照时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "来源仓库: $REPO"
  echo "分支: $BRANCH"
  echo "commit: $(git -C "$TMP/repo" rev-parse HEAD 2>/dev/null || echo unknown)"
} > "$DEST/INFO.txt"

# 更新 latest 软链接副本
rm -rf "$LATEST_DIR"
mkdir -p "$LATEST_DIR"
cp -R "$DEST/data" "$LATEST_DIR/data"
cp "$DEST/INFO.txt" "$LATEST_DIR/INFO.txt"

# 清理过旧的历史快照
COUNT=$(ls -1 "$SNAPSHOT_DIR" 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1dt "$SNAPSHOT_DIR"/* | tail -n $((COUNT - KEEP)) | while read -r old; do
    log "清理旧快照: $(basename "$old")"
    rm -rf "$old"
  done
fi

SIZE=$(du -sh "$DEST" 2>/dev/null | cut -f1)
log "完成，快照大小 ${SIZE}，当前共 ${COUNT} 份"

# 若配置了 COS 密钥，顺带上传到云端（异地备份）
# 密钥从独立文件读取，不写进 plist，也不进环境变量
COS_ENV_FILE="$HOME/.config/study-hub/cos.env"
if [ -f "$COS_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$COS_ENV_FILE"
fi

if [ -n "${COS_SECRET_ID:-}" ] && [ -n "${COS_SECRET_KEY:-}" ] && [ -n "${COS_BUCKET:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PY=$(command -v python3 || echo /usr/bin/python3)
  if "$PY" -c "import qcloud_cos" 2>/dev/null; then
    log "上传到腾讯云 COS…"
    "$PY" "$SCRIPT_DIR/backup-to-cos.py" || log "COS 上传失败（不影响本地备份）"
  else
    log "未安装 cos-python-sdk-v5，跳过 COS 上传"
  fi
else
  log "未配置 COS 密钥，仅本地备份"
fi
