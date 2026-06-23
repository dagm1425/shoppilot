from __future__ import annotations

import asyncio

import pytest

from app.llm.synthesizer import AssistantSynthesizer


class _FakeStreamChunk:
    def __init__(self, text: str, *, usage_metadata: dict[str, int] | None = None) -> None:
        self.text = text
        self.usage_metadata = usage_metadata


class _FakeAsyncModels:
    def __init__(
        self,
        *,
        stream_chunks: list[_FakeStreamChunk] | None = None,
        should_raise: bool = False,
    ) -> None:
        self._stream_chunks = stream_chunks or []
        self._should_raise = should_raise

    async def generate_content_stream(self, **kwargs):  # noqa: ANN003, ANN204
        if self._should_raise:
            raise RuntimeError('synthetic llm stream failure')

        async def stream():
            for chunk in self._stream_chunks:
                yield chunk

        return stream()


class _FakeAsyncClient:
    def __init__(self, *, stream_chunks: list[_FakeStreamChunk] | None = None, should_raise: bool = False) -> None:
        self.models = _FakeAsyncModels(
            stream_chunks=stream_chunks,
            should_raise=should_raise,
        )


class _FakeClient:
    def __init__(
        self,
        *,
        stream_chunks: list[_FakeStreamChunk] | None = None,
        should_raise: bool = False,
    ) -> None:
        self.aio = _FakeAsyncClient(
            stream_chunks=stream_chunks,
            should_raise=should_raise,
        )


def _retrieved_products() -> list[dict]:
    return [
        {
            'product': {
                'productId': 'essential-cropped-tee',
                'name': 'Essential Cropped Tee',
                'category': 'tops',
                'priceCents': 2400,
                'currency': 'USD',
                'available': True,
                'rating': 4.7,
                'shortDescription': 'Soft cropped tee',
            },
            'similarityScore': 0.95,
        },
        {
            'product': {
                'productId': 'flow-sports-bra',
                'name': 'Flow Sports Bra',
                'category': 'tops',
                'priceCents': 3600,
                'currency': 'USD',
                'available': True,
                'rating': 4.5,
                'shortDescription': 'Supportive bra',
            },
            'similarityScore': 0.86,
        },
    ]


def test_synthesizer_build_user_prompt_payload_applies_top_n_clamp() -> None:
    client = _FakeClient()
    synthesizer = AssistantSynthesizer(
        client=client,
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=True,
        max_tokens=220,
        temperature=0.2,
        top_n_products=1,
    )

    payload = synthesizer.build_user_prompt_payload(
        resolved_request='recommend workout tops',
        retrieval_mode='structured',
        normalized_filters={'category': 'tops'},
        retrieved_products=_retrieved_products(),
        comparison_summary=None,
    )

    assert payload['resolvedRequest'] == 'recommend workout tops'
    assert payload['retrievalMode'] == 'structured'
    assert len(payload['products']) == 1
    assert payload['products'][0]['productId'] == 'essential-cropped-tee'


def test_synthesizer_stream_requires_enabled_mode() -> None:
    client = _FakeClient()
    synthesizer = AssistantSynthesizer(
        client=client,
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=False,
        max_tokens=220,
        temperature=0.2,
        top_n_products=3,
    )

    with pytest.raises(RuntimeError, match='disabled'):
        asyncio.run(
            synthesizer.synthesize_stream(
                resolved_request='recommend workout tops',
                retrieval_mode='structured',
                normalized_filters={'category': 'tops'},
                retrieved_products=_retrieved_products(),
                comparison_summary=None,
            )
        )


def test_synthesizer_stream_raises_on_empty_model_text() -> None:
    client = _FakeClient(stream_chunks=[_FakeStreamChunk('')])
    synthesizer = AssistantSynthesizer(
        client=client,
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=True,
        max_tokens=220,
        temperature=0.2,
        top_n_products=3,
    )

    async def run_stream() -> None:
        stream = await synthesizer.synthesize_stream(
            resolved_request='recommend workout tops',
            retrieval_mode='structured',
            normalized_filters={'category': 'tops'},
            retrieved_products=_retrieved_products(),
            comparison_summary=None,
        )
        async for _ in stream:
            pass

    with pytest.raises(ValueError, match='empty content'):
        asyncio.run(run_stream())


def test_synthesizer_stream_yields_real_deltas_and_captures_usage() -> None:
    client = _FakeClient(
        stream_chunks=[
            _FakeStreamChunk('Best match '),
            _FakeStreamChunk(
                'is the Essential Cropped Tee.',
                usage_metadata={
                    'promptTokenCount': 12,
                    'candidatesTokenCount': 9,
                    'totalTokenCount': 21,
                },
            ),
        ]
    )
    synthesizer = AssistantSynthesizer(
        client=client,
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=True,
        max_tokens=220,
        temperature=0.2,
        top_n_products=3,
    )

    async def run_stream() -> tuple[list[str], object]:
        stream = await synthesizer.synthesize_stream(
            resolved_request='recommend workout tops',
            retrieval_mode='structured',
            normalized_filters={'category': 'tops'},
            retrieved_products=_retrieved_products(),
            comparison_summary=None,
        )
        deltas = [delta async for delta in stream]
        return deltas, stream

    deltas, stream = asyncio.run(run_stream())

    assert deltas == ['Best match ', 'is the Essential Cropped Tee.']
    assert stream.assistant_message == 'Best match is the Essential Cropped Tee.'
    assert stream.prompt_tokens == 12
    assert stream.completion_tokens == 9
    assert stream.total_tokens == 21
