from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

from .errors import ApiError
from .model_loader import FastTextModelStore, ModelInfo


@dataclass(frozen=True)
class NeighborItem:
    word: str
    score: float


@dataclass(frozen=True)
class RelatedWordsResult:
    word: str
    k: int
    neighbors: list[NeighborItem]
    model: ModelInfo


class RelatedWordsService:
    def __init__(self, model_store: FastTextModelStore) -> None:
        self._model_store = model_store

    def find_related_words(self, word: str, k: int) -> RelatedWordsResult:
        model = self._model_store.get_model_or_none()
        if model is None:
            reason = self._model_store.load_error or "model not loaded"
            raise ApiError("MODEL_UNAVAILABLE", reason, 503)

        neighbors: list[NeighborItem] = []
        target_size = k
        requested_k = max(target_size + 5, target_size * 2)
        max_requested_k = max(200, target_size * 10)

        # fastText may return the query word itself; we over-fetch and filter.
        while len(neighbors) < target_size and requested_k <= max_requested_k:
            raw_neighbors: list[tuple[float, str]] = model.get_nearest_neighbors(word, k=requested_k)
            neighbors = self._normalize_neighbors(raw_neighbors, query_word=word, k=target_size)
            if len(neighbors) >= target_size:
                break
            requested_k *= 2

        model_info = self._model_store.get_model_info_or_none()
        if model_info is None:
            raise ApiError("MODEL_UNAVAILABLE", "model metadata unavailable", 503)

        return RelatedWordsResult(word=word, k=target_size, neighbors=neighbors, model=model_info)

    @staticmethod
    def _normalize_neighbors(
        raw_neighbors: list[tuple[float, str]],
        query_word: str,
        k: int,
    ) -> list[NeighborItem]:
        dedup: dict[str, float] = {}
        for score, neighbor_word in raw_neighbors:
            if neighbor_word == query_word:
                continue
            if not RelatedWordsService._contains_hanzi(neighbor_word):
                continue
            if neighbor_word in dedup and dedup[neighbor_word] >= score:
                continue
            dedup[neighbor_word] = score

        sorted_items = sorted(dedup.items(), key=lambda item: item[1], reverse=True)[:k]
        return [NeighborItem(word=item_word, score=float(item_score)) for item_word, item_score in sorted_items]

    @staticmethod
    def _contains_hanzi(word: str) -> bool:
        for ch in word:
            if "\u4e00" <= ch <= "\u9fff":
                return True
        return False

    def calculate_consistency_score(self, words: list[str]) -> float:
        model = self._model_store.get_model_or_none()
        if model is None:
            reason = self._model_store.load_error or "model not loaded"
            raise ApiError("MODEL_UNAVAILABLE", reason, 503)

        vectors = [model.get_word_vector(word) for word in words]
        pair_scores: list[float] = []

        for i in range(len(vectors)):
            for j in range(i + 1, len(vectors)):
                score = self._cosine_similarity(vectors[i], vectors[j])
                pair_scores.append(self._clamp_0_1(score))

        if not pair_scores:
            raise ApiError("INVALID_ARGUMENT", "at least two words are required", 400)

        return float(sum(pair_scores) / len(pair_scores))

    @staticmethod
    def _cosine_similarity(vec_a: Any, vec_b: Any) -> float:
        dot = 0.0
        norm_a = 0.0
        norm_b = 0.0
        for a, b in zip(vec_a, vec_b):
            a_val = float(a)
            b_val = float(b)
            dot += a_val * b_val
            norm_a += a_val * a_val
            norm_b += b_val * b_val

        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0

        return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))

    @staticmethod
    def _clamp_0_1(value: float) -> float:
        if value < 0.0:
            return 0.0
        if value > 1.0:
            return 1.0
        return value
