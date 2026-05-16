from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_contract(client: TestClient) -> None:
    response = client.get('/health')

    assert response.status_code == 200
    assert response.headers.get('x-request-id')

    payload = response.json()
    assert payload['status'] == 'ok'
    assert payload['service'] == 'shoppilot-ai'
    assert payload['timestamp']


def test_health_versioned_route_contract(client: TestClient) -> None:
    response = client.get('/v1/health')

    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
