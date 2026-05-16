from __future__ import annotations

from fastapi.testclient import TestClient


def test_chat_returns_typed_placeholder_response(client: TestClient) -> None:
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
    assert payload['recommendations'] == []
    assert payload['placeholder'] is True
    assert payload['model'] == 'gpt-4.1-mini'


def test_chat_request_id_header_is_echoed_from_inbound_header(client: TestClient) -> None:
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


def test_chat_versioned_route_returns_same_contract(client: TestClient) -> None:
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
    assert response.json()['requestId'] == 'request-2'
