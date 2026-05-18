from __future__ import annotations

import logging
from time import perf_counter

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem
from app.search import get_search_service
from app.search.models import ProductRecord, RetrievalResult

logger = logging.getLogger(__name__)


def build_placeholder_response(payload: ChatRequest, *, model_name: str) -> ChatResponse:
    return ChatResponse(
        request_id=payload.request_id,
        session_id=payload.session_id,
        assistant_message=(
            'AI assistant foundation is online. Recommendations and semantic search '
            'will be enabled in upcoming subphases.'
        ),
        recommendations=[],
        follow_up_prompts=[
            'What style are you shopping for?',
            'Do you have a target budget?',
        ],
        model=model_name,
        placeholder=True,
    )


def build_chat_response(payload: ChatRequest, *, model_name: str) -> ChatResponse:
    started_at = perf_counter()
    retrieval = get_search_service().retrieve(payload.message)
    duration_ms = int((perf_counter() - started_at) * 1000)

    logger.info(
        {
            'event': 'ai.retrieval_completed',
            'request_id': payload.request_id,
            'session_id': payload.session_id,
            'ai_retrieval_mode': retrieval.mode,
            'filter_count': retrieval.filters.count(),
            'candidate_count': retrieval.candidate_count,
            'result_count': len(retrieval.products),
            'latency_ms': duration_ms,
        },
    )

    if len(retrieval.products) == 0:
        return ChatResponse(
            request_id=payload.request_id,
            session_id=payload.session_id,
            assistant_message=(
                'I could not find products that match those constraints yet. '
                'Try broadening your budget, category, or availability filters.'
            ),
            recommendations=[],
            follow_up_prompts=[
                'Try removing one filter and ask again.',
                'Would you like recommendations under a higher budget?',
            ],
            model=model_name,
            placeholder=False,
        )

    recommendation = _to_recommendation(retrieval)
    return ChatResponse(
        request_id=payload.request_id,
        session_id=payload.session_id,
        assistant_message=recommendation.summary,
        recommendations=[recommendation],
        follow_up_prompts=recommendation.follow_up_prompts,
        model=model_name,
        placeholder=False,
    )


def _to_recommendation(retrieval: RetrievalResult) -> FinalRecommendation:
    products = [_to_product_item(record) for record in retrieval.products]

    summary = (
        f'I found {len(products)} matching products using {retrieval.mode} retrieval. '
        'These options are ranked from your current request.'
    )
    comparison_summary = (
        f'Top match confidence: {retrieval.hits[0].similarity_score:.2f}'
        if retrieval.hits
        else None
    )

    # future: retrieval weighting policy - tune hybrid rank blending in Phase 4.3/4.5
    # future: query planner integration - hand off mode selection to LangGraph node in 4.3
    return FinalRecommendation(
        summary=summary,
        recommended_products=products,
        comparison_summary=comparison_summary,
        follow_up_prompts=[
            'Want options in a different price range?',
            'Should I focus on in-stock items only?',
        ],
    )


def _to_product_item(record: ProductRecord) -> ProductItem:
    return ProductItem(
        product_id=record.product_id,
        name=record.name,
        category=record.category,
        price_cents=record.price_cents,
        currency=record.currency,
        available=record.available,
        rating=record.rating,
        short_description=record.description,
    )
