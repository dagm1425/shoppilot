from __future__ import annotations

from app.graph.workflow import AssistantGraphWorkflow
from app.llm.planner import QueryPlannerOutput
from app.llm.synthesizer import AssistantSynthesisResult
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


class _StubSynthesizer:
    def __init__(
        self,
        *,
        provider: str = 'gemini',
        enabled: bool = False,
        result: AssistantSynthesisResult | None = None,
        should_raise: bool = False,
    ) -> None:
        self.provider = provider
        self.enabled = enabled
        self.model_name = 'gemini-2.5-flash'
        self.max_tokens = 220
        self.top_n_products = 3
        self.result = result
        self.should_raise = should_raise
        self.calls: list[dict[str, object]] = []

    def synthesize(
        self,
        *,
        query: str,
        retrieval_mode: str | None,
        normalized_filters: dict[str, object],
        retrieved_products: list[dict[str, object]],
        comparison_summary: str | None,
    ) -> AssistantSynthesisResult:
        self.calls.append(
            {
                'query': query,
                'retrieval_mode': retrieval_mode,
                'normalized_filters': normalized_filters,
                'retrieved_products': retrieved_products,
                'comparison_summary': comparison_summary,
            }
        )
        if self.should_raise:
            raise RuntimeError('synthetic synthesis failure')
        if self.result is None:
            raise RuntimeError('stub synthesis result missing')
        return self.result


class _StubPlanner:
    def __init__(
        self,
        *,
        enabled: bool = True,
        result: QueryPlannerOutput | list[QueryPlannerOutput] | None = None,
        should_raise: bool = False,
    ) -> None:
        self.enabled = enabled
        self.result = result
        self.should_raise = should_raise
        self.calls: list[dict[str, object]] = []
        self.last_run_metrics: dict[str, bool] = {
            'updater_attempted': False,
            'updater_pass': False,
            'planner_pass': False,
        }

    def plan(
        self,
        *,
        query: str,
        prior_filters: dict[str, object],
        prior_semantic_query: str,
        prior_comparison_requested: bool,
        prior_reset_requested: bool,
        has_prior_recommendations: bool,
    ) -> QueryPlannerOutput:
        self.last_run_metrics = {
            'updater_attempted': bool(prior_filters) or bool(prior_semantic_query.strip()),
            'updater_pass': not self.should_raise,
            'planner_pass': not self.should_raise,
        }
        self.calls.append(
            {
                'query': query,
                'prior_filters': prior_filters,
                'prior_semantic_query': prior_semantic_query,
                'prior_comparison_requested': prior_comparison_requested,
                'prior_reset_requested': prior_reset_requested,
                'has_prior_recommendations': has_prior_recommendations,
            }
        )
        if self.should_raise:
            raise RuntimeError('synthetic planner failure')
        if self.result is None:
            raise RuntimeError('stub planner result missing')
        if isinstance(self.result, list):
            if len(self.result) == 0:
                raise RuntimeError('stub planner result sequence exhausted')
            return self.result.pop(0)
        return self.result


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


def _search_output(
    *,
    retrieval_mode: str,
    items: list[ProductItem],
    semantic_query: str = 'breathable workout tops',
    normalized_filters: NormalizedFilters | None = None,
) -> SearchItemsToolOutput:
    return SearchItemsToolOutput(
        retrieval_mode=retrieval_mode,
        semantic_query=semantic_query,
        normalized_filters=normalized_filters or NormalizedFilters(category='tops', availability=True),
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
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

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
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

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
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

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
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

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


def test_workflow_applies_llm_synthesis_when_available() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    tools = _StubTools(
        search_plan=[_search_output(retrieval_mode='structured', items=[first])],
        product_map={first.product_id: first},
    )
    synthesizer = _StubSynthesizer(
        enabled=True,
        result=AssistantSynthesisResult(
            assistant_message='Top match: Essential Cropped Tee for breathable training.',
            follow_up_prompts=['Need lower-priced options?', 'Want only in-stock picks?'],
            comparison_summary=None,
        ),
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=synthesizer,
        model_name='gpt-4.1-mini',
    )

    response = workflow.run(
        _chat_payload(
            message='show available workout tops under 50 dollars',
            session_id='session-llm-1',
            request_id='request-llm-1',
            user_id='user-1',
        )
    )

    assert response.assistant_message == 'Top match: Essential Cropped Tee for breathable training.'
    assert response.follow_up_prompts == [
        'Need lower-priced options?',
        'Want only in-stock picks?',
    ]
    assert len(synthesizer.calls) == 1
    assert synthesizer.calls[0]['retrieval_mode'] == 'structured'


def test_workflow_keeps_deterministic_output_when_synthesis_fails() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    tools = _StubTools(
        search_plan=[_search_output(retrieval_mode='structured', items=[first])],
        product_map={first.product_id: first},
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=True, should_raise=True),
        model_name='gpt-4.1-mini',
    )

    response = workflow.run(
        _chat_payload(
            message='show available workout tops under 50 dollars',
            session_id='session-llm-fallback',
            request_id='request-llm-fallback',
            user_id='user-1',
        )
    )

    assert response.placeholder is False
    assert 'matching products using structured retrieval' in response.assistant_message
    assert response.follow_up_prompts == [
        'Want options in a different price range?',
        'Should I focus on in-stock items only?',
    ]


def test_workflow_turn_two_refinement_triggers_fresh_retrieval() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    second = _product(
        product_id='pro-performance-tank',
        name='Pro Performance Tank',
        category='tops',
        price_cents=7600,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(
                retrieval_mode='structured',
                items=[first],
                semantic_query='show in stock tops',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_max_cents=8000,
                    availability=True,
                    min_rating=4.0,
                ),
            ),
            _search_output(
                retrieval_mode='hybrid',
                items=[second],
                semantic_query='for men premium',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_min_cents=5000,
                    availability=True,
                    min_rating=4.0,
                ),
            ),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
        },
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

    first_turn = workflow.run(
        _chat_payload(
            message='Show me in-stock tops under $80 with rating at least 4.',
            session_id='session-refine',
            request_id='request-refine-1',
            user_id='user-1',
        )
    )
    second_turn = workflow.run(
        _chat_payload(
            message='Make those for men and premium.',
            session_id='session-refine',
            request_id='request-refine-2',
            user_id='user-1',
        )
    )

    assert first_turn.recommended_product_ids == ['essential-cropped-tee']
    assert second_turn.recommended_product_ids == ['pro-performance-tank']
    assert tools.search_calls == 2
    second_call_payload = tools.search_inputs[1]
    assert second_call_payload.price_min_cents == 5000
    assert second_call_payload.price_max_cents is None


def test_workflow_compare_with_refinement_does_not_skip_retrieval() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    second = _product(
        product_id='pro-performance-tank',
        name='Pro Performance Tank',
        category='tops',
        price_cents=7600,
    )
    third = _product(
        product_id='premium-motion-hoodie',
        name='Premium Motion Hoodie',
        category='tops',
        price_cents=8600,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(retrieval_mode='hybrid', items=[first, second]),
            _search_output(retrieval_mode='hybrid', items=[second, third]),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
            third.product_id: third,
        },
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

    workflow.run(
        _chat_payload(
            message='find breathable training tops under 60',
            session_id='session-compare-refine',
            request_id='request-compare-refine-1',
            user_id='user-1',
        )
    )
    workflow.run(
        _chat_payload(
            message='compare those, but make them premium',
            session_id='session-compare-refine',
            request_id='request-compare-refine-2',
            user_id='user-1',
        )
    )

    assert tools.search_calls == 2
    assert len(tools.compare_calls) == 1


def test_workflow_third_turn_uses_latest_state_not_first_turn_state() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    second = _product(
        product_id='pro-performance-tank',
        name='Pro Performance Tank',
        category='tops',
        price_cents=7600,
    )
    third = _product(
        product_id='lightweight-elite-tee',
        name='Lightweight Elite Tee',
        category='tops',
        price_cents=7200,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(
                retrieval_mode='structured',
                items=[first],
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_max_cents=8000,
                ),
            ),
            _search_output(
                retrieval_mode='hybrid',
                items=[second],
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_min_cents=5000,
                ),
            ),
            _search_output(
                retrieval_mode='hybrid',
                items=[third],
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_min_cents=5000,
                    availability=True,
                ),
            ),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
            third.product_id: third,
        },
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        model_name='gpt-4.1-mini',
    )

    workflow.run(
        _chat_payload(
            message='Show me tops under $80.',
            session_id='session-latest-state',
            request_id='request-latest-state-1',
            user_id='user-1',
        )
    )
    workflow.run(
        _chat_payload(
            message='Make those premium.',
            session_id='session-latest-state',
            request_id='request-latest-state-2',
            user_id='user-1',
        )
    )
    workflow.run(
        _chat_payload(
            message='Also keep only in stock options.',
            session_id='session-latest-state',
            request_id='request-latest-state-3',
            user_id='user-1',
        )
    )

    assert tools.search_calls == 3
    third_call_payload = tools.search_inputs[2]
    assert third_call_payload.price_min_cents == 5000
    assert third_call_payload.price_max_cents is None
    assert third_call_payload.availability is True


def test_workflow_uses_query_planner_plan_when_valid() -> None:
    first = _product(
        product_id='thermal-fleece-sweater',
        name='Thermal Fleece Sweater',
        category='tops',
        price_cents=6800,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(
                retrieval_mode='structured',
                items=[first],
                semantic_query='',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    gender='men',
                    price_max_cents=8000,
                    availability=True,
                ),
            )
        ],
        product_map={first.product_id: first},
    )
    planner = _StubPlanner(
        result=QueryPlannerOutput.model_validate(
            {
                'retrievalMode': 'structured',
                'filters': {
                    'category': 'tops',
                    'gender': 'men',
                    'priceMaxCents': 8000,
                    'availability': True,
                },
                'semanticQuery': '',
                'resetRequested': False,
                'clearFields': [],
                'comparisonRequested': False,
            }
        )
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        query_planner=planner,
        model_name='gpt-4.1-mini',
    )

    response = workflow.run(
        _chat_payload(
            message='show in-stock tops for men under 80',
            session_id='session-planner-1',
            request_id='request-planner-1',
            user_id='user-1',
        )
    )

    assert response.recommended_product_ids == ['thermal-fleece-sweater']
    assert len(planner.calls) == 1
    assert tools.search_inputs[0].gender == 'men'
    assert tools.search_inputs[0].retrieval_mode == 'structured'


def test_workflow_falls_back_to_deterministic_planning_when_query_planner_fails() -> None:
    first = _product(
        product_id='essential-cropped-tee',
        name='Essential Cropped Tee',
        category='tops',
        price_cents=2400,
    )
    tools = _StubTools(
        search_plan=[_search_output(retrieval_mode='structured', items=[first])],
        product_map={first.product_id: first},
    )
    planner = _StubPlanner(should_raise=True)
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        query_planner=planner,
        model_name='gpt-4.1-mini',
    )

    response = workflow.run(
        _chat_payload(
            message='show in-stock tops under 50',
            session_id='session-planner-fallback',
            request_id='request-planner-fallback',
            user_id='user-1',
        )
    )

    assert response.recommended_product_ids == ['essential-cropped-tee']
    assert len(planner.calls) == 1
    assert tools.search_calls == 1


def test_workflow_planner_path_does_not_append_residual_semantic_text() -> None:
    first = _product(
        product_id='flow-sports-bra',
        name='Flow Sports Bra',
        category='tops',
        price_cents=3600,
    )
    second = _product(
        product_id='thermal-fleece-sweater',
        name='Thermal Fleece Sweater',
        category='tops',
        price_cents=6800,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(retrieval_mode='hybrid', items=[first], semantic_query='hot weather tops'),
            _search_output(retrieval_mode='hybrid', items=[second], semantic_query='cold weather tops'),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
        },
    )
    planner = _StubPlanner(
        result=[
            QueryPlannerOutput.model_validate(
                {
                    'retrievalMode': 'hybrid',
                    'filters': {'category': 'tops', 'gender': 'women', 'thermalProfile': 'hot_weather'},
                    'semanticQuery': 'hot weather tops',
                    'resetRequested': False,
                    'clearFields': [],
                    'comparisonRequested': False,
                }
            ),
            QueryPlannerOutput.model_validate(
                {
                    'retrievalMode': 'hybrid',
                    'filters': {'category': 'tops', 'gender': 'women', 'thermalProfile': 'cold_weather'},
                    'semanticQuery': 'cold weather tops',
                    'resetRequested': False,
                    'clearFields': [],
                    'comparisonRequested': False,
                }
            ),
        ],
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        query_planner=planner,
        model_name='gpt-4.1-mini',
    )

    workflow.run(
        _chat_payload(
            message='show tops for women for hot weather workouts',
            session_id='session-updater-carry',
            request_id='request-updater-carry-1',
            user_id='user-1',
        )
    )
    workflow.run(
        _chat_payload(
            message='now make those for cold weather',
            session_id='session-updater-carry',
            request_id='request-updater-carry-2',
            user_id='user-1',
        )
    )

    assert len(planner.calls) == 2
    assert planner.calls[1]['prior_semantic_query'] == 'hot weather tops'
    assert tools.search_inputs[1].query == 'cold weather tops'


def test_workflow_planner_path_inherits_availability_when_not_explicitly_changed() -> None:
    first = _product(
        product_id='airflow-performance-tee-men',
        name='Airflow Performance Tee',
        category='tops',
        price_cents=3500,
    )
    second = _product(
        product_id='lift-seamless-tee',
        name='Lift Seamless Tee',
        category='tops',
        price_cents=3200,
    )
    tools = _StubTools(
        search_plan=[
            _search_output(
                retrieval_mode='structured',
                items=[first],
                semantic_query='',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    gender='men',
                    availability=True,
                    price_max_cents=8000,
                ),
            ),
            _search_output(
                retrieval_mode='structured',
                items=[second],
                semantic_query='',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    gender='men',
                    availability=True,
                    price_max_cents=3500,
                ),
            ),
        ],
        product_map={
            first.product_id: first,
            second.product_id: second,
        },
    )
    planner = _StubPlanner(
        result=[
            QueryPlannerOutput.model_validate(
                {
                    'retrievalMode': 'structured',
                    'filters': {
                        'category': 'tops',
                        'gender': 'men',
                        'availability': True,
                        'priceMaxCents': 8000,
                    },
                    'semanticQuery': '',
                    'resetRequested': False,
                    'clearFields': [],
                    'comparisonRequested': False,
                }
            ),
            QueryPlannerOutput.model_validate(
                {
                    'retrievalMode': 'structured',
                    'filters': {
                        'category': 'tops',
                        'gender': 'men',
                        'availability': None,
                        'priceMaxCents': 3500,
                    },
                    'semanticQuery': '',
                    'resetRequested': False,
                    'clearFields': [],
                    'comparisonRequested': False,
                }
            ),
        ],
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_StubSynthesizer(enabled=False),
        query_planner=planner,
        model_name='gpt-4.1-mini',
    )

    workflow.run(
        _chat_payload(
            message='show in-stock tops for men under 80',
            session_id='session-availability-carry',
            request_id='request-availability-carry-1',
            user_id='user-1',
        )
    )
    workflow.run(
        _chat_payload(
            message='under 35 dollars',
            session_id='session-availability-carry',
            request_id='request-availability-carry-2',
            user_id='user-1',
        )
    )

    assert len(tools.search_inputs) == 2
    assert tools.search_inputs[1].availability is True
