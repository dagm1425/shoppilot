from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.graph.workflow import AssistantGraphWorkflow
from app.llm.planner import QueryPlannerOutput
from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem
from app.schemas import (
    CompareItemsToolOutput,
    GetItemDetailsToolOutput,
    NormalizedFilters,
    SearchItemsToolOutput,
    SearchResult,
)


class _StubWorkflow:
    def __init__(self, response: ChatResponse, *, stream_chunks: list[str] | None = None) -> None:
        self._response = response
        self._stream_chunks = stream_chunks
        self.calls: list[ChatRequest] = []

    def run(self, payload: ChatRequest) -> ChatResponse:
        self.calls.append(payload)
        response = self._response.model_copy(deep=True)
        response.request_id = payload.request_id
        response.session_id = payload.session_id
        return response

    async def prepare_stream_response(self, payload: ChatRequest, *, run_id: str | None = None):
        response = self.run(payload)
        response.model = 'gemini-2.5-flash'
        telemetry = {
            'request_id': payload.request_id,
            'run_id': run_id or f'run-{payload.request_id}',
            'thread_id': f'{payload.user_context.user_id}:{payload.session_id}',
            'transport': 'sse',
            'retrieval_mode': response.retrieval_mode,
            'llm_provider': 'gemini',
            'llm_model': 'gemini-2.5-flash',
            'token_usage_prompt': None,
            'token_usage_completion': None,
            'token_usage_total': None,
            'cost_estimate_usd': None,
            'fallback_reason': None,
            'budget_top_k': 5,
            'budget_top_n_products': 3,
            'budget_max_output_tokens': 220,
        }
        synthesis_stream = None
        if self._stream_chunks is not None:
            synthesis_stream = _StubSynthesisStream(self._stream_chunks)
        return SimpleNamespace(
            chat_response=response,
            telemetry=telemetry,
            synthesis_stream=synthesis_stream,
        )


class _StubSynthesisStream:
    def __init__(self, chunks: list[str]) -> None:
        self._chunks = list(chunks)
        self.assistant_message = ''
        self.prompt_tokens = 12
        self.completion_tokens = 9
        self.total_tokens = 21
        self.closed = False

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        buffered: list[str] = []
        for chunk in self._chunks:
            buffered.append(chunk)
            yield chunk
        self.assistant_message = ''.join(buffered).strip()

    async def aclose(self) -> None:
        self.closed = True


class _NoopSynthesizer:
    provider = 'gemini'
    enabled = False
    model_name = 'gemini-2.5-flash'
    max_tokens = 220
    top_n_products = 3


class _StubPlanner:
    enabled = True

    def __init__(self, outcomes: list[QueryPlannerOutput]) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, object]] = []

    def plan(  # noqa: PLR0913
        self,
        *,
        query: str,
        prior_filters: dict[str, object],
        prior_semantic_query: str,
        prior_comparison_requested: bool,
        prior_reset_requested: bool,
        has_prior_recommendations: bool,
    ) -> QueryPlannerOutput:
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
        if len(self.outcomes) == 0:
            raise RuntimeError('planner outcomes exhausted')
        return self.outcomes.pop(0)


class _WorkflowTools:
    def __init__(self) -> None:
        self.search_calls = 0
        self.search_inputs: list[object] = []

        self._product_a = ProductItem(
            product_id='essential-cropped-tee',
            name='Essential Cropped Tee',
            category='tops',
            price_cents=2400,
            currency='USD',
            available=True,
            rating=4.8,
            short_description='Soft cropped tee',
        )
        self._product_b = ProductItem(
            product_id='pro-performance-tank',
            name='Pro Performance Tank',
            category='tops',
            price_cents=7600,
            currency='USD',
            available=True,
            rating=4.6,
            short_description='Premium performance tank',
        )
        self._product_c = ProductItem(
            product_id='thermal-fleece-sweater',
            name='Thermal Fleece Sweater',
            category='tops',
            price_cents=6800,
            currency='USD',
            available=True,
            rating=4.7,
            short_description='Insulated cold-weather sweater',
        )

    def search_items(self, payload):
        self.search_calls += 1
        self.search_inputs.append(payload)

        if self.search_calls == 1:
            return SearchItemsToolOutput(
                retrieval_mode='structured',
                semantic_query='in stock tops',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_max_cents=8000,
                    availability=True,
                    min_rating=4.0,
                ),
                items=[SearchResult(product=self._product_a, similarity_score=0.95)],
                total_matches=1,
            )

        if self.search_calls == 2:
            return SearchItemsToolOutput(
                retrieval_mode='hybrid',
                semantic_query='for men premium',
                normalized_filters=NormalizedFilters(
                    category='tops',
                    price_min_cents=5000,
                    availability=True,
                    min_rating=4.0,
                ),
                items=[SearchResult(product=self._product_b, similarity_score=0.93)],
                total_matches=1,
            )

        return SearchItemsToolOutput(
            retrieval_mode='hybrid',
            semantic_query='cold weather men tops',
            normalized_filters=NormalizedFilters(
                category='tops',
                gender='men',
                thermal_profile='cold_weather',
                price_min_cents=5000,
                availability=True,
                min_rating=4.0,
            ),
            items=[SearchResult(product=self._product_c, similarity_score=0.94)],
            total_matches=1,
        )

    def get_item_details(self, payload) -> GetItemDetailsToolOutput:
        if payload.product_id == self._product_a.product_id:
            return GetItemDetailsToolOutput(item=self._product_a)
        if payload.product_id == self._product_b.product_id:
            return GetItemDetailsToolOutput(item=self._product_b)
        if payload.product_id == self._product_c.product_id:
            return GetItemDetailsToolOutput(item=self._product_c)
        return GetItemDetailsToolOutput(item=None)

    def compare_items(self, payload) -> CompareItemsToolOutput:
        return CompareItemsToolOutput(summary='Compared selected products.', compared_items=[])


def _planner_output(
    *,
    retrieval_mode: str,
    semantic_query: str,
    reset_requested: bool = False,
    clear_fields: list[str] | None = None,
    comparison_requested: bool = False,
    **filter_overrides: object,
) -> QueryPlannerOutput:
    filters: dict[str, object] = {
        'category': None,
        'gender': None,
        'thermalProfile': None,
        'priceMinCents': None,
        'priceMaxCents': None,
        'availability': None,
        'minRating': None,
    }
    filters.update(filter_overrides)
    return QueryPlannerOutput.model_validate(
        {
            'retrievalMode': retrieval_mode,
            'filters': filters,
            'semanticQuery': semantic_query,
            'resetRequested': reset_requested,
            'clearFields': clear_fields or [],
            'comparisonRequested': comparison_requested,
        }
    )


def _recommended_response() -> ChatResponse:
    recommendation = FinalRecommendation(
        summary='Two strong in-stock options for training tops.',
        recommended_products=[
            ProductItem(
                product_id='essential-cropped-tee',
                name='Essential Cropped Tee',
                category='tops',
                price_cents=2400,
                currency='USD',
                available=True,
                rating=4.8,
                short_description='Soft cropped tee',
            ),
            ProductItem(
                product_id='flow-sports-bra',
                name='Flow Sports Bra',
                category='tops',
                price_cents=3600,
                currency='USD',
                available=True,
                rating=4.5,
                short_description='Supportive bra',
            ),
        ],
        follow_up_prompts=['Want a lower price range?'],
    )

    return ChatResponse(
        request_id='request-1',
        session_id='session-1',
        assistant_message='I found two options that match your constraints.',
        recommendations=[recommendation],
        recommended_product_ids=['essential-cropped-tee', 'flow-sports-bra'],
        retrieval_mode='hybrid',
        follow_up_prompts=['Want a lower price range?'],
        model='workflow-model',
        placeholder=False,
    )


def _no_result_response() -> ChatResponse:
    return ChatResponse(
        request_id='request-empty',
        session_id='session-empty',
        assistant_message='I could not find products that match those constraints yet.',
        recommendations=[],
        recommended_product_ids=[],
        retrieval_mode='structured',
        follow_up_prompts=['Try broadening your budget.'],
        model='workflow-model',
        placeholder=False,
    )


def _parse_sse_events(raw_payload: str) -> list[tuple[str, dict[str, object]]]:
    events: list[tuple[str, dict[str, object]]] = []

    for block in raw_payload.strip().split('\n\n'):
        lines = [line.strip() for line in block.split('\n') if line.strip() != '']
        if len(lines) < 2:
            continue

        event_line = next((line for line in lines if line.startswith('event: ')), None)
        data_line = next((line for line in lines if line.startswith('data: ')), None)

        if not event_line or not data_line:
            continue

        event_name = event_line.replace('event: ', '', 1).strip()
        payload = json.loads(data_line.replace('data: ', '', 1))
        events.append((event_name, payload))

    return events


def _extract_snapshot_chat_response(events: list[tuple[str, dict[str, object]]]) -> dict[str, object]:
    snapshot_payload = next(payload for event_name, payload in events if event_name == 'STATE_SNAPSHOT')
    state = snapshot_payload.get('state')
    assert isinstance(state, dict)
    chat_response = state.get('chatResponse')
    assert isinstance(chat_response, dict)
    return chat_response


def test_chat_stream_returns_typed_recommendation_snapshot(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-1',
        },
    )

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    payload = _extract_snapshot_chat_response(events)

    assert payload['requestId'] == 'request-1'
    assert payload['sessionId'] == 'session-1'
    assert payload['assistantMessage']
    assert payload['placeholder'] is False
    assert payload['model'] == 'gemini-2.5-flash'
    assert payload['retrievalMode'] == 'hybrid'
    assert payload['recommendedProductIds'] == ['essential-cropped-tee', 'flow-sports-bra']
    assert len(payload['recommendations']) == 1
    assert payload['recommendations'][0]['recommendedProducts'][0]['productId'] == 'essential-cropped-tee'
    assert len(stub_workflow.calls) == 1


def test_chat_stream_returns_graceful_no_match_snapshot(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_no_result_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'bottoms under $10',
            'sessionId': 'session-empty',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-empty',
        },
    )

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    payload = _extract_snapshot_chat_response(events)
    assert payload['placeholder'] is False
    assert payload['retrievalMode'] == 'structured'
    assert payload['recommendations'] == []
    assert payload['recommendedProductIds'] == []
    assert 'could not find products' in payload['assistantMessage'].lower()
    assert len(stub_workflow.calls) == 1


def test_chat_stream_request_id_header_is_echoed_from_inbound_header(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_no_result_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat/stream',
        headers={'x-request-id': 'external-request-id'},
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'payload-request-id',
        },
    )

    assert response.status_code == 200
    assert response.headers.get('x-request-id') == 'external-request-id'
    assert len(stub_workflow.calls) == 1


def test_chat_stream_follow_up_refinement_in_same_session_updates_recommendations(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tools = _WorkflowTools()
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_NoopSynthesizer(),
        model_name='gemini-2.5-flash',
    )
    monkeypatch.setattr('app.services.chat_service.get_assistant_workflow', lambda: workflow)

    first_response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Show me in-stock tops under $80 with rating at least 4.',
            'sessionId': 'session-follow-up',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-follow-up-1',
        },
    )
    second_response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Make those for men and premium',
            'sessionId': 'session-follow-up',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-follow-up-2',
        },
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_payload = _extract_snapshot_chat_response(_parse_sse_events(first_response.text))
    second_payload = _extract_snapshot_chat_response(_parse_sse_events(second_response.text))
    assert first_payload['recommendedProductIds'] == ['essential-cropped-tee']
    assert second_payload['recommendedProductIds'] == ['pro-performance-tank']
    assert tools.search_calls == 2

    second_call_input = tools.search_inputs[1]
    assert second_call_input.price_min_cents == 5000
    assert second_call_input.price_max_cents is None


def test_chat_stream_three_turn_follow_up_uses_updater_state_and_replaces_semantic_intent(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tools = _WorkflowTools()
    planner = _StubPlanner(
        outcomes=[
            _planner_output(
                retrieval_mode='structured',
                semantic_query='',
                category='tops',
                gender='men',
                priceMaxCents=8000,
                availability=True,
                minRating=4.0,
            ),
            _planner_output(
                retrieval_mode='hybrid',
                semantic_query='premium men tops',
                category='tops',
                gender='men',
                priceMinCents=5000,
                priceMaxCents=None,
                availability=True,
                minRating=4.0,
                clear_fields=['priceMaxCents'],
            ),
            _planner_output(
                retrieval_mode='hybrid',
                semantic_query='cold weather men tops',
                category='tops',
                gender='men',
                thermalProfile='cold_weather',
                priceMinCents=5000,
                availability=True,
                minRating=4.0,
            ),
        ],
    )
    workflow = AssistantGraphWorkflow(
        tools=tools,
        synthesizer=_NoopSynthesizer(),
        query_planner=planner,
        model_name='gemini-2.5-flash',
    )
    monkeypatch.setattr('app.services.chat_service.get_assistant_workflow', lambda: workflow)

    turn_one = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Show me in-stock tops under $80 with rating at least 4 for men.',
            'sessionId': 'session-follow-up-3turn',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-follow-up-3turn-1',
        },
    )
    turn_two = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Make those premium.',
            'sessionId': 'session-follow-up-3turn',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-follow-up-3turn-2',
        },
    )
    turn_three = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Now make those for cold weather only.',
            'sessionId': 'session-follow-up-3turn',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-follow-up-3turn-3',
        },
    )

    assert turn_one.status_code == 200
    assert turn_two.status_code == 200
    assert turn_three.status_code == 200
    assert _extract_snapshot_chat_response(_parse_sse_events(turn_one.text))['recommendedProductIds'] == ['essential-cropped-tee']
    assert _extract_snapshot_chat_response(_parse_sse_events(turn_two.text))['recommendedProductIds'] == ['pro-performance-tank']
    assert _extract_snapshot_chat_response(_parse_sse_events(turn_three.text))['recommendedProductIds'] == ['thermal-fleece-sweater']
    assert tools.search_calls == 3
    assert len(planner.calls) == 3
    assert planner.calls[2]['prior_semantic_query'] == 'premium men tops'
    third_call_input = tools.search_inputs[2]
    assert third_call_input.thermal_profile == 'cold_weather'
    assert third_call_input.semantic_query == 'cold weather men tops'


def test_chat_stream_versioned_route_returns_same_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/v1/ai/chat/stream',
        json={
            'message': 'Recommend neutral jackets',
            'sessionId': 'session-2',
            'userContext': {'userId': 'user-2'},
            'requestId': 'request-2',
        },
    )

    assert response.status_code == 200
    payload = _extract_snapshot_chat_response(_parse_sse_events(response.text))
    assert payload['requestId'] == 'request-2'
    assert payload['sessionId'] == 'session-2'
    assert payload['placeholder'] is False
    assert payload['recommendedProductIds'] == ['essential-cropped-tee', 'flow-sports-bra']


def test_chat_stream_returns_ordered_ag_ui_text_events(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(
        _recommended_response(),
        stream_chunks=['I found two ', 'options that ', 'match your constraints.'],
    )
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-stream',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-stream-1',
        },
    )

    assert response.status_code == 200
    assert response.headers.get('content-type', '').startswith('text/event-stream')
    assert response.headers.get('x-request-id') == 'request-stream-1'

    events = _parse_sse_events(response.text)
    event_names = [event_name for event_name, _payload in events]

    assert event_names[0] == 'RUN_STARTED'
    assert event_names[1] == 'TEXT_MESSAGE_START'
    assert 'TEXT_MESSAGE_CONTENT' in event_names
    assert event_names[-3] == 'TEXT_MESSAGE_END'
    assert event_names[-1] == 'RUN_FINISHED'
    assert 'STATE_SNAPSHOT' in event_names
    assert event_names[event_names.index('STATE_SNAPSHOT') + 1] == 'RUN_FINISHED'

    for event_name, payload in events:
        assert payload['type'] == event_name

    content_deltas = [
        payload['delta']
        for event_name, payload in events
        if event_name == 'TEXT_MESSAGE_CONTENT'
    ]
    assert content_deltas == ['I found two ', 'options that ', 'match your constraints.']

    snapshot_payload = next(payload for event_name, payload in events if event_name == 'STATE_SNAPSHOT')
    assert isinstance(snapshot_payload.get('state'), dict)
    assert isinstance(snapshot_payload['state'].get('chatResponse'), dict)
    assert snapshot_payload['state']['chatResponse']['assistantMessage'] == 'I found two options that match your constraints.'


def test_chat_stream_emits_run_error_event_on_failure(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FailingWorkflow:
        async def prepare_stream_response(self, _payload: ChatRequest, *, run_id: str | None = None):
            raise RuntimeError('graph failed')

    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: _FailingWorkflow(),
    )

    response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-stream-error',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-stream-2',
        },
    )

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    assert len(events) == 1
    assert events[0][0] == 'RUN_ERROR'
    assert events[0][1]['type'] == 'RUN_ERROR'
    assert events[0][1]['code'] == 'AI_INTERNAL_ERROR'


def test_chat_stream_invalid_payload_returns_typed_validation_error(client: TestClient) -> None:
    response = client.post('/ai/chat/stream', json={'message': ''})

    assert response.status_code == 422
    assert response.headers.get('x-request-id')
    payload = response.json()

    assert payload['error']['code'] == 'AI_VALIDATION_ERROR'
    assert payload['error']['message'] == 'Request validation failed.'
