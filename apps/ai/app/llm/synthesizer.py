from __future__ import annotations

import inspect
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types


@dataclass
class AssistantSynthesisStreamResult:
    _stream: AsyncIterator[Any]
    assistant_message: str = ''
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    _consumed: bool = False

    def __aiter__(self) -> AsyncIterator[str]:
        return self._iterate()

    async def _iterate(self) -> AsyncIterator[str]:
        if self._consumed:
            raise RuntimeError('LLM synthesis stream can only be consumed once.')

        self._consumed = True
        buffered_text: list[str] = []
        last_chunk: Any = None

        async for chunk in self._stream:
            last_chunk = chunk
            text = getattr(chunk, 'text', None)
            if not isinstance(text, str) or text == '':
                continue

            buffered_text.append(text)
            yield text

        assistant_message = ''.join(buffered_text).strip()
        if assistant_message == '':
            raise ValueError('LLM streaming synthesis returned empty content.')

        self.assistant_message = assistant_message
        token_usage = _extract_token_usage(response=last_chunk)
        self.prompt_tokens = token_usage['prompt']
        self.completion_tokens = token_usage['completion']
        self.total_tokens = token_usage['total']

    async def aclose(self) -> None:
        aclose = getattr(self._stream, 'aclose', None)
        if callable(aclose):
            result = aclose()
            if inspect.isawaitable(result):
                await result
            return

        close = getattr(self._stream, 'close', None)
        if callable(close):
            close()


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

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def max_tokens(self) -> int:
        return self._max_tokens

    @property
    def top_n_products(self) -> int:
        return self._top_n_products

    def build_streaming_system_prompt(self) -> str:
        return (
            'You are a synthesis-only assistant for e-commerce recommendations.\n'
            'Use only the provided products and metadata.\n'
            'resolvedRequest is the authoritative summary of the current request.\n'
            'Do not invent product IDs, names, prices, ratings, or availability.\n'
            'If provided products are empty, return a graceful no-result message.\n'
            'Return plain assistant text only.\n'
            'Do not return JSON.\n'
            'Do not use markdown fences.\n'
            'Keep the answer concise and shopper-friendly.'
        )

    def build_user_prompt_payload(
        self,
        *,
        resolved_request: str,
        retrieval_mode: str | None,
        normalized_filters: dict[str, Any],
        retrieved_products: list[dict[str, Any]],
        comparison_summary: str | None,
    ) -> dict[str, Any]:
        return {
            'resolvedRequest': resolved_request,
            'retrievalMode': retrieval_mode,
            'normalizedFilters': normalized_filters,
            'products': _trim_products_for_prompt(
                retrieved_products=retrieved_products,
                top_n=self._top_n_products,
            ),
            'comparisonSummary': comparison_summary,
        }

    async def synthesize_stream(
        self,
        *,
        resolved_request: str,
        retrieval_mode: str | None,
        normalized_filters: dict[str, Any],
        retrieved_products: list[dict[str, Any]],
        comparison_summary: str | None,
    ) -> AssistantSynthesisStreamResult:
        if not self._enabled:
            raise RuntimeError('LLM synthesis is disabled.')

        system_prompt = self.build_streaming_system_prompt()
        user_payload = self.build_user_prompt_payload(
            resolved_request=resolved_request,
            retrieval_mode=retrieval_mode,
            normalized_filters=normalized_filters,
            retrieved_products=retrieved_products,
            comparison_summary=comparison_summary,
        )

        prompt_payload = json.dumps(user_payload, separators=(',', ':'))
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=self._model_name,
                contents=prompt_payload,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=self._temperature,
                    max_output_tokens=self._max_tokens,
                    response_mime_type='text/plain',
                ),
            )
        except genai_errors.APIError as exc:
            raise RuntimeError(
                f'Gemini synthesis stream failed with API error {exc.code}: {exc.message}'
            ) from exc
        except Exception as exc:  # pragma: no cover - fallback for non-API runtime failures
            raise RuntimeError(f'Gemini synthesis stream failed: {exc}') from exc

        return AssistantSynthesisStreamResult(_stream=stream)


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


def _extract_token_usage(*, response: Any) -> dict[str, int | None]:
    usage_metadata = getattr(response, 'usage_metadata', None)
    if usage_metadata is None:
        usage_metadata = getattr(response, 'usageMetadata', None)

    if usage_metadata is None:
        return {'prompt': None, 'completion': None, 'total': None}

    prompt_tokens = _coerce_token_counter(
        getattr(usage_metadata, 'prompt_token_count', None),
        getattr(usage_metadata, 'promptTokenCount', None),
        usage_metadata.get('prompt_token_count') if isinstance(usage_metadata, dict) else None,
        usage_metadata.get('promptTokenCount') if isinstance(usage_metadata, dict) else None,
    )
    completion_tokens = _coerce_token_counter(
        getattr(usage_metadata, 'candidates_token_count', None),
        getattr(usage_metadata, 'completion_token_count', None),
        getattr(usage_metadata, 'candidatesTokenCount', None),
        getattr(usage_metadata, 'completionTokenCount', None),
        usage_metadata.get('candidates_token_count') if isinstance(usage_metadata, dict) else None,
        usage_metadata.get('completion_token_count') if isinstance(usage_metadata, dict) else None,
        usage_metadata.get('candidatesTokenCount') if isinstance(usage_metadata, dict) else None,
        usage_metadata.get('completionTokenCount') if isinstance(usage_metadata, dict) else None,
    )
    total_tokens = _coerce_token_counter(
        getattr(usage_metadata, 'total_token_count', None),
        getattr(usage_metadata, 'totalTokenCount', None),
        usage_metadata.get('total_token_count') if isinstance(usage_metadata, dict) else None,
        usage_metadata.get('totalTokenCount') if isinstance(usage_metadata, dict) else None,
    )

    return {
        'prompt': prompt_tokens,
        'completion': completion_tokens,
        'total': total_tokens,
    }


def _coerce_token_counter(*candidates: Any) -> int | None:
    for value in candidates:
        if value is None:
            continue
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return max(0, value)
        if isinstance(value, float):
            return max(0, int(value))
        if isinstance(value, str):
            stripped = value.strip()
            if stripped == '':
                continue
            try:
                return max(0, int(float(stripped)))
            except ValueError:
                continue

    return None
