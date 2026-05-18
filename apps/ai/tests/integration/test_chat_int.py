from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem


class _StubWorkflow:
    def __init__(self, response: ChatResponse) -> None:
        self._response = response
        self.calls: list[ChatRequest] = []

    def run(self, payload: ChatRequest) -> ChatResponse:
        self.calls.append(payload)
        response = self._response.model_copy(deep=True)
        response.request_id = payload.request_id
        response.session_id = payload.session_id
        return response


def _recommended_response() -> ChatResponse:
    recommendation = FinalRecommendation(
        summary='Two strong in-stock options for training tops.',
        recommended_products=[
            ProductItem(
                product_id='essential-cropped-tee',
                name='Essential Cropped Tee',
                category='tops',
                price_cents=2400,
                currency='USD',
                available=True,
                rating=4.8,
                short_description='Soft cropped tee',
            ),
            ProductItem(
                product_id='flow-sports-bra',
                name='Flow Sports Bra',
                category='tops',
                price_cents=3600,
                currency='USD',
                available=True,
                rating=4.5,
                short_description='Supportive bra',
            ),
        ],
        follow_up_prompts=['Want a lower price range?'],
    )

    return ChatResponse(
        request_id='request-1',
        session_id='session-1',
        assistant_message='I found two options that match your constraints.',
        recommendations=[recommendation],
        recommended_product_ids=['essential-cropped-tee', 'flow-sports-bra'],
        retrieval_mode='hybrid',
        follow_up_prompts=['Want a lower price range?'],
        model='workflow-model',
        placeholder=False,
    )


def _no_result_response() -> ChatResponse:
    return ChatResponse(
        request_id='request-empty',
        session_id='session-empty',
        assistant_message='I could not find products that match those constraints yet.',
        recommendations=[],
        recommended_product_ids=[],
        retrieval_mode='structured',
        follow_up_prompts=['Try broadening your budget.'],
        model='workflow-model',
        placeholder=False,
    )


def test_chat_returns_typed_recommendation_response(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-1',
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload['requestId'] == 'request-1'
    assert payload['sessionId'] == 'session-1'
    assert payload['assistantMessage']
    assert payload['placeholder'] is False
    assert payload['model'] == 'gpt-4.1-mini'
    assert payload['retrievalMode'] == 'hybrid'
    assert payload['recommendedProductIds'] == ['essential-cropped-tee', 'flow-sports-bra']
    assert len(payload['recommendations']) == 1
    assert payload['recommendations'][0]['recommendedProducts'][0]['productId'] == 'essential-cropped-tee'
    assert len(stub_workflow.calls) == 1


def test_chat_returns_graceful_no_match_response(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_no_result_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
        json={
            'message': 'bottoms under $10',
            'sessionId': 'session-empty',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-empty',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['placeholder'] is False
    assert payload['retrievalMode'] == 'structured'
    assert payload['recommendations'] == []
    assert payload['recommendedProductIds'] == []
    assert 'could not find products' in payload['assistantMessage'].lower()
    assert len(stub_workflow.calls) == 1


def test_chat_request_id_header_is_echoed_from_inbound_header(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_no_result_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
        headers={'x-request-id': 'external-request-id'},
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'payload-request-id',
        },
    )

    assert response.status_code == 200
    assert response.headers.get('x-request-id') == 'external-request-id'
    assert len(stub_workflow.calls) == 1


def test_chat_versioned_route_returns_same_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/v1/ai/chat',
        json={
            'message': 'Recommend neutral jackets',
            'sessionId': 'session-2',
            'userContext': {'userId': 'user-2'},
            'requestId': 'request-2',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['requestId'] == 'request-2'
    assert payload['sessionId'] == 'session-2'
    assert payload['placeholder'] is False
    assert payload['recommendedProductIds'] == ['essential-cropped-tee', 'flow-sports-bra']
