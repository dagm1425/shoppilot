from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class HealthResponse(StrictModel):
    status: str = Field(default='ok')
    service: str = Field(default='shoppilot-ai')
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ErrorDetail(StrictModel):
    code: str
    message: str
    request_id: str = Field(alias='requestId')
    details: list[dict[str, object]] | None = None


class ErrorResponse(StrictModel):
    error: ErrorDetail


class UserContext(StrictModel):
    user_id: str = Field(min_length=1, alias='userId')
    locale: str | None = None
    auth_scope: str | None = Field(default=None, alias='authScope')


class ProductItem(StrictModel):
    product_id: str = Field(alias='productId')
    name: str
    category: str
    price_cents: int = Field(ge=0, alias='priceCents')
    currency: str = Field(default='USD', min_length=3, max_length=3)
    available: bool = True
    rating: float | None = Field(default=None, ge=0, le=5)
    short_description: str | None = Field(default=None, alias='shortDescription')


class SearchResult(StrictModel):
    product: ProductItem
    similarity_score: float = Field(ge=0, le=1, alias='similarityScore')


class FinalRecommendation(StrictModel):
    summary: str
    recommended_products: list[ProductItem] = Field(default_factory=list, alias='recommendedProducts')
    comparison_summary: str | None = Field(default=None, alias='comparisonSummary')
    follow_up_prompts: list[str] = Field(default_factory=list, alias='followUpPrompts')


class NormalizedFilters(StrictModel):
    category: str | None = None
    price_min_cents: int | None = Field(default=None, ge=0, alias='priceMinCents')
    price_max_cents: int | None = Field(default=None, ge=0, alias='priceMaxCents')
    availability: bool | None = None
    min_rating: float | None = Field(default=None, ge=0, le=5, alias='minRating')


class AgentState(StrictModel):
    thread_id: str = Field(alias='threadId')
    session_id: str = Field(alias='sessionId')
    request_id: str = Field(alias='requestId')
    query: str
    semantic_query: str = Field(alias='semanticQuery')
    retrieval_mode: Literal['structured', 'semantic', 'hybrid'] | None = Field(
        default=None,
        alias='retrievalMode',
    )
    normalized_filters: NormalizedFilters = Field(
        default_factory=NormalizedFilters,
        alias='normalizedFilters',
    )
    user_context: UserContext = Field(alias='userContext')
    retrieved_products: list[SearchResult] = Field(default_factory=list, alias='retrievedProducts')
    retry_count: int = Field(default=0, ge=0, alias='retryCount')
    recommended_product_ids: list[str] = Field(default_factory=list, alias='recommendedProductIds')
    assistant_message: str | None = Field(default=None, alias='assistantMessage')
    follow_up_prompts: list[str] = Field(default_factory=list, alias='followUpPrompts')
    final_recommendation: FinalRecommendation | None = Field(
        default=None,
        alias='finalRecommendation',
    )


class ChatRequest(StrictModel):
    message: str = Field(min_length=1)
    session_id: str = Field(min_length=1, alias='sessionId')
    user_context: UserContext = Field(alias='userContext')
    request_id: str = Field(min_length=1, alias='requestId')

    @field_validator('message')
    @classmethod
    def validate_message(cls, value: str) -> str:
        if value.strip() == '':
            raise ValueError('message must not be blank.')
        return value

    @field_validator('session_id', 'request_id')
    @classmethod
    def validate_identity_fields(cls, value: str) -> str:
        if value.strip() == '':
            raise ValueError('session and request identifiers must not be blank.')
        return value


class ChatResponse(StrictModel):
    request_id: str = Field(alias='requestId')
    session_id: str = Field(alias='sessionId')
    assistant_message: str = Field(alias='assistantMessage')
    recommendations: list[FinalRecommendation] = Field(default_factory=list)
    recommended_product_ids: list[str] = Field(default_factory=list, alias='recommendedProductIds')
    retrieval_mode: Literal['structured', 'semantic', 'hybrid'] | None = Field(
        default=None,
        alias='retrievalMode',
    )
    follow_up_prompts: list[str] = Field(default_factory=list, alias='followUpPrompts')
    model: str | None = None
    placeholder: bool = True
