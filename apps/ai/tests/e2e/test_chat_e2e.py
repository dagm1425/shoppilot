from __future__ import annotations

from fastapi.testclient import TestClient


def test_chat_invalid_payload_returns_typed_validation_error(client: TestClient) -> None:
    response = client.post('/ai/chat', json={'message': ''})

    assert response.status_code == 422
    assert response.headers.get('x-request-id')

    payload = response.json()
    assert payload['error']['code'] == 'AI_VALIDATION_ERROR'
    assert payload['error']['message'] == 'Request validation failed.'
    assert payload['error']['requestId'] == response.headers['x-request-id']
    assert isinstance(payload['error']['details'], list)
    assert len(payload['error']['details']) > 0


def test_chat_validation_error_echoes_inbound_request_id(client: TestClient) -> None:
    response = client.post(
        '/ai/chat',
        headers={'x-request-id': 'validation-request-id'},
        json={'message': ''},
    )

    assert response.status_code == 422

    payload = response.json()
    assert payload['error']['requestId'] == 'validation-request-id'
