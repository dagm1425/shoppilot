from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.search.indexer import rebuild_product_index
from app.search.models import ProductRecord


def _settings_stub(*, batch_size: int = 2) -> SimpleNamespace:
    return SimpleNamespace(
        database_url='postgresql://postgres:postgres@localhost:5432/shoppilot',
        openai_api_key=SimpleNamespace(get_secret_value=lambda: 'test-key'),
        openai_base_url='https://api.openai.com/v1',
        openai_embedding_model='text-embedding-3-small',
        chroma_persist_directory='.chroma-tests',
        chroma_collection_name='test-products',
        ai_index_version='test-v1',
        ai_index_batch_size=batch_size,
    )


def _products() -> list[ProductRecord]:
    now = datetime.now(timezone.utc)
    return [
        ProductRecord(
            product_id='product-a',
            name='Product A',
            description='A desc',
            category='tops',
            gender='women',
            fit='regular',
            color='black',
            price_cents=2000,
            currency='USD',
            available=True,
            rating=4.2,
            stock=10,
            updated_at=now,
        ),
        ProductRecord(
            product_id='product-b',
            name='Product B',
            description='B desc',
            category='tops',
            gender='women',
            fit='regular',
            color='blue',
            price_cents=3000,
            currency='USD',
            available=True,
            rating=4.5,
            stock=8,
            updated_at=now,
        ),
        ProductRecord(
            product_id='product-c',
            name='Product C',
            description='C desc',
            category='bottoms',
            gender='men',
            fit='athletic',
            color='gray',
            price_cents=4500,
            currency='USD',
            available=False,
            rating=3.9,
            stock=0,
            updated_at=now,
        ),
    ]


def test_rebuild_product_index_batches_upserts_and_returns_count(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings_stub(batch_size=2)
    source_products = _products()
    calls: dict[str, object] = {'upserts': []}

    class _Repo:
        def __init__(self, *, database_url: str) -> None:
            assert database_url == settings.database_url

        def list_products(self) -> list[ProductRecord]:
            return source_products

    class _Embeddings:
        def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
            assert api_key == 'test-key'
            assert base_url == settings.openai_base_url
            assert model == settings.openai_embedding_model

        def embed_texts(self, documents: list[str]) -> list[list[float]]:
            return [[0.1, 0.2, 0.3] for _ in documents]

    class _VectorStore:
        def __init__(self, *, persist_directory: str, collection_name: str, index_version: str) -> None:
            assert persist_directory == settings.chroma_persist_directory
            assert collection_name == settings.chroma_collection_name
            assert index_version == settings.ai_index_version

        def reset_collection(self) -> None:
            calls['reset'] = True

        def upsert_products(self, *, products, documents, embeddings) -> None:  # noqa: ANN001
            calls['upserts'].append((len(products), len(documents), len(embeddings)))

        def count(self) -> int:
            return len(source_products)

    monkeypatch.setattr('app.search.indexer.ProductRepository', _Repo)
    monkeypatch.setattr('app.search.indexer.EmbeddingClient', _Embeddings)
    monkeypatch.setattr('app.search.indexer.ProductVectorStore', _VectorStore)

    count = rebuild_product_index(settings)

    assert count == 3
    assert calls['reset'] is True
    assert calls['upserts'] == [(2, 2, 2), (1, 1, 1)]


def test_rebuild_product_index_raises_when_source_products_are_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings_stub()
    captured: list[Exception] = []

    class _Repo:
        def __init__(self, *, database_url: str) -> None:
            assert database_url == settings.database_url

        def list_products(self) -> list[ProductRecord]:
            return []

    class _Embeddings:
        def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
            assert api_key == 'test-key'
            assert base_url == settings.openai_base_url
            assert model == settings.openai_embedding_model

    class _VectorStore:
        def __init__(self, *, persist_directory: str, collection_name: str, index_version: str) -> None:
            assert persist_directory == settings.chroma_persist_directory
            assert collection_name == settings.chroma_collection_name
            assert index_version == settings.ai_index_version

    monkeypatch.setattr('app.search.indexer.ProductRepository', _Repo)
    monkeypatch.setattr('app.search.indexer.EmbeddingClient', _Embeddings)
    monkeypatch.setattr('app.search.indexer.ProductVectorStore', _VectorStore)
    monkeypatch.setattr('app.search.indexer.capture_exception_if_configured', captured.append)

    with pytest.raises(RuntimeError, match='No products found in PostgreSQL'):
        rebuild_product_index(settings)

    assert len(captured) == 1
