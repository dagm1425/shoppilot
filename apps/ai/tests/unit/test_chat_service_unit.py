from __future__ import annotations

from datetime import datetime, timezone

from app.schemas import ChatRequest
from app.search.constants import RETRIEVAL_MODE_STRUCTURED
from app.search.models import ProductRecord, RetrievalFilters, RetrievalResult, SearchHit
from app.services.chat_service import build_chat_response, build_placeholder_response


class _StubSearchService:
    def __init__(self, result: RetrievalResult) -> None:
        self._result = result

    def retrieve(self, _: str) -> RetrievalResult:
        return self._result


def _payload() -> ChatRequest:
    return ChatRequest.model_validate(
        {
            'message': 'Recommend running shoes',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-1',
        }
    )


def _product(*, product_id: str, name: str, category: str, price_cents: int) -> ProductRecord:
    return ProductRecord(
        product_id=product_id,
        name=name,
        description=f'{name} description',
        category=category,
        gender='women',
        fit='regular',
        color='black',
        price_cents=price_cents,
        currency='USD',
        available=True,
        rating=4.4,
        stock=10,
        updated_at=datetime.now(timezone.utc),
    )


def test_build_placeholder_response_is_deterministic() -> None:
    payload = _payload()

    result = build_placeholder_response(payload, model_name='gpt-4.1-mini')

    assert result.request_id == 'request-1'
    assert result.session_id == 'session-1'
    assert result.placeholder is True
    assert result.model == 'gpt-4.1-mini'
    assert result.recommendations == []
    assert len(result.follow_up_prompts) == 2


def test_build_chat_response_maps_retrieval_into_typed_recommendation(monkeypatch) -> None:
    payload = _payload()
    products = [
        _product(
            product_id='essential-cropped-tee',
            name='Essential Cropped Tee',
            category='tops',
            price_cents=2400,
        ),
        _product(
            product_id='flow-sports-bra',
            name='Flow Sports Bra',
            category='tops',
            price_cents=3600,
        ),
    ]
    retrieval = RetrievalResult(
        mode=RETRIEVAL_MODE_STRUCTURED,
        filters=RetrievalFilters(category='tops', availability=True),
        semantic_query='running tops',
        hits=[
            SearchHit(product_id='essential-cropped-tee', similarity_score=1.0),
            SearchHit(product_id='flow-sports-bra', similarity_score=0.92),
        ],
        products=products,
        candidate_count=2,
    )
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(retrieval),
    )

    result = build_chat_response(payload, model_name='gpt-4.1-mini')

    assert result.request_id == payload.request_id
    assert result.session_id == payload.session_id
    assert result.placeholder is False
    assert result.model == 'gpt-4.1-mini'
    assert len(result.recommendations) == 1
    recommendation = result.recommendations[0]
    assert len(recommendation.recommended_products) == 2
    assert recommendation.recommended_products[0].product_id == 'essential-cropped-tee'
    assert 'structured retrieval' in recommendation.summary
    assert recommendation.comparison_summary == 'Top match confidence: 1.00'
    assert len(result.follow_up_prompts) == 2


def test_build_chat_response_returns_graceful_empty_result(monkeypatch) -> None:
    payload = _payload()
    retrieval = RetrievalResult(
        mode=RETRIEVAL_MODE_STRUCTURED,
        filters=RetrievalFilters(category='bottoms'),
        semantic_query='budget bottoms',
        hits=[],
        products=[],
        candidate_count=0,
    )
    monkeypatch.setattr(
        'app.services.chat_service.get_search_service',
        lambda: _StubSearchService(retrieval),
    )

    result = build_chat_response(payload, model_name='gpt-4.1-mini')

    assert result.placeholder is False
    assert result.recommendations == []
    assert 'could not find products' in result.assistant_message.lower()
    assert len(result.follow_up_prompts) == 2
