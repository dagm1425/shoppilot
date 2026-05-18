from __future__ import annotations

import logging
from time import perf_counter

from app.config.settings import AppSettings
from app.observability import capture_sentry_exception
from app.search.embeddings import EmbeddingClient
from app.search.repository import ProductRepository
from app.search.text_builder import build_embedding_text
from app.search.vector_store import ProductVectorStore

logger = logging.getLogger(__name__)


def rebuild_product_index(settings: AppSettings) -> int:
    started_at = perf_counter()

    repository = ProductRepository(database_url=settings.database_url)
    embedding_client = EmbeddingClient(
        api_key=settings.openai_api_key.get_secret_value(),
        base_url=str(settings.openai_base_url),
        model=settings.openai_embedding_model,
    )
    vector_store = ProductVectorStore(
        persist_directory=settings.chroma_persist_directory,
        collection_name=settings.chroma_collection_name,
        index_version=settings.ai_index_version,
    )

    try:
        products = repository.list_products()
        if len(products) == 0:
            raise RuntimeError('No products found in PostgreSQL. Seed product data before rebuilding the index.')

        vector_store.reset_collection()

        for batch_start in range(0, len(products), settings.ai_index_batch_size):
            batch = products[batch_start:batch_start + settings.ai_index_batch_size]
            documents = [build_embedding_text(product) for product in batch]
            embeddings = embedding_client.embed_texts(documents)
            vector_store.upsert_products(products=batch, documents=documents, embeddings=embeddings)

        # future: incremental reindex - support partial upserts when product catalog updates
        indexed_count = vector_store.count()
        duration_ms = int((perf_counter() - started_at) * 1000)

        logger.info(
            {
                'event': 'ai.index_rebuild_completed',
                'indexed_count': indexed_count,
                'duration_ms': duration_ms,
                'embedding_model': settings.openai_embedding_model,
                'index_version': settings.ai_index_version,
                'collection_name': settings.chroma_collection_name,
            },
        )

        return indexed_count
    except Exception as exc:
        capture_sentry_exception(exc)
        logger.exception(
            {
                'event': 'ai.index_rebuild_failed',
                'collection_name': settings.chroma_collection_name,
                'index_version': settings.ai_index_version,
            },
        )
        raise
