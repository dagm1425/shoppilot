from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

FilterField = Literal['category', 'priceMinCents', 'priceMaxCents', 'availability', 'minRating']
SemanticFacetGroup = Literal['gender', 'budget_tier']

_DEFAULT_FILTERS: dict[FilterField, str | int | float | bool | None] = {
    'category': None,
    'priceMinCents': None,
    'priceMaxCents': None,
    'availability': None,
    'minRating': None,
}

_RESET_TERMS = (
    'start over',
    'new search',
    'reset search',
    'ignore previous constraints',
    'ignore previous filters',
)

_CLEAR_PATTERNS: dict[FilterField, tuple[str, ...]] = {
    'category': (
        'any category',
        'ignore category',
        'all categories',
    ),
    'priceMinCents': (
        'any price',
        'no price limit',
        'ignore price',
        'remove budget',
    ),
    'priceMaxCents': (
        'any price',
        'no price limit',
        'ignore price',
        'remove budget',
    ),
    'availability': (
        'any availability',
        'ignore availability',
        'stock does not matter',
    ),
    'minRating': (
        'any rating',
        'ignore rating',
        'no rating requirement',
    ),
}

_FACET_RULES: dict[SemanticFacetGroup, dict[str, tuple[str, ...]]] = {
    'gender': {
        'male': ('for men', 'mens', "men's", 'male', 'men'),
        'female': ('for women', 'womens', "women's", 'female', 'women'),
        'unisex': ('unisex',),
    },
    'budget_tier': {
        'premium': ('premium', 'high-end', 'luxury'),
        'budget': ('budget friendly', 'affordable', 'cheap', 'budget'),
        'mid_range': ('mid-range', 'mid range'),
    },
}

_SEMANTIC_NOISE_WORDS = {
    'show', 'me', 'find', 'recommend', 'items', 'products', 'item', 'product',
    'under', 'over', 'below', 'above', 'between', 'and', 'to', 'at', 'least',
    'minimum', 'maximum', 'max', 'min', 'rating', 'stars', 'star', 'dollars',
    'usd', 'in', 'stock', 'available', 'unavailable', 'out', 'of', 'with',
    'those', 'these', 'make', 'them', 'for', 'the', 'now', 'please', 'top',
    'tops', 'bottom', 'bottoms', 'compare', 'comparison', 'versus', 'vs',
    'two', 'option', 'options',
}


@dataclass(frozen=True)
class RefinementMergeResult:
    filters: dict[FilterField, str | int | float | bool | None]
    changed_filter_keys: set[FilterField]
    implicit_filter_keys: set[FilterField]


@dataclass(frozen=True)
class SemanticMergeResult:
    facets: dict[SemanticFacetGroup, str]
    terms: list[str]
    changed_facet_groups: set[SemanticFacetGroup]
    terms_changed: bool


def detect_reset_requested(message: str) -> bool:
    lowered = message.lower()
    return any(term in lowered for term in _RESET_TERMS)


def detect_filter_clears(message: str) -> set[FilterField]:
    lowered = message.lower()
    clears: set[FilterField] = set()
    for field, patterns in _CLEAR_PATTERNS.items():
        if any(pattern in lowered for pattern in patterns):
            clears.add(field)
    return clears


def extract_semantic_constraints(message: str) -> tuple[dict[SemanticFacetGroup, str], list[str]]:
    lowered = message.lower()
    facets: dict[SemanticFacetGroup, str] = {}

    for group, canonical_terms in _FACET_RULES.items():
        latest: tuple[str, int] | None = None
        for canonical_value, synonyms in canonical_terms.items():
            for synonym in synonyms:
                for match in re.finditer(rf'\b{re.escape(synonym)}\b', lowered):
                    if latest is None or match.start() > latest[1]:
                        latest = (canonical_value, match.start())
        if latest is not None:
            facets[group] = latest[0]

    semantic_terms: list[str] = []
    for token in re.findall(r"[a-z]+(?:-[a-z]+)?", lowered):
        if token in _SEMANTIC_NOISE_WORDS:
            continue
        if token.isdigit():
            continue
        if len(token) < 3:
            continue
        if token not in semantic_terms:
            semantic_terms.append(token)

    return facets, semantic_terms


def merge_semantic_constraints(
    *,
    prior_facets: dict[str, str],
    prior_terms: list[str],
    current_facets: dict[SemanticFacetGroup, str],
    current_terms: list[str],
    reset_requested: bool,
) -> SemanticMergeResult:
    merged_facets: dict[SemanticFacetGroup, str] = {}
    merged_terms: list[str] = []
    changed_groups: set[SemanticFacetGroup] = set()

    if not reset_requested:
        for group, value in prior_facets.items():
            if group in _FACET_RULES:
                merged_facets[group] = value
        merged_terms.extend(term for term in prior_terms if term not in merged_terms)

    for group, value in current_facets.items():
        old_value = merged_facets.get(group)
        if old_value != value:
            changed_groups.add(group)
        merged_facets[group] = value

    for term in current_terms:
        if term not in merged_terms:
            merged_terms.append(term)

    # remove term noise that duplicates canonical facet words directly
    facet_tokens = set()
    for group, value in merged_facets.items():
        if group == 'gender':
            if value == 'male':
                facet_tokens.update({'male', 'men'})
            elif value == 'female':
                facet_tokens.update({'female', 'women'})
            elif value == 'unisex':
                facet_tokens.add('unisex')
        if group == 'budget_tier':
            if value == 'premium':
                facet_tokens.add('premium')
            elif value == 'budget':
                facet_tokens.update({'budget', 'affordable', 'cheap'})
            elif value == 'mid_range':
                facet_tokens.update({'mid', 'range'})

    merged_terms = [term for term in merged_terms if term not in facet_tokens]
    terms_changed = reset_requested or merged_terms != prior_terms

    return SemanticMergeResult(
        facets=merged_facets,
        terms=merged_terms,
        changed_facet_groups=changed_groups,
        terms_changed=terms_changed,
    )


def build_merged_semantic_query(
    *,
    facets: dict[str, str],
    terms: list[str],
    fallback_query: str,
) -> str:
    parts: list[str] = []

    gender = facets.get('gender')
    if gender == 'male':
        parts.append('for men')
    elif gender == 'female':
        parts.append('for women')
    elif gender == 'unisex':
        parts.append('unisex')

    budget_tier = facets.get('budget_tier')
    if budget_tier == 'premium':
        parts.append('premium')
    elif budget_tier == 'budget':
        parts.append('budget friendly')
    elif budget_tier == 'mid_range':
        parts.append('mid range')

    parts.extend(terms)
    merged = ' '.join(part.strip() for part in parts if part.strip() != '').strip()
    return merged or fallback_query.strip()


def apply_filter_refinement(
    *,
    prior_filters: dict[str, str | int | float | bool | None],
    explicit_filters: dict[str, str | int | float | bool | None],
    clear_fields: set[FilterField],
    facets: dict[str, str],
    has_memory: bool,
) -> RefinementMergeResult:
    merged: dict[FilterField, str | int | float | bool | None] = {
        key: prior_filters.get(key, _DEFAULT_FILTERS[key])
        for key in _DEFAULT_FILTERS
    }
    original = merged.copy()
    implicit_applied: set[FilterField] = set()

    explicit_set_fields = {
        key
        for key, value in explicit_filters.items()
        if key in _DEFAULT_FILTERS and value is not None
    }

    for field in clear_fields:
        merged[field] = None

    for field in _DEFAULT_FILTERS:
        explicit_value = explicit_filters.get(field)
        if explicit_value is not None:
            merged[field] = explicit_value

    # implicit mapping is only used for follow-up memory-backed turns
    if has_memory and 'budget_tier' in facets:
        budget_tier = facets['budget_tier']
        if (
            'priceMinCents' not in explicit_set_fields
            and 'priceMaxCents' not in explicit_set_fields
            and 'priceMinCents' not in clear_fields
            and 'priceMaxCents' not in clear_fields
        ):
            if budget_tier == 'premium':
                merged['priceMinCents'] = 5000
                merged['priceMaxCents'] = None
                implicit_applied.update({'priceMinCents', 'priceMaxCents'})
            elif budget_tier == 'budget':
                merged['priceMinCents'] = None
                merged['priceMaxCents'] = 3000
                implicit_applied.update({'priceMinCents', 'priceMaxCents'})

    price_min = merged['priceMinCents']
    price_max = merged['priceMaxCents']
    if isinstance(price_min, int) and isinstance(price_max, int) and price_min > price_max:
        if 'priceMinCents' in explicit_set_fields and 'priceMaxCents' not in explicit_set_fields:
            merged['priceMaxCents'] = None
        elif 'priceMaxCents' in explicit_set_fields and 'priceMinCents' not in explicit_set_fields:
            merged['priceMinCents'] = None
        else:
            merged['priceMaxCents'] = None

    changed = {field for field in _DEFAULT_FILTERS if merged[field] != original[field]}
    return RefinementMergeResult(
        filters=merged,
        changed_filter_keys=changed,
        implicit_filter_keys=implicit_applied,
    )
