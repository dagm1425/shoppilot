from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config.settings import get_settings


def _set_required_env() -> None:
    os.environ.setdefault('OPENAI_API_KEY', 'test-openai-key')
    os.environ.setdefault('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    os.environ.setdefault('OPENAI_CHAT_MODEL', 'gpt-4.1-mini')
    os.environ.setdefault('EMBEDDING_PROVIDER', 'gemini')
    os.environ.setdefault('GEMINI_API_KEY', 'test-gemini-key')
    os.environ.setdefault('EMBEDDING_MODEL', 'gemini-embedding-001')
    os.environ.setdefault('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    os.environ.setdefault('LANGCHAIN_TRACING_V2', 'false')


@pytest.fixture(scope='session', autouse=True)
def test_env() -> Iterator[None]:
    _set_required_env()
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    _set_required_env()
    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
