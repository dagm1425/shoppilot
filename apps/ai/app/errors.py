from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.request_id import get_request_id_from_request
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        request_id = get_request_id_from_request(request)

        payload = ErrorResponse.model_validate(
            {
                'error': {
                    'code': 'AI_VALIDATION_ERROR',
                    'message': 'Request validation failed.',
                    'requestId': request_id,
                    'details': exc.errors(),
                }
            }
        )

        logger.warning(
            'ai.validation_error',
            extra={
                'request_id': request_id,
                'path': request.url.path,
                'method': request.method,
            },
        )

        return JSONResponse(status_code=422, content=payload.model_dump(by_alias=True))

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = get_request_id_from_request(request)

        payload = ErrorResponse.model_validate(
            {
                'error': {
                    'code': 'AI_HTTP_ERROR',
                    'message': str(exc.detail),
                    'requestId': request_id,
                }
            }
        )

        logger.warning(
            'ai.http_error',
            extra={
                'request_id': request_id,
                'path': request.url.path,
                'method': request.method,
                'status_code': exc.status_code,
            },
        )

        return JSONResponse(status_code=exc.status_code, content=payload.model_dump(by_alias=True))

    @app.exception_handler(Exception)
    async def unexpected_exception_handler(request: Request, exc: Exception):
        request_id = get_request_id_from_request(request)

        payload = ErrorResponse.model_validate(
            {
                'error': {
                    'code': 'AI_INTERNAL_ERROR',
                    'message': 'Internal server error.',
                    'requestId': request_id,
                }
            }
        )

        logger.exception(
            'ai.internal_error',
            extra={
                'request_id': request_id,
                'path': request.url.path,
                'method': request.method,
            },
        )

        return JSONResponse(status_code=500, content=payload.model_dump(by_alias=True))
