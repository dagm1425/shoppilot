from __future__ import annotations

from functools import lru_cache

from app.config.settings import get_settings
from app.graph.workflow import AssistantGraphWorkflow
from app.tools import get_assistant_tools


@lru_cache(maxsize=1)
def get_assistant_workflow() -> AssistantGraphWorkflow:
    settings = get_settings()
    return AssistantGraphWorkflow(
        tools=get_assistant_tools(),
        model_name=settings.openai_chat_model,
    )
