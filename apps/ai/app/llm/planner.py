from __future__ import annotations

import json
from typing import Any, Literal

from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

PlannerClearField = Literal[
    'category',
    'gender',
    'thermalProfile',
    'priceMinCents',
    'priceMaxCents',
    'availability',
    'minRating',
]


class PlannerOutputInvalidError(Exception):
    """Raised when planner JSON is present but does not satisfy the output contract."""


class _PlannerFilters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',  # reject unexpected keys
        populate_by_name=True,  # Python uses snake_case while LLM JSON uses camelCase aliases
        str_strip_whitespace=True,  # trim surrounding whitespace on strings
    )

    # Nullable but required: the planner must return every filter key explicitly,
    # even when the value is null.
    category: str | None
    gender: str | None
    thermal_profile: str | None = Field(alias='thermalProfile')
    price_min_cents: int | None = Field(ge=0, alias='priceMinCents')
    price_max_cents: int | None = Field(ge=0, alias='priceMaxCents')
    availability: bool | None
    min_rating: float | None = Field(ge=0, le=5, alias='minRating')

    # Pydantic validates against the field definition first (including whether the
    # field is required), then runs this custom field validator.
    # Field validators are defined as class methods, not instance methods.
    @field_validator('category')
    @classmethod
    def normalize_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.lower()
        if normalized == '':
            return None
        if normalized not in {'tops', 'bottoms'}:
            raise ValueError('category must be "tops" or "bottoms" when provided.')
        return normalized

    @field_validator('gender')
    @classmethod
    def normalize_gender(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.lower()
        if normalized == '':
            return None
        if normalized in {'men', 'male', 'mens'}:
            return 'men'
        if normalized in {'women', 'female', 'womens'}:
            return 'women'
        if normalized == 'unisex':
            return 'unisex'
        raise ValueError('gender must be one of: men, women, unisex.')

    @field_validator('thermal_profile')
    @classmethod
    def normalize_thermal_profile(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.lower()
        if normalized == '':
            return None
        if normalized in {'hot_weather', 'hot-weather', 'hot weather'}:
            return 'hot_weather'
        if normalized in {'cold_weather', 'cold-weather', 'cold weather'}:
            return 'cold_weather'
        if normalized in {'all_season', 'all-season', 'all season'}:
            return 'all_season'
        raise ValueError('thermalProfile must be one of: hot_weather, cold_weather, all_season.')

    # Pydantic validates fields one by one first; this runs after that so it can
    # check the fully built _PlannerFilters object.
    @model_validator(mode='after')
    def validate_price_range(self) -> '_PlannerFilters':
        if (
            self.price_min_cents is not None
            and self.price_max_cents is not None
            and self.price_min_cents > self.price_max_cents
        ):
            raise ValueError('priceMinCents must be <= priceMaxCents.')
        return self


class QueryPlannerOutput(BaseModel):
    model_config = ConfigDict(
        extra='forbid',  # reject unexpected keys
        populate_by_name=True,  # Python uses snake_case while LLM JSON uses camelCase aliases
        str_strip_whitespace=True,  # trim surrounding whitespace on strings
    )

    # No default means these fields are required during Pydantic validation.
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
        system_prompt = self.build_query_planner_system_prompt(
            has_memory_context=has_memory_context,
        )

        for attempt in range(2):
            try:
                planner_result = self._call_llm_json(
                    payload=planner_payload,
                    system_prompt=system_prompt,
                    max_output_tokens=320,
                )
                validated_output = _validate_planner_output(planner_result)
            except PlannerOutputInvalidError:
                if attempt == 0:
                    continue
                raise

            self._last_run_metrics['planner_pass'] = True
            return validated_output

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
        raise PlannerOutputInvalidError('Query planner returned empty content.')
    return content.strip()


def _load_json_payload(*, content: str) -> dict[str, Any]:
    normalized = content.strip()
    if normalized.startswith('```'):
        normalized = normalized.strip('`')
        if normalized.lower().startswith('json'):
            normalized = normalized[4:].strip()

    try:
        parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
        # Tolerate occasional model wrappers by extracting the first JSON object.
        first_open = normalized.find('{')
        last_close = normalized.rfind('}')
        if first_open == -1 or last_close == -1 or last_close <= first_open:
            # as exc gives a variable name to the caught old error
            # raise NewError(...) from exc creates a new error and links the old one as its cause
            raise PlannerOutputInvalidError('Query planner output is not valid JSON.') from exc
        candidate = normalized[first_open : last_close + 1]
        decoder = json.JSONDecoder()
        try:
            parsed, _end = decoder.raw_decode(candidate)
        except json.JSONDecodeError as nested_exc:
            # as exc gives a variable name to the caught old error
            # raise NewError(...) from exc creates a new error and links the old one as its cause
            raise PlannerOutputInvalidError('Query planner output is not valid JSON.') from nested_exc

    if not isinstance(parsed, dict):
        raise PlannerOutputInvalidError('Query planner output must be a JSON object.')
    return parsed


def _derive_retrieval_mode(
    *,
    filters: _PlannerFilters,
    semantic_query: str,
) -> Literal['structured', 'hybrid', 'semantic']:
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
        return 'structured'
    if has_filters and has_semantic:
        return 'hybrid'
    if (not has_filters) and has_semantic:
        return 'semantic'
    return 'structured'


def _validate_planner_output(payload: dict[str, Any]) -> QueryPlannerOutput:
    try:
        validated = QueryPlannerOutput.model_validate(payload)
    except ValidationError as exc:
        raise PlannerOutputInvalidError(f'Query planner output failed validation: {exc}') from exc

    retrieval_mode = _derive_retrieval_mode(
        filters=validated.filters,
        semantic_query=validated.semantic_query,
    )
    return validated.model_copy(update={'retrieval_mode': retrieval_mode})
