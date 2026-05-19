from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from time import perf_counter

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse

from app.config.settings import get_settings
from app.observability import capture_sentry_exception
from app.request_id import (
    AI_COST_ESTIMATE_HEADER,
    AI_FALLBACK_REASON_HEADER,
    AI_MODEL_HEADER,
    AI_PROVIDER_HEADER,
    AI_TOKEN_COMPLETION_HEADER,
    AI_TOKEN_PROMPT_HEADER,
    AI_TOKEN_TOTAL_HEADER,
    REQUEST_ID_HEADER,
    RUN_ID_HEADER,
    THREAD_ID_HEADER,
    get_request_id_from_request,
    get_run_id_from_request,
)
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
    started_at = perf_counter()
    settings = get_settings()

    effective_request_id = payload.request_id or get_request_id_from_request(request)
    effective_run_id = get_run_id_from_request(request)
    response.headers[REQUEST_ID_HEADER] = effective_request_id
    response.headers[RUN_ID_HEADER] = effective_run_id

    thread_id = f'{payload.user_context.user_id}:{payload.session_id}'
    response.headers[THREAD_ID_HEADER] = thread_id

    logger.info(
        {
            'event': 'ai.chat_request',
            'request_id': effective_request_id,
            'run_id': effective_run_id,
            'thread_id': thread_id,
            'session_id': payload.session_id,
            'path': request.url.path,
            'method': request.method,
        },
    )

    try:
        chat_response, telemetry = build_chat_response(
            payload,
            model_name=settings.llm_synthesis_model,
            run_id=effective_run_id,
            transport='json',
        )
    except Exception:
        logger.exception(
            'ai.chat_request_failed',
            extra={
                'request_id': effective_request_id,
                'run_id': effective_run_id,
                'thread_id': thread_id,
                'session_id': payload.session_id,
                'latency_ms': int((perf_counter() - started_at) * 1000),
                'outcome': 'failure',
                'transport': 'json',
            },
        )
        raise

    _apply_telemetry_headers(response=response, telemetry=telemetry)

    logger.info(
        {
            'event': 'ai.chat_request_completed',
            'request_id': effective_request_id,
            'run_id': telemetry.get('run_id', effective_run_id),
            'thread_id': telemetry.get('thread_id', thread_id),
            'session_id': payload.session_id,
            'transport': 'json',
            'latency_ms': int((perf_counter() - started_at) * 1000),
            'outcome': 'success',
        },
    )

    return chat_response


@router.post('/ai/chat/stream')
async def post_chat_stream(
    payload: ChatRequest,
    request: Request,
    response: Response,
) -> StreamingResponse:
    settings = get_settings()

    effective_request_id = payload.request_id or get_request_id_from_request(request)
    effective_run_id = get_run_id_from_request(request)
    response.headers[REQUEST_ID_HEADER] = effective_request_id
    response.headers[RUN_ID_HEADER] = effective_run_id

    thread_id = f'{payload.user_context.user_id}:{payload.session_id}'
    response.headers[THREAD_ID_HEADER] = thread_id

    logger.info(
        {
            'event': 'ai.chat_stream_request',
            'request_id': effective_request_id,
            'run_id': effective_run_id,
            'thread_id': thread_id,
            'session_id': payload.session_id,
            'path': request.url.path,
            'method': request.method,
        },
    )

    try:
        envelope = build_chat_stream_envelope(
            payload,
            model_name=settings.llm_synthesis_model,
            run_id=effective_run_id,
        )
    except Exception as exc:
        capture_sentry_exception(
            exc,
            tags={
                'flow': 'ai_assistant',
                'transport': 'sse',
                'error_type': 'stream_setup_failure',
                'request_id': effective_request_id,
                'run_id': effective_run_id,
            },
        )

        async def stream_setup_failure() -> AsyncIterator[bytes]:
            error_event = build_run_error_event(
                run_id=effective_run_id,
                message='Assistant service failed before stream start.',
            )
            yield _encode_sse_event('RUN_ERROR', error_event)

        return StreamingResponse(
            stream_setup_failure(),
            media_type='text/event-stream',
            headers={
                REQUEST_ID_HEADER: effective_request_id,
                RUN_ID_HEADER: effective_run_id,
                THREAD_ID_HEADER: thread_id,
                'cache-control': 'no-cache, no-transform',
                'connection': 'keep-alive',
            },
        )

    _apply_telemetry_headers(response=response, telemetry=envelope.telemetry)
    response.headers[THREAD_ID_HEADER] = envelope.thread_id

    events = build_stream_event_sequence(
        run_id=envelope.run_id,
        message_id=envelope.message_id,
        thread_id=envelope.thread_id,
        chat_response=envelope.chat_response,
    )

    async def stream_events() -> AsyncIterator[bytes]:
        run_id = envelope.run_id
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

            for event in events:
                if await request.is_disconnected():
                    logger.info(
                        {
                            'event': 'ai.chat_stream_disconnected',
                            'request_id': effective_request_id,
                            'session_id': payload.session_id,
                            'run_id': run_id,
                            'thread_id': envelope.thread_id,
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
                    'thread_id': envelope.thread_id,
                    'transport': 'sse',
                    'llm_provider': envelope.telemetry.get('llm_provider'),
                    'llm_model': envelope.telemetry.get('llm_model'),
                    'token_usage_prompt': envelope.telemetry.get('token_usage_prompt'),
                    'token_usage_completion': envelope.telemetry.get('token_usage_completion'),
                    'token_usage_total': envelope.telemetry.get('token_usage_total'),
                    'cost_estimate_usd': envelope.telemetry.get('cost_estimate_usd'),
                    'fallback_reason': envelope.telemetry.get('fallback_reason'),
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
                    'thread_id': envelope.thread_id,
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
                    'run_id': run_id,
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
            RUN_ID_HEADER: envelope.run_id,
            THREAD_ID_HEADER: envelope.thread_id,
            **_build_telemetry_headers(envelope.telemetry),
            'cache-control': 'no-cache, no-transform',
            'connection': 'keep-alive',
        },
    )


def _apply_telemetry_headers(response: Response, telemetry: dict[str, object]) -> None:
    headers = _build_telemetry_headers(telemetry)
    for key, value in headers.items():
        response.headers[key] = value


def _build_telemetry_headers(telemetry: dict[str, object]) -> dict[str, str]:
    provider = telemetry.get('llm_provider')
    model = telemetry.get('llm_model')
    prompt_tokens = telemetry.get('token_usage_prompt')
    completion_tokens = telemetry.get('token_usage_completion')
    total_tokens = telemetry.get('token_usage_total')
    cost_estimate_usd = telemetry.get('cost_estimate_usd')
    fallback_reason = telemetry.get('fallback_reason')

    headers: dict[str, str] = {}

    if isinstance(provider, str) and provider.strip() != '':
        headers[AI_PROVIDER_HEADER] = provider
    if isinstance(model, str) and model.strip() != '':
        headers[AI_MODEL_HEADER] = model
    if isinstance(prompt_tokens, int):
        headers[AI_TOKEN_PROMPT_HEADER] = str(prompt_tokens)
    if isinstance(completion_tokens, int):
        headers[AI_TOKEN_COMPLETION_HEADER] = str(completion_tokens)
    if isinstance(total_tokens, int):
        headers[AI_TOKEN_TOTAL_HEADER] = str(total_tokens)
    if isinstance(cost_estimate_usd, (int, float)):
        headers[AI_COST_ESTIMATE_HEADER] = f'{float(cost_estimate_usd):.10f}'
    if isinstance(fallback_reason, str) and fallback_reason.strip() != '':
        headers[AI_FALLBACK_REASON_HEADER] = fallback_reason

    return headers


def _encode_sse_event(event_name: str, payload: dict[str, object]) -> bytes:
    return f'event: {event_name}\ndata: {json.dumps(payload, separators=(",", ":"))}\n\n'.encode('utf-8')
