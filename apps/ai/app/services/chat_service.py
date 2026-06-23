from __future__ import annotations

from dataclasses import dataclass
from inspect import isawaitable
from typing import Any
from uuid import uuid4

from app.graph import get_assistant_workflow
from app.llm import AssistantSynthesisStreamResult
from app.schemas import ChatRequest, ChatResponse


@dataclass
class StreamEnvelope:
    run_id: str
    message_id: str
    thread_id: str
    chat_response: ChatResponse
    telemetry: dict[str, Any]
    synthesis_stream: AssistantSynthesisStreamResult | None = None


async def build_chat_stream_response(payload: ChatRequest, *, run_id: str) -> StreamEnvelope:
    workflow = get_assistant_workflow()

    if not hasattr(workflow, 'prepare_stream_response'):
        raise RuntimeError('Assistant workflow must implement prepare_stream_response for stream delivery.')

    prepared = workflow.prepare_stream_response(payload, run_id=run_id)
    if isawaitable(prepared):
        prepared = await prepared

    telemetry = dict(prepared.telemetry)
    resolved_run_id = str(telemetry.get('run_id') or run_id)
    thread_id = str(telemetry.get('thread_id') or f'{payload.user_context.user_id}:{payload.session_id}')

    return StreamEnvelope(
        run_id=resolved_run_id,
        message_id=f'msg-{uuid4()}',
        thread_id=thread_id,
        chat_response=prepared.chat_response,
        telemetry=telemetry,
        synthesis_stream=prepared.synthesis_stream,
    )


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
