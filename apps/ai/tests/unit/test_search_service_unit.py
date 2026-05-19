from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.search.constants import (
    RETRIEVAL_MODE_HYBRID,
    RETRIEVAL_MODE_SEMANTIC,
    RETRIEVAL_MODE_STRUCTURED,
)
from app.search.models import ParsedIntent, ProductRecord, RetrievalFilters, SearchHit
from app.search.service import SemanticSearchService


def _settings_stub() -> SimpleNamespace:
    return SimpleNamespace(
        ai_search_top_k=3,
        ai_hybrid_candidate_limit=100,
        database_url='postgresql://postgres:postgres@localhost:5432/shoppilot',
        embedding_provider='gemini',
        embedding_api_key=SimpleNamespace(get_secret_value=lambda: 'test-key'),
        embedding_base_url='https://generativelanguage.googleapis.com/v1beta',
        embedding_model='gemini-embedding-001',
        chroma_persist_directory='.chroma-tests',
        chroma_collection_name='test-products',
        ai_index_version='test-v1',
    )


def _product(product_id: str, price_cents: int) -> ProductRecord:
    return ProductRecord(
        product_id=product_id,
        name=product_id.replace('-', ' ').title(),
        description=f'{product_id} description',
        category='tops',
        gender='women',
        fit='regular',
        color='black',
        price_cents=price_cents,
        currency='USD',
        available=True,
        rating=4.5,
        stock=10,
        updated_at=datetime.now(timezone.utc),
    )


def test_retrieve_structured_mode_uses_repository_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    service = SemanticSearchService(_settings_stub())
    products = [_product('product-a', 2000), _product('product-b', 2600)]
    filters = RetrievalFilters(category='tops', availability=True)
    captured: dict[str, object] = {}

    class _Repo:
        def list_products(self, *, filters, limit):  # noqa: ANN001
            captured['filters'] = filters
            captured['limit'] = limit
            return products

    service._repository = _Repo()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_STRUCTURED,
            semantic_query='tops',
            filters=filters,
        ),
    )

    result = service.retrieve('tops in stock')

    assert captured['filters'] == filters
    assert captured['limit'] == 3
    assert result.mode == RETRIEVAL_MODE_STRUCTURED
    assert result.candidate_count == 2
    assert [hit.product_id for hit in result.hits] == ['product-a', 'product-b']
    assert [hit.similarity_score for hit in result.hits] == [1.0, 0.92]


def test_retrieve_semantic_mode_hydrates_products_from_hit_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    service = SemanticSearchService(_settings_stub())
    products = [_product('product-b', 2600), _product('product-a', 2000)]

    class _Repo:
        def get_products_by_ids(self, ids):  # noqa: ANN001
            assert ids == ['product-b', 'product-a']
            return products

    class _Embeddings:
        def embed_text(self, text: str) -> list[float]:
            assert text == 'breathable gym top'
            return [0.1, 0.2, 0.3]

    class _Vector:
        def query(self, *, query_embedding, top_k, where):  # noqa: ANN001
            assert query_embedding == [0.1, 0.2, 0.3]
            assert top_k == 3
            assert where is None
            return [
                SearchHit(product_id='product-b', similarity_score=0.81),
                SearchHit(product_id='product-a', similarity_score=0.73),
            ]

    service._repository = _Repo()  # type: ignore[assignment]
    service._embedding_client = _Embeddings()  # type: ignore[assignment]
    service._vector_store = _Vector()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_SEMANTIC,
            semantic_query='breathable gym top',
            filters=RetrievalFilters(),
        ),
    )

    result = service.retrieve('recommend breathable gym top')

    assert result.mode == RETRIEVAL_MODE_SEMANTIC
    assert result.candidate_count == 2
    assert [product.product_id for product in result.products] == ['product-b', 'product-a']
    assert [hit.similarity_score for hit in result.hits] == [0.81, 0.73]


def test_retrieve_hybrid_fallback_returns_ranked_candidates_when_vector_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SemanticSearchService(_settings_stub())
    filters = RetrievalFilters(category='tops', price_max_cents=3000)
    captured: dict[str, object] = {}
    candidates = ['product-a', 'product-b']

    class _Repo:
        def list_product_ids(self, *, filters, limit):  # noqa: ANN001
            captured['filters'] = filters
            captured['limit'] = limit
            return candidates

        def get_products_by_ids(self, ids):  # noqa: ANN001
            assert ids == candidates
            return [_product('product-a', 2000), _product('product-b', 2600)]

    class _Embeddings:
        def embed_text(self, text: str) -> list[float]:
            assert text == 'breathable'
            return [0.3, 0.2, 0.1]

    class _Vector:
        def query(self, *, query_embedding, top_k, where):  # noqa: ANN001
            captured['where'] = where
            assert query_embedding == [0.3, 0.2, 0.1]
            assert top_k == 3
            return []

    service._repository = _Repo()  # type: ignore[assignment]
    service._embedding_client = _Embeddings()  # type: ignore[assignment]
    service._vector_store = _Vector()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_HYBRID,
            semantic_query='breathable',
            filters=filters,
        ),
    )

    result = service.retrieve('tops under $30 breathable')

    assert captured['filters'] == filters
    assert captured['limit'] == 100
    assert captured['where'] == {
        'product_id': {'$in': candidates},
        'category': {'$eq': 'tops'},
        'price': {'$lte': 3000},
    }
    assert result.mode == RETRIEVAL_MODE_HYBRID
    assert result.candidate_count == 2
    assert [hit.similarity_score for hit in result.hits] == [1.0, 0.92]
