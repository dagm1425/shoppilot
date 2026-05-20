from __future__ import annotations

import pytest

from app.llm.planner import AssistantQueryPlanner


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

    def generate_content(self, **kwargs):  # noqa: ANN003, ANN204
        self.calls += 1
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


def test_planner_accepts_valid_contract_output() -> None:
    planner = _planner(
        content=(
            '{"retrievalMode":"hybrid","filters":{"category":"tops","gender":"men","thermalProfile":"cold_weather","priceMaxCents":8000},'
            '"semanticQuery":"warm workout","resetRequested":false,"clearFields":[],"comparisonRequested":false}'
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

    with pytest.raises(ValueError):
        planner.plan(**_plan_kwargs())


def test_planner_coerces_invalid_schema_values() -> None:
    planner = _planner(
        content='{"retrievalMode":"hybrid","filters":{"priceMinCents":9000,"priceMaxCents":1000},"semanticQuery":"","resetRequested":false,"clearFields":[],"comparisonRequested":false}',
    )

    result = planner.plan(**_plan_kwargs())
    assert result.filters.price_min_cents == 9000
    assert result.filters.price_max_cents is None


def test_planner_rejects_missing_required_keys() -> None:
    planner = _planner(
        content='{"retrievalMode":"hybrid","filters":{},"semanticQuery":""}',
    )

    with pytest.raises(ValueError):
        planner.plan(**_plan_kwargs())


def test_planner_accepts_null_thermal_profile_when_uncertain() -> None:
    planner = _planner(
        content=(
            '{"retrievalMode":"hybrid","filters":{"category":"tops","thermalProfile":null},'
            '"semanticQuery":"summer breeze training","resetRequested":false,"clearFields":[],"comparisonRequested":false}'
        ),
    )

    result = planner.plan(**_plan_kwargs())
    assert result.filters.thermal_profile is None


def test_planner_disabled_raises_runtime_error() -> None:
    planner = _planner(
        content='{"retrievalMode":"structured","filters":{},"semanticQuery":"","resetRequested":false,"clearFields":[],"comparisonRequested":false}',
        enabled=False,
    )

    with pytest.raises(RuntimeError, match='disabled'):
        planner.plan(**_plan_kwargs())


def test_planner_uses_updater_call_when_memory_exists() -> None:
    planner = _planner(
        contents=[
            '{"updatedQuery":"show tops for women under 40 in stock","resetRequested":false,"comparisonRequested":false}',
            '{"retrievalMode":"structured","filters":{"category":"tops","gender":"women","priceMaxCents":4000,"availability":true},"semanticQuery":"","resetRequested":false,"clearFields":[],"comparisonRequested":false}',
        ],
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
    assert planner.last_run_metrics == {
        'updater_attempted': True,
        'updater_pass': True,
        'planner_pass': True,
    }


def test_planner_fails_when_updater_missing_required_keys() -> None:
    planner = _planner(
        contents=[
            '{"updated_query":"bad key"}',
        ],
    )

    with pytest.raises(ValueError, match='query_updater missing required keys'):
        planner.plan(
            query='make those for women',
            prior_filters={'category': 'tops'},
            prior_semantic_query='warm tops',
            prior_comparison_requested=False,
            prior_reset_requested=False,
            has_prior_recommendations=True,
        )


def test_updater_prompt_includes_availability_carry_forward_rules() -> None:
    planner = _planner(content='{}')
    prompt = planner.build_query_updater_system_prompt().lower()

    assert 'in stock' in prompt
    assert 'available now' in prompt
    assert 'out of stock' in prompt
    assert 'unavailable' in prompt
    assert 'ignore stock' in prompt
    assert 'any availability' in prompt
