from __future__ import annotations

import json
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, field_validator


class _AssistantSynthesisPayload(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    assistant_message: str = Field(alias='assistantMessage', min_length=1)
    follow_up_prompts: list[str] = Field(default_factory=list, alias='followUpPrompts')
    comparison_summary: str | None = Field(default=None, alias='comparisonSummary')

    @field_validator('assistant_message')
    @classmethod
    def validate_assistant_message(cls, value: str) -> str:
        if value.strip() == '':
            raise ValueError('assistantMessage must not be blank.')
        return value

    @field_validator('follow_up_prompts')
    @classmethod
    def sanitize_follow_up_prompts(cls, value: list[str]) -> list[str]:
        sanitized: list[str] = []
        for prompt in value:
            cleaned = prompt.strip()
            if cleaned == '':
                continue
            if cleaned not in sanitized:
                sanitized.append(cleaned)
            if len(sanitized) == 3:
                break
        return sanitized

    @field_validator('comparison_summary')
    @classmethod
    def sanitize_comparison_summary(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AssistantSynthesisResult(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        str_strip_whitespace=True,
    )

    assistant_message: str
    follow_up_prompts: list[str] = Field(default_factory=list)
    comparison_summary: str | None = None


class AssistantSynthesizer:
    def __init__(
        self,
        *,
        client: genai.Client,
        model_name: str,
        provider: str,
        enabled: bool,
        max_tokens: int,
        temperature: float,
        top_n_products: int,
    ) -> None:
        self._client = client
        self._model_name = model_name
        self._provider = provider
        self._enabled = enabled
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._top_n_products = top_n_products

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def provider(self) -> str:
        return self._provider

    def build_system_prompt(self) -> str:
        return (
            'You are a synthesis-only assistant for e-commerce recommendations.\n'
            'Use only the provided products and metadata.\n'
            'Do not invent product IDs, names, prices, ratings, or availability.\n'
            'If provided products are empty, return a graceful no-result message and helpful follow-up prompts.\n'
            'Return strict JSON with exactly these keys: assistantMessage, followUpPrompts, comparisonSummary.\n'
            'assistantMessage must be concise and shopper-friendly.\n'
            'followUpPrompts must be an array of at most 3 short prompts.\n'
            'comparisonSummary may be null.'
        )

    def build_user_prompt_payload(
        self,
        *,
        query: str,
        retrieval_mode: str | None,
        normalized_filters: dict[str, Any],
        retrieved_products: list[dict[str, Any]],
        comparison_summary: str | None,
    ) -> dict[str, Any]:
        return {
            'query': query,
            'retrievalMode': retrieval_mode,
            'normalizedFilters': normalized_filters,
            'products': _trim_products_for_prompt(
                retrieved_products=retrieved_products,
                top_n=self._top_n_products,
            ),
            'comparisonSummary': comparison_summary,
        }

    def synthesize(
        self,
        *,
        query: str,
        retrieval_mode: str | None,
        normalized_filters: dict[str, Any],
        retrieved_products: list[dict[str, Any]],
        comparison_summary: str | None,
    ) -> AssistantSynthesisResult:
        if not self._enabled:
            raise RuntimeError('LLM synthesis is disabled.')

        system_prompt = self.build_system_prompt()
        user_payload = self.build_user_prompt_payload(
            query=query,
            retrieval_mode=retrieval_mode,
            normalized_filters=normalized_filters,
            retrieved_products=retrieved_products,
            comparison_summary=comparison_summary,
        )

        prompt_payload = json.dumps(user_payload, separators=(',', ':'))
        try:
            response = self._client.models.generate_content(
                model=self._model_name,
                contents=prompt_payload,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=self._temperature,
                    max_output_tokens=self._max_tokens,
                    response_mime_type='application/json',
                    response_json_schema=_AssistantSynthesisPayload.model_json_schema(),
                ),
            )
        except genai_errors.APIError as exc:
            raise RuntimeError(
                f'Gemini synthesis request failed with API error {exc.code}: {exc.message}'
            ) from exc
        except Exception as exc:  # pragma: no cover - fallback for non-API runtime failures
            raise RuntimeError(f'Gemini synthesis request failed: {exc}') from exc

        content = _extract_response_text(response=response)
        parsed = _load_json_payload(content=content)
        payload = _AssistantSynthesisPayload.model_validate(parsed)
        return AssistantSynthesisResult(
            assistant_message=payload.assistant_message,
            follow_up_prompts=payload.follow_up_prompts,
            comparison_summary=payload.comparison_summary,
        )


def _trim_products_for_prompt(
    *,
    retrieved_products: list[dict[str, Any]],
    top_n: int,
) -> list[dict[str, Any]]:
    trimmed: list[dict[str, Any]] = []
    for row in retrieved_products[:top_n]:
        if not isinstance(row, dict):
            continue

        product = row.get('product')
        if not isinstance(product, dict):
            continue

        trimmed.append(
            {
                'productId': product.get('productId'),
                'name': product.get('name'),
                'category': product.get('category'),
                'priceCents': product.get('priceCents'),
                'currency': product.get('currency'),
                'available': product.get('available'),
                'rating': product.get('rating'),
                'shortDescription': product.get('shortDescription'),
                'similarityScore': row.get('similarityScore'),
            }
        )

    return trimmed


def _extract_response_text(*, response: Any) -> str:
    content = getattr(response, 'text', None)
    if not isinstance(content, str) or content.strip() == '':
        raise ValueError('LLM synthesis returned empty content.')

    return content.strip()


def _load_json_payload(*, content: str) -> dict[str, Any]:
    normalized = content.strip()
    if normalized.startswith('```'):
        normalized = normalized.strip('`')
        if normalized.lower().startswith('json'):
            normalized = normalized[4:].strip()

    parsed = json.loads(normalized)
    if not isinstance(parsed, dict):
        raise ValueError('LLM synthesis output must be a JSON object.')
    return parsed
