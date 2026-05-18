from __future__ import annotations

import logging
from collections.abc import Mapping

import sentry_sdk

from app.config.settings import AppSettings

logger = logging.getLogger(__name__)
_sentry_initialized = False


def initialize_sentry(settings: AppSettings) -> None:
    global _sentry_initialized

    if (
        _sentry_initialized
        or not settings.sentry_enabled
        or settings.node_env == 'test'
    ):
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.node_env,
        sample_rate=settings.sentry_sample_rate,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=settings.sentry_profiles_sample_rate,
    )
    _sentry_initialized = True

    logger.info(
        {
            'event': 'ai.sentry_initialized',
            'environment': settings.node_env,
            'sample_rate': settings.sentry_sample_rate,
            'traces_sample_rate': settings.sentry_traces_sample_rate,
            'profiles_sample_rate': settings.sentry_profiles_sample_rate,
        },
    )


def capture_sentry_exception(
    exc: Exception,
    *,
    tags: Mapping[str, str] | None = None,
) -> None:
    if not _sentry_initialized:
        return

    if tags is None:
        sentry_sdk.capture_exception(exc)
        return

    with sentry_sdk.push_scope() as scope:
        for key, value in tags.items():
            scope.set_tag(key, value)
        sentry_sdk.capture_exception(exc)
