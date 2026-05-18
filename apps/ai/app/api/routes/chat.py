from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from app.config.settings import get_settings
from app.request_id import REQUEST_ID_HEADER, get_request_id_from_request
from app.schemas import ChatRequest, ChatResponse
from app.services.chat_service import build_chat_response

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
