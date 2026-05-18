from __future__ import annotations

from app.search.constants import (
    RETRIEVAL_MODE_HYBRID,
    RETRIEVAL_MODE_SEMANTIC,
    RETRIEVAL_MODE_STRUCTURED,
)
from app.search.query_intent import parse_intent


def test_parse_intent_detects_structured_filters_only() -> None:
    result = parse_intent('Show tops under $50 in stock')

    assert result.mode == RETRIEVAL_MODE_STRUCTURED
    assert result.filters.category == 'tops'
    assert result.filters.price_max_cents == 5000
    assert result.filters.availability is True
    assert result.filters.count() == 3


def test_parse_intent_detects_hybrid_when_filters_and_semantic_phrase_exist() -> None:
    result = parse_intent('Recommend breathable tops under $60 for cardio')

    assert result.mode == RETRIEVAL_MODE_HYBRID
    assert result.filters.category == 'tops'
    assert result.filters.price_max_cents == 6000
    assert 'breathable' in result.semantic_query.lower()


def test_parse_intent_falls_back_to_semantic_without_filters() -> None:
    result = parse_intent('Recommend minimalist gym wear')

    assert result.mode == RETRIEVAL_MODE_SEMANTIC
    assert result.filters.count() == 0
    assert result.semantic_query == 'Recommend minimalist gym wear'


def test_parse_intent_parses_between_and_rating_constraints() -> None:
    result = parse_intent('bottoms between 20 and 40 dollars at least 4.5 stars')

    assert result.mode == RETRIEVAL_MODE_STRUCTURED
    assert result.filters.category == 'bottoms'
    assert result.filters.price_min_cents == 2000
    assert result.filters.price_max_cents == 4000
    assert result.filters.min_rating == 4.5
