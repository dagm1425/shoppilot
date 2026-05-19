from __future__ import annotations

import pytest

from app.search.embeddings import EmbeddingClient


class _FakeEmbedding:
    def __init__(self, values: list[float] | None) -> None:
        self.values = values


class _FakeEmbedResponse:
    def __init__(self, embeddings: list[_FakeEmbedding] | None) -> None:
        self.embeddings = embeddings


def test_embed_texts_uses_google_genai_sdk_and_returns_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class _FakeModels:
        def embed_content(self, *, model: str, contents: list[str]):  # noqa: ANN001
            captured['model'] = model
            captured['contents'] = contents
            return _FakeEmbedResponse(
                embeddings=[
                    _FakeEmbedding([0.1, -0.2, 0.3]),
                    _FakeEmbedding([0.4, 0.5, -0.6]),
                ]
            )

    class _FakeClient:
        def __init__(self, *, api_key: str, http_options):  # noqa: ANN001
            captured['api_key'] = api_key
            captured['base_url'] = getattr(http_options, 'base_url', None)
            self.models = _FakeModels()

    monkeypatch.setattr('app.search.embeddings.genai.Client', _FakeClient)

    client = EmbeddingClient(
        provider='gemini',
        api_key='gemini-key',
        base_url='https://generativelanguage.googleapis.com/v1beta',
        model='gemini-embedding-001',
    )
    vectors = client.embed_texts(['alpha', 'beta'])

    assert vectors == [[0.1, -0.2, 0.3], [0.4, 0.5, -0.6]]
    assert captured['api_key'] == 'gemini-key'
    assert captured['base_url'] == 'https://generativelanguage.googleapis.com/v1beta'
    assert captured['model'] == 'gemini-embedding-001'
    assert captured['contents'] == ['alpha', 'beta']


def test_embed_text_returns_first_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeModels:
        def embed_content(self, *, model: str, contents: list[str]):  # noqa: ANN001
            assert model == 'gemini-embedding-001'
            assert contents == ['alpha']
            return _FakeEmbedResponse(embeddings=[_FakeEmbedding([0.9, 0.8, 0.7])])

    class _FakeClient:
        def __init__(self, *, api_key: str, http_options):  # noqa: ANN001
            self.models = _FakeModels()

    monkeypatch.setattr('app.search.embeddings.genai.Client', _FakeClient)

    client = EmbeddingClient(
        provider='gemini',
        api_key='gemini-key',
        base_url='https://generativelanguage.googleapis.com/v1beta',
        model='gemini-embedding-001',
    )

    assert client.embed_text('alpha') == [0.9, 0.8, 0.7]


def test_embed_texts_raises_on_missing_embeddings_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeModels:
        def embed_content(self, *, model: str, contents: list[str]):  # noqa: ANN001
            del model, contents
            return _FakeEmbedResponse(embeddings=None)

    class _FakeClient:
        def __init__(self, *, api_key: str, http_options):  # noqa: ANN001
            self.models = _FakeModels()

    monkeypatch.setattr('app.search.embeddings.genai.Client', _FakeClient)

    client = EmbeddingClient(
        provider='gemini',
        api_key='gemini-key',
        base_url='https://generativelanguage.googleapis.com/v1beta',
        model='gemini-embedding-001',
    )

    with pytest.raises(RuntimeError, match='missing embeddings list'):
        client.embed_texts(['alpha'])


def test_embed_texts_raises_on_missing_embedding_values(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeModels:
        def embed_content(self, *, model: str, contents: list[str]):  # noqa: ANN001
            del model, contents
            return _FakeEmbedResponse(embeddings=[_FakeEmbedding(None)])

    class _FakeClient:
        def __init__(self, *, api_key: str, http_options):  # noqa: ANN001
            self.models = _FakeModels()

    monkeypatch.setattr('app.search.embeddings.genai.Client', _FakeClient)

    client = EmbeddingClient(
        provider='gemini',
        api_key='gemini-key',
        base_url='https://generativelanguage.googleapis.com/v1beta',
        model='gemini-embedding-001',
    )

    with pytest.raises(RuntimeError, match='missing embedding values'):
        client.embed_texts(['alpha'])
