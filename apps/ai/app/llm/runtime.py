from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from app.config.settings import get_settings
from app.llm.synthesizer import AssistantSynthesizer


@lru_cache(maxsize=1)
def get_assistant_synthesizer() -> AssistantSynthesizer:
    settings = get_settings()
    return AssistantSynthesizer(
        client=OpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            base_url=str(settings.openai_base_url),
        ),
        model_name=settings.openai_chat_model,
        enabled=settings.ai_llm_synthesis_enabled,
        timeout_ms=settings.ai_llm_synthesis_timeout_ms,
        max_tokens=settings.ai_llm_synthesis_max_tokens,
        temperature=settings.ai_llm_synthesis_temperature,
        top_n_products=settings.ai_llm_synthesis_top_n_products,
    )
