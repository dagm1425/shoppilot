from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.schemas import ChatRequest, ChatResponse, FinalRecommendation, ProductItem


class _StubWorkflow:
    def __init__(self, response: ChatResponse | None = None, *, should_raise: bool = False) -> None:
        self._response = response
        self._should_raise = should_raise

    async def prepare_stream_response(self, payload: ChatRequest, *, run_id: str | None = None):
        if self._should_raise:
            raise RuntimeError('assistant graph failed')
        if self._response is None:
            raise RuntimeError('stub result missing')

        response = self._response.model_copy(deep=True)
        response.request_id = payload.request_id
        response.session_id = payload.session_id

        return SimpleNamespace(
            chat_response=response,
            telemetry={
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
            },
            synthesis_stream=None,
        )


def _success_response() -> ChatResponse:
    recommendation = FinalRecommendation(
        summary='One strong jogger option matched your request.',
        recommended_products=[
            ProductItem(
                product_id='studio-training-jogger',
                name='Studio Training Jogger',
                category='bottoms',
                price_cents=5200,
                currency='USD',
                available=True,
                rating=4.6,
                short_description='Tapered jogger for training',
            )
        ],
        follow_up_prompts=['Want a lower-priced alternative?'],
    )

    return ChatResponse(
        request_id='request-success',
        session_id='session-success',
        assistant_message='I found one tapered jogger to consider.',
        recommendations=[recommendation],
        recommended_product_ids=['studio-training-jogger'],
        retrieval_mode='semantic',
        follow_up_prompts=['Want a lower-priced alternative?'],
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


def test_chat_stream_success_path_returns_typed_recommendation_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_workflow = _StubWorkflow(_success_response())
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: stub_workflow,
    )

    response = client.post(
        '/ai/chat/stream',
        json={
            'message': 'recommend tapered joggers',
            'sessionId': 'session-success',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-success',
        },
    )

    assert response.status_code == 200
    payload = _extract_snapshot_chat_response(_parse_sse_events(response.text))
    assert payload['placeholder'] is False
    assert payload['retrievalMode'] == 'semantic'
    assert payload['recommendedProductIds'] == ['studio-training-jogger']
    assert len(payload['recommendations']) == 1
    assert payload['recommendations'][0]['recommendedProducts'][0]['productId'] == 'studio-training-jogger'


def test_chat_stream_invalid_payload_returns_typed_validation_error(client: TestClient) -> None:
    response = client.post('/ai/chat/stream', json={'message': ''})

    assert response.status_code == 422
    assert response.headers.get('x-request-id')

    payload = response.json()
    assert payload['error']['code'] == 'AI_VALIDATION_ERROR'
    assert payload['error']['message'] == 'Request validation failed.'
    assert payload['error']['requestId'] == response.headers['x-request-id']
    assert isinstance(payload['error']['details'], list)
    assert len(payload['error']['details']) > 0


def test_chat_stream_validation_error_echoes_inbound_request_id(client: TestClient) -> None:
    response = client.post(
        '/ai/chat/stream',
        headers={'x-request-id': 'validation-request-id'},
        json={'message': ''},
    )

    assert response.status_code == 422

    payload = response.json()
    assert payload['error']['requestId'] == 'validation-request-id'


def test_chat_stream_setup_failure_returns_run_error_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        'app.services.chat_service.get_assistant_workflow',
        lambda: _StubWorkflow(should_raise=True),
    )

    from app.main import create_app

    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as safe_client:
        response = safe_client.post(
            '/ai/chat/stream',
            headers={'x-request-id': 'internal-request-id'},
            json={
                'message': 'recommend breathable tops',
                'sessionId': 'session-error',
                'userContext': {'userId': 'user-1'},
                'requestId': 'request-error',
            },
        )

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    assert len(events) == 1
    assert events[0][0] == 'RUN_ERROR'
    assert events[0][1]['type'] == 'RUN_ERROR'
    assert events[0][1]['code'] == 'AI_INTERNAL_ERROR'
