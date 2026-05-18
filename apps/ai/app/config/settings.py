from __future__ import annotations

from functools import lru_cache

from pydantic import AnyHttpUrl, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=True,
        extra='ignore',
    )

    openai_api_key: SecretStr = Field(validation_alias='OPENAI_API_KEY')
    openai_base_url: AnyHttpUrl = Field(validation_alias='OPENAI_BASE_URL')
    openai_chat_model: str = Field(min_length=1, validation_alias='OPENAI_CHAT_MODEL')
    openai_embedding_model: str = Field(min_length=1, validation_alias='OPENAI_EMBEDDING_MODEL')
    database_url: str = Field(
        default='postgresql://postgres:postgres@localhost:5432/shoppilot',
        validation_alias='DATABASE_URL',
    )
    ai_search_top_k: int = Field(default=5, ge=1, le=20, validation_alias='AI_SEARCH_TOP_K')
    ai_hybrid_candidate_limit: int = Field(default=200, ge=1, le=5000, validation_alias='AI_HYBRID_CANDIDATE_LIMIT')
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


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
