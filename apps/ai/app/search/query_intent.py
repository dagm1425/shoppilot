from __future__ import annotations

import re

from app.search.constants import (
    RETRIEVAL_MODE_HYBRID,
    RETRIEVAL_MODE_SEMANTIC,
    RETRIEVAL_MODE_STRUCTURED,
)
from app.search.models import ParsedIntent, RetrievalFilters

_TOP_CATEGORY_TERMS = (
    'top',
    'tops',
    'tee',
    't-shirt',
    'tank',
    'hoodie',
    'bra',
    'shirt',
)
_BOTTOM_CATEGORY_TERMS = (
    'bottom',
    'bottoms',
    'short',
    'shorts',
    'jogger',
    'joggers',
    'legging',
    'leggings',
    'pants',
)

_PRICE_PATTERN = r'(?:\$|usd\s*)?(\d+(?:\.\d{1,2})?)'
_BETWEEN_PATTERN = re.compile(rf'between\s+{_PRICE_PATTERN}\s+(?:and|to)\s+{_PRICE_PATTERN}', re.IGNORECASE)
_UNDER_PATTERN = re.compile(rf'(?:under|below|less than|max)\s+{_PRICE_PATTERN}', re.IGNORECASE)
_OVER_PATTERN = re.compile(rf'(?:over|above|more than|min(?:imum)?)\s+{_PRICE_PATTERN}', re.IGNORECASE)
_RATING_PATTERN = re.compile(
    r'(?:rating\s*(?:at least|>=|>|minimum)?\s*|at least\s*)(\d(?:\.\d)?)\s*(?:\+|\s*stars?)?',
    re.IGNORECASE,
)

_NOISE_PATTERN = re.compile(
    r'(?:\b(?:tops?|bottoms?|tee|tank|hoodie|shorts?|joggers?|leggings?|pants|'
    r'under|below|less than|over|above|more than|between|and|available|in stock|'
    r'out of stock|unavailable|rating|stars?|usd|dollars?|products?|items?|'
    r'show|find|recommend|at\s+least|minimum)\b|\$?\d+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)


def parse_intent(message: str) -> ParsedIntent:
    normalized_message = _normalize_message(message)
    lowered = normalized_message.lower()

    category = None
    if _contains_any_term(lowered, _TOP_CATEGORY_TERMS):
        category = 'tops'
    elif _contains_any_term(lowered, _BOTTOM_CATEGORY_TERMS):
        category = 'bottoms'

    price_min_cents = None
    price_max_cents = None

    between_match = _BETWEEN_PATTERN.search(normalized_message)
    if between_match:
        first = _to_cents(between_match.group(1))
        second = _to_cents(between_match.group(2))
        price_min_cents = min(first, second)
        price_max_cents = max(first, second)
    else:
        under_match = _UNDER_PATTERN.search(normalized_message)
        over_match = _OVER_PATTERN.search(normalized_message)
        if under_match:
            price_max_cents = _to_cents(under_match.group(1))
        if over_match:
            price_min_cents = _to_cents(over_match.group(1))

    availability = None
    if 'in stock' in lowered or 'available' in lowered:
        availability = True
    if 'out of stock' in lowered or 'unavailable' in lowered:
        availability = False

    min_rating = None
    rating_match = _RATING_PATTERN.search(normalized_message)
    if rating_match:
        min_rating = max(0.0, min(5.0, float(rating_match.group(1))))

    filters = RetrievalFilters(
        category=category,
        price_min_cents=price_min_cents,
        price_max_cents=price_max_cents,
        availability=availability,
        min_rating=min_rating,
    )

    semantic_query = _NOISE_PATTERN.sub(' ', normalized_message).strip()
    semantic_query = re.sub(r'\s{2,}', ' ', semantic_query)
    has_semantic_intent = len(semantic_query) >= 6
    has_filters = filters.count() > 0

    if has_filters and has_semantic_intent:
        mode = RETRIEVAL_MODE_HYBRID
    elif has_filters:
        mode = RETRIEVAL_MODE_STRUCTURED
    else:
        mode = RETRIEVAL_MODE_SEMANTIC
        semantic_query = normalized_message.strip()

    if semantic_query == '':
        semantic_query = normalized_message.strip()

    return ParsedIntent(mode=mode, semantic_query=semantic_query, filters=filters)


def _to_cents(raw: str) -> int:
    return int(round(float(raw) * 100))


def _contains_any_term(text: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf'\b{re.escape(term)}\b', text) for term in terms)


def _normalize_message(message: str) -> str:
    normalized = re.sub(r'out[-\s]?of[-\s]?stock', 'out of stock', message, flags=re.IGNORECASE)
    normalized = re.sub(r'in[-\s]?stock', 'in stock', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\s{2,}', ' ', normalized)
    return normalized.strip()
