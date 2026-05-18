from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from time import perf_counter

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse

from app.config.settings import get_settings
from app.observability import capture_sentry_exception
from app.request_id import REQUEST_ID_HEADER, get_request_id_from_request
from app.schemas import ChatRequest, ChatResponse
from app.services.chat_service import (
    build_chat_response,
    build_chat_stream_envelope,
    build_run_error_event,
    build_stream_event_sequence,
)

router = APIRouter(tags=['chat'])
logger = logging.getLogger(__name__)


@router.post('/ai/chat', response_model=ChatResponse)
def post_chat(
    payload: ChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse:
    settings = get_settings()

    effective_request_id = payload.request_id or get_request_id_from_request(request)
    response.headers[REQUEST_ID_HEADER] = effective_request_id

    logger.info(
        {
            'event': 'ai.chat_request',
            'request_id': effective_request_id,
            'session_id': payload.session_id,
            'path': request.url.path,
            'method': request.method,
        },
    )

    return build_chat_response(payload, model_name=settings.openai_chat_model)


@router.post('/ai/chat/stream')
async def post_chat_stream(
    payload: ChatRequest,
    request: Request,
    response: Response,
) -> StreamingResponse:
    settings = get_settings()

    effective_request_id = payload.request_id or get_request_id_from_request(request)
    response.headers[REQUEST_ID_HEADER] = effective_request_id

    logger.info(
        {
            'event': 'ai.chat_stream_request',
            'request_id': effective_request_id,
            'session_id': payload.session_id,
            'path': request.url.path,
            'method': request.method,
        },
    )

    async def stream_events() -> AsyncIterator[bytes]:
        run_id = f'run-{effective_request_id}'
        started_at = perf_counter()

        try:
            if await request.is_disconnected():
                logger.info(
                    {
                        'event': 'ai.chat_stream_disconnected_before_start',
                        'request_id': effective_request_id,
                        'session_id': payload.session_id,
                        'latency_ms': int((perf_counter() - started_at) * 1000),
                        'outcome': 'client_disconnected',
                    },
                )
                return

            envelope = build_chat_stream_envelope(payload, model_name=settings.openai_chat_model)
            run_id = envelope.run_id

            events = build_stream_event_sequence(
                run_id=envelope.run_id,
                message_id=envelope.message_id,
                thread_id=envelope.thread_id,
                assistant_message=envelope.chat_response.assistant_message,
            )

            for event in events:
                if await request.is_disconnected():
                    logger.info(
                        {
                            'event': 'ai.chat_stream_disconnected',
                            'request_id': effective_request_id,
                            'session_id': payload.session_id,
                            'run_id': run_id,
                            'latency_ms': int((perf_counter() - started_at) * 1000),
                            'outcome': 'client_disconnected',
                        },
                    )
                    return

                yield _encode_sse_event(event['type'], event)

            logger.info(
                {
                    'event': 'ai.chat_stream_completed',
                    'request_id': effective_request_id,
                    'session_id': payload.session_id,
                    'run_id': run_id,
                    'latency_ms': int((perf_counter() - started_at) * 1000),
                    'outcome': 'success',
                },
            )
        except Exception as exc:
            logger.exception(
                'ai.chat_stream_failed',
                extra={
                    'request_id': effective_request_id,
                    'session_id': payload.session_id,
                    'run_id': run_id,
                    'latency_ms': int((perf_counter() - started_at) * 1000),
                    'outcome': 'stream_failure',
                },
            )
            capture_sentry_exception(
                exc,
                tags={
                    'flow': 'ai_assistant',
                    'transport': 'sse',
                    'error_type': 'stream_failure',
                    'request_id': effective_request_id,
                },
            )
            error_event = build_run_error_event(
                run_id=run_id,
                message='Assistant service failed to complete the stream.',
            )
            yield _encode_sse_event('RUN_ERROR', error_event)

    return StreamingResponse(
        stream_events(),
        media_type='text/event-stream',
        headers={
            REQUEST_ID_HEADER: effective_request_id,
            'cache-control': 'no-cache, no-transform',
            'connection': 'keep-alive',
        },
    )


def _encode_sse_event(event_name: str, payload: dict[str, object]) -> bytes:
    return f'event: {event_name}\ndata: {json.dumps(payload, separators=(",", ":"))}\n\n'.encode('utf-8')
