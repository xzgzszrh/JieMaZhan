#!/usr/bin/env python3
"""
Extract THUOCL words with max length <= 4 characters.

Input:  wordslib/data/raw/thuocl/THUOCL_*.txt
Output: wordslib/data/processed/thuocl_words_max4.txt

Each output line contains one word only (no frequency numbers).
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Extract THUOCL words by max length")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=root / "data" / "raw" / "thuocl",
        help="Directory that contains THUOCL_*.txt files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "data" / "processed" / "thuocl_words_max4.txt",
        help="Output txt path",
    )
    parser.add_argument(
        "--max-len",
        type=int,
        default=4,
        help="Keep words with length <= max-len",
    )
    parser.add_argument(
        "--min-freq",
        type=int,
        default=10000,
        help="Keep words with frequency > min-freq",
    )
    return parser.parse_args()


def iter_thuocl_files(input_dir: Path) -> list[Path]:
    return sorted(input_dir.glob("THUOCL_*.txt"))


def extract_word_and_freq(line: str) -> tuple[str, int] | None:
    # THUOCL lines are generally: "<word><tab><freq>".
    parts = line.strip().split()
    if len(parts) < 2:
        return None

    word = parts[0].strip()
    freq_raw = parts[1].strip()
    if not re.fullmatch(r"\d+", freq_raw):
        return None

    return word, int(freq_raw)


def main() -> int:
    args = parse_args()
    input_dir = args.input_dir
    output_path = args.output
    max_len = args.max_len
    min_freq = args.min_freq

    files = iter_thuocl_files(input_dir)
    if not files:
        raise FileNotFoundError(f"No THUOCL files found in: {input_dir}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    seen: set[str] = set()
    words: list[str] = []
    total_rows = 0
    skipped_dirty = 0
    skipped_len = 0
    skipped_freq = 0

    for path in files:
        with path.open("r", encoding="utf-8") as f:
            for raw in f:
                total_rows += 1
                parsed = extract_word_and_freq(raw)
                if not parsed:
                    skipped_dirty += 1
                    continue
                word, freq = parsed
                if len(word) > max_len:
                    skipped_len += 1
                    continue
                if freq <= min_freq:
                    skipped_freq += 1
                    continue
                if word in seen:
                    continue
                seen.add(word)
                words.append(word)

    with output_path.open("w", encoding="utf-8") as f:
        for word in words:
            f.write(f"{word}\n")

    print(f"Input files: {len(files)}")
    print(f"Input rows: {total_rows}")
    print(f"Skipped dirty rows: {skipped_dirty}")
    print(f"Skipped by length(>{max_len}): {skipped_len}")
    print(f"Skipped by frequency(<= {min_freq}): {skipped_freq}")
    print(f"Output words: {len(words)}")
    print(f"Output path: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
