from __future__ import annotations

from datetime import datetime, timezone

from app.search.models import ProductRecord
from app.search.text_builder import build_embedding_text


def test_build_embedding_text_contains_required_semantic_fields() -> None:
    product = ProductRecord(
        product_id='power-hoodie',
        name='Power Hoodie',
        description='Mid-weight hoodie for recovery days',
        category='tops',
        gender='men',
        thermal_profile='cold_weather',
        fit='regular fit',
        color='black',
        price_cents=6000,
        currency='USD',
        available=False,
        rating=3.7,
        stock=0,
        updated_at=datetime.now(timezone.utc),
    )

    text = build_embedding_text(product)

    assert 'title: Power Hoodie' in text
    assert 'description: Mid-weight hoodie for recovery days' in text
    assert 'category: tops' in text
    assert 'thermal_profile: cold_weather' in text
    assert 'features:' in text
    assert 'tags:' in text
    assert 'price_cents: 6000' in text
    assert 'availability: out of stock' in text
    assert 'rating: 3.7' in text
    assert 'premium' in text
    assert 'unavailable' in text
