from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from google import genai
from google.genai import types as genai_types


class EmbeddingClient:
    def __init__(self, *, provider: str, api_key: str, base_url: str, model: str) -> None:
        resolved_provider = provider.strip().lower()
        if resolved_provider != 'gemini':
            raise ValueError(f'Unsupported embedding provider: {provider}')

        self._provider = resolved_provider
        self._api_key = api_key
        self._base_url = base_url.rstrip('/')
        self._model = model
        self._client = genai.Client(
            api_key=self._api_key,
            http_options=genai_types.HttpOptions(base_url=self._base_url),
        )

    @property
    def model(self) -> str:
        return self._model

    def embed_text(self, text: str) -> list[float]:
        vectors = self.embed_texts([text])
        if not vectors:
            raise RuntimeError('Embedding API returned no vectors for single-text embedding request.')
        return vectors[0]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []

        response = self._embed_contents(texts=list(texts))
        raw_embeddings = getattr(response, 'embeddings', None)
        if not isinstance(raw_embeddings, list):
            raise RuntimeError('Embedding API returned an invalid response: missing embeddings list.')

        vectors: list[list[float]] = []
        for index, item in enumerate(raw_embeddings):
            values = _read_embedding_values(item)
            if values is None:
                raise RuntimeError(f'Embedding API item {index} is missing embedding values.')
            vectors.append([float(value) for value in values])

        if len(vectors) != len(texts):
            raise RuntimeError('Embedding API returned unexpected vector count.')

        return vectors

    def _embed_contents(self, *, texts: list[str]) -> Any:
        try:
            return self._client.models.embed_content(
                model=self._model,
                contents=texts,
            )
        except Exception as exc:
            raise RuntimeError(f'Embedding API request failed for provider "{self._provider}": {exc}') from exc


def _read_embedding_values(item: Any) -> list[float] | None:
    values = getattr(item, 'values', None)
    if isinstance(values, list):
        return values
    return None
