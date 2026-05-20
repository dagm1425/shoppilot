from __future__ import annotations

import logging
import re
from time import perf_counter
from typing import Any, Literal

from pydantic import ValidationError
from typing_extensions import TypedDict

from langgraph.graph import END, START, StateGraph

try:
    from langgraph.checkpoint.memory import MemorySaver
except ImportError:  # pragma: no cover - compatibility for pre-rename releases
    from langgraph.checkpoint.memory import InMemorySaver as MemorySaver

from app.llm.planner import AssistantQueryPlanner, QueryPlannerOutput
from app.llm.synthesizer import AssistantSynthesizer
from app.llm.pricing import estimate_request_cost_usd
from app.observability import capture_sentry_exception, traceable
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
from app.search.refinement import (
    apply_filter_refinement,
    build_merged_semantic_query,
    detect_filter_clears,
    detect_reset_requested,
    extract_semantic_constraints,
    merge_semantic_constraints,
)
from app.tools import AssistantTools

logger = logging.getLogger(__name__)

_RETRY_LIMIT = 1
_FALLBACK_SEMANTIC_NOISE_TOKENS = {
    'for',
    'show',
    'find',
    'recommend',
    'item',
    'items',
    'product',
    'products',
    'option',
    'options',
    'those',
    'these',
    'make',
    'them',
    'now',
    'in',
    'stock',
    'available',
    'under',
    'over',
    'below',
    'above',
    'price',
    'budget',
    'friendly',
    'premium',
    'rating',
    'rated',
    'least',
    'star',
    'stars',
    'dollar',
    'dollars',
    'tops',
    'top',
    'bottoms',
    'bottom',
    'men',
    'male',
    'women',
    'female',
    'unisex',
}


class AssistantGraphState(TypedDict, total=False):
    query: str
    request_id: str
    run_id: str
    session_id: str
    user_id: str
    thread_id: str
    transport: Literal['json', 'sse']
    semantic_query: str
    merged_semantic_query: str
    semantic_facets: dict[str, str]
    semantic_terms: list[str]
    retrieval_mode: Literal['structured', 'semantic', 'hybrid']
    normalized_filters: dict[str, Any]
    tool_output: dict[str, Any]
    retrieved_products: list[dict[str, Any]]
    recommended_product_ids: list[str]
    prior_recommended_product_ids: list[str]
    comparison_requested: bool
    skip_retrieval: bool
    reset_requested: bool
    comparison_summary: str | None
    retry_count: int
    validation_error: str | None
    assistant_message: str
    follow_up_prompts: list[str]
    llm_provider: str | None
    llm_model: str | None
    token_usage_prompt: int | None
    token_usage_completion: int | None
    token_usage_total: int | None
    cost_estimate_usd: float | None
    fallback_reason: str | None
    budget_top_k: int
    budget_top_n_products: int
    budget_max_output_tokens: int
    terminal_status: Literal['success', 'no_results', 'retry_exhausted']


class AssistantRunTelemetry(TypedDict):
    request_id: str
    run_id: str
    thread_id: str
    transport: Literal['json', 'sse']
    retrieval_mode: Literal['structured', 'semantic', 'hybrid'] | None
    llm_provider: str | None
    llm_model: str | None
    token_usage_prompt: int | None
    token_usage_completion: int | None
    token_usage_total: int | None
    cost_estimate_usd: float | None
    fallback_reason: str | None
    budget_top_k: int
    budget_top_n_products: int
    budget_max_output_tokens: int


class AssistantGraphWorkflow:
    def __init__(
        self,
        *,
        tools: AssistantTools,
        synthesizer: AssistantSynthesizer,
        query_planner: AssistantQueryPlanner | None = None,
        model_name: str,
        search_top_k: int = 5,
    ) -> None:
        self._tools = tools
        self._synthesizer = synthesizer
        self._query_planner = query_planner
        self._model_name = model_name
        self._search_top_k = _clamp_int(search_top_k, min_value=1, max_value=20)
        self._graph = _compile_graph(self)

    def run(self, payload: ChatRequest) -> ChatResponse:
        response, _telemetry = self.run_with_telemetry(payload)
        return response

    def run_with_telemetry(
        self,
        payload: ChatRequest,
        *,
        run_id: str | None = None,
        transport: Literal['json', 'sse'] = 'json',
    ) -> tuple[ChatResponse, AssistantRunTelemetry]:
        return self._execute(payload, run_id=run_id, transport=transport)

    def _execute(
        self,
        payload: ChatRequest,
        *,
        run_id: str | None,
        transport: Literal['json', 'sse'],
    ) -> tuple[ChatResponse, AssistantRunTelemetry]:
        thread_id = _build_thread_id(
            user_id=payload.user_context.user_id,
            session_id=payload.session_id,
        )
        resolved_run_id = run_id.strip() if isinstance(run_id, str) and run_id.strip() else f'run-{payload.request_id}'
        resolved_budget_top_n = _clamp_int(self._synthesizer.top_n_products, min_value=1, max_value=5)
        resolved_budget_max_tokens = _clamp_int(self._synthesizer.max_tokens, min_value=64, max_value=800)

        initial_state: AssistantGraphState = {
            'query': payload.message,
            'request_id': payload.request_id,
            'run_id': resolved_run_id,
            'session_id': payload.session_id,
            'user_id': payload.user_context.user_id,
            'thread_id': thread_id,
            'transport': transport,
            'retry_count': 0,
            'validation_error': None,
            'llm_provider': self._synthesizer.provider,
            'llm_model': self._synthesizer.model_name,
            'fallback_reason': None,
            'token_usage_prompt': None,
            'token_usage_completion': None,
            'token_usage_total': None,
            'cost_estimate_usd': None,
            'budget_top_k': self._search_top_k,
            'budget_top_n_products': resolved_budget_top_n,
            'budget_max_output_tokens': resolved_budget_max_tokens,
        }

        logger.info(
            {
                'event': 'ai.graph.run_started',
                'request_id': payload.request_id,
                'run_id': resolved_run_id,
                'thread_id': thread_id,
                'transport': transport,
                'budget_top_k': self._search_top_k,
                'budget_top_n_products': resolved_budget_top_n,
                'budget_max_output_tokens': resolved_budget_max_tokens,
            },
        )

        config = {
            'configurable': {
                'thread_id': thread_id,
            },
            'run_name': 'assistant_graph',
            'tags': ['ai_assistant', f'transport:{transport}'],
            'metadata': {
                'request_id': payload.request_id,
                'run_id': resolved_run_id,
                'thread_id': thread_id,
                'transport': transport,
            },
        }

        try:
            state = self._graph.invoke(initial_state, config=config)
        except Exception as exc:
            planner_metrics = getattr(self._query_planner, 'last_run_metrics', {})
            if not isinstance(planner_metrics, dict):
                planner_metrics = {}
            capture_sentry_exception(
                exc,
                tags={
                    'ai_assistant_request': 'true',
                    'request_id': payload.request_id,
                    'run_id': resolved_run_id,
                    'thread_id': thread_id,
                },
            )
            raise

        recommendation = _build_recommendation_from_state(state)
        recommended_ids = [product.product_id for product in recommendation.recommended_products]

        response = ChatResponse(
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

        telemetry: AssistantRunTelemetry = {
            'request_id': payload.request_id,
            'run_id': state.get('run_id', resolved_run_id),
            'thread_id': state.get('thread_id', thread_id),
            'transport': state.get('transport', transport),
            'retrieval_mode': state.get('retrieval_mode'),
            'llm_provider': state.get('llm_provider', self._synthesizer.provider),
            'llm_model': state.get('llm_model', self._synthesizer.model_name),
            'token_usage_prompt': state.get('token_usage_prompt'),
            'token_usage_completion': state.get('token_usage_completion'),
            'token_usage_total': state.get('token_usage_total'),
            'cost_estimate_usd': state.get('cost_estimate_usd'),
            'fallback_reason': state.get('fallback_reason'),
            'budget_top_k': state.get('budget_top_k', self._search_top_k),
            'budget_top_n_products': state.get('budget_top_n_products', resolved_budget_top_n),
            'budget_max_output_tokens': state.get('budget_max_output_tokens', resolved_budget_max_tokens),
        }

        return response, telemetry

    @traceable(run_type='chain', name='ai.graph.query_planning_node')
    def _query_planning_node(self, state: AssistantGraphState) -> AssistantGraphState:
        _log_node_entered(state, node='query_planning')
        lowered_query = state['query'].lower()
        prior_recommended_ids = list(state.get('recommended_product_ids', []))
        has_memory_context = (
            'normalized_filters' in state
            or 'semantic_facets' in state
            or 'semantic_terms' in state
            or len(prior_recommended_ids) > 0
        )

        prior_filters: dict[str, Any] = {}
        if has_memory_context:
            prior_filters = {
                'category': state.get('normalized_filters', {}).get('category'),
                'gender': state.get('normalized_filters', {}).get('gender'),
                'thermalProfile': state.get('normalized_filters', {}).get('thermalProfile'),
                'priceMinCents': state.get('normalized_filters', {}).get('priceMinCents'),
                'priceMaxCents': state.get('normalized_filters', {}).get('priceMaxCents'),
                'availability': state.get('normalized_filters', {}).get('availability'),
                'minRating': state.get('normalized_filters', {}).get('minRating'),
            }

        planner_state = self._plan_query_with_llm(
            state=state,
            lowered_query=lowered_query,
            has_memory_context=has_memory_context,
            prior_filters=prior_filters,
            prior_recommended_ids=prior_recommended_ids,
        )
        if planner_state is not None:
            return planner_state

        intent = parse_intent(state['query'])
        reset_requested = detect_reset_requested(state['query'])
        clear_fields = detect_filter_clears(state['query'])

        current_facets, current_terms = extract_semantic_constraints(state['query'])
        semantic_merge = merge_semantic_constraints(
            prior_facets=state.get('semantic_facets', {}),
            prior_terms=state.get('semantic_terms', []),
            current_facets=current_facets,
            current_terms=current_terms,
            reset_requested=reset_requested,
        )

        explicit_filters = {
            'category': intent.filters.category,
            'gender': intent.filters.gender,
            'thermalProfile': intent.filters.thermal_profile,
            'priceMinCents': intent.filters.price_min_cents,
            'priceMaxCents': intent.filters.price_max_cents,
            'availability': intent.filters.availability,
            'minRating': intent.filters.min_rating,
        }
        filter_merge = apply_filter_refinement(
            prior_filters=prior_filters,
            explicit_filters=explicit_filters,
            clear_fields=clear_fields,
            facets=current_facets,
            has_memory=has_memory_context and not reset_requested,
        )
        merged_semantic_query = build_merged_semantic_query(
            facets=semantic_merge.facets,
            terms=semantic_merge.terms,
            fallback_query=intent.semantic_query,
        )
        merged_semantic_query = _sanitize_fallback_semantic_query(
            semantic_query=merged_semantic_query,
            normalized_filters=filter_merge.filters,
        )

        comparison_requested = any(
            token in lowered_query
            for token in ('compare', 'comparison', 'versus', 'vs ')
        )
        refinement_delta = (
            reset_requested
            or len(filter_merge.changed_filter_keys) > 0
            or len(semantic_merge.changed_facet_groups) > 0
            or semantic_merge.terms_changed
            or len(clear_fields) > 0
        )
        skip_retrieval = (
            comparison_requested
            and len(prior_recommended_ids) >= 2
            and not refinement_delta
        )

        normalized_filters = filter_merge.filters
        retrieval_mode = _derive_retrieval_mode(
            normalized_filters=normalized_filters,
            semantic_query=merged_semantic_query,
        )

        if reset_requested:
            logger.info(
                {
                    'event': 'ai.graph.refinement_reset',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                },
            )

        logger.info(
            {
                'event': 'ai.graph.refinement_applied',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'changed_filter_keys': sorted(filter_merge.changed_filter_keys),
                'changed_facet_groups': sorted(semantic_merge.changed_facet_groups),
                'implicit_filter_keys': sorted(filter_merge.implicit_filter_keys),
                'compare_only': skip_retrieval,
                'ai_retrieval_mode': retrieval_mode,
            },
        )

        logger.info(
            {
                'event': 'ai.graph.query_planned',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'ai_retrieval_mode': retrieval_mode,
                'comparison_requested': comparison_requested,
                'skip_retrieval': skip_retrieval,
            },
        )

        if reset_requested:
            prior_recommended_ids = []

        return {
            'semantic_query': merged_semantic_query,
            'merged_semantic_query': merged_semantic_query,
            'semantic_facets': semantic_merge.facets,
            'semantic_terms': semantic_merge.terms,
            'retrieval_mode': retrieval_mode,
            'normalized_filters': normalized_filters,
            'comparison_requested': comparison_requested,
            'prior_recommended_product_ids': prior_recommended_ids,
            'skip_retrieval': skip_retrieval,
            'reset_requested': reset_requested,
            'validation_error': None,
        }

    def _plan_query_with_llm(
        self,
        *,
        state: AssistantGraphState,
        lowered_query: str,
        has_memory_context: bool,
        prior_filters: dict[str, Any],
        prior_recommended_ids: list[str],
    ) -> AssistantGraphState | None:
        if self._query_planner is None or not self._query_planner.enabled:
            return None

        prior_semantic_query = (
            str(state.get('merged_semantic_query') or state.get('semantic_query') or '')
            .strip()
        )
        prior_comparison_requested = bool(state.get('comparison_requested', False))
        prior_reset_requested = bool(state.get('reset_requested', False))
        has_prior_recommendations = len(prior_recommended_ids) > 0

        logger.info(
            {
                'event': 'ai.query_planner_started',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'retrieval_mode': state.get('retrieval_mode'),
                'planner_enabled': True,
                'updater_attempted': has_memory_context,
            },
        )

        planner_metrics = getattr(self._query_planner, 'last_run_metrics', {})
        if not isinstance(planner_metrics, dict):
            planner_metrics = {}

        try:
            planner_result = self._query_planner.plan(
                query=state['query'],
                prior_filters=prior_filters,
                prior_semantic_query=prior_semantic_query,
                prior_comparison_requested=prior_comparison_requested,
                prior_reset_requested=prior_reset_requested,
                has_prior_recommendations=has_prior_recommendations,
            )
            planned_state = self._build_state_from_planner_result(
                state=state,
                planner_result=planner_result,
                lowered_query=lowered_query,
                has_memory_context=has_memory_context,
                prior_filters=prior_filters,
                prior_recommended_ids=prior_recommended_ids,
                prior_semantic_query=prior_semantic_query,
            )
        except Exception as exc:
            capture_sentry_exception(
                exc,
                tags={
                    'ai_component': 'query_planner',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                },
            )
            logger.warning(
                {
                    'event': 'ai.query_planner_fallback',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'fallback_reason': type(exc).__name__,
                    'retrieval_mode': state.get('retrieval_mode'),
                    'planner_enabled': True,
                    'updater_attempted': planner_metrics.get('updater_attempted', False),
                    'updater_pass': planner_metrics.get('updater_pass', False),
                    'planner_pass': planner_metrics.get('planner_pass', False),
                },
            )
            return None

        planner_metrics = getattr(self._query_planner, 'last_run_metrics', {})
        if not isinstance(planner_metrics, dict):
            planner_metrics = {}

        logger.info(
            {
                'event': 'ai.query_planner_succeeded',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'retrieval_mode': planned_state['retrieval_mode'],
                'planner_enabled': True,
                'updater_attempted': planner_metrics.get('updater_attempted', False),
                'updater_pass': planner_metrics.get('updater_pass', False),
                'planner_pass': planner_metrics.get('planner_pass', False),
            },
        )
        return planned_state

    def _build_state_from_planner_result(
        self,
        *,
        state: AssistantGraphState,
        planner_result: QueryPlannerOutput,
        lowered_query: str,
        has_memory_context: bool,
        prior_filters: dict[str, Any],
        prior_recommended_ids: list[str],
        prior_semantic_query: str,
    ) -> AssistantGraphState:
        merged_filters: dict[str, Any] = {
            'category': planner_result.filters.category,
            'gender': planner_result.filters.gender,
            'thermalProfile': planner_result.filters.thermal_profile,
            'priceMinCents': planner_result.filters.price_min_cents,
            'priceMaxCents': planner_result.filters.price_max_cents,
            'availability': planner_result.filters.availability,
            'minRating': planner_result.filters.min_rating,
        }
        for clear_field in planner_result.clear_fields:
            merged_filters[clear_field] = None

        # Deterministic availability safety:
        # if planner returns null availability while prior availability exists and the
        # current turn did not explicitly clear/change availability, carry prior value.
        availability_directive = _detect_availability_directive(lowered_query)
        if availability_directive == 'set_true':
            merged_filters['availability'] = True
        elif availability_directive == 'set_false':
            merged_filters['availability'] = False
        elif availability_directive == 'clear':
            merged_filters['availability'] = None
        elif (
            not planner_result.reset_requested
            and 'availability' not in planner_result.clear_fields
            and merged_filters.get('availability') is None
            and prior_filters.get('availability') is not None
        ):
            merged_filters['availability'] = bool(prior_filters.get('availability'))

        semantic_query = planner_result.semantic_query.strip()
        if planner_result.retrieval_mode == 'semantic' and semantic_query == '':
            raise ValueError('Planner returned semantic mode with empty semantic query.')

        current_facets, current_terms = extract_semantic_constraints(semantic_query)
        comparison_requested = planner_result.comparison_requested or any(
            token in lowered_query
            for token in ('compare', 'comparison', 'versus', 'vs ')
        )

        changed_filter_keys = {
            key
            for key in (
                'category',
                'gender',
                'thermalProfile',
                'priceMinCents',
                'priceMaxCents',
                'availability',
                'minRating',
            )
            if merged_filters.get(key) != prior_filters.get(key)
        }
        semantic_changed = semantic_query != prior_semantic_query
        retrieval_mode_changed = planner_result.retrieval_mode != state.get('retrieval_mode')
        comparison_changed = comparison_requested != bool(state.get('comparison_requested', False))

        refinement_delta = (
            planner_result.reset_requested
            or len(changed_filter_keys) > 0
            or len(planner_result.clear_fields) > 0
            or semantic_changed
            or retrieval_mode_changed
            or comparison_changed
        )
        skip_retrieval = (
            comparison_requested
            and len(prior_recommended_ids) >= 2
            and not refinement_delta
        )

        if planner_result.reset_requested:
            logger.info(
                {
                    'event': 'ai.graph.refinement_reset',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                },
            )

        logger.info(
            {
                'event': 'ai.graph.refinement_applied',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'changed_filter_keys': sorted(changed_filter_keys),
                'changed_facet_groups': [],
                'implicit_filter_keys': [],
                'semantic_changed': semantic_changed,
                'compare_only': skip_retrieval,
                'ai_retrieval_mode': planner_result.retrieval_mode,
            },
        )

        logger.info(
            {
                'event': 'ai.graph.query_planned',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'ai_retrieval_mode': planner_result.retrieval_mode,
                'comparison_requested': comparison_requested,
                'skip_retrieval': skip_retrieval,
            },
        )

        effective_prior_recommended_ids = (
            []
            if planner_result.reset_requested
            else prior_recommended_ids
        )

        return {
            'semantic_query': semantic_query,
            'merged_semantic_query': semantic_query,
            'semantic_facets': current_facets,
            'semantic_terms': current_terms,
            'retrieval_mode': planner_result.retrieval_mode,
            'normalized_filters': merged_filters,
            'comparison_requested': comparison_requested,
            'prior_recommended_product_ids': effective_prior_recommended_ids,
            'skip_retrieval': skip_retrieval,
            'reset_requested': planner_result.reset_requested and has_memory_context,
            'validation_error': None,
        }

    @traceable(run_type='tool', name='ai.tool.search_items')
    def _product_retrieval_node(self, state: AssistantGraphState) -> AssistantGraphState:
        _log_node_entered(state, node='product_retrieval')
        retrieval_query = (
            state.get('merged_semantic_query')
            or state.get('semantic_query')
            or state['query']
        )
        requested_top_k = state.get('budget_top_k', self._search_top_k)
        clamped_top_k = _clamp_int(requested_top_k, min_value=1, max_value=20)

        logger.info(
            {
                'event': 'ai.tool.search_items_started',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'input_shape': {
                    'retrieval_mode': state.get('retrieval_mode'),
                    'top_k': clamped_top_k,
                    'has_category': state.get('normalized_filters', {}).get('category') is not None,
                    'has_gender': state.get('normalized_filters', {}).get('gender') is not None,
                    'has_thermal_profile': state.get('normalized_filters', {}).get('thermalProfile') is not None,
                    'has_price_min': state.get('normalized_filters', {}).get('priceMinCents') is not None,
                    'has_price_max': state.get('normalized_filters', {}).get('priceMaxCents') is not None,
                    'has_availability': state.get('normalized_filters', {}).get('availability') is not None,
                    'has_min_rating': state.get('normalized_filters', {}).get('minRating') is not None,
                    'query_length': len(retrieval_query.strip()),
                },
                'budget_top_k': state.get('budget_top_k', self._search_top_k),
                'budget_top_k_clamped': clamped_top_k,
            },
        )

        try:
            tool_input = SearchItemsToolInput.model_validate(
                {
                    'query': retrieval_query,
                    'retrievalMode': state['retrieval_mode'],
                    'topK': clamped_top_k,
                    'category': state.get('normalized_filters', {}).get('category'),
                    'gender': state.get('normalized_filters', {}).get('gender'),
                    'thermalProfile': state.get('normalized_filters', {}).get('thermalProfile'),
                    'priceMinCents': state.get('normalized_filters', {}).get('priceMinCents'),
                    'priceMaxCents': state.get('normalized_filters', {}).get('priceMaxCents'),
                    'availability': state.get('normalized_filters', {}).get('availability'),
                    'minRating': state.get('normalized_filters', {}).get('minRating'),
                }
            )
            tool_output = self._tools.search_items(tool_input)
        except ValidationError as exc:
            logger.warning(
                {
                    'event': 'ai.tool.search_items_failed',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'failure_reason': 'input_validation',
                },
            )
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
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                },
            )
            logger.warning(
                {
                    'event': 'ai.tool.search_items_failed',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'failure_reason': type(exc).__name__,
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
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'ai_retrieval_mode': tool_output.retrieval_mode,
                'result_count': len(tool_output.items),
                'retry_count': state.get('retry_count', 0),
            },
        )

        logger.info(
            {
                'event': 'ai.tool.search_items_completed',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'output_shape': {
                    'result_count': len(tool_output.items),
                    'total_matches': tool_output.total_matches,
                    'retrieval_mode': tool_output.retrieval_mode,
                },
            },
        )

        return {
            'tool_output': tool_output.model_dump(by_alias=True),
            'retrieval_mode': tool_output.retrieval_mode,
            'semantic_query': tool_output.semantic_query,
            'merged_semantic_query': state.get('merged_semantic_query', tool_output.semantic_query),
            'normalized_filters': tool_output.normalized_filters.model_dump(by_alias=True),
            'validation_error': None,
        }

    @traceable(run_type='chain', name='ai.graph.validate_tool_output_node')
    def _validate_tool_output_node(self, state: AssistantGraphState) -> AssistantGraphState:
        _log_node_entered(state, node='validate_tool_output')
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
            logger.warning(
                {
                    'event': 'ai.tool.search_items_failed',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'failure_reason': 'output_validation',
                },
            )
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

    @traceable(run_type='chain', name='ai.graph.retry_route_node')
    def _retry_route_node(self, state: AssistantGraphState) -> AssistantGraphState:
        _log_node_entered(state, node='retry_route')
        next_retry_count = state.get('retry_count', 0) + 1

        logger.warning(
            {
                'event': 'ai.graph.retry_route',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'retry_count': next_retry_count,
                'validation_error': state.get('validation_error'),
            },
        )

        return {
            'retry_count': next_retry_count,
            'validation_error': None,
        }

    @traceable(run_type='chain', name='ai.graph.no_result_node')
    def _no_result_node(self, state: AssistantGraphState) -> AssistantGraphState:
        _log_node_entered(state, node='no_result')
        status = 'retry_exhausted' if state.get('validation_error') else 'no_results'

        logger.info(
            {
                'event': 'ai.graph.no_result',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'terminal_status': status,
            },
        )

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

    @traceable(run_type='chain', name='ai.graph.final_response_node')
    def _final_response_node(self, state: AssistantGraphState) -> AssistantGraphState:
        _log_node_entered(state, node='final_response')
        retrieved_products = list(state.get('retrieved_products', []))
        recommended_ids = list(state.get('recommended_product_ids', []))

        if len(retrieved_products) == 0 and recommended_ids:
            hydrated_products: list[dict[str, Any]] = []
            for index, product_id in enumerate(recommended_ids[:4]):
                logger.info(
                    {
                        'event': 'ai.tool.get_item_details_started',
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'input_shape': {'product_id_length': len(product_id)},
                    },
                )
                try:
                    details = self._tools.get_item_details(
                        GetItemDetailsToolInput(product_id=product_id)
                    )
                except Exception as exc:
                    logger.warning(
                        {
                            'event': 'ai.tool.get_item_details_failed',
                            'request_id': state['request_id'],
                            'run_id': state['run_id'],
                            'thread_id': state['thread_id'],
                            'failure_reason': type(exc).__name__,
                        },
                    )
                    continue

                logger.info(
                    {
                        'event': 'ai.tool.get_item_details_completed',
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'output_shape': {'item_found': details.item is not None},
                    },
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
            logger.info(
                {
                    'event': 'ai.tool.compare_items_started',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'input_shape': {'product_count': min(4, len(recommended_ids))},
                },
            )
            try:
                compare_output = self._tools.compare_items(
                    CompareItemsToolInput(
                        product_ids=recommended_ids[:4],
                    )
                )
                comparison_summary = compare_output.summary
                logger.info(
                    {
                        'event': 'ai.tool.compare_items_completed',
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'output_shape': {'summary_length': len(compare_output.summary.strip())},
                    },
                )
            except Exception as exc:
                logger.warning(
                    {
                        'event': 'ai.tool.compare_items_failed',
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'failure_reason': type(exc).__name__,
                    },
                )

        assistant_message = (
            f"I found {len(retrieved_products)} matching products using "
            f"{state.get('retrieval_mode', 'semantic')} retrieval. "
            'These options are ranked from your current request.'
        )
        follow_up_prompts = [
            'Want options in a different price range?',
            'Should I focus on in-stock items only?',
        ]

        llm_provider = self._synthesizer.provider
        llm_model = self._synthesizer.model_name
        token_usage_prompt: int | None = None
        token_usage_completion: int | None = None
        token_usage_total: int | None = None
        cost_estimate_usd: float | None = None
        fallback_reason: str | None = None

        if not self._synthesizer.enabled:
            fallback_reason = 'disabled'
            logger.info(
                {
                    'event': 'ai.llm_synthesis_fallback',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'ai_retrieval_mode': state.get('retrieval_mode'),
                    'llm_provider': llm_provider,
                    'llm_model': llm_model,
                    'latency_ms': 0,
                    'fallback_reason': fallback_reason,
                },
            )
        else:
            started_at = perf_counter()
            logger.info(
                {
                    'event': 'ai.llm_synthesis_started',
                    'request_id': state['request_id'],
                    'run_id': state['run_id'],
                    'thread_id': state['thread_id'],
                    'ai_retrieval_mode': state.get('retrieval_mode'),
                    'llm_provider': llm_provider,
                    'llm_model': llm_model,
                    'budget_top_n_products': state.get('budget_top_n_products'),
                    'budget_max_output_tokens': state.get('budget_max_output_tokens'),
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
                token_usage_prompt = synthesis.prompt_tokens
                token_usage_completion = synthesis.completion_tokens
                token_usage_total = synthesis.total_tokens
                cost_estimate_usd = estimate_request_cost_usd(
                    provider=llm_provider,
                    model=llm_model,
                    prompt_tokens=token_usage_prompt,
                    completion_tokens=token_usage_completion,
                    total_tokens=token_usage_total,
                )
                if synthesis.follow_up_prompts:
                    follow_up_prompts = synthesis.follow_up_prompts
                if state.get('comparison_requested') and synthesis.comparison_summary:
                    comparison_summary = synthesis.comparison_summary
            except Exception as exc:
                fallback_reason = type(exc).__name__
                capture_sentry_exception(
                    exc,
                    tags={
                        'ai_component': 'llm_synthesis',
                        'llm_provider': llm_provider,
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'ai_retrieval_mode': str(state.get('retrieval_mode')),
                    },
                )
                logger.warning(
                    {
                        'event': 'ai.llm_synthesis_fallback',
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'ai_retrieval_mode': state.get('retrieval_mode'),
                        'llm_provider': llm_provider,
                        'llm_model': llm_model,
                        'latency_ms': int((perf_counter() - started_at) * 1000),
                        'fallback_reason': fallback_reason,
                    },
                )
            else:
                logger.info(
                    {
                        'event': 'ai.llm_synthesis_completed',
                        'request_id': state['request_id'],
                        'run_id': state['run_id'],
                        'thread_id': state['thread_id'],
                        'ai_retrieval_mode': state.get('retrieval_mode'),
                        'llm_provider': llm_provider,
                        'llm_model': llm_model,
                        'latency_ms': int((perf_counter() - started_at) * 1000),
                        'token_usage_prompt': token_usage_prompt,
                        'token_usage_completion': token_usage_completion,
                        'token_usage_total': token_usage_total,
                        'cost_estimate_usd': cost_estimate_usd,
                    },
                )

        logger.info(
            {
                'event': 'ai.graph.final_response_ready',
                'request_id': state['request_id'],
                'run_id': state['run_id'],
                'thread_id': state['thread_id'],
                'result_count': len(recommended_ids),
                'fallback_reason': fallback_reason,
            },
        )

        return {
            'terminal_status': 'success',
            'assistant_message': assistant_message,
            'follow_up_prompts': follow_up_prompts,
            'retrieved_products': retrieved_products,
            'recommended_product_ids': recommended_ids,
            'comparison_summary': comparison_summary,
            'llm_provider': llm_provider,
            'llm_model': llm_model,
            'token_usage_prompt': token_usage_prompt,
            'token_usage_completion': token_usage_completion,
            'token_usage_total': token_usage_total,
            'cost_estimate_usd': cost_estimate_usd,
            'fallback_reason': fallback_reason,
        }


def _route_after_planning(state: AssistantGraphState) -> Literal['product_retrieval', 'final_response']:
    selected = 'final_response' if state.get('skip_retrieval', False) else 'product_retrieval'
    _log_route_decision(state, route_name='after_planning', selected=selected)
    return selected


def _derive_retrieval_mode(
    *,
    normalized_filters: dict[str, Any],
    semantic_query: str,
) -> Literal['structured', 'semantic', 'hybrid']:
    has_filters = any(
        normalized_filters.get(key) is not None
        for key in ('category', 'gender', 'thermalProfile', 'priceMinCents', 'priceMaxCents', 'availability', 'minRating')
    )
    has_semantic_query = semantic_query.strip() != ''
    if has_filters and has_semantic_query:
        return 'hybrid'
    if has_filters:
        return 'structured'
    return 'semantic'


def _sanitize_fallback_semantic_query(
    *,
    semantic_query: str,
    normalized_filters: dict[str, Any],
) -> str:
    query = semantic_query.strip()
    if query == '':
        return ''

    has_filters = any(
        normalized_filters.get(key) is not None
        for key in (
            'category',
            'gender',
            'thermalProfile',
            'priceMinCents',
            'priceMaxCents',
            'availability',
            'minRating',
        )
    )
    if not has_filters:
        return query

    tokens = [
        token
        for token in re.findall(r"[a-z]+(?:-[a-z]+)?", query.lower())
        if len(token) >= 2
    ]
    meaningful = [token for token in tokens if token not in _FALLBACK_SEMANTIC_NOISE_TOKENS]
    if len(meaningful) == 0:
        return ''

    return query


def _detect_availability_directive(lowered_query: str) -> str:
    if any(
        phrase in lowered_query
        for phrase in (
            'any availability',
            'ignore stock',
            'ignore availability',
            'any stock',
            'either in stock or out of stock',
        )
    ):
        return 'clear'

    if 'out of stock' in lowered_query or 'unavailable' in lowered_query:
        return 'set_false'

    if 'in stock' in lowered_query or 'available now' in lowered_query:
        return 'set_true'

    if ' available ' in f' {lowered_query} ':
        return 'set_true'

    return 'none'


def _route_after_validation(state: AssistantGraphState) -> Literal['retry_route', 'no_result', 'final_response']:
    selected: Literal['retry_route', 'no_result', 'final_response']
    if state.get('validation_error') is not None:
        if state.get('retry_count', 0) < _RETRY_LIMIT:
            selected = 'retry_route'
        else:
            selected = 'no_result'
    elif len(state.get('recommended_product_ids', [])) == 0:
        selected = 'no_result'
    else:
        selected = 'final_response'

    _log_route_decision(state, route_name='after_validation', selected=selected)
    return selected


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


def _clamp_int(value: int, *, min_value: int, max_value: int) -> int:
    return max(min_value, min(max_value, value))


def _log_node_entered(state: AssistantGraphState, *, node: str) -> None:
    logger.info(
        {
            'event': 'ai.graph.node_entered',
            'node': node,
            'request_id': state.get('request_id'),
            'run_id': state.get('run_id'),
            'thread_id': state.get('thread_id'),
            'retry_count': state.get('retry_count', 0),
        },
    )


def _log_route_decision(
    state: AssistantGraphState,
    *,
    route_name: str,
    selected: str,
) -> None:
    logger.info(
        {
            'event': 'ai.graph.route_selected',
            'route_name': route_name,
            'selected': selected,
            'request_id': state.get('request_id'),
            'run_id': state.get('run_id'),
            'thread_id': state.get('thread_id'),
            'retry_count': state.get('retry_count', 0),
            'validation_error_present': state.get('validation_error') is not None,
        },
    )


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
