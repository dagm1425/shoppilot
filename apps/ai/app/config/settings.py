from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, AnyHttpUrl, Field, PrivateAttr, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=True,
        extra='ignore',
    )

    llm_synthesis_provider: str = Field(
        default='gemini',
        min_length=1,
        validation_alias='LLM_SYNTHESIS_PROVIDER',
    )
    llm_synthesis_api_key: SecretStr = Field(
        validation_alias=AliasChoices(
            'LLM_SYNTHESIS_API_KEY',
            'GEMINI_API_KEY',
            'OPENAI_API_KEY',
        )
    )
    llm_synthesis_base_url: AnyHttpUrl = Field(
        default='https://generativelanguage.googleapis.com/v1beta',
        validation_alias=AliasChoices(
            'LLM_SYNTHESIS_BASE_URL',
            'GEMINI_BASE_URL',
            'OPENAI_BASE_URL',
        ),
    )
    llm_synthesis_model: str = Field(
        default='gemini-2.5-flash',
        min_length=1,
        validation_alias=AliasChoices(
            'LLM_SYNTHESIS_MODEL',
            'GEMINI_CHAT_MODEL',
            'OPENAI_CHAT_MODEL',
        ),
    )
    embedding_provider: str = Field(default='gemini', min_length=1, validation_alias='EMBEDDING_PROVIDER')
    embedding_api_key: SecretStr = Field(validation_alias='GEMINI_API_KEY')
    embedding_base_url: AnyHttpUrl = Field(
        default='https://generativelanguage.googleapis.com/v1beta',
        validation_alias=AliasChoices('EMBEDDING_BASE_URL', 'GEMINI_BASE_URL'),
    )
    embedding_model: str = Field(
        default='gemini-embedding-001',
        min_length=1,
        validation_alias=AliasChoices('EMBEDDING_MODEL', 'GEMINI_EMBEDDING_MODEL'),
    )
    database_url: str = Field(
        default='postgresql://postgres:postgres@localhost:5432/shoppilot',
        validation_alias='DATABASE_URL',
    )
    ai_search_top_k: int = Field(default=5, ge=1, le=20, validation_alias='AI_SEARCH_TOP_K')
    ai_hybrid_candidate_limit: int = Field(default=200, ge=1, le=5000, validation_alias='AI_HYBRID_CANDIDATE_LIMIT')
    ai_semantic_min_score: float = Field(
        default=0.72,
        ge=0,
        le=1,
        validation_alias='AI_SEMANTIC_MIN_SCORE',
    )
    ai_semantic_relative_floor: float = Field(
        default=0.88,
        ge=0,
        le=1,
        validation_alias='AI_SEMANTIC_RELATIVE_FLOOR',
    )
    ai_llm_synthesis_enabled: bool = Field(default=True, validation_alias='AI_LLM_SYNTHESIS_ENABLED')
    ai_query_planner_enabled: bool = Field(default=True, validation_alias='AI_QUERY_PLANNER_ENABLED')
    ai_query_planner_timeout_ms: int = Field(
        default=10000,
        ge=10000,
        le=30000,
        validation_alias='AI_QUERY_PLANNER_TIMEOUT_MS',
    )
    ai_llm_synthesis_timeout_ms: int = Field(
        default=8000,
        ge=1000,
        le=30000,
        validation_alias='AI_LLM_SYNTHESIS_TIMEOUT_MS',
    )
    ai_llm_synthesis_max_tokens: int = Field(
        default=220,
        ge=64,
        le=800,
        validation_alias='AI_LLM_SYNTHESIS_MAX_TOKENS',
    )
    ai_llm_synthesis_temperature: float = Field(
        default=0.2,
        ge=0,
        le=1,
        validation_alias='AI_LLM_SYNTHESIS_TEMPERATURE',
    )
    ai_llm_synthesis_top_n_products: int = Field(
        default=3,
        ge=1,
        le=5,
        validation_alias='AI_LLM_SYNTHESIS_TOP_N_PRODUCTS',
    )
    ai_index_batch_size: int = Field(default=25, ge=1, le=200, validation_alias='AI_INDEX_BATCH_SIZE')
    ai_index_version: str = Field(default='phase4-v1', min_length=1, validation_alias='AI_INDEX_VERSION')
    chroma_persist_directory: str = Field(
        default='.chroma',
        min_length=1,
        validation_alias='CHROMA_PERSIST_DIRECTORY',
    )
    chroma_collection_name: str = Field(
        default='shoppilot_products',
        min_length=1,
        validation_alias='CHROMA_COLLECTION_NAME',
    )

    langchain_tracing_v2: bool = Field(default=False, validation_alias='LANGCHAIN_TRACING_V2')
    langchain_api_key: SecretStr | None = Field(default=None, validation_alias='LANGCHAIN_API_KEY')
    langchain_project: str | None = Field(default=None, validation_alias='LANGCHAIN_PROJECT')
    langchain_endpoint: AnyHttpUrl | None = Field(default=None, validation_alias='LANGCHAIN_ENDPOINT')
    node_env: str = Field(default='development', validation_alias='NODE_ENV')
    sentry_enabled: bool = Field(default=False, validation_alias='SENTRY_ENABLED')
    sentry_dsn: str | None = Field(default=None, validation_alias='SENTRY_DSN')
    sentry_sample_rate: float = Field(default=0, ge=0, le=1, validation_alias='SENTRY_SAMPLE_RATE')
    sentry_traces_sample_rate: float = Field(
        default=0,
        ge=0,
        le=1,
        validation_alias='SENTRY_TRACES_SAMPLE_RATE',
    )
    sentry_profiles_sample_rate: float = Field(
        default=0,
        ge=0,
        le=1,
        validation_alias='SENTRY_PROFILES_SAMPLE_RATE',
    )
    sentry_replays_session_sample_rate: float = Field(
        default=0,
        ge=0,
        le=1,
        validation_alias='SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
    )
    sentry_replays_on_error_sample_rate: float = Field(
        default=0,
        ge=0,
        le=1,
        validation_alias='SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
    )
    _llm_synthesis_uses_deprecated_openai_aliases: bool = PrivateAttr(default=False)

    @model_validator(mode='after')
    def validate_langsmith_requirements(self) -> 'AppSettings':
        if not self.langchain_tracing_v2:
            return self

        if self.langchain_api_key is None or self.langchain_project is None:
            raise ValueError(
                'LANGCHAIN_API_KEY and LANGCHAIN_PROJECT are required when LANGCHAIN_TRACING_V2=true.'
            )

        return self

    @model_validator(mode='after')
    def validate_sentry_requirements(self) -> 'AppSettings':
        if not self.sentry_enabled:
            return self

        if self.sentry_dsn is None or self.sentry_dsn.strip() == '':
            raise ValueError('SENTRY_DSN is required when SENTRY_ENABLED=true.')

        return self

    @model_validator(mode='after')
    def validate_embedding_provider(self) -> 'AppSettings':
        provider = self.embedding_provider.strip().lower()
        if provider != 'gemini':
            raise ValueError('EMBEDDING_PROVIDER must be "gemini" in Phase A.')

        self.embedding_provider = provider
        return self

    @model_validator(mode='after')
    def validate_llm_synthesis_provider(self) -> 'AppSettings':
        provider = self.llm_synthesis_provider.strip().lower()
        if provider != 'gemini':
            raise ValueError('LLM_SYNTHESIS_PROVIDER must be "gemini" in Phase B.')

        self.llm_synthesis_provider = provider
        self._llm_synthesis_uses_deprecated_openai_aliases = _uses_deprecated_openai_synthesis_aliases()
        return self

    @property
    def llm_synthesis_uses_deprecated_openai_aliases(self) -> bool:
        return self._llm_synthesis_uses_deprecated_openai_aliases


def _uses_deprecated_openai_synthesis_aliases() -> bool:
    dotenv_values = _read_env_file_values(Path('.env'))

    def has_value(key: str) -> bool:
        env_value = os.environ.get(key)
        if isinstance(env_value, str) and env_value.strip() != '':
            return True

        file_value = dotenv_values.get(key)
        if isinstance(file_value, str) and file_value.strip() != '':
            return True

        return False

    uses_openai_api_key_alias = (
        has_value('OPENAI_API_KEY')
        and not has_value('LLM_SYNTHESIS_API_KEY')
        and not has_value('GEMINI_API_KEY')
    )
    uses_openai_base_url_alias = (
        has_value('OPENAI_BASE_URL')
        and not has_value('LLM_SYNTHESIS_BASE_URL')
        and not has_value('GEMINI_BASE_URL')
    )
    uses_openai_model_alias = (
        has_value('OPENAI_CHAT_MODEL')
        and not has_value('LLM_SYNTHESIS_MODEL')
        and not has_value('GEMINI_CHAT_MODEL')
    )

    return (
        uses_openai_api_key_alias
        or uses_openai_base_url_alias
        or uses_openai_model_alias
    )


def _read_env_file_values(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if line == '' or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        values[key.strip()] = value.strip()

    return values


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
