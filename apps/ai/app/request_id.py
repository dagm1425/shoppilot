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
    request.state.request_id = inbound.strip() if inbound and inbound.strip() else str(uuid4())

    response: Response = await call_next(request)
    response.headers[REQUEST_ID_HEADER] = request.state.request_id
    return response
