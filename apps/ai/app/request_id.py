from __future__ import annotations

from uuid import uuid4

from fastapi import Request, Response

REQUEST_ID_HEADER = 'x-request-id'


def get_request_id_from_request(request: Request) -> str:
    value = getattr(request.state, 'request_id', None)
    if isinstance(value, str) and value.strip() != '':
        return value

    fallback = request.headers.get(REQUEST_ID_HEADER)
    if fallback and fallback.strip() != '':
        return fallback.strip()

    return str(uuid4())


async def attach_request_id_middleware(request: Request, call_next):
    inbound = request.headers.get(REQUEST_ID_HEADER)
    normalized_inbound = inbound.strip() if inbound and inbound.strip() else None
    request.state.request_id = normalized_inbound or str(uuid4())

    response: Response = await call_next(request)
    # Preserve externally supplied correlation ids when present.
    if normalized_inbound:
        response.headers[REQUEST_ID_HEADER] = normalized_inbound
    # Otherwise keep route-provided ids (for example payload requestId) and
    # only backfill from middleware state when the header is absent.
    elif not response.headers.get(REQUEST_ID_HEADER):
        response.headers[REQUEST_ID_HEADER] = request.state.request_id
    return response
