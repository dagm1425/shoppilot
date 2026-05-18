from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.search.constants import RETRIEVAL_MODE_SEMANTIC
from app.search.models import ProductRecord, RetrievalFilters, RetrievalResult, SearchHit


class _StubSearchService:
    def __init__(self, result: RetrievalResult | None = None, *, should_raise: bool = False) -> None:
        self._result = result
        self._should_raise = should_raise

    def retrieve(self, _: str) -> RetrievalResult:
        if self._should_raise:
            raise RuntimeError('vector lookup failed')
        if self._result is None:
            raise RuntimeError('stub result missing')
        return self._result


def _semantic_retrieval() -> RetrievalResult:
    product = ProductRecord(
        product_id='studio-training-jogger',
        name='Studio Training Jogger',
        description='Tapered jogger for training',
        category='bottoms',
        gender='men',
        fit='tapered',
        color='stone',
        price_cents=5200,
        currency='USD',
        available=True,
        rating=4.6,
        stock=12,
        updated_at=datetime.now(timezone.utc),
    )
    return RetrievalResult(
        mode=RETRIEVAL_MODE_SEMANTIC,
        filters=RetrievalFilters(),
        semantic_query='tapered jogger',
        hits=[SearchHit(product_id='studio-training-jogger', similarity_score=0.88)],
        products=[product],
        candidate_count=1,
    )


def test_chat_success_path_returns_typed_recommendation_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(_semantic_retrieval()),
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
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(should_raise=True),
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
