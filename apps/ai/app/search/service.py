from __future__ import annotations

from typing import Any

from app.config.settings import AppSettings
from app.observability import capture_exception_if_configured
from app.search.constants import RETRIEVAL_MODE_HYBRID, RETRIEVAL_MODE_SEMANTIC
from app.search.embeddings import EmbeddingClient
from app.search.models import ParsedIntent, ProductRecord, RetrievalFilters, RetrievalResult, SearchHit
from app.search.query_intent import parse_intent
from app.search.repository import ProductRepository
from app.search.vector_store import ProductVectorStore


class SemanticSearchService:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._top_k = settings.ai_search_top_k
        self._hybrid_candidate_limit = settings.ai_hybrid_candidate_limit
        self._repository = ProductRepository(database_url=settings.database_url)
        self._embedding_client: EmbeddingClient | None = None
        self._vector_store: ProductVectorStore | None = None

    def retrieve(self, message: str) -> RetrievalResult:
        intent = parse_intent(message)

        try:
            if intent.mode == RETRIEVAL_MODE_SEMANTIC:
                return self._semantic_retrieval(intent)

            if intent.mode == RETRIEVAL_MODE_HYBRID:
                return self._hybrid_retrieval(intent)

            return self._structured_retrieval(intent)
        except Exception as exc:
            capture_exception_if_configured(exc)
            raise

    def _structured_retrieval(self, intent: ParsedIntent) -> RetrievalResult:
        products = self._repository.list_products(filters=intent.filters, limit=self._top_k)
        hits = [
            SearchHit(product_id=product.product_id, similarity_score=_rank_score(index))
            for index, product in enumerate(products)
        ]
        return RetrievalResult(
            mode=intent.mode,
            filters=intent.filters,
            semantic_query=intent.semantic_query,
            hits=hits,
            products=products,
            candidate_count=len(products),
        )

    def _semantic_retrieval(self, intent: ParsedIntent) -> RetrievalResult:
        query_embedding = self._get_embedding_client().embed_text(intent.semantic_query)
        hits = self._get_vector_store().query(query_embedding=query_embedding, top_k=self._top_k, where=None)
        products = self._hydrate_products(hits)
        hydrated_hits = _hydrate_hits(products=products, hits=hits)
        return RetrievalResult(
            mode=intent.mode,
            filters=intent.filters,
            semantic_query=intent.semantic_query,
            hits=hydrated_hits,
            products=products,
            candidate_count=len(hits),
        )

    def _hybrid_retrieval(self, intent: ParsedIntent) -> RetrievalResult:
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
        hits = self._get_vector_store().query(query_embedding=query_embedding, top_k=self._top_k, where=where)

        if not hits:
            products = self._repository.get_products_by_ids(candidate_ids[: self._top_k])
            fallback_hits = [
                SearchHit(product_id=product.product_id, similarity_score=_rank_score(index))
                for index, product in enumerate(products)
            ]
            return RetrievalResult(
                mode=intent.mode,
                filters=intent.filters,
                semantic_query=intent.semantic_query,
                hits=fallback_hits,
                products=products,
                candidate_count=len(candidate_ids),
            )

        products = self._hydrate_products(hits)
        hydrated_hits = _hydrate_hits(products=products, hits=hits)
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
                api_key=self._settings.openai_api_key.get_secret_value(),
                base_url=str(self._settings.openai_base_url),
                model=self._settings.openai_embedding_model,
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
    where: dict[str, Any] = {
        'product_id': {'$in': candidate_ids},
    }

    if filters.category:
        where['category'] = {'$eq': filters.category}

    if filters.availability is not None:
        where['availability'] = {'$eq': filters.availability}

    price_range: dict[str, int] = {}
    if filters.price_min_cents is not None:
        price_range['$gte'] = filters.price_min_cents
    if filters.price_max_cents is not None:
        price_range['$lte'] = filters.price_max_cents
    if price_range:
        where['price'] = price_range

    if filters.min_rating is not None:
        where['rating'] = {'$gte': filters.min_rating}

    return where


def _hydrate_hits(*, products: list[ProductRecord], hits: list[SearchHit]) -> list[SearchHit]:
    scores = {hit.product_id: hit.similarity_score for hit in hits}
    hydrated_hits: list[SearchHit] = []
    for product in products:
        similarity = scores.get(product.product_id, 0.0)
        hydrated_hits.append(SearchHit(product_id=product.product_id, similarity_score=similarity))
    return hydrated_hits


def _rank_score(index: int) -> float:
    return max(0.0, round(1.0 - (index * 0.08), 4))
