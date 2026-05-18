from __future__ import annotations

import logging
from time import perf_counter

from app.graph import get_assistant_workflow
from app.schemas import ChatRequest, ChatResponse

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
        recommended_product_ids=[],
        follow_up_prompts=[
            'What style are you shopping for?',
            'Do you have a target budget?',
        ],
        model=model_name,
        placeholder=True,
    )


def build_chat_response(payload: ChatRequest, *, model_name: str) -> ChatResponse:
    started_at = perf_counter()
    response = get_assistant_workflow().run(payload)
    duration_ms = int((perf_counter() - started_at) * 1000)

    response.model = model_name

    logger.info(
        {
            'event': 'ai.graph_response_completed',
            'request_id': payload.request_id,
            'session_id': payload.session_id,
            'thread_id': f'{payload.user_context.user_id}:{payload.session_id}',
            'ai_retrieval_mode': response.retrieval_mode,
            'result_count': len(response.recommended_product_ids),
            'latency_ms': duration_ms,
        },
    )

    return response
