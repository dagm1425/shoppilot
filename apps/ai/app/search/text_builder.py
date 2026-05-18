from __future__ import annotations

from app.search.models import ProductRecord


def build_embedding_text(product: ProductRecord) -> str:
    tags = _build_tags(product)
    features = _build_features(product)
    availability_text = 'in stock' if product.available else 'out of stock'

    lines = [
        f'title: {product.name}',
        f'description: {product.description}',
        f'category: {product.category}',
        f'features: {", ".join(features)}',
        f'tags: {", ".join(tags)}',
        f'price_cents: {product.price_cents}',
        f'currency: {product.currency}',
        f'availability: {availability_text}',
        f'rating: {product.rating:.1f}',
    ]
    return '\n'.join(lines)


def _build_features(product: ProductRecord) -> list[str]:
    return [
        product.fit.lower(),
        f'{product.gender.lower()} fit',
        f'color {product.color.lower()}',
        'limited stock' if product.stock <= 5 else 'standard stock',
    ]


def _build_tags(product: ProductRecord) -> list[str]:
    return [
        product.category.lower(),
        product.gender.lower(),
        _price_bucket_tag(product.price_cents),
        'available' if product.available else 'unavailable',
    ]


def _price_bucket_tag(price_cents: int) -> str:
    if price_cents < 3000:
        return 'budget'
    if price_cents <= 5000:
        return 'mid-range'
    return 'premium'
