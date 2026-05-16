from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config.settings import AppSettings


def _base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('OPENAI_API_KEY', 'test-openai-key')
    monkeypatch.setenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', 'gpt-4.1-mini')
    monkeypatch.setenv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small')


def test_settings_allow_langsmith_disabled_without_optional_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _base_env(monkeypatch)
    monkeypatch.delenv('LANGCHAIN_API_KEY', raising=False)
    monkeypatch.delenv('LANGCHAIN_PROJECT', raising=False)
    monkeypatch.setenv('LANGCHAIN_TRACING_V2', 'false')

    settings = AppSettings(_env_file=None)

    assert settings.langchain_tracing_v2 is False
    assert settings.langchain_api_key is None
    assert settings.langchain_project is None


def test_settings_require_langsmith_keys_when_tracing_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv('LANGCHAIN_TRACING_V2', 'true')
    monkeypatch.delenv('LANGCHAIN_API_KEY', raising=False)
    monkeypatch.delenv('LANGCHAIN_PROJECT', raising=False)

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)
