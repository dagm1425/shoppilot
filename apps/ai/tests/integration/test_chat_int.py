from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem


class _StubWorkflow:
    def __init__(self, response: ChatResponse) -> None:
        self._response = response
        self.calls: list[ChatRequest] = []

    def run(self, payload: ChatRequest) -> ChatResponse:
        self.calls.append(payload)
        response = self._response.model_copy(deep=True)
        response.request_id = payload.request_id
        response.session_id = payload.session_id
        return response


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


def test_chat_returns_typed_recommendation_response(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
        json={
            'message': 'Recommend running tops',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-1',
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload['requestId'] == 'request-1'
    assert payload['sessionId'] == 'session-1'
    assert payload['assistantMessage']
    assert payload['placeholder'] is False
    assert payload['model'] == 'gpt-4.1-mini'
    assert payload['retrievalMode'] == 'hybrid'
    assert payload['recommendedProductIds'] == ['essential-cropped-tee', 'flow-sports-bra']
    assert len(payload['recommendations']) == 1
    assert payload['recommendations'][0]['recommendedProducts'][0]['productId'] == 'essential-cropped-tee'
    assert len(stub_workflow.calls) == 1


def test_chat_returns_graceful_no_match_response(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_no_result_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
        json={
            'message': 'bottoms under $10',
            'sessionId': 'session-empty',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-empty',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['placeholder'] is False
    assert payload['retrievalMode'] == 'structured'
    assert payload['recommendations'] == []
    assert payload['recommendedProductIds'] == []
    assert 'could not find products' in payload['assistantMessage'].lower()
    assert len(stub_workflow.calls) == 1


def test_chat_request_id_header_is_echoed_from_inbound_header(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_no_result_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat',
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


def test_chat_versioned_route_returns_same_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_recommended_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/v1/ai/chat',
        json={
            'message': 'Recommend neutral jackets',
            'sessionId': 'session-2',
            'userContext': {'userId': 'user-2'},
            'requestId': 'request-2',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['requestId'] == 'request-2'
    assert payload['sessionId'] == 'session-2'
    assert payload['placeholder'] is False
    assert payload['recommendedProductIds'] == ['essential-cropped-tee', 'flow-sports-bra']


def test_chat_stream_returns_ordered_ag_ui_text_events(
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

    snapshot_payload = next(payload for event_name, payload in events if event_name == 'STATE_SNAPSHOT')
    assert isinstance(snapshot_payload.get('state'), dict)
    assert isinstance(snapshot_payload['state'].get('chatResponse'), dict)


def test_chat_stream_emits_run_error_event_on_failure(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FailingWorkflow:
        def run(self, _payload: ChatRequest) -> ChatResponse:
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
