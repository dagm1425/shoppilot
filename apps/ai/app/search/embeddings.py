from __future__ import annotations

from collections.abc import Sequence

from openai import OpenAI


class EmbeddingClient:
    def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
        self._model = model
        self._client = OpenAI(api_key=api_key, base_url=base_url)

    @property
    def model(self) -> str:
        return self._model

    def embed_text(self, text: str) -> list[float]:
        response = self._client.embeddings.create(
            model=self._model,
            input=[text],
            encoding_format='float',
        )
        return list(response.data[0].embedding)

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []

        response = self._client.embeddings.create(
            model=self._model,
            input=list(texts),
            encoding_format='float',
        )
        return [list(item.embedding) for item in response.data]
