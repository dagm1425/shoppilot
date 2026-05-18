from __future__ import annotations

from functools import lru_cache

from app.config.settings import get_settings
from app.search.service import SemanticSearchService


@lru_cache(maxsize=1)
def get_search_service() -> SemanticSearchService:
    settings = get_settings()
    return SemanticSearchService(settings)
