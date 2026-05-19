from __future__ import annotations

from functools import lru_cache

from google import genai
from google.genai import types as genai_types

from app.config.settings import get_settings
from app.llm.synthesizer import AssistantSynthesizer


@lru_cache(maxsize=1)
def get_assistant_synthesizer() -> AssistantSynthesizer:
    settings = get_settings()
    return AssistantSynthesizer(
        client=genai.Client(
            api_key=settings.llm_synthesis_api_key.get_secret_value(),
            http_options=genai_types.HttpOptions(
                base_url=str(settings.llm_synthesis_base_url),
                timeout=settings.ai_llm_synthesis_timeout_ms,
            ),
        ),
        model_name=settings.llm_synthesis_model,
        provider=settings.llm_synthesis_provider,
        enabled=settings.ai_llm_synthesis_enabled,
        max_tokens=settings.ai_llm_synthesis_max_tokens,
        temperature=settings.ai_llm_synthesis_temperature,
        top_n_products=settings.ai_llm_synthesis_top_n_products,
    )
