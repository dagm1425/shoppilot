from __future__ import annotations

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem
from app.services.chat_service import build_chat_response, build_placeholder_response


class _StubWorkflow:
    def __init__(self, response: ChatResponse) -> None:
        self._response = response
        self.calls: list[ChatRequest] = []

    def run(self, payload: ChatRequest) -> ChatResponse:
        self.calls.append(payload)
        return self._response.model_copy(deep=True)


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


def test_build_placeholder_response_is_deterministic() -> None:
    payload = _payload()

    result = build_placeholder_response(payload, model_name='gpt-4.1-mini')

    assert result.request_id == 'request-1'
    assert result.session_id == 'session-1'
    assert result.placeholder is True
    assert result.model == 'gpt-4.1-mini'
    assert result.recommendations == []
    assert result.recommended_product_ids == []
    assert len(result.follow_up_prompts) == 2


def test_build_chat_response_delegates_to_workflow_and_sets_model(monkeypatch) -> None:
    payload = _payload()
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    result = build_chat_response(payload, model_name='gpt-4.1-mini')

    assert len(stub_workflow.calls) == 1
    assert stub_workflow.calls[0].request_id == 'request-1'
    assert result.request_id == payload.request_id
    assert result.session_id == payload.session_id
    assert result.placeholder is False
    assert result.model == 'gpt-4.1-mini'
    assert result.retrieval_mode == 'hybrid'
    assert result.recommended_product_ids == ['essential-cropped-tee']
    assert len(result.recommendations) == 1


def test_build_chat_response_preserves_graceful_no_result_shape(monkeypatch) -> None:
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

    result = build_chat_response(payload, model_name='gpt-4.1-mini')

    assert result.placeholder is False
    assert result.recommendations == []
    assert result.recommended_product_ids == []
    assert result.retrieval_mode == 'structured'
    assert 'no products found' in result.assistant_message.lower()
