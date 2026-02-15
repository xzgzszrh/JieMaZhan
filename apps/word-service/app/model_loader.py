from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fasttext


@dataclass(frozen=True)
class ModelInfo:
    path: str
    dimension: int


class FastTextModelStore:
    def __init__(self, model_path: Path) -> None:
        self._model_path = model_path
        self._model: Any | None = None
        self._load_error: str | None = None

    def load(self) -> None:
        try:
            if not self._model_path.exists():
                self._load_error = f"model file not found: {self._model_path}"
                self._model = None
                return
            self._model = fasttext.load_model(str(self._model_path))
            self._load_error = None
        except Exception as exc:  # noqa: BLE001
            self._model = None
            self._load_error = str(exc)

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def get_model_or_none(self) -> Any | None:
        return self._model

    def get_model_info_or_none(self) -> ModelInfo | None:
        if self._model is None:
            return None
        return ModelInfo(path=str(self._model_path), dimension=int(self._model.get_dimension()))
