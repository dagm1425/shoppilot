from __future__ import annotations

import logging
from time import perf_counter
from uuid import uuid4

from pydantic import BaseModel

from app.graph import get_assistant_workflow
from app.schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

_STREAM_TEXT_CHUNK_SIZE = 32


class StreamEnvelope(BaseModel):
    run_id: str
    message_id: str
    thread_id: str
    chat_response: ChatResponse


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


def build_chat_stream_envelope(payload: ChatRequest, *, model_name: str) -> StreamEnvelope:
    response = build_chat_response(payload, model_name=model_name)

    return StreamEnvelope(
        run_id=f'run-{uuid4()}',
        message_id=f'msg-{uuid4()}',
        thread_id=f'{payload.user_context.user_id}:{payload.session_id}',
        chat_response=response,
    )


def build_stream_event_sequence(
    *,
    run_id: str,
    message_id: str,
    thread_id: str,
    chat_response: ChatResponse,
) -> list[dict[str, object]]:
    events: list[dict[str, object]] = [
        {
            'type': 'RUN_STARTED',
            'threadId': thread_id,
            'runId': run_id,
        },
        {
            'type': 'TEXT_MESSAGE_START',
            'messageId': message_id,
            'role': 'assistant',
        },
    ]

    text_chunks = _chunk_message_for_stream(chat_response.assistant_message)
    for delta in text_chunks:
        events.append(
            {
                'type': 'TEXT_MESSAGE_CONTENT',
                'messageId': message_id,
                'delta': delta,
            }
        )

    events.extend(
        [
            {
                'type': 'TEXT_MESSAGE_END',
                'messageId': message_id,
            },
            {
                'type': 'STATE_SNAPSHOT',
                'state': {
                    'chatResponse': chat_response.model_dump(by_alias=True, mode='json'),
                },
            },
            {
                'type': 'RUN_FINISHED',
                'threadId': thread_id,
                'runId': run_id,
            },
        ]
    )

    return events


def build_run_error_event(
    *,
    run_id: str,
    message: str,
    code: str = 'AI_INTERNAL_ERROR',
) -> dict[str, str]:
    return {
        'type': 'RUN_ERROR',
        'runId': run_id,
        'message': message,
        'code': code,
    }


def _chunk_message_for_stream(message: str) -> list[str]:
    if message.strip() == '':
        return ['I hit an unexpected formatting issue while building the response.']

    return [
        message[index : index + _STREAM_TEXT_CHUNK_SIZE]
        for index in range(0, len(message), _STREAM_TEXT_CHUNK_SIZE)
    ]
