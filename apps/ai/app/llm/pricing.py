from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPricing:
    prompt_per_million_usd: float
    completion_per_million_usd: float


# future: centralized pricing registry - unify model cost updates without code edits
_MODEL_PRICING: dict[tuple[str, str], ModelPricing] = {
    ('gemini', 'gemini-2.5-flash'): ModelPricing(
        prompt_per_million_usd=0.15,
        completion_per_million_usd=0.60,
    ),
    ('openai', 'gpt-4.1-mini'): ModelPricing(
        prompt_per_million_usd=0.40,
        completion_per_million_usd=1.60,
    ),
}


def estimate_request_cost_usd(
    *,
    provider: str,
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    total_tokens: int | None,
) -> float | None:
    if prompt_tokens is None and completion_tokens is None and total_tokens is None:
        return None

    pricing = _MODEL_PRICING.get((_normalize(provider), _normalize(model)))
    if pricing is None:
        return None

    prompt = max(0, prompt_tokens or 0)
    completion = completion_tokens
    if completion is None and total_tokens is not None:
        completion = max(0, total_tokens - prompt)

    resolved_completion = max(0, completion or 0)
    estimated = (
        (prompt / 1_000_000) * pricing.prompt_per_million_usd
        + (resolved_completion / 1_000_000) * pricing.completion_per_million_usd
    )
    return round(estimated, 10)


def _normalize(value: str) -> str:
    return value.strip().lower()
