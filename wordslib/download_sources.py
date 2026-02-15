#!/usr/bin/env python3
"""
Download Chinese lexicon sources for preprocessing.

Python: 3.11+
Sources:
- THUOCL (MIT): https://github.com/thunlp/THUOCL
- jieba dictionaries (MIT): https://github.com/fxsjy/jieba
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
META_PATH = DATA_DIR / "downloads_meta.json"


SOURCES = [
    {
        "name": "thuocl_it",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_IT.txt",
        "relative_path": "thuocl/THUOCL_IT.txt",
    },
    {
        "name": "thuocl_financial",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_caijing.txt",
        "relative_path": "thuocl/THUOCL_caijing.txt",
    },
    {
        "name": "thuocl_geo",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_diming.txt",
        "relative_path": "thuocl/THUOCL_diming.txt",
    },
    {
        "name": "thuocl_idiom",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_chengyu.txt",
        "relative_path": "thuocl/THUOCL_chengyu.txt",
    },
    {
        "name": "thuocl_food",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_food.txt",
        "relative_path": "thuocl/THUOCL_food.txt",
    },
    {
        "name": "thuocl_history",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_lishi.txt",
        "relative_path": "thuocl/THUOCL_lishi.txt",
    },
    {
        "name": "thuocl_poem",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_poem.txt",
        "relative_path": "thuocl/THUOCL_poem.txt",
    },
    {
        "name": "thuocl_medical",
        "url": "https://raw.githubusercontent.com/thunlp/THUOCL/master/data/THUOCL_medical.txt",
        "relative_path": "thuocl/THUOCL_medical.txt",
    },
    {
        "name": "jieba_dict",
        "url": "https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt",
        "relative_path": "jieba/dict.txt",
    },
    {
        "name": "jieba_dict_small",
        "url": "https://raw.githubusercontent.com/fxsjy/jieba/master/extra_dict/dict.txt.small",
        "relative_path": "jieba/dict.txt.small",
    },
    {
        "name": "jieba_dict_big",
        "url": "https://raw.githubusercontent.com/fxsjy/jieba/master/extra_dict/dict.txt.big",
        "relative_path": "jieba/dict.txt.big",
    },
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_meta() -> dict:
    if not META_PATH.exists():
        return {"files": {}}
    with META_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_meta(meta: dict) -> None:
    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    with META_PATH.open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def download_one(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (wordslib-downloader)",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def main() -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    meta = load_meta()
    files_meta = meta.setdefault("files", {})

    ok = 0
    failed = 0

    for src in SOURCES:
        rel = Path(src["relative_path"])
        dest = RAW_DIR / rel
        dest.parent.mkdir(parents=True, exist_ok=True)

        try:
            payload = download_one(src["url"])
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failed += 1
            print(f"[FAIL] {src['name']}: {exc}", file=sys.stderr)
            continue

        digest = sha256_bytes(payload)
        dest.write_bytes(payload)
        files_meta[src["name"]] = {
            "url": src["url"],
            "relative_path": str(rel),
            "size_bytes": len(payload),
            "sha256": digest,
        }
        ok += 1
        print(f"[OK]   {src['name']} -> {dest} ({len(payload)} bytes)")

    save_meta(meta)
    print(f"\nDownloaded: {ok}, Failed: {failed}")
    print(f"Metadata: {META_PATH}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())
