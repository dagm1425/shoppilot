from __future__ import annotations

from functools import lru_cache

from app.config.settings import get_settings
from app.llm import get_assistant_query_planner, get_assistant_synthesizer
from app.graph.workflow import AssistantGraphWorkflow
from app.tools import get_assistant_tools


@lru_cache(maxsize=1)
def get_assistant_workflow() -> AssistantGraphWorkflow:
    settings = get_settings()
    return AssistantGraphWorkflow(
        tools=get_assistant_tools(),
        synthesizer=get_assistant_synthesizer(),
        query_planner=get_assistant_query_planner(),
        model_name=settings.llm_synthesis_model,
        search_top_k=settings.ai_search_top_k,
    )
