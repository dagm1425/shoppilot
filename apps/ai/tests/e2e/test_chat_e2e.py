from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem


class _StubWorkflow:
    def __init__(self, response: ChatResponse | None = None, *, should_raise: bool = False) -> None:
        self._response = response
        self._should_raise = should_raise

    def run(self, payload: ChatRequest) -> ChatResponse:
        if self._should_raise:
            raise RuntimeError('assistant graph failed')
        if self._response is None:
            raise RuntimeError('stub result missing')
        response = self._response.model_copy(deep=True)
        response.request_id = payload.request_id
        response.session_id = payload.session_id
        return response


def _success_response() -> ChatResponse:
    recommendation = FinalRecommendation(
        summary='One strong jogger option matched your request.',
        recommended_products=[
            ProductItem(
                product_id='studio-training-jogger',
                name='Studio Training Jogger',
                category='bottoms',
                price_cents=5200,
                currency='USD',
                available=True,
                rating=4.6,
                short_description='Tapered jogger for training',
            )
        ],
        follow_up_prompts=['Want a lower-priced alternative?'],
    )

    return ChatResponse(
        request_id='request-success',
        session_id='session-success',
        assistant_message='I found one tapered jogger to consider.',
        recommendations=[recommendation],
        recommended_product_ids=['studio-training-jogger'],
        retrieval_mode='semantic',
        follow_up_prompts=['Want a lower-priced alternative?'],
        model='workflow-model',
        placeholder=False,
    )


def test_chat_success_path_returns_typed_recommendation_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_success_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
        json={
            'message': 'recommend tapered joggers',
            'sessionId': 'session-success',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-success',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['placeholder'] is False
    assert payload['retrievalMode'] == 'semantic'
    assert payload['recommendedProductIds'] == ['studio-training-jogger']
    assert len(payload['recommendations']) == 1
    assert payload['recommendations'][0]['recommendedProducts'][0]['productId'] == 'studio-training-jogger'


def test_chat_invalid_payload_returns_typed_validation_error(client: TestClient) -> None:
    response = client.post('/ai/chat', json={'message': ''})

    assert response.status_code == 422
    assert response.headers.get('x-request-id')

    payload = response.json()
    assert payload['error']['code'] == 'AI_VALIDATION_ERROR'
    assert payload['error']['message'] == 'Request validation failed.'
    assert payload['error']['requestId'] == response.headers['x-request-id']
    assert isinstance(payload['error']['details'], list)
    assert len(payload['error']['details']) > 0


def test_chat_validation_error_echoes_inbound_request_id(client: TestClient) -> None:
    response = client.post(
        '/ai/chat',
        headers={'x-request-id': 'validation-request-id'},
        json={'message': ''},
    )

    assert response.status_code == 422

    payload = response.json()
    assert payload['error']['requestId'] == 'validation-request-id'


def test_chat_internal_error_returns_typed_error_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: _StubWorkflow(should_raise=True),
    )

    from app.main import create_app

    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as safe_client:
        response = safe_client.post(
            '/ai/chat',
            headers={'x-request-id': 'internal-request-id'},
            json={
                'message': 'recommend breathable tops',
                'sessionId': 'session-error',
                'userContext': {'userId': 'user-1'},
                'requestId': 'request-error',
            },
        )

    assert response.status_code == 500
    payload = response.json()
    assert payload['error']['code'] == 'AI_INTERNAL_ERROR'
    assert payload['error']['message'] == 'Internal server error.'
    assert payload['error']['requestId'] == 'internal-request-id'
