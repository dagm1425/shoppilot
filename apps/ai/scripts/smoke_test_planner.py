from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_APP_ROOT = Path(__file__).resolve().parents[1]
if str(_APP_ROOT) not in sys.path:
    sys.path.insert(0, str(_APP_ROOT))

from app.llm.runtime import get_assistant_query_planner

_FILTER_KEYS = (
    'category',
    'gender',
    'thermalProfile',
    'priceMinCents',
    'priceMaxCents',
    'availability',
    'minRating',
)


@dataclass(frozen=True)
class PlannerCase:
    name: str
    query: str
    prior_filters: dict[str, Any]
    prior_semantic_query: str = ''
    prior_comparison_requested: bool = False
    prior_reset_requested: bool = False
    has_prior_recommendations: bool = False


def _normalize_filters(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw or {}
    return {key: raw.get(key) for key in _FILTER_KEYS}


def _demo_cases() -> list[PlannerCase]:
    return [
        PlannerCase(
            name='fresh_search',
            query='show women breathable tops under 50 in stock',
            prior_filters=_normalize_filters({}),
        ),
        PlannerCase(
            name='follow_up_refinement',
            query='make those cold weather instead',
            prior_filters=_normalize_filters(
                {
                    'category': 'tops',
                    'gender': 'women',
                    'priceMaxCents': 5000,
                    'availability': True,
                }
            ),
            prior_semantic_query='breathable',
            has_prior_recommendations=True,
        ),
    ]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Run the real Gemini query planner against one or more planner scenarios.',
    )
    parser.add_argument(
        '--query',
        help='Custom user query. If omitted, built-in demo cases are used.',
    )
    parser.add_argument(
        '--prior-filters',
        default='{}',
        help=(
            'JSON object for prior filters. Example: '
            '\'{"category":"tops","gender":"men","priceMaxCents":8000,"availability":true}\''
        ),
    )
    parser.add_argument(
        '--prior-semantic-query',
        default='',
        help='Prior semanticQuery value for follow-up testing.',
    )
    parser.add_argument(
        '--prior-comparison-requested',
        action='store_true',
        help='Set prior comparisonRequested=true.',
    )
    parser.add_argument(
        '--prior-reset-requested',
        action='store_true',
        help='Set prior resetRequested=true.',
    )
    parser.add_argument(
        '--has-prior-recommendations',
        action='store_true',
        help='Set has_prior_recommendations=true.',
    )
    parser.add_argument(
        '--show-prompt',
        action='store_true',
        help='Also print the system prompt variant used for each case.',
    )
    return parser.parse_args()


def _load_custom_case(args: argparse.Namespace) -> PlannerCase:
    try:
        prior_filters = json.loads(args.prior_filters)
    except json.JSONDecodeError as exc:
        raise SystemExit(f'Invalid --prior-filters JSON: {exc}') from exc

    if not isinstance(prior_filters, dict):
        raise SystemExit('--prior-filters must be a JSON object.')

    return PlannerCase(
        name='custom',
        query=args.query,
        prior_filters=_normalize_filters(prior_filters),
        prior_semantic_query=args.prior_semantic_query,
        prior_comparison_requested=args.prior_comparison_requested,
        prior_reset_requested=args.prior_reset_requested,
        has_prior_recommendations=args.has_prior_recommendations,
    )


def _has_memory_context(case: PlannerCase) -> bool:
    return (
        bool(case.prior_semantic_query.strip())
        or case.prior_comparison_requested
        or case.prior_reset_requested
        or case.has_prior_recommendations
        or any(value is not None for value in case.prior_filters.values())
    )


def _run_case(*, case: PlannerCase, show_prompt: bool) -> None:
    planner = get_assistant_query_planner()
    result = planner.plan(
        query=case.query,
        prior_filters=case.prior_filters,
        prior_semantic_query=case.prior_semantic_query,
        prior_comparison_requested=case.prior_comparison_requested,
        prior_reset_requested=case.prior_reset_requested,
        has_prior_recommendations=case.has_prior_recommendations,
    )

    print(f'=== {case.name} ===')
    print(
        json.dumps(
            {
                'input': {
                    'query': case.query,
                    'priorFilters': case.prior_filters,
                    'priorSemanticQuery': case.prior_semantic_query,
                    'priorComparisonRequested': case.prior_comparison_requested,
                    'priorResetRequested': case.prior_reset_requested,
                    'hasPriorRecommendations': case.has_prior_recommendations,
                },
                'plannerMetrics': planner.last_run_metrics,
                'output': result.model_dump(by_alias=True),
            },
            indent=2,
        )
    )

    if show_prompt:
        print('\n--- prompt ---')
        print(
            planner.build_query_planner_system_prompt(
                has_memory_context=_has_memory_context(case),
            )
        )

    print()


def main() -> None:
    args = _parse_args()
    cases = [_load_custom_case(args)] if args.query else _demo_cases()

    for case in cases:
        _run_case(case=case, show_prompt=args.show_prompt)


if __name__ == '__main__':
    main()
