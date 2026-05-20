from __future__ import annotations

from app.search.refinement import (
    apply_filter_refinement,
    build_merged_semantic_query,
    detect_filter_clears,
    detect_reset_requested,
    extract_semantic_constraints,
    merge_semantic_constraints,
)


def test_semantic_facets_replace_budget_tier_from_premium_to_budget() -> None:
    current_facets, current_terms = extract_semantic_constraints('make those budget friendly')
    merged = merge_semantic_constraints(
        prior_facets={'budget_tier': 'premium'},
        prior_terms=['workout'],
        current_facets=current_facets,
        current_terms=current_terms,
        reset_requested=False,
    )

    assert merged.facets['budget_tier'] == 'budget'
    assert 'budget_tier' in merged.changed_facet_groups


def test_semantic_facets_replace_gender_from_female_to_male() -> None:
    current_facets, current_terms = extract_semantic_constraints('make those for men')
    merged = merge_semantic_constraints(
        prior_facets={'gender': 'female'},
        prior_terms=['tops'],
        current_facets=current_facets,
        current_terms=current_terms,
        reset_requested=False,
    )

    assert merged.facets['gender'] == 'male'
    assert 'gender' in merged.changed_facet_groups


def test_semantic_facets_replace_climate_from_hot_to_cold_and_drop_conflicting_terms() -> None:
    current_facets, current_terms = extract_semantic_constraints('now cold weather options')
    merged = merge_semantic_constraints(
        prior_facets={'climate': 'hot_weather', 'gender': 'male', 'budget_tier': 'budget'},
        prior_terms=['breathable', 'workouts'],
        current_facets=current_facets,
        current_terms=current_terms,
        reset_requested=False,
    )

    assert merged.facets['climate'] == 'cold_weather'
    assert 'climate' in merged.changed_facet_groups
    assert 'breathable' not in merged.terms


def test_detect_filter_clears_handles_price_and_rating() -> None:
    clears = detect_filter_clears('any price and ignore rating')
    assert 'priceMinCents' in clears
    assert 'priceMaxCents' in clears
    assert 'minRating' in clears


def test_apply_filter_refinement_gives_explicit_price_precedence_over_implicit() -> None:
    merged = apply_filter_refinement(
        prior_filters={
            'category': 'tops',
            'priceMinCents': 5000,
            'priceMaxCents': None,
            'availability': True,
            'minRating': 4.0,
        },
        explicit_filters={
            'category': None,
            'priceMinCents': None,
            'priceMaxCents': 8000,
            'availability': None,
            'minRating': None,
        },
        clear_fields=set(),
        facets={'budget_tier': 'premium'},
        has_memory=True,
    )

    assert merged.filters['priceMaxCents'] == 8000
    assert merged.filters['priceMinCents'] == 5000
    assert merged.implicit_filter_keys == set()


def test_apply_filter_refinement_maps_budget_facet_only_on_memory_backed_turns() -> None:
    no_memory_merge = apply_filter_refinement(
        prior_filters={},
        explicit_filters={
            'category': None,
            'priceMinCents': None,
            'priceMaxCents': None,
            'availability': None,
            'minRating': None,
        },
        clear_fields=set(),
        facets={'budget_tier': 'budget'},
        has_memory=False,
    )
    memory_merge = apply_filter_refinement(
        prior_filters={},
        explicit_filters={
            'category': None,
            'priceMinCents': None,
            'priceMaxCents': None,
            'availability': None,
            'minRating': None,
        },
        clear_fields=set(),
        facets={'budget_tier': 'budget'},
        has_memory=True,
    )

    assert no_memory_merge.filters['priceMaxCents'] is None
    assert memory_merge.filters['priceMaxCents'] == 3000
    assert memory_merge.filters['priceMinCents'] is None


def test_apply_filter_refinement_drops_stale_prior_filters_when_memory_not_used() -> None:
    merge = apply_filter_refinement(
        prior_filters={
            'category': 'tops',
            'gender': 'men',
            'thermalProfile': 'cold_weather',
            'priceMinCents': 5000,
            'priceMaxCents': 8000,
            'availability': True,
            'minRating': 4.2,
        },
        explicit_filters={
            'category': 'bottoms',
            'gender': None,
            'thermalProfile': None,
            'priceMinCents': None,
            'priceMaxCents': None,
            'availability': None,
            'minRating': None,
        },
        clear_fields=set(),
        facets={},
        has_memory=False,
    )

    assert merge.filters['category'] == 'bottoms'
    assert merge.filters['gender'] is None
    assert merge.filters['thermalProfile'] is None
    assert merge.filters['priceMinCents'] is None
    assert merge.filters['priceMaxCents'] is None
    assert merge.filters['availability'] is None
    assert merge.filters['minRating'] is None


def test_detect_reset_requested_for_start_over_commands() -> None:
    assert detect_reset_requested('start over and show new options') is True
    assert detect_reset_requested('recommend breathable tops') is False


def test_extract_semantic_constraints_distinguishes_cold_and_hot_weather_climate() -> None:
    cold_facets, _ = extract_semantic_constraints('show cold weather tops')
    hot_facets, _ = extract_semantic_constraints('show warm-weather tops')

    assert cold_facets.get('climate') == 'cold_weather'
    assert hot_facets.get('climate') == 'hot_weather'


def test_build_merged_semantic_query_includes_facet_and_term_context() -> None:
    merged_query = build_merged_semantic_query(
        facets={'gender': 'male', 'budget_tier': 'premium', 'climate': 'cold_weather'},
        terms=['hot-weather', 'workouts'],
        fallback_query='show options',
    )

    assert 'for men' in merged_query
    assert 'premium' in merged_query
    assert 'cold weather' in merged_query
    assert 'hot-weather' in merged_query
