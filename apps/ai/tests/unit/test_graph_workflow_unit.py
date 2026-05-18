from __future__ import annotations

from app.graph.workflow import AssistantGraphWorkflow
from app.schemas import (
    ChatRequest,
    CompareItemsToolOutput,
    GetItemDetailsToolOutput,
    NormalizedFilters,
    ProductItem,
    SearchItemsToolOutput,
    SearchResult,
)


class _StubTools:
    def __init__(
        self,
        *,
        search_plan: list[SearchItemsToolOutput | Exception],
        product_map: dict[str, ProductItem] | None = None,
    ) -> None:
        self.search_plan = list(search_plan)
        self.product_map = product_map or {}
        self.search_calls = 0
        self.search_inputs: list[object] = []
        self.detail_calls: list[str] = []
        self.compare_calls: list[list[str]] = []

    def search_items(self, payload):
        self.search_calls += 1
        self.search_inputs.append(payload)

        if len(self.search_plan) == 0:
            raise RuntimeError('search plan exhausted')

        outcome = self.search_plan.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    def get_item_details(self, payload) -> GetItemDetailsToolOutput:
        self.detail_calls.append(payload.product_id)
        return GetItemDetailsToolOutput(item=self.product_map.get(payload.product_id))

    def compare_items(self, payload) -> CompareItemsToolOutput:
        self.compare_calls.append(list(payload.product_ids))
        compared_items = [
            item
            for product_id in payload.product_ids
            for item in [self.product_map.get(product_id)]
            if item is not None
        ]
        return CompareItemsToolOutput(
            summary='Compared selected products.',
            compared_items=compared_items,
        )


def _chat_payload(
    *,
    message: str,
    session_id: str,
    request_id: str,
    user_id: str,
) -> ChatRequest:
    return ChatRequest(
        message=message,
        session_id=session_id,
        request_id=request_id,
        user_context={'userId': user_id},
    )


def _product(*, product_id: str, name: str, category: str, price_cents: int) -> ProductItem:
    return ProductItem(
        product_id=product_id,
        name=name,
        category=category,
        price_cents=price_cents,
        currency='USD',
        available=True,
        rating=4.5,
        short_description=f'{name} description',
    )


def _search_output(*, retrieval_mode: str, items: list[ProductItem]) -> SearchItemsToolOutput:
    return SearchItemsToolOutput(
        retrieval_mode=retrieval_mode,
        semantic_query='breathable workout tops',
        normalized_filters=NormalizedFilters(category='tops', availability=True),
        items=[
            SearchResult(product=item, similarity_score=0.95 - (index * 0.05))
            for index, item in enumerate(items)
        ],
        total_matches=len(items),
    )


def test_workflow_run_returns_structured_recommendations() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    second = _product(
        product_id='flow-sports-bra',
        name='Flow Sports Bra',
        category='tops',
        price_cents=3600,
    )
    tools = _StubTools(
        search_plan=[_search_output(retrieval_mode='structured', items=[first, second])],
        product_map={
            first.product_id: first,
            second.product_id: second,
        },
    )
    workflow = AssistantGraphWorkflow(tools=tools, model_name='gpt-4.1-mini')

    response = workflow.run(
        _chat_payload(
            message='show available workout tops under 50 dollars',
            session_id='session-1',
            request_id='request-1',
            user_id='user-1',
        )
    )

    assert response.placeholder is False
    assert response.retrieval_mode == 'structured'
    assert response.recommended_product_ids == ['essential-cropped-tee', 'flow-sports-bra']
    assert len(response.recommendations) == 1
    assert len(response.recommendations[0].recommended_products) == 2
    assert tools.search_calls == 1
    assert tools.compare_calls == []


def test_workflow_retry_path_is_bounded_to_single_retry() -> None:
    tools = _StubTools(
        search_plan=[RuntimeError('temporary failure'), RuntimeError('still failing')],
    )
    workflow = AssistantGraphWorkflow(tools=tools, model_name='gpt-4.1-mini')

    response = workflow.run(
        _chat_payload(
            message='recommend tops under 30',
            session_id='session-retry',
            request_id='request-retry',
            user_id='user-1',
        )
    )

    assert response.placeholder is False
    assert response.recommendations == []
    assert response.recommended_product_ids == []
    assert 'could not find products' in response.assistant_message.lower()
    assert tools.search_calls == 2


def test_workflow_reuses_memory_for_same_thread_compare_follow_up() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    second = _product(
        product_id='flow-sports-bra',
        name='Flow Sports Bra',
        category='tops',
        price_cents=3600,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(retrieval_mode='hybrid', items=[first, second]),
            _search_output(retrieval_mode='hybrid', items=[]),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
        },
    )
    workflow = AssistantGraphWorkflow(tools=tools, model_name='gpt-4.1-mini')

    first_turn = workflow.run(
        _chat_payload(
            message='find breathable training tops under 60',
            session_id='session-memory',
            request_id='request-memory-1',
            user_id='user-1',
        )
    )
    second_turn = workflow.run(
        _chat_payload(
            message='now compare the top two options',
            session_id='session-memory',
            request_id='request-memory-2',
            user_id='user-1',
        )
    )

    assert first_turn.recommended_product_ids == ['essential-cropped-tee', 'flow-sports-bra']
    assert second_turn.recommended_product_ids == ['essential-cropped-tee', 'flow-sports-bra']
    assert tools.search_calls == 1
    assert tools.compare_calls == [['essential-cropped-tee', 'flow-sports-bra']]
    assert 'compared selected products' in (
        second_turn.recommendations[0].comparison_summary or ''
    ).lower()


def test_workflow_isolates_memory_between_sessions() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    second = _product(
        product_id='flow-sports-bra',
        name='Flow Sports Bra',
        category='tops',
        price_cents=3600,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(retrieval_mode='hybrid', items=[first, second]),
            _search_output(retrieval_mode='hybrid', items=[]),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
        },
    )
    workflow = AssistantGraphWorkflow(tools=tools, model_name='gpt-4.1-mini')

    workflow.run(
        _chat_payload(
            message='find breathable training tops under 60',
            session_id='session-a',
            request_id='request-a-1',
            user_id='user-1',
        )
    )
    isolated_turn = workflow.run(
        _chat_payload(
            message='now compare the top two options',
            session_id='session-b',
            request_id='request-b-1',
            user_id='user-2',
        )
    )

    assert isolated_turn.recommendations == []
    assert isolated_turn.recommended_product_ids == []
    assert tools.search_calls == 2
    assert tools.compare_calls == []
