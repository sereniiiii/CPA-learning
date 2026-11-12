#!/usr/bin/env python3
"""
上传本机备份到腾讯云 COS（异地备份）。

用法：
    export COS_SECRET_ID=xxx
    export COS_SECRET_KEY=xxx
    export COS_REGION=ap-shanghai
    export COS_BUCKET=your-bucket-1250000000
    python3 scripts/backup-to-cos.py

依赖：
    pip3 install cos-python-sdk-v5

备份位置：~/Documents/CPA-learning-backup/snapshots/
上传后保留 COS 上最近 30 份，更旧的自动删除。
"""
import glob
import os
import sys
from datetime import datetime, timezone

SNAPSHOT_ROOT = os.path.expanduser(
    os.environ.get("CPA_BACKUP_ROOT", "~/Documents/CPA-learning-backup/snapshots")
)
PREFIX = os.environ.get("COS_PREFIX", "cpa-learning")
KEEP = 30


def main() -> int:
    missing = [k for k in ("COS_SECRET_ID", "COS_SECRET_KEY", "COS_REGION", "COS_BUCKET") if not os.environ.get(k)]
    if missing:
        print(f"缺少环境变量：{', '.join(missing)}")
        print("用法：")
        print("  export COS_SECRET_ID=xxx COS_SECRET_KEY=xxx")
        print("  export COS_REGION=ap-shanghai COS_BUCKET=your-bucket-125xxxx")
        return 1

    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError:
        print("缺少依赖，请先运行： pip3 install cos-python-sdk-v5")
        return 1

    if not os.path.isdir(SNAPSHOT_ROOT):
        print(f"找不到备份目录：{SNAPSHOT_ROOT}")
        print("请先运行 local-backup.sh 生成快照")
        return 1

    # 打包最新快照
    latest = os.path.join(SNAPSHOT_ROOT, "..", "latest")
    tarball = None
    try:
        import tarfile

        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        tarball = os.path.join(SNAPSHOT_ROOT, f"cpa-learning-{stamp}.tar.gz")
        with tarfile.open(tarball, "w:gz") as tf:
            # latest/ 下是 data/ 与 INFO.txt，解包后根目录即 data/
            tf.add(os.path.abspath(os.path.join(latest, "data")), arcname="data")
            info = os.path.join(latest, "INFO.txt")
            if os.path.exists(info):
                tf.add(info, arcname="INFO.txt")
        print(f"已打包：{os.path.basename(tarball)}")
    except Exception as exc:
        print(f"打包失败：{exc}")
        return 1

    cfg = CosConfig(
        Region=os.environ["COS_REGION"],
        SecretId=os.environ["COS_SECRET_ID"],
        SecretKey=os.environ["COS_SECRET_KEY"],
    )
    client = CosS3Client(cfg)
    bucket = os.environ["COS_BUCKET"]

    try:
        key = f"{PREFIX}/{os.path.basename(tarball)}"
        client.upload_file(Bucket=bucket, Key=key, LocalFilePath=tarball)
        print(f"已上传：cos://{bucket}/{key}")

        # 清理旧备份
        resp = client.list_objects(Bucket=bucket, Prefix=f"{PREFIX}/")
        items = sorted(
            (o["Key"] for o in resp.get("Contents", [])),
            reverse=True,
        )
        for old in items[KEEP:]:
            client.delete_object(Bucket=bucket, Key=old)
            print(f"删除旧备份：{old}")
    except Exception as exc:
        print(f"上传失败：{exc}")
        return 1
    finally:
        if tarball and os.path.exists(tarball):
            os.remove(tarball)

    return 0


if __name__ == "__main__":
    sys.exit(main())
