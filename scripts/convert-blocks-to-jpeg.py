#!/usr/bin/env python3
"""
把教材块图从 PNG 转成 JPEG（体积省 ~76%）。

为什么要转：
  四科加起来 PNG 有 2.5GB，GitHub 仓库会到 3GB —— 超过建议上限，
  每次 push 都要传整个 pack，慢到不可用。
  教材是文字截图，JPEG q90 @1100px 实测文字依然锐利（无明显伪影），
  体积能降到 1/4。

同时把各处 JSON 里的 .png 引用改成 .jpg（manifest / blocks.json / chapters）。

用法：
    python3 convert-blocks-to-jpeg.py <科目id> <科目名>
    python3 convert-blocks-to-jpeg.py all
"""
import json
import os
import subprocess
import sys

BASE = "/Users/seren/WorkBuddy/2026-11-12-00-20-32"
QUALITY = 90
MAX_WIDTH = 1100

SUBJECTS = {
    "cwc": "财管",
    "eco": "经济法",
    "sts": "税法",
    "kj": "会计",
    "sj": "审计",
    "zl": "战略",
}


def convert_dir(block_dir: str) -> int:
    """批量转 JPEG（同目录下的 png → jpg）"""
    if not os.path.isdir(block_dir):
        return 0
    pngs = sorted(f for f in os.listdir(block_dir) if f.endswith(".png"))
    if not pngs:
        return 0

    # sips 批量：一次传多个文件
    batch = 100
    done = 0
    for i in range(0, len(pngs), batch):
        group = pngs[i:i + batch]
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(QUALITY),
             "-Z", str(MAX_WIDTH)]
            + [os.path.join(block_dir, f) for f in group]
            + ["--out", block_dir],
            capture_output=True,
        )
        done += len(group)
    # 注意：**不删 png**。
    # 批量删除 ≥50 个文件会触发系统的安全删除保护；
    # 本地留一份 png 无妨（上传时只取 jpg）。
    return done


def _png_to_jpg(name):
    return name[:-4] + ".jpg" if isinstance(name, str) and name.endswith(".png") else name


def fix_json_refs(work: str) -> None:
    """把各处 JSON 里的 .png 引用改成 .jpg"""
    # manifest.json —— 块列表里的 file 字段
    mpath = f"{work}/blocks/manifest.json"
    if os.path.exists(mpath):
        d = json.load(open(mpath, encoding="utf-8"))
        for b in d.get("blocks", []):
            b["file"] = _png_to_jpg(b.get("file", ""))
        json.dump(d, open(mpath, "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))

    # blocks.json —— **字典的 key** 就是文件名，必须一起改
    subj_dir = f"{work}/upload/subjects"
    for root, _, files in os.walk(subj_dir):
        for f in files:
            if not f.endswith(".json"):
                continue
            p = os.path.join(root, f)
            try:
                d = json.load(open(p, encoding="utf-8"))
            except Exception:
                continue
            changed = False

            # blocks.json：{"__version":..., "文件名.png": {...}}
            if isinstance(d, dict) and "__version" in d:
                new_map = {}
                for k, v in d.items():
                    nk = _png_to_jpg(k)
                    if nk != k:
                        changed = True
                    new_map[nk] = v
                d = new_map

            # 章节文件：顶层就有 sections（不在 chapters 下）
            # index.json：chapters[].sections[]
            def fix_sections(sections):
                nonlocal changed
                for sec in sections or []:
                    for pt in sec.get("points", []) or []:
                        blks = pt.get("blocks")
                        if isinstance(blks, list):
                            new_blks = [_png_to_jpg(b) for b in blks]
                            if new_blks != blks:
                                pt["blocks"] = new_blks
                                changed = True

            fix_sections(d.get("sections"))
            for ch in d.get("chapters", []) or []:
                fix_sections(ch.get("sections"))

            if changed:
                json.dump(d, open(p, "w", encoding="utf-8"),
                          ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    targets = sys.argv[1:] or list(SUBJECTS.keys())
    if targets == ["all"]:
        targets = list(SUBJECTS.keys())

    for sid in targets:
        name = SUBJECTS.get(sid, sid)
        work = f"{BASE}/build/{sid}"
        if not os.path.isdir(work):
            print(f"  跳过 {name}（无工作目录）")
            continue
        block_dir = f"{work}/blocks/{name}"
        n = convert_dir(block_dir)
        # 财管的块在 build/cwc/blocks/ 根下（没有科目名子目录）
        if n == 0:
            n = convert_dir(f"{work}/blocks")
        fix_json_refs(work)
        du = subprocess.run(["du", "-sh", block_dir], capture_output=True, text=True)
        size = du.stdout.split()[0] if du.stdout.strip() else "?"
        jpg_n = len([f for f in os.listdir(block_dir) if f.endswith(".jpg")]) \
            if os.path.isdir(block_dir) else 0
        print(f"  {name}（{sid}）: 转 {n} 张 → {jpg_n} 个 jpg，{size}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
