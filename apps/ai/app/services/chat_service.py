from __future__ import annotations

import logging
from time import perf_counter
from uuid import uuid4
from typing import Any, Literal

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
    telemetry: dict[str, Any]


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


def build_chat_response(
    payload: ChatRequest,
    *,
    model_name: str,
    run_id: str,
    transport: Literal['json', 'sse'],
) -> tuple[ChatResponse, dict[str, Any]]:
    started_at = perf_counter()
    response, telemetry = _run_workflow(payload, run_id=run_id, transport=transport)
    duration_ms = int((perf_counter() - started_at) * 1000)

    response.model = model_name
    if telemetry.get('llm_model') is None:
        telemetry['llm_model'] = model_name

    thread_id = str(telemetry.get('thread_id') or f'{payload.user_context.user_id}:{payload.session_id}')

    logger.info(
        {
            'event': 'ai.graph_response_completed',
            'request_id': payload.request_id,
            'run_id': telemetry.get('run_id', run_id),
            'session_id': payload.session_id,
            'thread_id': thread_id,
            'transport': transport,
            'ai_retrieval_mode': response.retrieval_mode,
            'result_count': len(response.recommended_product_ids),
            'latency_ms': duration_ms,
            'llm_provider': telemetry.get('llm_provider'),
            'llm_model': telemetry.get('llm_model', model_name),
            'token_usage_prompt': telemetry.get('token_usage_prompt'),
            'token_usage_completion': telemetry.get('token_usage_completion'),
            'token_usage_total': telemetry.get('token_usage_total'),
            'cost_estimate_usd': telemetry.get('cost_estimate_usd'),
            'fallback_reason': telemetry.get('fallback_reason'),
            'budget_top_k': telemetry.get('budget_top_k'),
            'budget_top_n_products': telemetry.get('budget_top_n_products'),
            'budget_max_output_tokens': telemetry.get('budget_max_output_tokens'),
            'outcome': 'success',
        },
    )

    return response, telemetry


def build_chat_stream_envelope(payload: ChatRequest, *, model_name: str, run_id: str) -> StreamEnvelope:
    response, telemetry = build_chat_response(
        payload,
        model_name=model_name,
        run_id=run_id,
        transport='sse',
    )

    thread_id = str(telemetry.get('thread_id') or f'{payload.user_context.user_id}:{payload.session_id}')

    return StreamEnvelope(
        run_id=run_id,
        message_id=f'msg-{uuid4()}',
        thread_id=thread_id,
        chat_response=response,
        telemetry=telemetry,
    )


def _run_workflow(
    payload: ChatRequest,
    *,
    run_id: str,
    transport: Literal['json', 'sse'],
) -> tuple[ChatResponse, dict[str, Any]]:
    workflow = get_assistant_workflow()

    if hasattr(workflow, 'run_with_telemetry'):
        response, telemetry = workflow.run_with_telemetry(  # type: ignore[attr-defined]
            payload,
            run_id=run_id,
            transport=transport,
        )
        return response, dict(telemetry)

    response = workflow.run(payload)
    return (
        response,
        {
            'request_id': payload.request_id,
            'run_id': run_id,
            'thread_id': f'{payload.user_context.user_id}:{payload.session_id}',
            'transport': transport,
            'retrieval_mode': response.retrieval_mode,
            'llm_model': response.model,
            'llm_provider': None,
            'token_usage_prompt': None,
            'token_usage_completion': None,
            'token_usage_total': None,
            'cost_estimate_usd': None,
            'fallback_reason': None,
            'budget_top_k': None,
            'budget_top_n_products': None,
            'budget_max_output_tokens': None,
        },
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
