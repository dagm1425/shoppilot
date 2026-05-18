from __future__ import annotations

import logging
from time import perf_counter
from typing import Any, Literal

from pydantic import ValidationError
from typing_extensions import TypedDict

from langgraph.graph import END, START, StateGraph

try:
    from langgraph.checkpoint.memory import MemorySaver
except ImportError:  # pragma: no cover - compatibility for pre-rename releases
    from langgraph.checkpoint.memory import InMemorySaver as MemorySaver

from app.llm.synthesizer import AssistantSynthesizer
from app.observability import capture_sentry_exception
from app.schemas import (
    AgentState,
    ChatRequest,
    ChatResponse,
    CompareItemsToolInput,
    FinalRecommendation,
    GetItemDetailsToolInput,
    ProductItem,
    SearchResult,
    SearchItemsToolInput,
    SearchItemsToolOutput,
)
from app.search.query_intent import parse_intent
from app.tools import AssistantTools

logger = logging.getLogger(__name__)

_RETRY_LIMIT = 1


class AssistantGraphState(TypedDict, total=False):
    query: str
    request_id: str
    session_id: str
    user_id: str
    thread_id: str
    semantic_query: str
    retrieval_mode: Literal['structured', 'semantic', 'hybrid']
    normalized_filters: dict[str, Any]
    tool_output: dict[str, Any]
    retrieved_products: list[dict[str, Any]]
    recommended_product_ids: list[str]
    prior_recommended_product_ids: list[str]
    comparison_requested: bool
    skip_retrieval: bool
    comparison_summary: str | None
    retry_count: int
    validation_error: str | None
    assistant_message: str
    follow_up_prompts: list[str]
    terminal_status: Literal['success', 'no_results', 'retry_exhausted']


class AssistantGraphWorkflow:
    def __init__(
        self,
        *,
        tools: AssistantTools,
        synthesizer: AssistantSynthesizer,
        model_name: str,
    ) -> None:
        self._tools = tools
        self._synthesizer = synthesizer
        self._model_name = model_name
        self._graph = _compile_graph(self)

    def run(self, payload: ChatRequest) -> ChatResponse:
        initial_state: AssistantGraphState = {
            'query': payload.message,
            'request_id': payload.request_id,
            'session_id': payload.session_id,
            'user_id': payload.user_context.user_id,
            'thread_id': _build_thread_id(
                user_id=payload.user_context.user_id,
                session_id=payload.session_id,
            ),
            'retry_count': 0,
            'validation_error': None,
        }

        config = {
            'configurable': {
                'thread_id': initial_state['thread_id'],
            }
        }

        try:
            state = self._graph.invoke(initial_state, config=config)
        except Exception as exc:
            capture_sentry_exception(
                exc,
                tags={
                    'ai_assistant_request': 'true',
                    'request_id': payload.request_id,
                    'thread_id': initial_state['thread_id'],
                },
            )
            raise

        recommendation = _build_recommendation_from_state(state)
        recommended_ids = [product.product_id for product in recommendation.recommended_products]

        return ChatResponse(
            request_id=payload.request_id,
            session_id=payload.session_id,
            assistant_message=state.get('assistant_message', recommendation.summary),
            recommendations=[recommendation] if recommendation.recommended_products else [],
            recommended_product_ids=recommended_ids,
            retrieval_mode=state.get('retrieval_mode'),
            follow_up_prompts=state.get('follow_up_prompts', recommendation.follow_up_prompts),
            model=self._model_name,
            placeholder=False,
        )

    def _query_planning_node(self, state: AssistantGraphState) -> AssistantGraphState:
        intent = parse_intent(state['query'])
        lowered_query = state['query'].lower()
        prior_recommended_ids = list(state.get('recommended_product_ids', []))

        comparison_requested = any(
            token in lowered_query
            for token in ('compare', 'comparison', 'versus', 'vs ')
        )
        skip_retrieval = comparison_requested and len(prior_recommended_ids) >= 2

        normalized_filters = {
            'category': intent.filters.category,
            'priceMinCents': intent.filters.price_min_cents,
            'priceMaxCents': intent.filters.price_max_cents,
            'availability': intent.filters.availability,
            'minRating': intent.filters.min_rating,
        }

        logger.info(
            {
                'event': 'ai.graph.query_planned',
                'request_id': state['request_id'],
                'thread_id': state['thread_id'],
                'ai_retrieval_mode': intent.mode,
                'comparison_requested': comparison_requested,
                'skip_retrieval': skip_retrieval,
            },
        )

        return {
            'semantic_query': intent.semantic_query,
            'retrieval_mode': intent.mode,
            'normalized_filters': normalized_filters,
            'comparison_requested': comparison_requested,
            'prior_recommended_product_ids': prior_recommended_ids,
            'skip_retrieval': skip_retrieval,
            'validation_error': None,
        }

    def _product_retrieval_node(self, state: AssistantGraphState) -> AssistantGraphState:
        try:
            tool_input = SearchItemsToolInput.model_validate(
                {
                    'query': state['query'],
                    'retrievalMode': state['retrieval_mode'],
                    'topK': 5,
                    'category': state.get('normalized_filters', {}).get('category'),
                    'priceMinCents': state.get('normalized_filters', {}).get('priceMinCents'),
                    'priceMaxCents': state.get('normalized_filters', {}).get('priceMaxCents'),
                    'availability': state.get('normalized_filters', {}).get('availability'),
                    'minRating': state.get('normalized_filters', {}).get('minRating'),
                }
            )
            tool_output = self._tools.search_items(tool_input)
        except ValidationError as exc:
            return {
                'validation_error': f'search_items input validation failed: {exc.errors()}',
                'tool_output': {},
            }
        except Exception as exc:
            capture_sentry_exception(
                exc,
                tags={
                    'ai_assistant_request': 'true',
                    'request_id': state['request_id'],
                    'thread_id': state['thread_id'],
                },
            )
            return {
                'validation_error': f'search_items execution failed: {exc}',
                'tool_output': {},
            }

        logger.info(
            {
                'event': 'ai.graph.retrieval_completed',
                'request_id': state['request_id'],
                'thread_id': state['thread_id'],
                'ai_retrieval_mode': tool_output.retrieval_mode,
                'result_count': len(tool_output.items),
                'retry_count': state.get('retry_count', 0),
            },
        )

        return {
            'tool_output': tool_output.model_dump(by_alias=True),
            'retrieval_mode': tool_output.retrieval_mode,
            'semantic_query': tool_output.semantic_query,
            'normalized_filters': tool_output.normalized_filters.model_dump(by_alias=True),
            'validation_error': None,
        }

    def _validate_tool_output_node(self, state: AssistantGraphState) -> AssistantGraphState:
        if state.get('validation_error'):
            return {}

        try:
            validated_output = SearchItemsToolOutput.model_validate(state.get('tool_output', {}))
            retrieved_products = [
                item.model_dump(by_alias=True)
                for item in validated_output.items
            ]
            recommended_ids = [item.product.product_id for item in validated_output.items]
        except ValidationError as exc:
            return {
                'validation_error': f'search_items output validation failed: {exc.errors()}',
                'retrieved_products': [],
                'recommended_product_ids': [],
            }

        return {
            'retrieved_products': retrieved_products,
            'recommended_product_ids': recommended_ids,
            'terminal_status': 'success' if recommended_ids else 'no_results',
        }

    def _retry_route_node(self, state: AssistantGraphState) -> AssistantGraphState:
        next_retry_count = state.get('retry_count', 0) + 1

        logger.warning(
            {
                'event': 'ai.graph.retry_route',
                'request_id': state['request_id'],
                'thread_id': state['thread_id'],
                'retry_count': next_retry_count,
                'validation_error': state.get('validation_error'),
            },
        )

        return {
            'retry_count': next_retry_count,
            'validation_error': None,
        }

    def _no_result_node(self, state: AssistantGraphState) -> AssistantGraphState:
        status = 'retry_exhausted' if state.get('validation_error') else 'no_results'

        return {
            'terminal_status': status,
            'assistant_message': (
                'I could not find products that match those constraints yet. '
                'Try broadening your budget, category, or availability filters.'
            ),
            'follow_up_prompts': [
                'Try removing one filter and ask again.',
                'Would you like recommendations under a higher budget?',
            ],
            'retrieved_products': [],
            'recommended_product_ids': [],
            'comparison_summary': None,
        }

    def _final_response_node(self, state: AssistantGraphState) -> AssistantGraphState:
        retrieved_products = list(state.get('retrieved_products', []))
        recommended_ids = list(state.get('recommended_product_ids', []))

        if len(retrieved_products) == 0 and recommended_ids:
            hydrated_products: list[dict[str, Any]] = []
            for index, product_id in enumerate(recommended_ids[:4]):
                details = self._tools.get_item_details(
                    GetItemDetailsToolInput(product_id=product_id)
                )
                if details.item is None:
                    continue
                hydrated_products.append(
                    SearchResult(
                        product=details.item,
                        similarity_score=max(0.0, round(1.0 - (index * 0.08), 4)),
                    ).model_dump(by_alias=True)
                )

            if hydrated_products:
                retrieved_products = hydrated_products
                recommended_ids = [
                    row['product']['productId']
                    for row in hydrated_products
                    if isinstance(row, dict)
                ]

        comparison_summary: str | None = None
        if state.get('comparison_requested') and recommended_ids:
            compare_output = self._tools.compare_items(
                CompareItemsToolInput(
                    product_ids=recommended_ids[:4],
                )
            )
            comparison_summary = compare_output.summary

        assistant_message = (
            f"I found {len(retrieved_products)} matching products using "
            f"{state.get('retrieval_mode', 'semantic')} retrieval. "
            'These options are ranked from your current request.'
        )
        follow_up_prompts = [
            'Want options in a different price range?',
            'Should I focus on in-stock items only?',
        ]

        if not self._synthesizer.enabled:
            logger.info(
                {
                    'event': 'ai.llm_synthesis_fallback',
                    'request_id': state['request_id'],
                    'thread_id': state['thread_id'],
                    'ai_retrieval_mode': state.get('retrieval_mode'),
                    'latency_ms': 0,
                    'fallback_reason': 'disabled',
                },
            )
        else:
            started_at = perf_counter()
            logger.info(
                {
                    'event': 'ai.llm_synthesis_started',
                    'request_id': state['request_id'],
                    'thread_id': state['thread_id'],
                    'ai_retrieval_mode': state.get('retrieval_mode'),
                },
            )

            try:
                synthesis = self._synthesizer.synthesize(
                    query=state['query'],
                    retrieval_mode=state.get('retrieval_mode'),
                    normalized_filters=state.get('normalized_filters', {}),
                    retrieved_products=retrieved_products,
                    comparison_summary=comparison_summary,
                )
                assistant_message = synthesis.assistant_message
                if synthesis.follow_up_prompts:
                    follow_up_prompts = synthesis.follow_up_prompts
                if state.get('comparison_requested') and synthesis.comparison_summary:
                    comparison_summary = synthesis.comparison_summary
            except Exception as exc:
                capture_sentry_exception(
                    exc,
                    tags={
                        'ai_component': 'llm_synthesis',
                        'request_id': state['request_id'],
                        'thread_id': state['thread_id'],
                        'ai_retrieval_mode': str(state.get('retrieval_mode')),
                    },
                )
                logger.warning(
                    {
                        'event': 'ai.llm_synthesis_fallback',
                        'request_id': state['request_id'],
                        'thread_id': state['thread_id'],
                        'ai_retrieval_mode': state.get('retrieval_mode'),
                        'latency_ms': int((perf_counter() - started_at) * 1000),
                        'fallback_reason': type(exc).__name__,
                    },
                )
            else:
                logger.info(
                    {
                        'event': 'ai.llm_synthesis_completed',
                        'request_id': state['request_id'],
                        'thread_id': state['thread_id'],
                        'ai_retrieval_mode': state.get('retrieval_mode'),
                        'latency_ms': int((perf_counter() - started_at) * 1000),
                    },
                )

        return {
            'terminal_status': 'success',
            'assistant_message': assistant_message,
            'follow_up_prompts': follow_up_prompts,
            'retrieved_products': retrieved_products,
            'recommended_product_ids': recommended_ids,
            'comparison_summary': comparison_summary,
        }


def _route_after_planning(state: AssistantGraphState) -> Literal['product_retrieval', 'final_response']:
    if state.get('skip_retrieval', False):
        return 'final_response'
    return 'product_retrieval'


def _route_after_validation(state: AssistantGraphState) -> Literal['retry_route', 'no_result', 'final_response']:
    if state.get('validation_error') is not None:
        if state.get('retry_count', 0) < _RETRY_LIMIT:
            return 'retry_route'
        return 'no_result'

    if len(state.get('recommended_product_ids', [])) == 0:
        return 'no_result'

    return 'final_response'


def _compile_graph(workflow: AssistantGraphWorkflow):
    graph = StateGraph(AssistantGraphState)

    graph.add_node('query_planning', workflow._query_planning_node)
    graph.add_node('product_retrieval', workflow._product_retrieval_node)
    graph.add_node('validate_tool_output', workflow._validate_tool_output_node)
    graph.add_node('retry_route', workflow._retry_route_node)
    graph.add_node('no_result', workflow._no_result_node)
    graph.add_node('final_response', workflow._final_response_node)

    graph.add_edge(START, 'query_planning')
    graph.add_conditional_edges('query_planning', _route_after_planning)
    graph.add_edge('product_retrieval', 'validate_tool_output')
    graph.add_conditional_edges('validate_tool_output', _route_after_validation)
    graph.add_edge('retry_route', 'product_retrieval')
    graph.add_edge('no_result', END)
    graph.add_edge('final_response', END)

    return graph.compile(checkpointer=MemorySaver())


def _build_thread_id(*, user_id: str, session_id: str) -> str:
    return f'{user_id}:{session_id}'


def _build_recommendation_from_state(state: AssistantGraphState) -> FinalRecommendation:
    products: list[ProductItem] = []
    for raw_product in state.get('retrieved_products', []):
        product_payload = raw_product.get('product') if isinstance(raw_product, dict) else None
        if isinstance(product_payload, dict):
            products.append(ProductItem.model_validate(product_payload))

    _validate_agent_state_snapshot(state=state, products=products)

    if state.get('terminal_status') in {'no_results', 'retry_exhausted'}:
        return FinalRecommendation(
            summary=state.get('assistant_message', 'No matching products were found.'),
            recommended_products=[],
            comparison_summary=None,
            follow_up_prompts=state.get('follow_up_prompts', []),
        )

    return FinalRecommendation(
        summary=state.get('assistant_message', 'Here are the best matching products I found.'),
        recommended_products=products,
        comparison_summary=state.get('comparison_summary'),
        follow_up_prompts=state.get('follow_up_prompts', []),
    )


def _validate_agent_state_snapshot(*, state: AssistantGraphState, products: list[ProductItem]) -> None:
    AgentState.model_validate(
        {
            'threadId': state.get('thread_id'),
            'sessionId': state.get('session_id'),
            'requestId': state.get('request_id'),
            'query': state.get('query'),
            'semanticQuery': state.get('semantic_query', state.get('query')),
            'retrievalMode': state.get('retrieval_mode'),
            'normalizedFilters': state.get('normalized_filters', {}),
            'userContext': {'userId': state.get('user_id')},
            'retrievedProducts': state.get('retrieved_products', []),
            'retryCount': state.get('retry_count', 0),
            'recommendedProductIds': [product.product_id for product in products],
            'assistantMessage': state.get('assistant_message'),
            'followUpPrompts': state.get('follow_up_prompts', []),
            'finalRecommendation': {
                'summary': state.get('assistant_message', ''),
                'recommendedProducts': [
                    product.model_dump(by_alias=True)
                    for product in products
                ],
                'comparisonSummary': state.get('comparison_summary'),
                'followUpPrompts': state.get('follow_up_prompts', []),
            },
        }
    )
