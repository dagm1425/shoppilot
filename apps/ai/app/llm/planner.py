from __future__ import annotations

import json
from typing import Any, Literal

from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, field_validator

PlannerClearField = Literal[
    'category',
    'gender',
    'thermalProfile',
    'priceMinCents',
    'priceMaxCents',
    'availability',
    'minRating',
]


class _PlannerFilters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    category: str | None = None
    gender: str | None = None
    thermal_profile: str | None = Field(default=None, alias='thermalProfile')
    price_min_cents: int | None = Field(default=None, ge=0, alias='priceMinCents')
    price_max_cents: int | None = Field(default=None, ge=0, alias='priceMaxCents')
    availability: bool | None = None
    min_rating: float | None = Field(default=None, ge=0, le=5, alias='minRating')


class QueryPlannerOutput(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    retrieval_mode: Literal['structured', 'hybrid', 'semantic'] = Field(alias='retrievalMode')
    filters: _PlannerFilters
    semantic_query: str = Field(alias='semanticQuery')
    reset_requested: bool = Field(alias='resetRequested')
    clear_fields: list[PlannerClearField] = Field(alias='clearFields')
    comparison_requested: bool = Field(alias='comparisonRequested')

    @field_validator('semantic_query')
    @classmethod
    def normalize_semantic_query(cls, value: str) -> str:
        return value.strip()

    @field_validator('clear_fields')
    @classmethod
    def dedupe_clear_fields(cls, value: list[PlannerClearField]) -> list[PlannerClearField]:
        deduped: list[PlannerClearField] = []
        for key in value:
            if key not in deduped:
                deduped.append(key)
        return deduped


class AssistantQueryPlanner:
    def __init__(
        self,
        *,
        client: genai.Client,
        model_name: str,
        provider: str,
        enabled: bool,
    ) -> None:
        self._client = client
        self._model_name = model_name
        self._provider = provider
        self._enabled = enabled
        self._last_run_metrics: dict[str, bool] = {
            'has_memory_context': False,
            'planner_pass': False,
        }

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
    def last_run_metrics(self) -> dict[str, bool]:
        return dict(self._last_run_metrics)

    def build_query_planner_system_prompt(self, *, has_memory_context: bool) -> str:
        if has_memory_context:
            preamble = """
You are a strict retrieval planner for an e-commerce assistant handling a follow-up turn.

Input contains:
- the current user query
- priorState

Your job is to use priorState as the starting state, update it based on the current user query, and return the full next-state JSON object.
Follow-up state rules:
1. Update filters field-by-field:
   - for each key in filters, keep the prior value unless the current user query explicitly changes, removes, or broadens that filter
   - for filter keys that change, set the new value using the filter field rules below
   - for filter keys the current user query explicitly removes or broadens, set that filter value to null
2. Update semanticQuery:
   - keep, add, or replace semantic terms subject to the semanticQuery rules below
   - keep it if the prior semantic meaning is still relevant
     example: prior semanticQuery="workout" and current user query is "for women under 50" -> keep "workout"
   - add new semantic terms if the current user query adds compatible semantic intent
     example: prior semanticQuery="workout" and current user query is "for running too" -> semanticQuery should include both "workout" and "running"
   - replace it if the current user query introduces different semantic intent
     example: prior semanticQuery="running" and current user query is "for recovery instead" -> replace "running" with "recovery"
3. If the user says reset/start over/new search, ignore priorState and build state only from the current user query.
4. After updating all other relevant next-state fields, recompute retrievalMode using the retrievalMode consistency rules below.
5. Return the full next-state object, not a partial patch and not prose.
""".strip()
        else:
            preamble = """
You are a strict retrieval planner for an e-commerce assistant handling a new search turn.

Input contains only the current user query.
Your job is to build a fresh next-state JSON object from that query.
Do not assume prior constraints unless they are explicitly present in the current user query.
""".strip()

        if has_memory_context:
            planner_flag_rules = """
8) clearFields
- use only when the current user query explicitly clears or broadens prior filter constraints.
- allowed values only:
  category, gender, thermalProfile, priceMinCents, priceMaxCents, availability, minRating
- otherwise [].

9) resetRequested
- true only when the current user query explicitly resets prior context (says start over, new search, reset).
- otherwise false.

10) comparisonRequested
- true only when the current user query explicitly asks to compare items.
- otherwise false.
""".strip()
        else:
            planner_flag_rules = """
8) clearFields
- because priorState is absent, always return [].

9) resetRequested
- because priorState is absent, always return false.

10) comparisonRequested
- because priorState is absent, always return false.
""".strip()

        return f"""{preamble}

You are a strict retrieval planner for an e-commerce assistant.

Return exactly one JSON object with exactly these six top-level keys, even when some values are false, empty, or null:
filters, semanticQuery, retrievalMode, resetRequested, clearFields, comparisonRequested.
No markdown. No prose. No code fences.

Required top-level keys (always include all):
- filters
- semanticQuery
- retrievalMode
- resetRequested
- clearFields
- comparisonRequested

Output contract template:
{{
  "filters": {{
    "category": "tops|bottoms|null",
    "gender": "men|women|unisex|null",
    "thermalProfile": "hot_weather|cold_weather|all_season|null",
    "priceMinCents": "integer>=0|null",
    "priceMaxCents": "integer>=0|null",
    "availability": "boolean|null",
    "minRating": "number(0..5)|null"
  }},
  "semanticQuery": "string (can be empty)",
  "retrievalMode": "structured|hybrid|semantic",
  "resetRequested": "boolean",
  "clearFields": ["array of allowed keys"],
  "comparisonRequested": "boolean"
}}

Field rules:
1) filters.category
- set only to tops or bottoms when user intent is explicit.
- otherwise null.
- when garment words appear in the current user query, map them to category using these mappings: sweater/hoodie/tank -> tops; jogger/legging/shorts -> bottoms.

2) filters.gender
- map men/male/mens -> men
- map women/female/womens -> women
- map unisex -> unisex
- otherwise null.

3) filters.thermalProfile
- hot_weather for hot/summer/breathable/lightweight/airflow/ventilated intent.
- cold_weather for cold/winter/warm layer/insulated/thermal/fleece/merino intent.
- all_season only when explicitly all-season/transitional.
- if unclear, null.

4) filters.priceMinCents / priceMaxCents
- parse explicit numeric price constraints directly.
- if no explicit numeric price:
  premium/high-end/luxury -> priceMinCents=5000 and priceMaxCents=null
  budget/budget-friendly/affordable/cheap -> priceMaxCents=3000 and priceMinCents=null
  mid-range -> leave both null unless explicit numbers exist.
- explicit numeric prices always override tier defaults.

5) filters.availability
- true for in stock / available now / available
- false for out of stock / unavailable
- otherwise null.

6) filters.minRating
- set from explicit rating constraints (e.g., rated at least 4, 4+ stars, minimum 4.2).
- otherwise null.

7) semanticQuery
- include only meaningful residual semantic intent not represented by filters
  (e.g., workout context, style preference, usage context).
- set to empty string "" when no meaningful residual semantic intent remains.
- do NOT repeat structured filter content in semanticQuery
  (category, gender, availability, numeric price, rating, mapped premium/budget terms, mapped climate terms).
- keep only specific garment/item words in semanticQuery when they add product preference beyond the generic category
  (e.g., "sweater", "hoodie", "tank", "legging", "jogger"), even if category is mapped.
- do NOT keep generic category words in semanticQuery such as "top", "tops", "bottom", or "bottoms".
- example: "show sweaters for women under 90" -> filters.category="tops" and semanticQuery includes "sweater".

{planner_flag_rules}

retrievalMode MUST obey these consistency rules:
- structured: semanticQuery must be "" and at least one filter is non-null.
- hybrid: semanticQuery must be non-empty and at least one filter is non-null.
- semantic: semanticQuery must be non-empty and all filters are null.
- never output hybrid with empty semanticQuery.
- never output semantic with empty semanticQuery.

Final consistency step (mandatory before returning JSON):
- compute hasFilters = any filter value is non-null
- compute hasSemantic = semanticQuery.strip() != ""
- if hasFilters and not hasSemantic => retrievalMode = "structured"
- if hasFilters and hasSemantic => retrievalMode = "hybrid"
- if not hasFilters and hasSemantic => retrievalMode = "semantic"
- if not hasFilters and not hasSemantic => retrievalMode = "structured"
""".strip()

    # Backward-compatible alias used by existing tests and callers.
    def build_system_prompt(self) -> str:
        return self.build_query_planner_system_prompt(has_memory_context=False)

    def build_planner_prompt_payload(
        self,
        *,
        query: str,
        prior_filters: dict[str, Any],
        prior_semantic_query: str,
        prior_comparison_requested: bool,
        prior_reset_requested: bool,
        has_prior_recommendations: bool,
        has_memory_context: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            'query': query,
        }
        if has_memory_context:
            payload['priorState'] = {
                'filters': prior_filters,
                'semanticQuery': prior_semantic_query,
                'comparisonRequested': prior_comparison_requested,
                'resetRequested': prior_reset_requested,
                'hasRecommendedProducts': has_prior_recommendations,
            }
        return payload

    def plan(
        self,
        *,
        query: str,
        prior_filters: dict[str, Any],
        prior_semantic_query: str,
        prior_comparison_requested: bool,
        prior_reset_requested: bool,
        has_prior_recommendations: bool,
    ) -> QueryPlannerOutput:
        if not self._enabled:
            raise RuntimeError('Query planner is disabled.')

        self._last_run_metrics = {
            'has_memory_context': False,
            'planner_pass': False,
        }

        has_memory_context = (
            bool(prior_semantic_query.strip())
            or prior_comparison_requested
            or prior_reset_requested
            or has_prior_recommendations
            or any(value is not None for value in prior_filters.values())
        )
        self._last_run_metrics['has_memory_context'] = has_memory_context

        planner_payload = self.build_planner_prompt_payload(
            query=query,
            prior_filters=prior_filters,
            prior_semantic_query=prior_semantic_query,
            prior_comparison_requested=prior_comparison_requested,
            prior_reset_requested=prior_reset_requested,
            has_prior_recommendations=has_prior_recommendations,
            has_memory_context=has_memory_context,
        )
        planner_result = self._call_llm_json(
            payload=planner_payload,
            system_prompt=self.build_query_planner_system_prompt(
                has_memory_context=has_memory_context,
            ),
            max_output_tokens=320,
        )
        _ensure_required_keys(
            payload=planner_result,
            required_keys={
                'retrievalMode',
                'filters',
                'semanticQuery',
                'resetRequested',
                'clearFields',
                'comparisonRequested',
            },
            stage='query_planner',
        )
        self._last_run_metrics['planner_pass'] = True
        return _coerce_planner_output(planner_result)

    def _call_llm_json(
        self,
        *,
        payload: dict[str, Any],
        system_prompt: str,
        max_output_tokens: int,
    ) -> dict[str, Any]:
        prompt_payload = json.dumps(payload, separators=(',', ':'))
        try:
            response = self._client.models.generate_content(
                model=self._model_name,
                contents=prompt_payload,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0,
                    max_output_tokens=max_output_tokens,
                    response_mime_type='application/json',
                    # This task is strict JSON mapping; disable model thinking to avoid
                    # consuming output budget and truncating JSON payloads.
                    thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
                ),
            )
        except genai_errors.APIError as exc:
            raise RuntimeError(
                f'Gemini planner request failed with API error {exc.code}: {exc.message}'
            ) from exc
        except Exception as exc:  # pragma: no cover - fallback for non-API runtime failures
            raise RuntimeError(f'Gemini planner request failed: {exc}') from exc

        content = _extract_response_text(response=response)
        return _load_json_payload(content=content)


def _extract_response_text(*, response: Any) -> str:
    content = getattr(response, 'text', None)
    if not isinstance(content, str) or content.strip() == '':
        raise ValueError('Query planner returned empty content.')
    return content.strip()


def _load_json_payload(*, content: str) -> dict[str, Any]:
    normalized = content.strip()
    if normalized.startswith('```'):
        normalized = normalized.strip('`')
        if normalized.lower().startswith('json'):
            normalized = normalized[4:].strip()

    try:
        parsed = json.loads(normalized)
    except json.JSONDecodeError:
        # Tolerate occasional model wrappers by extracting the first JSON object.
        first_open = normalized.find('{')
        last_close = normalized.rfind('}')
        if first_open == -1 or last_close == -1 or last_close <= first_open:
            raise
        candidate = normalized[first_open : last_close + 1]
        decoder = json.JSONDecoder()
        parsed, _end = decoder.raw_decode(candidate)

    if not isinstance(parsed, dict):
        raise ValueError('Query planner output must be a JSON object.')
    return parsed


def _ensure_required_keys(
    *,
    payload: dict[str, Any],
    required_keys: set[str],
    stage: str,
) -> None:
    missing = sorted(key for key in required_keys if key not in payload)
    if missing:
        raise ValueError(f'{stage} missing required keys: {missing}')


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'true', '1', 'yes'}:
            return True
        if normalized in {'false', '0', 'no'}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return False


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if isinstance(value, str):
        candidate = value.strip()
        if candidate == '':
            return None
        try:
            parsed = int(float(candidate))
        except ValueError:
            return None
        return max(0, parsed)
    return None


def _coerce_float(value: Any, *, min_value: float, max_value: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return min(max(float(value), min_value), max_value)
    if isinstance(value, str):
        candidate = value.strip()
        if candidate == '':
            return None
        try:
            parsed = float(candidate)
        except ValueError:
            return None
        return min(max(parsed, min_value), max_value)
    return None


def _normalize_category(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in {'tops', 'bottoms'}:
        return normalized
    return None


def _normalize_gender(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in {'men', 'male', 'mens'}:
        return 'men'
    if normalized in {'women', 'female', 'womens'}:
        return 'women'
    if normalized == 'unisex':
        return 'unisex'
    return None


def _normalize_thermal_profile(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in {'hot_weather', 'hot-weather', 'hot weather'}:
        return 'hot_weather'
    if normalized in {'cold_weather', 'cold-weather', 'cold weather'}:
        return 'cold_weather'
    if normalized in {'all_season', 'all-season', 'all season'}:
        return 'all_season'
    return None


def _normalize_retrieval_mode(value: Any) -> Literal['structured', 'hybrid', 'semantic']:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'structured', 'hybrid', 'semantic'}:
            return normalized
    return 'hybrid'


def _coerce_planner_output(payload: dict[str, Any]) -> QueryPlannerOutput:
    filters_payload = payload.get('filters')
    if not isinstance(filters_payload, dict):
        filters_payload = {}

    price_min_cents = _coerce_int(filters_payload.get('priceMinCents'))
    price_max_cents = _coerce_int(filters_payload.get('priceMaxCents'))
    if (
        price_min_cents is not None
        and price_max_cents is not None
        and price_min_cents > price_max_cents
    ):
        price_max_cents = None

    clear_fields_payload = payload.get('clearFields')
    clear_fields: list[PlannerClearField] = []
    if isinstance(clear_fields_payload, list):
        for value in clear_fields_payload:
            if isinstance(value, str) and value in {
                'category',
                'gender',
                'thermalProfile',
                'priceMinCents',
                'priceMaxCents',
                'availability',
                'minRating',
            }:
                typed_value = value  # keep literal for type checker
                if typed_value not in clear_fields:
                    clear_fields.append(typed_value)

    semantic_query_raw = payload.get('semanticQuery')
    semantic_query = semantic_query_raw.strip() if isinstance(semantic_query_raw, str) else ''

    filters = _PlannerFilters.model_construct(
        category=_normalize_category(filters_payload.get('category')),
        gender=_normalize_gender(filters_payload.get('gender')),
        thermal_profile=_normalize_thermal_profile(filters_payload.get('thermalProfile')),
        price_min_cents=price_min_cents,
        price_max_cents=price_max_cents,
        availability=(
            _coerce_bool(filters_payload.get('availability'))
            if filters_payload.get('availability') is not None
            else None
        ),
        min_rating=_coerce_float(filters_payload.get('minRating'), min_value=0, max_value=5),
    )

    # Deterministic mode reconciliation:
    # Avoid planner-mode drift by deriving retrieval mode from canonical signal presence.
    has_filters = any(
        value is not None
        for value in (
            filters.category,
            filters.gender,
            filters.thermal_profile,
            filters.price_min_cents,
            filters.price_max_cents,
            filters.availability,
            filters.min_rating,
        )
    )
    has_semantic = semantic_query != ''
    if has_filters and not has_semantic:
        retrieval_mode = 'structured'
    elif has_filters and has_semantic:
        retrieval_mode = 'hybrid'
    elif (not has_filters) and has_semantic:
        retrieval_mode = 'semantic'
    else:
        retrieval_mode = 'structured'

    return QueryPlannerOutput.model_construct(
        retrieval_mode=retrieval_mode,
        filters=filters,
        semantic_query=semantic_query,
        reset_requested=_coerce_bool(payload.get('resetRequested')),
        clear_fields=clear_fields,
        comparison_requested=_coerce_bool(payload.get('comparisonRequested')),
    )
