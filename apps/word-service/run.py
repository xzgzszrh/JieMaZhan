#!/usr/bin/env python3
from __future__ import annotations

import os

from app import create_app


def main() -> None:
    os.environ.setdefault("PYTHONUTF8", "1")
    app, settings = create_app()
    app.run(host="0.0.0.0", port=settings.port)


if __name__ == "__main__":
    main()
