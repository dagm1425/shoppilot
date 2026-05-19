from __future__ import annotations

from uuid import uuid4

from fastapi import Request, Response

REQUEST_ID_HEADER = 'x-request-id'
RUN_ID_HEADER = 'x-run-id'
THREAD_ID_HEADER = 'x-thread-id'
AI_PROVIDER_HEADER = 'x-ai-provider'
AI_MODEL_HEADER = 'x-ai-model'
AI_TOKEN_PROMPT_HEADER = 'x-ai-token-prompt'
AI_TOKEN_COMPLETION_HEADER = 'x-ai-token-completion'
AI_TOKEN_TOTAL_HEADER = 'x-ai-token-total'
AI_COST_ESTIMATE_HEADER = 'x-ai-cost-estimate-usd'
AI_FALLBACK_REASON_HEADER = 'x-ai-fallback-reason'


def get_request_id_from_request(request: Request) -> str:
    value = getattr(request.state, 'request_id', None)
    if isinstance(value, str) and value.strip() != '':
        return value

    fallback = request.headers.get(REQUEST_ID_HEADER)
    if fallback and fallback.strip() != '':
        return fallback.strip()

    return str(uuid4())


def get_run_id_from_request(request: Request) -> str:
    value = getattr(request.state, 'run_id', None)
    if isinstance(value, str) and value.strip() != '':
        return value

    fallback = request.headers.get(RUN_ID_HEADER)
    if fallback and fallback.strip() != '':
        return fallback.strip()

    return f'run-{uuid4()}'


async def attach_request_id_middleware(request: Request, call_next):
    inbound = request.headers.get(REQUEST_ID_HEADER)
    normalized_inbound = inbound.strip() if inbound and inbound.strip() else None
    inbound_run_id = request.headers.get(RUN_ID_HEADER)
    normalized_run_id = inbound_run_id.strip() if inbound_run_id and inbound_run_id.strip() else None

    request.state.request_id = normalized_inbound or str(uuid4())
    request.state.run_id = normalized_run_id or f'run-{uuid4()}'

    response: Response = await call_next(request)
    # Preserve externally supplied correlation ids when present.
    if normalized_inbound:
        response.headers[REQUEST_ID_HEADER] = normalized_inbound
    # Otherwise keep route-provided ids (for example payload requestId) and
    # only backfill from middleware state when the header is absent.
    elif not response.headers.get(REQUEST_ID_HEADER):
        response.headers[REQUEST_ID_HEADER] = request.state.request_id

    if normalized_run_id:
        response.headers[RUN_ID_HEADER] = normalized_run_id
    elif not response.headers.get(RUN_ID_HEADER):
        response.headers[RUN_ID_HEADER] = request.state.run_id

    return response
