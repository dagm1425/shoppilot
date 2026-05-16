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

    langchain_tracing_v2: bool = Field(default=False, validation_alias='LANGCHAIN_TRACING_V2')
    langchain_api_key: SecretStr | None = Field(default=None, validation_alias='LANGCHAIN_API_KEY')
    langchain_project: str | None = Field(default=None, validation_alias='LANGCHAIN_PROJECT')
    langchain_endpoint: AnyHttpUrl | None = Field(default=None, validation_alias='LANGCHAIN_ENDPOINT')

    @model_validator(mode='after')
    def validate_langsmith_requirements(self) -> 'AppSettings':
        if not self.langchain_tracing_v2:
            return self

        if self.langchain_api_key is None or self.langchain_project is None:
            raise ValueError(
                'LANGCHAIN_API_KEY and LANGCHAIN_PROJECT are required when LANGCHAIN_TRACING_V2=true.'
            )

        return self


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
