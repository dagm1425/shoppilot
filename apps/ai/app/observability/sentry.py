from __future__ import annotations

import logging

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


def capture_exception_if_configured(exc: Exception) -> None:
    if not _sentry_initialized:
        return

    sentry_sdk.capture_exception(exc)
