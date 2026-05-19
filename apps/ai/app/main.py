from __future__ import annotations

import logging

from fastapi import FastAPI
from pydantic import ValidationError

from app.config.settings import get_settings
from app.errors import register_exception_handlers
from app.observability import initialize_langsmith, initialize_sentry
from app.request_id import attach_request_id_middleware

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title='ShopPilot AI Service',
        version='0.1.0',
    )

    app.middleware('http')(attach_request_id_middleware)

    try:
        settings = get_settings()
    except ValidationError as exc:
        logger.error('ai.config_invalid')
        raise RuntimeError(
            'Invalid AI service configuration. Set required AI environment variables.'
        ) from exc

    app.state.settings = settings

    initialize_langsmith(settings)

    if settings.llm_synthesis_uses_deprecated_openai_aliases:
        logger.warning(
            {
                'event': 'ai.synthesis_env_deprecated_alias_used',
                'message': (
                    'Deprecated OPENAI_* synthesis aliases detected. '
                    'Switch to LLM_SYNTHESIS_* or GEMINI_* synthesis env variables.'
                ),
            },
        )

    initialize_sentry(settings)

    register_exception_handlers(app)

    from app.api.router import api_router

    # Versioned API router for forward compatibility.
    app.include_router(api_router, prefix='/v1')
    # Keep unversioned routes available in subphase 4.1 acceptance checks.
    app.include_router(api_router)

    logger.info(
        'ai.service_bootstrap',
        extra={
            'llm_synthesis_provider': settings.llm_synthesis_provider,
            'llm_synthesis_model': settings.llm_synthesis_model,
            'llm_synthesis_base_url': str(settings.llm_synthesis_base_url),
            'embedding_provider': settings.embedding_provider,
            'embedding_model': settings.embedding_model,
            'embedding_base_url': str(settings.embedding_base_url),
            'langchain_tracing_v2': settings.langchain_tracing_v2,
            'sentry_enabled': settings.sentry_enabled,
            'chroma_collection_name': settings.chroma_collection_name,
        },
    )

    return app


app = create_app()
