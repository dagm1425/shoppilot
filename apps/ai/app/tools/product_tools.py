from __future__ import annotations

from functools import lru_cache

from app.config.settings import get_settings
from app.schemas import (
    CompareItemsToolInput,
    CompareItemsToolOutput,
    GetItemDetailsToolInput,
    GetItemDetailsToolOutput,
    NormalizedFilters,
    ProductItem,
    SearchItemsToolInput,
    SearchItemsToolOutput,
    SearchResult,
)
from app.search.models import ProductRecord, RetrievalFilters, RetrievalResult
from app.search.query_intent import parse_intent
from app.search.repository import ProductRepository
from app.search.runtime import get_search_service
from app.search.service import SemanticSearchService


class AssistantTools:
    def __init__(
        self,
        *,
        search_service: SemanticSearchService,
        repository: ProductRepository,
    ) -> None:
        self._search_service = search_service
        self._repository = repository

    def search_items(self, payload: SearchItemsToolInput) -> SearchItemsToolOutput:
        parsed_intent = parse_intent(payload.query)
        filters = RetrievalFilters(
            category=payload.category if payload.category is not None else parsed_intent.filters.category,
            price_min_cents=(
                payload.price_min_cents
                if payload.price_min_cents is not None
                else parsed_intent.filters.price_min_cents
            ),
            price_max_cents=(
                payload.price_max_cents
                if payload.price_max_cents is not None
                else parsed_intent.filters.price_max_cents
            ),
            availability=(
                payload.availability
                if payload.availability is not None
                else parsed_intent.filters.availability
            ),
            min_rating=(
                payload.min_rating
                if payload.min_rating is not None
                else parsed_intent.filters.min_rating
            ),
        )

        retrieval = self._search_service.retrieve_with_plan(
            retrieval_mode=payload.retrieval_mode,
            filters=filters,
            semantic_query=parsed_intent.semantic_query,
            top_k=payload.top_k,
        )

        return SearchItemsToolOutput(
            retrieval_mode=retrieval.mode,
            semantic_query=retrieval.semantic_query,
            normalized_filters=_to_normalized_filters(retrieval.filters),
            items=_to_search_results(retrieval),
            total_matches=len(retrieval.products),
        )

    def get_item_details(self, payload: GetItemDetailsToolInput) -> GetItemDetailsToolOutput:
        products = self._repository.get_products_by_ids([payload.product_id])
        if not products:
            return GetItemDetailsToolOutput(item=None)
        return GetItemDetailsToolOutput(item=_to_product_item(products[0]))

    def compare_items(self, payload: CompareItemsToolInput) -> CompareItemsToolOutput:
        unique_ids: list[str] = []
        for product_id in payload.product_ids:
            if product_id not in unique_ids:
                unique_ids.append(product_id)

        products = self._repository.get_products_by_ids(unique_ids)
        compared_items = [_to_product_item(product) for product in products]

        if len(compared_items) < 2:
            return CompareItemsToolOutput(
                summary='I need at least two matching products to provide a meaningful comparison.',
                compared_items=compared_items,
            )

        lowest_price = min(compared_items, key=lambda item: item.price_cents)
        highest_rating = max(
            compared_items,
            key=lambda item: item.rating if item.rating is not None else 0.0,
        )

        summary = (
            f'Compared {len(compared_items)} products. '
            f'{lowest_price.name} is the lowest priced option at '
            f'{lowest_price.price_cents / 100:.2f} {lowest_price.currency}. '
            f'{highest_rating.name} has the strongest rating signal.'
        )

        return CompareItemsToolOutput(summary=summary, compared_items=compared_items)


@lru_cache(maxsize=1)
def get_assistant_tools() -> AssistantTools:
    settings = get_settings()
    repository = ProductRepository(database_url=settings.database_url)
    return AssistantTools(search_service=get_search_service(), repository=repository)


def _to_normalized_filters(filters: RetrievalFilters) -> NormalizedFilters:
    return NormalizedFilters(
        category=filters.category,
        price_min_cents=filters.price_min_cents,
        price_max_cents=filters.price_max_cents,
        availability=filters.availability,
        min_rating=filters.min_rating,
    )


def _to_search_results(retrieval: RetrievalResult) -> list[SearchResult]:
    score_by_id = {hit.product_id: hit.similarity_score for hit in retrieval.hits}
    search_results: list[SearchResult] = []

    for product in retrieval.products:
        search_results.append(
            SearchResult(
                product=_to_product_item(product),
                similarity_score=max(0.0, min(1.0, score_by_id.get(product.product_id, 0.0))),
            )
        )

    return search_results


def _to_product_item(product: ProductRecord) -> ProductItem:
    return ProductItem(
        product_id=product.product_id,
        name=product.name,
        category=product.category,
        price_cents=product.price_cents,
        currency=product.currency,
        available=product.available,
        rating=product.rating,
        short_description=product.description,
    )
