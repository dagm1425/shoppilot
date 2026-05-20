from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.search.constants import (
    RETRIEVAL_MODE_HYBRID,
    RETRIEVAL_MODE_SEMANTIC,
    RETRIEVAL_MODE_STRUCTURED,
)

RetrievalMode = Literal[
    RETRIEVAL_MODE_STRUCTURED,
    RETRIEVAL_MODE_SEMANTIC,
    RETRIEVAL_MODE_HYBRID,
]


@dataclass(frozen=True)
class ProductRecord:
    product_id: str
    name: str
    description: str
    category: str
    gender: str
    thermal_profile: str
    fit: str
    color: str
    price_cents: int
    currency: str
    available: bool
    rating: float
    stock: int
    updated_at: datetime


@dataclass(frozen=True)
class RetrievalFilters:
    category: str | None = None
    gender: str | None = None
    thermal_profile: str | None = None
    price_min_cents: int | None = None
    price_max_cents: int | None = None
    availability: bool | None = None
    min_rating: float | None = None

    def count(self) -> int:
        return sum(
            value is not None
            for value in (
                self.category,
                self.gender,
                self.thermal_profile,
                self.price_min_cents,
                self.price_max_cents,
                self.availability,
                self.min_rating,
            )
        )


@dataclass(frozen=True)
class ParsedIntent:
    mode: RetrievalMode
    semantic_query: str
    filters: RetrievalFilters


@dataclass(frozen=True)
class SearchHit:
    product_id: str
    similarity_score: float


@dataclass(frozen=True)
class RetrievalResult:
    mode: RetrievalMode
    filters: RetrievalFilters
    semantic_query: str
    hits: list[SearchHit]
    products: list[ProductRecord]
    candidate_count: int
