from __future__ import annotations

import math
from typing import Any

import chromadb
from chromadb.config import Settings

from app.search.models import ProductRecord, SearchHit


class ProductVectorStore:
    def __init__(
        self,
        *,
        persist_directory: str,
        collection_name: str,
        index_version: str,
    ) -> None:
        self._client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection_name = collection_name
        self._index_version = index_version
        self._collection = self._client.get_or_create_collection(
            name=self._collection_name,
            embedding_function=None,
            metadata={'hnsw:space': 'cosine'},
        )

    def reset_collection(self) -> None:
        try:
            self._client.delete_collection(name=self._collection_name)
        except Exception:
            # Collection may not exist yet.
            pass

        self._collection = self._client.get_or_create_collection(
            name=self._collection_name,
            embedding_function=None,
            metadata={'hnsw:space': 'cosine'},
        )

    def upsert_products(
        self,
        *,
        products: list[ProductRecord],
        documents: list[str],
        embeddings: list[list[float]],
    ) -> None:
        if not products:
            return

        metadatas = [
            {
                'product_id': product.product_id,
                'category': product.category,
                'gender': product.gender,
                'thermal_profile': product.thermal_profile,
                'price': product.price_cents,
                'availability': product.available,
                'rating': product.rating,
                'index_version': self._index_version,
                'updated_at': product.updated_at.isoformat(),
            }
            for product in products
        ]

        self._collection.upsert(
            ids=[product.product_id for product in products],
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def query(
        self,
        *,
        query_embedding: list[float],
        top_k: int,
        where: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        result = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
            include=['distances', 'metadatas'],
        )

        ids = result.get('ids', [[]])
        distances = result.get('distances', [[]])
        if not ids or not ids[0]:
            return []

        hits: list[SearchHit] = []
        for index, product_id in enumerate(ids[0]):
            distance = distances[0][index] if distances and distances[0] else None
            similarity = _distance_to_similarity(distance)
            hits.append(SearchHit(product_id=str(product_id), similarity_score=similarity))

        return hits

    def count(self) -> int:
        return int(self._collection.count())


def _distance_to_similarity(distance: float | None) -> float:
    if distance is None:
        return 0.0
    if not math.isfinite(distance):
        return 0.0

    similarity = 1.0 / (1.0 + max(distance, 0.0))
    return max(0.0, min(1.0, similarity))
