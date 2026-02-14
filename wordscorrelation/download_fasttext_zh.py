#!/usr/bin/env python3
"""
Download and unpack fastText Chinese vectors (cc.zh.300.bin).

Python: 3.11+
Source: https://fasttext.cc/docs/en/crawl-vectors
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
MODEL_DIR = DATA_DIR / "models"
META_PATH = DATA_DIR / "fasttext_download_meta.json"

MODEL_URL = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.zh.300.bin.gz"
GZ_PATH = MODEL_DIR / "cc.zh.300.bin.gz"
BIN_PATH = MODEL_DIR / "cc.zh.300.bin"


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def download_file(url: str, dest: Path, timeout: int = 60) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (wordscorrelation-fasttext-downloader)",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        total = resp.headers.get("Content-Length")
        total_size = int(total) if total and total.isdigit() else 0
        downloaded = 0
        with dest.open("wb") as out:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    pct = downloaded * 100.0 / total_size
                    print(
                        f"\rDownloading: {downloaded}/{total_size} bytes ({pct:.2f}%)",
                        end="",
                        flush=True,
                    )
                else:
                    print(f"\rDownloading: {downloaded} bytes", end="", flush=True)
    print()


def gunzip_file(src_gz: Path, dest_bin: Path) -> None:
    with gzip.open(src_gz, "rb") as fin, dest_bin.open("wb") as fout:
        while True:
            chunk = fin.read(1024 * 1024)
            if not chunk:
                break
            fout.write(chunk)


def save_meta(meta: dict) -> None:
    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    with META_PATH.open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download fastText Chinese model.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download and overwrite local files even if model already exists.",
    )
    parser.add_argument(
        "--keep-gz",
        action="store_true",
        help="Keep the downloaded .gz file after extracting .bin.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    if BIN_PATH.exists() and not args.force:
        print(f"[SKIP] Model already exists: {BIN_PATH}")
        print("Use --force to re-download.")
        return 0

    if GZ_PATH.exists() and args.force:
        GZ_PATH.unlink()
    if BIN_PATH.exists() and args.force:
        BIN_PATH.unlink()

    print(f"[INFO] Downloading: {MODEL_URL}")
    try:
        download_file(MODEL_URL, GZ_PATH)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"[FAIL] Download failed: {exc}", file=sys.stderr)
        return 2

    print(f"[INFO] Extracting: {GZ_PATH} -> {BIN_PATH}")
    try:
        gunzip_file(GZ_PATH, BIN_PATH)
    except OSError as exc:
        print(f"[FAIL] Extract failed: {exc}", file=sys.stderr)
        return 3

    meta = {
        "source_url": MODEL_URL,
        "gz_path": str(GZ_PATH.relative_to(ROOT)),
        "bin_path": str(BIN_PATH.relative_to(ROOT)),
        "gz_size_bytes": GZ_PATH.stat().st_size if GZ_PATH.exists() else 0,
        "bin_size_bytes": BIN_PATH.stat().st_size if BIN_PATH.exists() else 0,
        "bin_sha256": sha256_file(BIN_PATH) if BIN_PATH.exists() else "",
    }
    save_meta(meta)

    if not args.keep_gz and GZ_PATH.exists():
        GZ_PATH.unlink()
        print(f"[INFO] Removed archive: {GZ_PATH}")

    print(f"[OK] Model ready: {BIN_PATH}")
    print(f"[OK] Metadata: {META_PATH}")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())
