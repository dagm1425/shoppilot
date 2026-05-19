from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any, TypeVar, cast

from app.config.settings import AppSettings

logger = logging.getLogger(__name__)

_langsmith_initialized = False
_TraceableCallable = TypeVar('_TraceableCallable', bound=Callable[..., Any])

try:
    from langsmith import traceable as _langsmith_traceable
except Exception:  # pragma: no cover - optional runtime dependency fallback
    _langsmith_traceable = None


def initialize_langsmith(settings: AppSettings) -> None:
    global _langsmith_initialized

    if (
        _langsmith_initialized
        or not settings.langchain_tracing_v2
        or settings.node_env == 'test'
    ):
        return

    api_key = settings.langchain_api_key.get_secret_value() if settings.langchain_api_key else ''
    project = settings.langchain_project or ''

    os.environ['LANGCHAIN_TRACING_V2'] = 'true'
    os.environ['LANGCHAIN_API_KEY'] = api_key
    os.environ['LANGCHAIN_PROJECT'] = project
    if settings.langchain_endpoint is not None:
        os.environ['LANGCHAIN_ENDPOINT'] = str(settings.langchain_endpoint)

    _langsmith_initialized = True
    logger.info(
        {
            'event': 'ai.langsmith_initialized',
            'project': project,
            'endpoint': str(settings.langchain_endpoint) if settings.langchain_endpoint else None,
        },
    )


def traceable(*args: Any, **kwargs: Any):
    if _langsmith_traceable is None:
        def noop_decorator(func: _TraceableCallable) -> _TraceableCallable:
            return func

        return noop_decorator

    return cast(Callable[..., Any], _langsmith_traceable)(*args, **kwargs)
