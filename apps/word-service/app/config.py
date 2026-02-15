from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REDUCED_MODEL_PATH = ROOT / "models" / "cc.zh.100.bin"
DEFAULT_FULL_MODEL_PATH = ROOT / "models" / "cc.zh.300.bin"


def _resolve_default_model_path() -> Path:
    if DEFAULT_REDUCED_MODEL_PATH.exists():
        return DEFAULT_REDUCED_MODEL_PATH
    return DEFAULT_FULL_MODEL_PATH


@dataclass(frozen=True)
class Settings:
    port: int
    max_k: int
    model_path: Path
    service_name: str = "word-service"

    @classmethod
    def from_env(cls) -> "Settings":
        raw_port = os.getenv("PORT", "4201")
        raw_max_k = os.getenv("MAX_K", "50")
        raw_model_path = os.getenv("FASTTEXT_MODEL_PATH", "").strip()

        port = int(raw_port)
        max_k = int(raw_max_k)
        model_path = Path(raw_model_path) if raw_model_path else _resolve_default_model_path()

        if max_k <= 0:
            raise ValueError("MAX_K must be a positive integer")
        if port <= 0:
            raise ValueError("PORT must be a positive integer")

        return cls(port=port, max_k=max_k, model_path=model_path)
