from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.search.models import ProductRecord, RetrievalFilters

_RATING_SQL = """
ROUND(
  LEAST(
    5.0,
    GREATEST(
      2.8,
      3.1 + CASE WHEN "available" THEN 0.9 ELSE -0.4 END + LEAST("stock", 30)::double precision / 35.0
    )
  )::numeric,
  1
)::double precision
"""

_BASE_SELECT = f"""
WITH base_products AS (
  SELECT
    "slug" AS slug,
    "name" AS name,
    "description" AS description,
    lower("category"::text) AS category,
    lower("gender"::text) AS gender,
    lower("thermalProfile"::text) AS thermal_profile,
    "fit" AS fit,
    "color" AS color,
    "priceCents" AS price_cents,
    "currency" AS currency,
    "available" AS available,
    "stock" AS stock,
    {_RATING_SQL} AS rating,
    "updatedAt" AS updated_at
  FROM "products"
)
SELECT
  slug,
  name,
  description,
  category,
  gender,
  thermal_profile,
  fit,
  color,
  price_cents,
  currency,
  available,
  stock,
  rating,
  updated_at
FROM base_products
"""


class ProductRepository:
    def __init__(self, *, database_url: str) -> None:
        self._database_url = database_url

    def list_products(
        self,
        *,
        filters: RetrievalFilters | None = None,
        limit: int | None = None,
    ) -> list[ProductRecord]:
        where_clause, params = _build_where_clause(filters)

        query = _BASE_SELECT
        if where_clause:
            query += f' WHERE {where_clause}'
        query += ' ORDER BY available DESC, rating DESC, updated_at DESC'
        if limit is not None:
            query += ' LIMIT %(limit)s'
            params['limit'] = limit

        rows = self._query(query=query, params=params)
        return _rows_to_products(rows)

    def get_products_by_ids(self, product_ids: Sequence[str]) -> list[ProductRecord]:
        if not product_ids:
            return []

        query = (
            _BASE_SELECT
            + ' WHERE slug = ANY(%(product_ids)s)'
            + ' ORDER BY array_position(%(ordered_ids)s::text[], slug)'
        )
        rows = self._query(
            query=query,
            params={
                'product_ids': list(product_ids),
                'ordered_ids': list(product_ids),
            },
        )
        return _rows_to_products(rows)

    def list_product_ids(self, *, filters: RetrievalFilters, limit: int) -> list[str]:
        where_clause, params = _build_where_clause(filters)
        query = f'WITH candidate_products AS ({_BASE_SELECT}) SELECT slug FROM candidate_products'
        if where_clause:
            query += f' WHERE {where_clause}'
        query += ' ORDER BY updated_at DESC LIMIT %(limit)s'
        params['limit'] = limit
        rows = self._query(query=query, params=params)
        return [str(row['slug']) for row in rows]

    def _query(self, *, query: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        with psycopg.connect(self._database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                return list(cursor.fetchall())


def _build_where_clause(filters: RetrievalFilters | None) -> tuple[str, dict[str, Any]]:
    if filters is None:
        return ('', {})

    clauses: list[str] = []
    params: dict[str, Any] = {}

    if filters.category:
        clauses.append('category = %(category)s')
        params['category'] = filters.category.lower()

    if filters.gender:
        clauses.append('gender = %(gender)s')
        params['gender'] = filters.gender.lower()

    if filters.thermal_profile:
        clauses.append('thermal_profile = %(thermal_profile)s')
        params['thermal_profile'] = filters.thermal_profile.lower()

    if filters.price_min_cents is not None:
        clauses.append('price_cents >= %(price_min_cents)s')
        params['price_min_cents'] = filters.price_min_cents

    if filters.price_max_cents is not None:
        clauses.append('price_cents <= %(price_max_cents)s')
        params['price_max_cents'] = filters.price_max_cents

    if filters.availability is not None:
        clauses.append('available = %(availability)s')
        params['availability'] = filters.availability

    if filters.min_rating is not None:
        clauses.append('rating >= %(min_rating)s')
        params['min_rating'] = filters.min_rating

    return (' AND '.join(clauses), params)


def _rows_to_products(rows: list[dict[str, Any]]) -> list[ProductRecord]:
    products: list[ProductRecord] = []
    for row in rows:
        products.append(
            ProductRecord(
                product_id=str(row['slug']),
                name=str(row['name']),
                description=str(row['description']),
                category=str(row['category']),
                gender=str(row['gender']),
                thermal_profile=str(row['thermal_profile']),
                fit=str(row['fit']),
                color=str(row['color']),
                price_cents=int(row['price_cents']),
                currency=str(row['currency']),
                available=bool(row['available']),
                rating=float(row['rating']),
                stock=int(row['stock']),
                updated_at=row['updated_at'],
            )
        )
    return products
