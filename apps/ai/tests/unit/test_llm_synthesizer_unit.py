from __future__ import annotations

import pytest

from app.llm.synthesizer import AssistantSynthesizer


class _FakeResponse:
    def __init__(self, content: str | None) -> None:
        self.text = content


class _FakeModels:
    def __init__(self, *, content: str | None = None, should_raise: bool = False) -> None:
        self._content = content
        self._should_raise = should_raise

    def generate_content(self, **kwargs):  # noqa: ANN003, ANN204
        if self._should_raise:
            raise RuntimeError('synthetic llm failure')
        return _FakeResponse(self._content)


class _FakeClient:
    def __init__(self, *, content: str | None = None, should_raise: bool = False) -> None:
        self.models = _FakeModels(content=content, should_raise=should_raise)


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


def test_synthesizer_accepts_valid_json_and_sanitizes_prompts() -> None:
    client = _FakeClient(
        content=(
            '{"assistantMessage":"Best match is the Essential Cropped Tee.",'
            '"followUpPrompts":["Need cheaper options?","Need cheaper options?"," ","Only in-stock?"],'
            '"comparisonSummary":"  Top option has higher rating.  "}'
        )
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

    result = synthesizer.synthesize(
        resolved_request='recommend workout tops',
        retrieval_mode='structured',
        normalized_filters={'category': 'tops'},
        retrieved_products=_retrieved_products(),
        comparison_summary=None,
    )

    assert result.assistant_message == 'Best match is the Essential Cropped Tee.'
    assert result.follow_up_prompts == ['Need cheaper options?', 'Only in-stock?']
    assert result.comparison_summary == 'Top option has higher rating.'


def test_synthesizer_raises_on_invalid_json_output() -> None:
    client = _FakeClient(content='not-json')
    synthesizer = AssistantSynthesizer(
        client=client,
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=True,
        max_tokens=220,
        temperature=0.2,
        top_n_products=3,
    )

    with pytest.raises(ValueError):
        synthesizer.synthesize(
            resolved_request='recommend workout tops',
            retrieval_mode='structured',
            normalized_filters={'category': 'tops'},
            retrieved_products=_retrieved_products(),
            comparison_summary=None,
        )


def test_synthesizer_build_user_prompt_payload_applies_top_n_clamp() -> None:
    client = _FakeClient(content='{"assistantMessage":"ok","followUpPrompts":[],"comparisonSummary":null}')
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


def test_synthesizer_disabled_mode_raises_runtime_error() -> None:
    client = _FakeClient(content='{"assistantMessage":"ok","followUpPrompts":[],"comparisonSummary":null}')
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
        synthesizer.synthesize(
            resolved_request='recommend workout tops',
            retrieval_mode='structured',
            normalized_filters={'category': 'tops'},
            retrieved_products=_retrieved_products(),
            comparison_summary=None,
        )


def test_synthesizer_raises_on_empty_model_text() -> None:
    client = _FakeClient(content=None)
    synthesizer = AssistantSynthesizer(
        client=client,
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=True,
        max_tokens=220,
        temperature=0.2,
        top_n_products=3,
    )

    with pytest.raises(ValueError, match='empty content'):
        synthesizer.synthesize(
            resolved_request='recommend workout tops',
            retrieval_mode='structured',
            normalized_filters={'category': 'tops'},
            retrieved_products=_retrieved_products(),
            comparison_summary=None,
        )
