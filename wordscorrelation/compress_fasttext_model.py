#!/usr/bin/env python3
"""
Quantize fastText model from .bin to smaller .ftz.

Python: 3.11+
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import fasttext


ROOT = Path(__file__).resolve().parent
DEFAULT_BIN_PATH = ROOT / "data" / "models" / "cc.zh.300.bin"
DEFAULT_FTZ_PATH = ROOT / "data" / "models" / "cc.zh.300.ftz"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compress fastText .bin model into quantized .ftz model."
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
        default=DEFAULT_FTZ_PATH,
        help=f"Output .ftz model path (default: {DEFAULT_FTZ_PATH}).",
    )
    parser.add_argument(
        "--cutoff",
        type=int,
        default=0,
        help="Keep top cutoff words before quantization. 0 keeps all words.",
    )
    parser.add_argument(
        "--dsub",
        type=int,
        default=2,
        help="Number of sub-vectors for product quantization. Lower means smaller file.",
    )
    parser.add_argument(
        "--qnorm",
        action="store_true",
        help="Quantize vector norms as well (usually slightly better quality).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.input.exists():
        print(f"Input model not found: {args.input}", file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)

    print(f"[INFO] Loading model: {args.input}")
    model = fasttext.load_model(str(args.input))

    print(
        f"[INFO] Quantizing model (cutoff={args.cutoff}, dsub={args.dsub}, qnorm={args.qnorm})"
    )
    model.quantize(
        cutoff=args.cutoff,
        dsub=args.dsub,
        qnorm=args.qnorm,
        retrain=False,
    )

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
