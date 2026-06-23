from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem
from app.services.chat_service import build_chat_stream_response


class _StubWorkflow:
    def __init__(self, response: ChatResponse) -> None:
        self._response = response
        self.calls: list[tuple[ChatRequest, str | None]] = []

    async def prepare_stream_response(self, payload: ChatRequest, *, run_id: str | None = None):
        self.calls.append((payload, run_id))
        return SimpleNamespace(
            chat_response=self._response.model_copy(deep=True),
            telemetry={
                'request_id': payload.request_id,
                'run_id': run_id or f'run-{payload.request_id}',
                'thread_id': f'{payload.user_context.user_id}:{payload.session_id}',
                'transport': 'sse',
                'retrieval_mode': self._response.retrieval_mode,
                'llm_provider': 'gemini',
                'llm_model': 'gemini-2.5-flash',
                'token_usage_prompt': None,
                'token_usage_completion': None,
                'token_usage_total': None,
                'cost_estimate_usd': None,
                'fallback_reason': None,
                'budget_top_k': 5,
                'budget_top_n_products': 3,
                'budget_max_output_tokens': 220,
            },
            synthesis_stream=None,
        )


class _MissingPrepareWorkflow:
    pass


def _payload() -> ChatRequest:
    return ChatRequest.model_validate(
        {
            'message': 'Recommend running shoes',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-1',
        }
    )


def _recommended_response() -> ChatResponse:
    product = ProductItem(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
        currency='USD',
        available=True,
        rating=4.7,
        short_description='Soft cropped tee',
    )

    recommendation = FinalRecommendation(
        summary='Great match for breathable training.',
        recommended_products=[product],
        comparison_summary='Top match confidence: 0.95',
        follow_up_prompts=['Need a lower price option?'],
    )

    return ChatResponse(
        request_id='request-1',
        session_id='session-1',
        assistant_message='I found one strong option for your request.',
        recommendations=[recommendation],
        recommended_product_ids=['essential-cropped-tee'],
        retrieval_mode='hybrid',
        follow_up_prompts=['Need a lower price option?'],
        model='workflow-model',
        placeholder=False,
    )


def test_build_chat_stream_response_delegates_to_prepare_stream_response(monkeypatch) -> None:
    payload = _payload()
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    result = asyncio.run(
        build_chat_stream_response(
            payload,
            run_id='run-test-1',
        )
    )

    assert len(stub_workflow.calls) == 1
    assert stub_workflow.calls[0][0].request_id == 'request-1'
    assert stub_workflow.calls[0][1] == 'run-test-1'
    assert result.run_id == 'run-test-1'
    assert result.thread_id == 'user-1:session-1'
    assert result.message_id.startswith('msg-')
    assert result.chat_response.request_id == payload.request_id
    assert result.chat_response.session_id == payload.session_id
    assert result.chat_response.placeholder is False
    assert result.chat_response.recommended_product_ids == ['essential-cropped-tee']
    assert result.telemetry['transport'] == 'sse'


def test_build_chat_stream_response_preserves_graceful_no_result_shape(monkeypatch) -> None:
    payload = _payload()
    stub_workflow = _StubWorkflow(
        ChatResponse(
            request_id='request-1',
            session_id='session-1',
            assistant_message='No products found for those constraints.',
            recommendations=[],
            recommended_product_ids=[],
            retrieval_mode='structured',
            follow_up_prompts=['Try widening your budget range.'],
            model='workflow-model',
            placeholder=False,
        )
    )
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    result = asyncio.run(
        build_chat_stream_response(
            payload,
            run_id='run-test-2',
        )
    )

    assert result.chat_response.placeholder is False
    assert result.chat_response.recommendations == []
    assert result.chat_response.recommended_product_ids == []
    assert result.chat_response.retrieval_mode == 'structured'
    assert 'no products found' in result.chat_response.assistant_message.lower()
    assert result.telemetry['run_id'] == 'run-test-2'


def test_build_chat_stream_response_requires_stream_capable_workflow(monkeypatch) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: _MissingPrepareWorkflow(),
    )

    with pytest.raises(RuntimeError, match='prepare_stream_response'):
        asyncio.run(build_chat_stream_response(_payload(), run_id='run-missing-prepare'))
