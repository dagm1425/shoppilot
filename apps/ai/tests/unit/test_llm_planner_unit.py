from __future__ import annotations

import json

import pytest

from app.llm.planner import AssistantQueryPlanner, PlannerOutputInvalidError


class _FakeResponse:
    def __init__(self, content: str | None) -> None:
        self.text = content


class _FakeModels:
    def __init__(
        self,
        *,
        content: str | None = None,
        contents: list[str | None] | None = None,
        should_raise: bool = False,
    ) -> None:
        self._content = content
        self._contents = list(contents or [])
        self._should_raise = should_raise
        self.calls = 0
        self.kwargs_history: list[dict[str, object]] = []

    def generate_content(self, **kwargs):  # noqa: ANN003, ANN204
        self.calls += 1
        self.kwargs_history.append(kwargs)
        if self._should_raise:
            raise RuntimeError('synthetic planner failure')
        if len(self._contents) > 0:
            return _FakeResponse(self._contents.pop(0))
        return _FakeResponse(self._content)


class _FakeClient:
    def __init__(
        self,
        *,
        content: str | None = None,
        contents: list[str | None] | None = None,
        should_raise: bool = False,
    ) -> None:
        self.models = _FakeModels(content=content, contents=contents, should_raise=should_raise)


def _planner(
    *,
    content: str | None = None,
    contents: list[str | None] | None = None,
    enabled: bool = True,
    should_raise: bool = False,
) -> AssistantQueryPlanner:
    return AssistantQueryPlanner(
        client=_FakeClient(content=content, contents=contents, should_raise=should_raise),
        model_name='gemini-2.5-flash',
        provider='gemini',
        enabled=enabled,
    )


def _plan_kwargs() -> dict[str, object]:
    return {
        'query': 'show warm tops for men under 80',
        'prior_filters': {},
        'prior_semantic_query': '',
        'prior_comparison_requested': False,
        'prior_reset_requested': False,
        'has_prior_recommendations': False,
    }


def _filters_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        'category': None,
        'gender': None,
        'thermalProfile': None,
        'priceMinCents': None,
        'priceMaxCents': None,
        'availability': None,
        'minRating': None,
    }
    payload.update(overrides)
    return payload


def _planner_output_json(
    *,
    retrieval_mode: str,
    filters: dict[str, object],
    semantic_query: str,
    reset_requested: bool = False,
    clear_fields: list[str] | None = None,
    comparison_requested: bool = False,
) -> str:
    return json.dumps(
        {
            'retrievalMode': retrieval_mode,
            'filters': filters,
            'semanticQuery': semantic_query,
            'resetRequested': reset_requested,
            'clearFields': clear_fields or [],
            'comparisonRequested': comparison_requested,
        },
        separators=(',', ':'),
    )


def test_planner_accepts_valid_contract_output() -> None:
    planner = _planner(
        content=_planner_output_json(
            retrieval_mode='hybrid',
            filters=_filters_payload(
                category='tops',
                gender='men',
                thermalProfile='cold_weather',
                priceMaxCents=8000,
            ),
            semantic_query='warm workout',
        ),
    )

    result = planner.plan(**_plan_kwargs())

    assert result.retrieval_mode == 'hybrid'
    assert result.filters.category == 'tops'
    assert result.filters.gender == 'men'
    assert result.filters.thermal_profile == 'cold_weather'
    assert result.filters.price_max_cents == 8000
    assert result.semantic_query == 'warm workout'


def test_planner_rejects_invalid_json() -> None:
    planner = _planner(content='not-json')

    with pytest.raises(PlannerOutputInvalidError, match='not valid JSON'):
        planner.plan(**_plan_kwargs())
    assert planner._client.models.calls == 2
    assert planner.last_run_metrics == {
        'has_memory_context': False,
        'planner_pass': False,
    }


def test_planner_retries_once_when_first_schema_output_is_invalid() -> None:
    planner = _planner(
        contents=[
            _planner_output_json(
                retrieval_mode='structured',
                filters=_filters_payload(priceMinCents=9000, priceMaxCents=1000),
                semantic_query='',
            ),
            _planner_output_json(
                retrieval_mode='structured',
                filters=_filters_payload(priceMinCents=9000, priceMaxCents=None),
                semantic_query='',
            ),
        ],
    )

    result = planner.plan(**_plan_kwargs())
    assert result.filters.price_min_cents == 9000
    assert result.filters.price_max_cents is None
    assert planner._client.models.calls == 2
    assert planner.last_run_metrics == {
        'has_memory_context': False,
        'planner_pass': True,
    }


def test_planner_rejects_missing_required_keys() -> None:
    planner = _planner(
        content='{"retrievalMode":"hybrid","filters":{},"semanticQuery":""}',
    )

    with pytest.raises(PlannerOutputInvalidError, match='failed validation'):
        planner.plan(**_plan_kwargs())
    assert planner._client.models.calls == 2


def test_planner_accepts_null_thermal_profile_when_uncertain() -> None:
    planner = _planner(
        content=_planner_output_json(
            retrieval_mode='hybrid',
            filters=_filters_payload(
                category='tops',
                thermalProfile=None,
            ),
            semantic_query='summer breeze training',
        ),
    )

    result = planner.plan(**_plan_kwargs())
    assert result.filters.thermal_profile is None


def test_planner_disabled_raises_runtime_error() -> None:
    planner = _planner(
        content=_planner_output_json(
            retrieval_mode='structured',
            filters=_filters_payload(),
            semantic_query='',
        ),
        enabled=False,
    )

    with pytest.raises(RuntimeError, match='disabled'):
        planner.plan(**_plan_kwargs())


def test_planner_uses_single_planner_call_with_prior_state_when_memory_exists() -> None:
    planner = _planner(
        content=_planner_output_json(
            retrieval_mode='structured',
            filters=_filters_payload(
                category='tops',
                gender='women',
                priceMaxCents=4000,
                availability=True,
            ),
            semantic_query='',
        ),
    )

    result = planner.plan(
        query='make those for women and under 40 in stock',
        prior_filters={'category': 'tops', 'gender': 'men'},
        prior_semantic_query='warm workout tops',
        prior_comparison_requested=False,
        prior_reset_requested=False,
        has_prior_recommendations=True,
    )

    assert result.retrieval_mode == 'structured'
    assert result.filters.gender == 'women'
    assert result.filters.price_max_cents == 4000
    assert planner._client.models.calls == 1
    planner_payload = planner._client.models.kwargs_history[0]['contents']
    assert isinstance(planner_payload, str)
    assert '"priorState"' in planner_payload
    assert planner.last_run_metrics == {
        'has_memory_context': True,
        'planner_pass': True,
    }


def test_planner_fails_when_required_keys_are_missing() -> None:
    planner = _planner(
        content='{"retrievalMode":"hybrid","filters":{},"semanticQuery":""}',
    )

    with pytest.raises(PlannerOutputInvalidError, match='failed validation'):
        planner.plan(
            query='make those for women',
            prior_filters={'category': 'tops'},
            prior_semantic_query='warm tops',
            prior_comparison_requested=False,
            prior_reset_requested=False,
            has_prior_recommendations=True,
        )
    assert planner._client.models.calls == 2
    assert planner.last_run_metrics == {
        'has_memory_context': True,
        'planner_pass': False,
    }


def test_follow_up_planner_prompt_includes_carry_forward_rules() -> None:
    planner = _planner(content='{}')
    prompt = planner.build_query_planner_system_prompt(has_memory_context=True).lower()

    assert 'in stock' in prompt
    assert 'available now' in prompt
    assert 'out of stock' in prompt
    assert 'unavailable' in prompt
    assert 'use priorstate as the starting state' in prompt
    assert 'comparisonrequested' in prompt
    assert 'asks to compare items' in prompt


def test_new_search_planner_prompt_forces_non_memory_flags_to_defaults() -> None:
    planner = _planner(content='{}')
    prompt = planner.build_query_planner_system_prompt(has_memory_context=False).lower()

    assert 'because priorstate is absent, always return []' in prompt
    assert 'because priorstate is absent, always return false' in prompt
