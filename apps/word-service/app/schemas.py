from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .errors import ApiError


@dataclass(frozen=True)
class RelatedWordsRequest:
    word: str
    k: int


@dataclass(frozen=True)
class ConsistencyScoreRequest:
    words: list[str]


def parse_related_words_request(payload: Any, max_k: int) -> RelatedWordsRequest:
    if not isinstance(payload, dict):
        raise ApiError("INVALID_ARGUMENT", "request body must be a JSON object", 400)

    raw_word = payload.get("word")
    if not isinstance(raw_word, str):
        raise ApiError("INVALID_ARGUMENT", "word must be a string", 400)

    word = raw_word.strip()
    if not word:
        raise ApiError("INVALID_ARGUMENT", "word must not be empty", 400)

    raw_k = payload.get("k", 10)
    if isinstance(raw_k, bool) or not isinstance(raw_k, int):
        raise ApiError("INVALID_ARGUMENT", f"k must be an integer between 1 and {max_k}", 400)
    if raw_k <= 0 or raw_k > max_k:
        raise ApiError("INVALID_ARGUMENT", f"k must be an integer between 1 and {max_k}", 400)

    return RelatedWordsRequest(word=word, k=raw_k)


def parse_consistency_score_request(payload: Any) -> ConsistencyScoreRequest:
    if not isinstance(payload, dict):
        raise ApiError("INVALID_ARGUMENT", "request body must be a JSON object", 400)

    raw_words = payload.get("words")
    if not isinstance(raw_words, list):
        raise ApiError("INVALID_ARGUMENT", "words must be an array of strings", 400)

    if len(raw_words) < 2 or len(raw_words) > 4:
        raise ApiError("INVALID_ARGUMENT", "words must contain between 2 and 4 items", 400)

    words: list[str] = []
    for raw_word in raw_words:
        if not isinstance(raw_word, str):
            raise ApiError("INVALID_ARGUMENT", "words must be an array of strings", 400)
        word = raw_word.strip()
        if not word:
            raise ApiError("INVALID_ARGUMENT", "word must not be empty", 400)
        words.append(word)

    return ConsistencyScoreRequest(words=words)
