#!/usr/bin/env python3
"""
校验访问口令是否生效。

读本地保存的口令文件（~/.config/study-hub/access-password），
逐个尝试登录，返回各自的状态码。

用法：
    python3 scripts/verify-password.py

注意：本机走 127.0.0.1:65532 代理才能访问 GitHub/Vercel，
但访问本站 vercel.app 直连更快，脚本里两种都试。
"""
import json
import os
import subprocess
import sys

BASE = os.environ.get("SITE_BASE", "https://cpa-learning-eta.vercel.app")
CRED = os.path.expanduser("~/.config/study-hub/access-password")
OLD_VALUES = ["cpa-2026", "cpa-2027"]


def try_login(value: str) -> int:
    """返回 HTTP 状态码；网络失败返回 0"""
    body = json.dumps({"password": value})
    proc = subprocess.run(
        [
            "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
            "--max-time", "40", "--retry", "2", "--retry-delay", "2",
            "-X", "POST", f"{BASE}/api/session",
            "-H", "Content-Type: application/json",
            "-d", body,
        ],
        capture_output=True,
        text=True,
    )
    try:
        return int(proc.stdout.strip() or "0")
    except ValueError:
        return 0


def main() -> int:
    if not os.path.exists(CRED):
        print(f"找不到口令文件：{CRED}")
        return 1

    with open(CRED) as f:
        current = f.read().strip()

    print(f"站点：{BASE}")
    print(f"口令文件：{CRED}\n")

    code = try_login(current)
    ok = code == 200
    print(f"当前口令     -> HTTP {code}  {'✓ 已生效' if ok else '✗ 未生效'}")

    for old in OLD_VALUES:
        c = try_login(old)
        state = "✓ 已失效" if c == 401 else f"✗ 仍可登录({c})"
        print(f"旧口令 {old:9} -> HTTP {c}  {state}")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
