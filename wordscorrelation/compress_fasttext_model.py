#!/usr/bin/env python3
"""
Compress fastText word vectors by reducing embedding dimension.

Note:
- fastText Python `quantize()` only supports supervised models.
- `cc.zh.300.bin` is an unsupervised word-vector model, so we use `reduce_model`.

Python: 3.11+
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import fasttext
import fasttext.util


ROOT = Path(__file__).resolve().parent
DEFAULT_BIN_PATH = ROOT / "data" / "models" / "cc.zh.300.bin"
DEFAULT_REDUCED_BIN_PATH = ROOT / "data" / "models" / "cc.zh.100.bin"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compress fastText .bin word vectors by reducing dimensions."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_BIN_PATH,
        help=f"Input .bin model path (default: {DEFAULT_BIN_PATH}).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_REDUCED_BIN_PATH,
        help=f"Output reduced .bin model path (default: {DEFAULT_REDUCED_BIN_PATH}).",
    )
    parser.add_argument(
        "--dim",
        type=int,
        default=100,
        help="Target embedding dimension. Smaller means smaller model (e.g. 200/100/50).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.input.exists():
        print(f"Input model not found: {args.input}", file=sys.stderr)
        return 2
    if args.dim <= 0:
        print(f"Invalid --dim: {args.dim}", file=sys.stderr)
        return 3

    args.output.parent.mkdir(parents=True, exist_ok=True)

    print(f"[INFO] Loading model: {args.input}")
    model = fasttext.load_model(str(args.input))

    original_dim = model.get_dimension()
    if args.dim >= original_dim:
        print(
            f"[WARN] Target dim ({args.dim}) >= original dim ({original_dim}); no compression benefit."
        )
    print(f"[INFO] Reducing dimension: {original_dim} -> {args.dim}")
    fasttext.util.reduce_model(model, args.dim)

    print(f"[INFO] Saving compressed model: {args.output}")
    model.save_model(str(args.output))

    in_size = args.input.stat().st_size
    out_size = args.output.stat().st_size
    ratio = out_size / in_size if in_size else 0.0
    print(f"[OK] Input size : {in_size} bytes")
    print(f"[OK] Output size: {out_size} bytes")
    print(f"[OK] Ratio      : {ratio:.2%}")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())
