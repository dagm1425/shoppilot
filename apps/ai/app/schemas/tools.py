from __future__ import annotations

from typing import Literal

from pydantic import Field

from .contracts import NormalizedFilters, ProductItem, SearchResult, StrictModel


class SearchItemsToolInput(StrictModel):
    query: str = Field(min_length=1)
    retrieval_mode: Literal['structured', 'semantic', 'hybrid'] = Field(alias='retrievalMode')
    top_k: int = Field(default=5, ge=1, le=20, alias='topK')
    category: str | None = None
    price_min_cents: int | None = Field(default=None, ge=0, alias='priceMinCents')
    price_max_cents: int | None = Field(default=None, ge=0, alias='priceMaxCents')
    availability: bool | None = None
    min_rating: float | None = Field(default=None, ge=0, le=5, alias='minRating')


class SearchItemsToolOutput(StrictModel):
    retrieval_mode: Literal['structured', 'semantic', 'hybrid'] = Field(alias='retrievalMode')
    semantic_query: str = Field(alias='semanticQuery')
    normalized_filters: NormalizedFilters = Field(alias='normalizedFilters')
    items: list[SearchResult] = Field(default_factory=list)
    total_matches: int = Field(default=0, ge=0, alias='totalMatches')


class GetItemDetailsToolInput(StrictModel):
    product_id: str = Field(min_length=1, alias='productId')


class GetItemDetailsToolOutput(StrictModel):
    item: ProductItem | None = None


class CompareItemsToolInput(StrictModel):
    product_ids: list[str] = Field(min_length=2, max_length=4, alias='productIds')


class CompareItemsToolOutput(StrictModel):
    summary: str
    compared_items: list[ProductItem] = Field(default_factory=list, alias='comparedItems')
