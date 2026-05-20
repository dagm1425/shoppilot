from __future__ import annotations

import re
from typing import Any

from app.config.settings import AppSettings
from app.observability import capture_sentry_exception
from app.search.constants import RETRIEVAL_MODE_HYBRID, RETRIEVAL_MODE_SEMANTIC
from app.search.embeddings import EmbeddingClient
from app.search.models import (
    ParsedIntent,
    ProductRecord,
    RetrievalFilters,
    RetrievalMode,
    RetrievalResult,
    SearchHit,
)
from app.search.query_intent import parse_intent
from app.search.repository import ProductRepository
from app.search.vector_store import ProductVectorStore

_SEMANTIC_PRECISION_TOKENS = {
    'warm',
    'cold',
    'winter',
    'summer',
    'hot-weather',
    'cold-weather',
    'cool-weather',
    'breathable',
    'insulated',
    'fleece',
    'merino',
    'layer',
}

_LOW_SIGNAL_SEMANTIC_TOKENS = {
    'for',
    'men',
    'male',
    'womens',
    'women',
    'female',
    'unisex',
    'budget',
    'friendly',
    'premium',
    'mid',
    'range',
    'show',
    'find',
    'recommend',
    'options',
    'option',
    'items',
    'item',
    'products',
    'product',
    'stock',
    'available',
    'in',
    'out',
    'tops',
    'top',
    'bottoms',
    'bottom',
    'how',
    'about',
}

_WARM_INTENT_TOKENS = {
    'warm',
    'cold',
    'winter',
    'insulated',
    'fleece',
    'merino',
    'thermal',
    'layer',
}

_COOLING_INTENT_TOKENS = {
    'breathable',
    'hot-weather',
    'summer',
    'lightweight',
    'airflow',
    'ventilated',
}

_WARM_PRODUCT_POSITIVE_PATTERNS = (
    r'\bcold-weather\b',
    r'\bwinter\b',
    r'\binsulated\b',
    r'\bfleece\b',
    r'\bmerino\b',
    r'\bthermal\b',
    r'\bwarm\b(?!-weather)',
)


class SemanticSearchService:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._top_k = settings.ai_search_top_k
        self._hybrid_candidate_limit = settings.ai_hybrid_candidate_limit
        self._semantic_min_score = settings.ai_semantic_min_score
        self._semantic_relative_floor = settings.ai_semantic_relative_floor
        self._repository = ProductRepository(database_url=settings.database_url)
        self._embedding_client: EmbeddingClient | None = None
        self._vector_store: ProductVectorStore | None = None

    def retrieve(self, message: str) -> RetrievalResult:
        intent = parse_intent(message)
        return self.retrieve_for_intent(intent)

    def retrieve_for_intent(
        self,
        intent: ParsedIntent,
        *,
        top_k: int | None = None,
    ) -> RetrievalResult:
        resolved_top_k = top_k or self._top_k

        try:
            if intent.mode == RETRIEVAL_MODE_SEMANTIC:
                return self._semantic_retrieval(intent, top_k=resolved_top_k)

            if intent.mode == RETRIEVAL_MODE_HYBRID:
                return self._hybrid_retrieval(intent, top_k=resolved_top_k)

            return self._structured_retrieval(intent, top_k=resolved_top_k)
        except Exception as exc:
            capture_sentry_exception(exc)
            raise

    def retrieve_with_plan(
        self,
        *,
        retrieval_mode: RetrievalMode,
        filters: RetrievalFilters,
        semantic_query: str,
        top_k: int | None = None,
    ) -> RetrievalResult:
        planned_intent = ParsedIntent(
            mode=retrieval_mode,
            semantic_query=semantic_query,
            filters=filters,
        )
        return self.retrieve_for_intent(planned_intent, top_k=top_k)

    def _structured_retrieval(self, intent: ParsedIntent, *, top_k: int) -> RetrievalResult:
        products = self._repository.list_products(filters=intent.filters, limit=top_k)
        hits = [
            SearchHit(product_id=product.product_id, similarity_score=_rank_score(index))
            for index, product in enumerate(products)
        ]
        if intent.filters.gender is None:
            products, hits = _apply_gender_constraint(
                products=products,
                hits=hits,
                semantic_query=intent.semantic_query,
            )
        return RetrievalResult(
            mode=intent.mode,
            filters=intent.filters,
            semantic_query=intent.semantic_query,
            hits=hits,
            products=products,
            candidate_count=len(products),
        )

    def _semantic_retrieval(self, intent: ParsedIntent, *, top_k: int) -> RetrievalResult:
        query_embedding = self._get_embedding_client().embed_text(intent.semantic_query)
        min_score, relative_floor = _resolve_semantic_thresholds(
            retrieval_mode=intent.mode,
            structured_filter_count=intent.filters.count(),
            base_min_score=self._semantic_min_score,
            base_relative_floor=self._semantic_relative_floor,
        )
        hits = self._get_vector_store().query(query_embedding=query_embedding, top_k=top_k, where=None)
        strong_hits = _filter_semantic_hits(
            hits=hits,
            min_score=min_score,
            relative_floor=relative_floor,
        )
        products = self._hydrate_products(strong_hits)
        hydrated_hits = _hydrate_hits(products=products, hits=strong_hits)
        if intent.filters.gender is None:
            products, hydrated_hits = _apply_gender_constraint(
                products=products,
                hits=hydrated_hits,
                semantic_query=intent.semantic_query,
            )
        return RetrievalResult(
            mode=intent.mode,
            filters=intent.filters,
            semantic_query=intent.semantic_query,
            hits=hydrated_hits,
            products=products,
            candidate_count=len(hits),
        )

    def _hybrid_retrieval(self, intent: ParsedIntent, *, top_k: int) -> RetrievalResult:
        candidate_ids = self._repository.list_product_ids(
            filters=intent.filters,
            limit=self._hybrid_candidate_limit,
        )
        if len(candidate_ids) == 0:
            return RetrievalResult(
                mode=intent.mode,
                filters=intent.filters,
                semantic_query=intent.semantic_query,
                hits=[],
                products=[],
                candidate_count=0,
            )

        where = _build_vector_where(filters=intent.filters, candidate_ids=candidate_ids)
        query_embedding = self._get_embedding_client().embed_text(intent.semantic_query)
        min_score, relative_floor = _resolve_semantic_thresholds(
            retrieval_mode=intent.mode,
            structured_filter_count=intent.filters.count(),
            base_min_score=self._semantic_min_score,
            base_relative_floor=self._semantic_relative_floor,
        )
        hits = self._get_vector_store().query(query_embedding=query_embedding, top_k=top_k, where=where)

        strong_hits = _filter_semantic_hits(
            hits=hits,
            min_score=min_score,
            relative_floor=relative_floor,
        )
        if not strong_hits:
            if intent.filters.count() > 0 and _allows_structured_hybrid_rescue(intent.semantic_query):
                # Hybrid rescue: when semantic gating over-prunes, return deterministic
                # structured results instead of empty.
                return self._structured_retrieval(intent, top_k=top_k)
            return RetrievalResult(
                mode=intent.mode,
                filters=intent.filters,
                semantic_query=intent.semantic_query,
                hits=[],
                products=[],
                candidate_count=len(candidate_ids),
            )

        products = self._hydrate_products(strong_hits)
        hydrated_hits = _hydrate_hits(products=products, hits=strong_hits)
        if intent.filters.gender is None:
            products, hydrated_hits = _apply_gender_constraint(
                products=products,
                hits=hydrated_hits,
                semantic_query=intent.semantic_query,
            )
        products, hydrated_hits = _apply_semantic_precision_guard(
            products=products,
            hits=hydrated_hits,
            semantic_query=intent.semantic_query,
        )
        if not products:
            if intent.filters.count() > 0 and _allows_structured_hybrid_rescue(intent.semantic_query):
                return self._structured_retrieval(intent, top_k=top_k)
            return RetrievalResult(
                mode=intent.mode,
                filters=intent.filters,
                semantic_query=intent.semantic_query,
                hits=[],
                products=[],
                candidate_count=len(candidate_ids),
            )
        return RetrievalResult(
            mode=intent.mode,
            filters=intent.filters,
            semantic_query=intent.semantic_query,
            hits=hydrated_hits,
            products=products,
            candidate_count=len(candidate_ids),
        )

    def _hydrate_products(self, hits: list[SearchHit]) -> list[ProductRecord]:
        product_ids = [hit.product_id for hit in hits]
        return self._repository.get_products_by_ids(product_ids)

    def _get_embedding_client(self) -> EmbeddingClient:
        if self._embedding_client is None:
            self._embedding_client = EmbeddingClient(
                provider=self._settings.embedding_provider,
                api_key=self._settings.embedding_api_key.get_secret_value(),
                base_url=str(self._settings.embedding_base_url),
                model=self._settings.embedding_model,
            )

        return self._embedding_client

    def _get_vector_store(self) -> ProductVectorStore:
        if self._vector_store is None:
            self._vector_store = ProductVectorStore(
                persist_directory=self._settings.chroma_persist_directory,
                collection_name=self._settings.chroma_collection_name,
                index_version=self._settings.ai_index_version,
            )

        return self._vector_store


def _build_vector_where(filters: RetrievalFilters, candidate_ids: list[str]) -> dict[str, Any]:
    conditions: list[dict[str, Any]] = [
        {'product_id': {'$in': candidate_ids}},
    ]

    if filters.category:
        conditions.append({'category': {'$eq': filters.category}})

    if filters.gender:
        conditions.append({'gender': {'$eq': filters.gender}})

    if filters.thermal_profile:
        conditions.append({'thermal_profile': {'$eq': filters.thermal_profile}})

    if filters.availability is not None:
        conditions.append({'availability': {'$eq': filters.availability}})

    price_range: dict[str, int] = {}
    if filters.price_min_cents is not None:
        price_range['$gte'] = filters.price_min_cents
    if filters.price_max_cents is not None:
        price_range['$lte'] = filters.price_max_cents
    if price_range:
        conditions.append({'price': price_range})

    if filters.min_rating is not None:
        conditions.append({'rating': {'$gte': filters.min_rating}})

    # If only one condition, return it directly; otherwise wrap with $and
    if len(conditions) == 1:
        return conditions[0]
    return {'$and': conditions}


def _hydrate_hits(*, products: list[ProductRecord], hits: list[SearchHit]) -> list[SearchHit]:
    scores = {hit.product_id: hit.similarity_score for hit in hits}
    hydrated_hits: list[SearchHit] = []
    for product in products:
        similarity = scores.get(product.product_id, 0.0)
        hydrated_hits.append(SearchHit(product_id=product.product_id, similarity_score=similarity))
    return hydrated_hits


def _rank_score(index: int) -> float:
    return max(0.0, round(1.0 - (index * 0.08), 4))


def _filter_semantic_hits(
    *,
    hits: list[SearchHit],
    min_score: float,
    relative_floor: float,
) -> list[SearchHit]:
    if not hits:
        return []

    strongest_score = max(hit.similarity_score for hit in hits)
    dynamic_floor = max(min_score, strongest_score * relative_floor)
    return [
        hit
        for hit in hits
        if hit.similarity_score >= dynamic_floor
    ]


def _allows_structured_hybrid_rescue(semantic_query: str) -> bool:
    lowered = semantic_query.lower().strip()
    if lowered == '':
        return True

    tokens = re.findall(r"[a-z]+(?:-[a-z]+)?", lowered)
    if any(token in _SEMANTIC_PRECISION_TOKENS for token in tokens):
        return False

    meaningful_tokens = [
        token
        for token in tokens
        if token not in _LOW_SIGNAL_SEMANTIC_TOKENS
    ]
    return len(meaningful_tokens) <= 1


def _apply_semantic_precision_guard(
    *,
    products: list[ProductRecord],
    hits: list[SearchHit],
    semantic_query: str,
) -> tuple[list[ProductRecord], list[SearchHit]]:
    precision_tokens = _extract_precision_tokens(semantic_query)
    if not precision_tokens:
        return products, hits

    score_by_id = {hit.product_id: hit.similarity_score for hit in hits}
    filtered_products = [
        product
        for product in products
        if _product_matches_precision_tokens(product, precision_tokens)
    ]
    filtered_hits = [
        SearchHit(
            product_id=product.product_id,
            similarity_score=score_by_id.get(product.product_id, 0.0),
        )
        for product in filtered_products
    ]
    return filtered_products, filtered_hits


def _extract_precision_tokens(query: str) -> set[str]:
    tokens = set(re.findall(r"[a-z]+(?:-[a-z]+)?", query.lower()))
    return {
        token
        for token in tokens
        if token in _SEMANTIC_PRECISION_TOKENS
    }


def _product_matches_precision_tokens(product: ProductRecord, precision_tokens: set[str]) -> bool:
    text = f'{product.name} {product.description}'.lower()
    if _is_warm_intent(precision_tokens):
        return any(re.search(pattern, text) for pattern in _WARM_PRODUCT_POSITIVE_PATTERNS)
    return any(
        re.search(rf'\b{re.escape(token)}\b', text)
        for token in precision_tokens
    )


def _is_warm_intent(precision_tokens: set[str]) -> bool:
    has_warm = any(token in _WARM_INTENT_TOKENS for token in precision_tokens)
    has_cooling = any(token in _COOLING_INTENT_TOKENS for token in precision_tokens)
    return has_warm and not has_cooling


def _resolve_semantic_thresholds(
    *,
    retrieval_mode: RetrievalMode,
    structured_filter_count: int,
    base_min_score: float,
    base_relative_floor: float,
) -> tuple[float, float]:
    # For structured-heavy hybrid queries, structured filters already provide the precision boundary.
    # Bypassing semantic thresholds avoids over-pruning valid matches.
    if retrieval_mode == RETRIEVAL_MODE_HYBRID and structured_filter_count >= 3:
        return 0.0, 0.0

    # For lighter hybrid queries (two structured filters), keep semantic guidance but
    # relax thresholds to reduce phrasing-sensitivity failures.
    if retrieval_mode == RETRIEVAL_MODE_HYBRID and structured_filter_count == 2:
        return max(0.0, base_min_score * 0.85), max(0.0, base_relative_floor * 0.90)

    return base_min_score, base_relative_floor


def _apply_gender_constraint(
    *,
    products: list[ProductRecord],
    hits: list[SearchHit],
    semantic_query: str,
) -> tuple[list[ProductRecord], list[SearchHit]]:
    gender_constraint = _infer_gender_from_query(semantic_query)
    if gender_constraint is None:
        return products, hits

    score_by_id = {hit.product_id: hit.similarity_score for hit in hits}
    filtered_products = [
        product
        for product in products
        if _matches_gender_constraint(product.gender, gender_constraint)
    ]
    filtered_hits = [
        SearchHit(
            product_id=product.product_id,
            similarity_score=score_by_id.get(product.product_id, 0.0),
        )
        for product in filtered_products
    ]
    return filtered_products, filtered_hits


def _infer_gender_from_query(query: str) -> str | None:
    lowered = query.lower()
    if re.search(r"\b(unisex)\b", lowered):
        return 'unisex'
    if re.search(r"\b(men|mens|men's|male)\b", lowered):
        return 'male'
    if re.search(r"\b(women|womens|women's|female)\b", lowered):
        return 'female'
    return None


def _matches_gender_constraint(raw_gender: str, constraint: str) -> bool:
    normalized = raw_gender.strip().lower()

    if constraint == 'male':
        return normalized in {'male', 'men', 'mens', 'unisex'}
    if constraint == 'female':
        return normalized in {'female', 'women', 'womens', 'unisex'}
    if constraint == 'men':
        return normalized in {'male', 'men', 'mens', 'unisex'}
    if constraint == 'women':
        return normalized in {'female', 'women', 'womens', 'unisex'}
    if constraint == 'unisex':
        return normalized == 'unisex'
    return True
