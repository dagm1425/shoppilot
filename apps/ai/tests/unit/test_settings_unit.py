from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config.settings import AppSettings


def _base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'gemini')
    monkeypatch.setenv('LLM_SYNTHESIS_API_KEY', 'test-gemini-synthesis-key')
    monkeypatch.setenv('LLM_SYNTHESIS_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('LLM_SYNTHESIS_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('EMBEDDING_PROVIDER', 'gemini')
    monkeypatch.setenv('GEMINI_API_KEY', 'test-gemini-key')
    monkeypatch.setenv('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('EMBEDDING_MODEL', 'gemini-embedding-001')


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


def test_settings_allow_sentry_disabled_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv('SENTRY_ENABLED', 'false')
    monkeypatch.delenv('SENTRY_DSN', raising=False)

    settings = AppSettings(_env_file=None)

    assert settings.sentry_enabled is False
    assert settings.sentry_dsn is None


def test_settings_require_sentry_dsn_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv('SENTRY_ENABLED', 'true')
    monkeypatch.delenv('SENTRY_DSN', raising=False)

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)


def test_settings_apply_llm_synthesis_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)

    settings = AppSettings(_env_file=None)

    assert settings.llm_synthesis_provider == 'gemini'
    assert settings.llm_synthesis_api_key.get_secret_value() == 'test-gemini-synthesis-key'
    assert str(settings.llm_synthesis_base_url) == 'https://generativelanguage.googleapis.com/v1beta'
    assert settings.llm_synthesis_model == 'gemini-2.5-flash'
    assert settings.ai_llm_synthesis_enabled is True
    assert settings.ai_llm_synthesis_timeout_ms == 8000
    assert settings.ai_llm_synthesis_max_tokens == 220
    assert settings.ai_llm_synthesis_temperature == 0.2
    assert settings.ai_llm_synthesis_top_n_products == 3


@pytest.mark.parametrize(
    ('field', 'value'),
    [
        ('AI_LLM_SYNTHESIS_TIMEOUT_MS', '500'),
        ('AI_LLM_SYNTHESIS_MAX_TOKENS', '999'),
        ('AI_LLM_SYNTHESIS_TEMPERATURE', '1.5'),
        ('AI_LLM_SYNTHESIS_TOP_N_PRODUCTS', '0'),
    ],
)
def test_settings_reject_invalid_llm_synthesis_ranges(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: str,
) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv(field, value)

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)


def test_settings_apply_embedding_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)

    settings = AppSettings(_env_file=None)

    assert settings.embedding_provider == 'gemini'
    assert settings.embedding_api_key.get_secret_value() == 'test-gemini-key'
    assert str(settings.embedding_base_url) == 'https://generativelanguage.googleapis.com/v1beta'
    assert settings.embedding_model == 'gemini-embedding-001'


def test_settings_support_gemini_base_model_alias_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'gemini')
    monkeypatch.setenv('LLM_SYNTHESIS_API_KEY', 'test-gemini-synthesis-key')
    monkeypatch.setenv('LLM_SYNTHESIS_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('LLM_SYNTHESIS_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('GEMINI_API_KEY', 'test-gemini-key')
    monkeypatch.delenv('EMBEDDING_BASE_URL', raising=False)
    monkeypatch.delenv('EMBEDDING_MODEL', raising=False)
    monkeypatch.setenv('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001')

    settings = AppSettings(_env_file=None)

    assert settings.embedding_api_key.get_secret_value() == 'test-gemini-key'
    assert str(settings.embedding_base_url) == 'https://generativelanguage.googleapis.com/v1beta'
    assert settings.embedding_model == 'gemini-embedding-001'


def test_settings_support_synthesis_alias_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'gemini')
    monkeypatch.delenv('LLM_SYNTHESIS_API_KEY', raising=False)
    monkeypatch.delenv('LLM_SYNTHESIS_BASE_URL', raising=False)
    monkeypatch.delenv('LLM_SYNTHESIS_MODEL', raising=False)
    monkeypatch.setenv('GEMINI_API_KEY', 'test-gemini-key')
    monkeypatch.setenv('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('GEMINI_CHAT_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('EMBEDDING_PROVIDER', 'gemini')
    monkeypatch.setenv('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('EMBEDDING_MODEL', 'gemini-embedding-001')

    settings = AppSettings(_env_file=None)

    assert settings.llm_synthesis_api_key.get_secret_value() == 'test-gemini-key'
    assert str(settings.llm_synthesis_base_url) == 'https://generativelanguage.googleapis.com/v1beta'
    assert settings.llm_synthesis_model == 'gemini-2.5-flash'


def test_settings_support_deprecated_openai_synthesis_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'gemini')
    monkeypatch.delenv('LLM_SYNTHESIS_API_KEY', raising=False)
    monkeypatch.delenv('LLM_SYNTHESIS_BASE_URL', raising=False)
    monkeypatch.delenv('LLM_SYNTHESIS_MODEL', raising=False)
    monkeypatch.delenv('GEMINI_BASE_URL', raising=False)
    monkeypatch.delenv('GEMINI_CHAT_MODEL', raising=False)
    monkeypatch.setenv('OPENAI_API_KEY', 'test-openai-key')
    monkeypatch.setenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', 'gpt-4.1-mini')
    monkeypatch.setenv('EMBEDDING_PROVIDER', 'gemini')
    monkeypatch.setenv('GEMINI_API_KEY', 'test-gemini-key')
    monkeypatch.setenv('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('EMBEDDING_MODEL', 'gemini-embedding-001')

    settings = AppSettings(_env_file=None)

    assert settings.llm_synthesis_api_key.get_secret_value() == 'test-gemini-key'
    assert str(settings.llm_synthesis_base_url) == 'https://api.openai.com/v1'
    assert settings.llm_synthesis_model == 'gpt-4.1-mini'
    assert settings.llm_synthesis_uses_deprecated_openai_aliases is True


def test_settings_reject_legacy_embedding_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'gemini')
    monkeypatch.setenv('LLM_SYNTHESIS_API_KEY', 'test-gemini-synthesis-key')
    monkeypatch.setenv('LLM_SYNTHESIS_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('LLM_SYNTHESIS_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('EMBEDDING_PROVIDER', 'gemini')
    monkeypatch.setenv('EMBEDDING_API_KEY', 'legacy-key')
    monkeypatch.setenv('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('EMBEDDING_MODEL', 'gemini-embedding-001')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)


def test_settings_reject_unsupported_embedding_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv('EMBEDDING_PROVIDER', 'openai')

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)


def test_settings_reject_unsupported_synthesis_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'openai')

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)


def test_settings_require_shared_gemini_key_when_synthesis_key_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('LLM_SYNTHESIS_PROVIDER', 'gemini')
    monkeypatch.delenv('LLM_SYNTHESIS_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.setenv('LLM_SYNTHESIS_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('LLM_SYNTHESIS_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('EMBEDDING_PROVIDER', 'gemini')
    monkeypatch.setenv('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
    monkeypatch.setenv('EMBEDDING_MODEL', 'gemini-embedding-001')

    with pytest.raises(ValidationError):
        AppSettings(_env_file=None)
