from __future__ import annotations

import time

from flask import Blueprint, jsonify, request

from .config import Settings
from .schemas import parse_consistency_score_request, parse_related_words_request
from .service import RelatedWordsService


def create_routes_blueprint(settings: Settings, related_words_service: RelatedWordsService) -> Blueprint:
    bp = Blueprint("word_service", __name__)

    @bp.get("/health")
    def health() -> tuple[dict[str, object], int]:
        return {
            "ok": True,
            "service": settings.service_name,
            "ts": int(time.time() * 1000),
        }, 200

    @bp.post("/api/v1/related-words")
    def related_words():
        payload = request.get_json(silent=True)
        req = parse_related_words_request(payload, settings.max_k)
        result = related_words_service.find_related_words(word=req.word, k=req.k)
        return jsonify(
            {
                "word": result.word,
                "k": result.k,
                "neighbors": [{"word": item.word, "score": item.score} for item in result.neighbors],
                "model": {
                    "path": result.model.path,
                    "dimension": result.model.dimension,
                },
            }
        )

    @bp.post("/api/v1/consistency-score")
    def consistency_score():
        payload = request.get_json(silent=True)
        req = parse_consistency_score_request(payload)
        score = related_words_service.calculate_consistency_score(req.words)
        return jsonify({"score": score})

    return bp
