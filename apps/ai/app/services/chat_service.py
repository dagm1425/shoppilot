from __future__ import annotations

from app.schemas import ChatRequest, ChatResponse


def build_placeholder_response(payload: ChatRequest, *, model_name: str) -> ChatResponse:
    # future: langgraph-workflow - replace placeholder chat pipeline in subphase 4.3
    return ChatResponse(
        request_id=payload.request_id,
        session_id=payload.session_id,
        assistant_message=(
            'AI assistant foundation is online. Recommendations and semantic search '
            'will be enabled in upcoming subphases.'
        ),
        recommendations=[],
        follow_up_prompts=[
            'What style are you shopping for?',
            'Do you have a target budget?',
        ],
        model=model_name,
        placeholder=True,
    )
