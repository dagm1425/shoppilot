from __future__ import annotations

from app.schemas import ChatRequest
from app.services.chat_service import build_placeholder_response


def test_build_placeholder_response_is_deterministic() -> None:
    payload = ChatRequest.model_validate(
        {
            'message': 'Recommend running shoes',
            'sessionId': 'session-1',
            'userContext': {'userId': 'user-1'},
            'requestId': 'request-1',
        }
    )

    result = build_placeholder_response(payload, model_name='gpt-4.1-mini')

    assert result.request_id == 'request-1'
    assert result.session_id == 'session-1'
    assert result.placeholder is True
    assert result.model == 'gpt-4.1-mini'
    assert result.recommendations == []
    assert len(result.follow_up_prompts) == 2
