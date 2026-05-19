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
from app.search.service import SemanticSearchService, _resolve_semantic_thresholds


def _settings_stub() -> SimpleNamespace:
    return SimpleNamespace(
        ai_search_top_k=3,
        ai_hybrid_candidate_limit=100,
        ai_semantic_min_score=0.72,
        ai_semantic_relative_floor=0.88,
        database_url='postgresql://postgres:postgres@localhost:5432/shoppilot',
        embedding_provider='gemini',
        embedding_api_key=SimpleNamespace(get_secret_value=lambda: 'test-key'),
        embedding_base_url='https://generativelanguage.googleapis.com/v1beta',
        embedding_model='gemini-embedding-001',
        chroma_persist_directory='.chroma-tests',
        chroma_collection_name='test-products',
        ai_index_version='test-v1',
    )


def _product(product_id: str, price_cents: int, *, gender: str = 'women') -> ProductRecord:
    return ProductRecord(
        product_id=product_id,
        name=product_id.replace('-', ' ').title(),
        description=f'{product_id} description',
        category='tops',
        gender=gender,
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


def test_retrieve_hybrid_falls_back_to_structured_when_vector_returns_no_hits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SemanticSearchService(_settings_stub())
    filters = RetrievalFilters(category='tops', price_max_cents=3000)
    captured: dict[str, object] = {}
    candidates = ['product-a', 'product-b']
    products = [_product('product-a', 2000, gender='men'), _product('product-b', 2600, gender='unisex')]

    class _Repo:
        def list_product_ids(self, *, filters, limit):  # noqa: ANN001
            captured['filters'] = filters
            captured['limit'] = limit
            return candidates

        def list_products(self, *, filters, limit):  # noqa: ANN001
            captured['structured_limit'] = limit
            return products

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
        '$and': [
            {'product_id': {'$in': candidates}},
            {'category': {'$eq': 'tops'}},
            {'price': {'$lte': 3000}},
        ],
    }
    assert result.mode == RETRIEVAL_MODE_HYBRID
    assert captured['structured_limit'] == 3
    assert result.candidate_count == 2
    assert [product.product_id for product in result.products] == ['product-a', 'product-b']
    assert [hit.product_id for hit in result.hits] == ['product-a', 'product-b']


def test_retrieve_semantic_mode_applies_gender_constraint_from_semantic_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SemanticSearchService(_settings_stub())
    products = [
        _product('flow-sports-bra', 3600, gender='women'),
        _product('lift-seamless-tee', 3200, gender='men'),
        _product('arrival-oversized-tank', 3000, gender='unisex'),
    ]

    class _Repo:
        def get_products_by_ids(self, ids):  # noqa: ANN001
            assert ids == ['flow-sports-bra', 'lift-seamless-tee', 'arrival-oversized-tank']
            return products

    class _Embeddings:
        def embed_text(self, text: str) -> list[float]:
            assert text == 'tops for men'
            return [0.2, 0.1, 0.4]

    class _Vector:
        def query(self, *, query_embedding, top_k, where):  # noqa: ANN001
            assert query_embedding == [0.2, 0.1, 0.4]
            assert top_k == 3
            assert where is None
            return [
                SearchHit(product_id='flow-sports-bra', similarity_score=0.91),
                SearchHit(product_id='lift-seamless-tee', similarity_score=0.84),
                SearchHit(product_id='arrival-oversized-tank', similarity_score=0.81),
            ]

    service._repository = _Repo()  # type: ignore[assignment]
    service._embedding_client = _Embeddings()  # type: ignore[assignment]
    service._vector_store = _Vector()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_SEMANTIC,
            semantic_query='tops for men',
            filters=RetrievalFilters(),
        ),
    )

    result = service.retrieve('recommend tops for men')

    assert result.mode == RETRIEVAL_MODE_SEMANTIC
    assert [product.product_id for product in result.products] == [
        'lift-seamless-tee',
        'arrival-oversized-tank',
    ]
    assert [hit.product_id for hit in result.hits] == [
        'lift-seamless-tee',
        'arrival-oversized-tank',
    ]


def test_retrieve_semantic_mode_drops_weak_tail_results_via_dynamic_similarity_floor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SemanticSearchService(_settings_stub())
    products = [_product('product-a', 2800, gender='men'), _product('product-b', 3000, gender='men')]

    class _Repo:
        def get_products_by_ids(self, ids):  # noqa: ANN001
            assert ids == ['product-a']
            return [products[0]]

    class _Embeddings:
        def embed_text(self, text: str) -> list[float]:
            assert text == 'warm tops for men'
            return [0.2, 0.2, 0.2]

    class _Vector:
        def query(self, *, query_embedding, top_k, where):  # noqa: ANN001
            assert query_embedding == [0.2, 0.2, 0.2]
            assert top_k == 3
            assert where is None
            return [
                SearchHit(product_id='product-a', similarity_score=0.81),
                SearchHit(product_id='product-b', similarity_score=0.66),
            ]

    service._repository = _Repo()  # type: ignore[assignment]
    service._embedding_client = _Embeddings()  # type: ignore[assignment]
    service._vector_store = _Vector()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_SEMANTIC,
            semantic_query='warm tops for men',
            filters=RetrievalFilters(),
        ),
    )

    result = service.retrieve('warm tops for men')

    assert result.mode == RETRIEVAL_MODE_SEMANTIC
    assert result.candidate_count == 2
    assert [product.product_id for product in result.products] == ['product-a']
    assert [hit.product_id for hit in result.hits] == ['product-a']


def test_retrieve_hybrid_with_strong_structured_filters_bypasses_semantic_thresholds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SemanticSearchService(_settings_stub())
    filters = RetrievalFilters(
        category='tops',
        price_max_cents=4000,
        availability=True,
        min_rating=4.0,
    )
    products = [_product('product-a', 3200, gender='men'), _product('product-b', 3000, gender='men')]

    class _Repo:
        def list_product_ids(self, *, filters, limit):  # noqa: ANN001
            assert filters.category == 'tops'
            assert filters.price_max_cents == 4000
            assert filters.availability is True
            assert filters.min_rating == 4.0
            assert limit == 100
            return ['product-a', 'product-b']

        def get_products_by_ids(self, ids):  # noqa: ANN001
            assert ids == ['product-a', 'product-b']
            return products

    class _Embeddings:
        def embed_text(self, text: str) -> list[float]:
            assert text == 'for men'
            return [0.11, 0.22, 0.33]

    class _Vector:
        def query(self, *, query_embedding, top_k, where):  # noqa: ANN001
            assert query_embedding == [0.11, 0.22, 0.33]
            assert top_k == 3
            assert where == {
                '$and': [
                    {'product_id': {'$in': ['product-a', 'product-b']}},
                    {'category': {'$eq': 'tops'}},
                    {'availability': {'$eq': True}},
                    {'price': {'$lte': 4000}},
                    {'rating': {'$gte': 4.0}},
                ],
            }
            return [
                SearchHit(product_id='product-a', similarity_score=0.48),
                SearchHit(product_id='product-b', similarity_score=0.44),
            ]

    service._repository = _Repo()  # type: ignore[assignment]
    service._embedding_client = _Embeddings()  # type: ignore[assignment]
    service._vector_store = _Vector()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_HYBRID,
            semantic_query='for men',
            filters=filters,
        ),
    )

    result = service.retrieve('show tops for men under 40 in stock rated at least 4')

    assert result.mode == RETRIEVAL_MODE_HYBRID
    assert [product.product_id for product in result.products] == ['product-a', 'product-b']
    assert [hit.product_id for hit in result.hits] == ['product-a', 'product-b']


def test_resolve_semantic_thresholds_relaxes_hybrid_with_two_structured_filters() -> None:
    min_score, relative_floor = _resolve_semantic_thresholds(
        retrieval_mode=RETRIEVAL_MODE_HYBRID,
        structured_filter_count=2,
        base_min_score=0.72,
        base_relative_floor=0.88,
    )

    assert min_score == pytest.approx(0.612)
    assert relative_floor == pytest.approx(0.792)


def test_retrieve_hybrid_rescues_with_structured_results_when_semantic_gating_drops_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SemanticSearchService(_settings_stub())
    filters = RetrievalFilters(category='tops', availability=True)
    products = [_product('product-a', 3200, gender='men'), _product('product-b', 3400, gender='unisex')]

    class _Repo:
        def list_product_ids(self, *, filters, limit):  # noqa: ANN001
            assert filters.category == 'tops'
            assert filters.availability is True
            assert limit == 100
            return ['product-a', 'product-b', 'product-c']

        def list_products(self, *, filters, limit):  # noqa: ANN001
            assert filters.category == 'tops'
            assert filters.availability is True
            assert limit == 3
            return products

    class _Embeddings:
        def embed_text(self, text: str) -> list[float]:
            assert text == 'for men'
            return [0.12, 0.34, 0.56]

    class _Vector:
        def query(self, *, query_embedding, top_k, where):  # noqa: ANN001
            assert query_embedding == [0.12, 0.34, 0.56]
            assert top_k == 3
            assert where == {
                '$and': [
                    {'product_id': {'$in': ['product-a', 'product-b', 'product-c']}},
                    {'category': {'$eq': 'tops'}},
                    {'availability': {'$eq': True}},
                ],
            }
            return [
                SearchHit(product_id='product-a', similarity_score=0.44),
                SearchHit(product_id='product-b', similarity_score=0.41),
            ]

    service._repository = _Repo()  # type: ignore[assignment]
    service._embedding_client = _Embeddings()  # type: ignore[assignment]
    service._vector_store = _Vector()  # type: ignore[assignment]
    monkeypatch.setattr(
        'app.search.service.parse_intent',
        lambda _: ParsedIntent(
            mode=RETRIEVAL_MODE_HYBRID,
            semantic_query='for men',
            filters=filters,
        ),
    )

    result = service.retrieve('show in-stock tops for men')

    assert result.mode == RETRIEVAL_MODE_HYBRID
    assert [product.product_id for product in result.products] == ['product-a', 'product-b']
    assert [hit.product_id for hit in result.hits] == ['product-a', 'product-b']
