#!/usr/bin/env python3
"""
Compute Chinese word correlation with fastText vectors.

Python: 3.11+
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import fasttext


ROOT = Path(__file__).resolve().parent
DEFAULT_REDUCED_BIN_MODEL_PATH = ROOT / "data" / "models" / "cc.zh.100.bin"
DEFAULT_BIN_MODEL_PATH = ROOT / "data" / "models" / "cc.zh.300.bin"


def resolve_default_model_path() -> Path:
    if DEFAULT_REDUCED_BIN_MODEL_PATH.exists():
        return DEFAULT_REDUCED_BIN_MODEL_PATH
    return DEFAULT_BIN_MODEL_PATH


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def pairwise_similarity(words: list[str], model: fasttext.FastText._FastText) -> list[list[float]]:
    vectors = [model.get_word_vector(w) for w in words]
    matrix: list[list[float]] = []
    for i in range(len(words)):
        row: list[float] = []
        for j in range(len(words)):
            sim = cosine_similarity(vectors[i], vectors[j])
            row.append(sim)
        matrix.append(row)
    return matrix


def format_matrix(words: list[str], matrix: list[list[float]]) -> str:
    width = max(6, max(len(w) for w in words) + 2)
    header = " ".ljust(width) + "".join(w.ljust(width) for w in words)
    lines = [header]
    for i, row in enumerate(matrix):
        line = words[i].ljust(width) + "".join(f"{v:.4f}".ljust(width) for v in row)
        lines.append(line)
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compute pairwise similarity for Chinese words with fastText."
    )
    parser.add_argument("words", nargs="+", help="Input words, e.g. 苹果 香蕉 水果.")
    parser.add_argument(
        "--model-path",
        type=Path,
        default=resolve_default_model_path(),
        help=(
            "Path to fastText model (.bin). "
            f"Default prefers {DEFAULT_REDUCED_BIN_MODEL_PATH} then {DEFAULT_BIN_MODEL_PATH}."
        ),
    )
    parser.add_argument(
        "--neighbors",
        type=int,
        default=8,
        help="Top-K nearest neighbors for each input word. Set 0 to disable.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of readable text table.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_path = args.model_path

    if len(args.words) < 2:
        print("Please provide at least 2 words.", file=sys.stderr)
        return 2
    if not model_path.exists():
        print(f"Model not found: {model_path}", file=sys.stderr)
        print("Run: python3.11 wordscorrelation/download_fasttext_zh.py", file=sys.stderr)
        return 3

    model = fasttext.load_model(str(model_path))
    matrix = pairwise_similarity(args.words, model)

    neighbors_data: dict[str, list[dict[str, float]]] = {}
    if args.neighbors > 0:
        for word in args.words:
            nn = model.get_nearest_neighbors(word, k=args.neighbors)
            neighbors_data[word] = [{"word": w, "score": s} for s, w in nn]

    if args.json:
        payload = {
            "words": args.words,
            "pairwise_similarity": matrix,
            "neighbors": neighbors_data,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print("Pairwise cosine similarity:")
    print(format_matrix(args.words, matrix))

    if args.neighbors > 0:
        print("\nNearest neighbors:")
        for word in args.words:
            print(f"- {word}")
            for item in neighbors_data[word]:
                print(f"  {item['word']}: {item['score']:.4f}")

    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())
