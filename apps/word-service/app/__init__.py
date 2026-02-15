from __future__ import annotations

from flask import Flask, jsonify

from .config import Settings
from .errors import ApiError
from .model_loader import FastTextModelStore
from .routes import create_routes_blueprint
from .service import RelatedWordsService


def create_app() -> tuple[Flask, Settings]:
    settings = Settings.from_env()

    model_store = FastTextModelStore(settings.model_path)
    model_store.load()
    model_store.warm_up()
    related_words_service = RelatedWordsService(model_store)

    app = Flask(__name__)
    app.register_blueprint(create_routes_blueprint(settings, related_words_service))

    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": error.code,
                        "message": error.message,
                    },
                }
            ),
            error.status_code,
        )

    @app.errorhandler(Exception)
    def handle_unexpected_error(_error: Exception):
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "internal server error",
                    },
                }
            ),
            500,
        )

    return app, settings
