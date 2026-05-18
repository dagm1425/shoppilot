from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.search.constants import RETRIEVAL_MODE_HYBRID, RETRIEVAL_MODE_STRUCTURED
from app.search.models import ProductRecord, RetrievalFilters, RetrievalResult, SearchHit


class _StubSearchService:
    def __init__(self, result: RetrievalResult) -> None:
        self._result = result

    def retrieve(self, _: str) -> RetrievalResult:
        return self._result


def _retrieval_with_products() -> RetrievalResult:
    products = [
        ProductRecord(
            product_id='essential-cropped-tee',
            name='Essential Cropped Tee',
            description='Soft cropped tee',
            category='tops',
            gender='women',
            fit='relaxed',
            color='white',
            price_cents=2400,
            currency='USD',
            available=True,
            rating=4.8,
            stock=30,
            updated_at=datetime.now(timezone.utc),
        ),
        ProductRecord(
            product_id='flow-sports-bra',
            name='Flow Sports Bra',
            description='Supportive bra',
            category='tops',
            gender='women',
            fit='supportive',
            color='sage',
            price_cents=3600,
            currency='USD',
            available=True,
            rating=4.5,
            stock=14,
            updated_at=datetime.now(timezone.utc),
        ),
    ]

    return RetrievalResult(
        mode=RETRIEVAL_MODE_HYBRID,
        filters=RetrievalFilters(category='tops', price_max_cents=5000, availability=True),
        semantic_query='breathable for cardio',
        hits=[
            SearchHit(product_id='essential-cropped-tee', similarity_score=1.0),
            SearchHit(product_id='flow-sports-bra', similarity_score=0.86),
        ],
        products=products,
        candidate_count=2,
    )


def _empty_retrieval() -> RetrievalResult:
    return RetrievalResult(
        mode=RETRIEVAL_MODE_STRUCTURED,
        filters=RetrievalFilters(category='bottoms', price_max_cents=1000),
        semantic_query='budget bottoms',
        hits=[],
        products=[],
        candidate_count=0,
    )


def test_chat_returns_typed_recommendation_response(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(_retrieval_with_products()),
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
    assert len(payload['recommendations']) == 1
    assert payload['recommendations'][0]['recommendedProducts'][0]['productId'] == 'essential-cropped-tee'


def test_chat_returns_graceful_no_match_response(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(_empty_retrieval()),
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
    assert payload['recommendations'] == []
    assert 'could not find products' in payload['assistantMessage'].lower()


def test_chat_request_id_header_is_echoed_from_inbound_header(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(_empty_retrieval()),
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


def test_chat_versioned_route_returns_same_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(_retrieval_with_products()),
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
    assert response.json()['requestId'] == 'request-2'
