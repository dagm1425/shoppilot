from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib import error, request

logger = logging.getLogger(__name__)


@dataclass
class EvalStepResult:
    status_code: int
    headers: dict[str, str]
    payload: dict[str, Any] | None
    sse_events: list[dict[str, Any]]


@dataclass
class EvalCaseOutcome:
    case_id: str
    status: Literal['pass', 'fail', 'skip']
    reasons: list[str]


def run_eval_dataset(
    *,
    dataset_path: Path,
    base_url: str,
    timeout_seconds: float,
) -> int:
    dataset = _load_dataset(dataset_path)
    cases = dataset.get('cases', [])

    if not isinstance(cases, list) or len(cases) == 0:
        raise ValueError('Eval dataset must contain a non-empty "cases" array.')

    outcomes: list[EvalCaseOutcome] = []

    for case in cases:
        outcome = _run_case(
            case=case,
            base_url=base_url,
            timeout_seconds=timeout_seconds,
        )
        outcomes.append(outcome)

        logger.info(
            {
                'event': 'ai.eval.case_result',
                'case_id': outcome.case_id,
                'status': outcome.status,
                'reasons': outcome.reasons,
            },
        )

    passed = sum(1 for outcome in outcomes if outcome.status == 'pass')
    failed = sum(1 for outcome in outcomes if outcome.status == 'fail')
    skipped = sum(1 for outcome in outcomes if outcome.status == 'skip')

    logger.info(
        {
            'event': 'ai.eval.summary',
            'dataset_path': str(dataset_path),
            'base_url': base_url,
            'total_cases': len(outcomes),
            'passed': passed,
            'failed': failed,
            'skipped': skipped,
        },
    )

    return 0 if failed == 0 else 1


def _run_case(
    *,
    case: dict[str, Any],
    base_url: str,
    timeout_seconds: float,
) -> EvalCaseOutcome:
    case_id = str(case.get('id', 'unknown-case'))

    if case.get('manualOnly') is True:
        return EvalCaseOutcome(
            case_id=case_id,
            status='skip',
            reasons=[str(case.get('manualReason', 'manual_only_case'))],
        )

    steps = case.get('steps')
    expectations = case.get('expectations', {})
    if not isinstance(steps, list) or len(steps) == 0:
        return EvalCaseOutcome(case_id=case_id, status='fail', reasons=['missing_steps'])

    last_result: EvalStepResult | None = None
    reasons: list[str] = []

    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            return EvalCaseOutcome(case_id=case_id, status='fail', reasons=[f'invalid_step_{index}'])

        try:
            last_result = _execute_step(
                case_id=case_id,
                step_index=index,
                step=step,
                base_url=base_url,
                timeout_seconds=timeout_seconds,
            )
        except Exception as exc:  # pragma: no cover - exercised in runtime failures
            return EvalCaseOutcome(case_id=case_id, status='fail', reasons=[f'step_{index}_error:{type(exc).__name__}'])

    if last_result is None:
        return EvalCaseOutcome(case_id=case_id, status='fail', reasons=['missing_step_result'])

    reasons.extend(_evaluate_expectations(expectations=expectations, result=last_result))
    status: Literal['pass', 'fail'] = 'pass' if len(reasons) == 0 else 'fail'
    return EvalCaseOutcome(case_id=case_id, status=status, reasons=reasons)


def _execute_step(
    *,
    case_id: str,
    step_index: int,
    step: dict[str, Any],
    base_url: str,
    timeout_seconds: float,
) -> EvalStepResult:
    transport = str(step.get('transport', 'json')).lower()
    message = str(step.get('message', '')).strip()
    session_id = str(step.get('sessionId', f'{case_id}-session')).strip()
    user_id = str(step.get('userId', 'eval-user')).strip()
    request_id = str(step.get('requestId', f'{case_id}-step-{step_index + 1}')).strip()

    payload = {
        'message': message,
        'sessionId': session_id,
        'userContext': {'userId': user_id},
        'requestId': request_id,
    }

    endpoint = '/ai/chat/stream' if transport == 'sse' else '/ai/chat'
    response = _post_json(
        url=f'{base_url.rstrip("/")}{endpoint}',
        body=payload,
        headers={'x-request-id': request_id},
        timeout_seconds=timeout_seconds,
    )

    if transport != 'sse':
        payload_json = _try_parse_json(response['body'])
        return EvalStepResult(
            status_code=response['status'],
            headers=response['headers'],
            payload=payload_json,
            sse_events=[],
        )

    events = _parse_sse_events(response['body'])
    snapshot_payload = _extract_snapshot_payload(events)
    return EvalStepResult(
        status_code=response['status'],
        headers=response['headers'],
        payload=snapshot_payload,
        sse_events=events,
    )


def _evaluate_expectations(*, expectations: dict[str, Any], result: EvalStepResult) -> list[str]:
    reasons: list[str] = []

    expected_status = expectations.get('httpStatus')
    if isinstance(expected_status, int) and result.status_code != expected_status:
        reasons.append(f'expected_status_{expected_status}_got_{result.status_code}')

    expect_run_id = expectations.get('expectRunId') is True
    if expect_run_id and 'x-run-id' not in result.headers:
        reasons.append('missing_run_id_header')

    expect_thread_id = expectations.get('expectThreadId') is True
    if expect_thread_id and 'x-thread-id' not in result.headers:
        reasons.append('missing_thread_id_header')

    expected_error_code = expectations.get('errorCode')
    if isinstance(expected_error_code, str):
        actual_error_code = _read_nested(result.payload, ['error', 'code'])
        if actual_error_code != expected_error_code:
            reasons.append(f'expected_error_code_{expected_error_code}_got_{actual_error_code}')

    if result.payload is None:
        return reasons

    expected_retrieval_mode = expectations.get('retrievalMode')
    if isinstance(expected_retrieval_mode, str):
        actual_mode = _read_nested(result.payload, ['retrievalMode'])
        if actual_mode != expected_retrieval_mode:
            reasons.append(f'expected_retrieval_mode_{expected_retrieval_mode}_got_{actual_mode}')

    min_recommended = expectations.get('minRecommendedProductIds')
    if isinstance(min_recommended, int):
        recommended_ids = _read_nested(result.payload, ['recommendedProductIds'])
        if not isinstance(recommended_ids, list) or len(recommended_ids) < min_recommended:
            reasons.append(f'recommended_product_ids_lt_{min_recommended}')

    expect_no_results = expectations.get('expectNoResults')
    if isinstance(expect_no_results, bool):
        recommended_ids = _read_nested(result.payload, ['recommendedProductIds'])
        actual_no_results = isinstance(recommended_ids, list) and len(recommended_ids) == 0
        if actual_no_results != expect_no_results:
            reasons.append(f'expected_no_results_{expect_no_results}_got_{actual_no_results}')

    expect_stream_done = expectations.get('expectRunFinishedEvent') is True
    if expect_stream_done:
        has_finished = any(event.get('type') == 'RUN_FINISHED' for event in result.sse_events)
        if not has_finished:
            reasons.append('missing_run_finished_event')

    return reasons


def _post_json(
    *,
    url: str,
    body: dict[str, Any],
    headers: dict[str, str],
    timeout_seconds: float,
) -> dict[str, Any]:
    encoded_body = json.dumps(body).encode('utf-8')
    req = request.Request(
        url=url,
        data=encoded_body,
        headers={
            'content-type': 'application/json',
            **headers,
        },
        method='POST',
    )

    try:
        with request.urlopen(req, timeout=timeout_seconds) as resp:
            raw_body = resp.read().decode('utf-8')
            return {
                'status': resp.status,
                'headers': {key.lower(): value for key, value in resp.headers.items()},
                'body': raw_body,
            }
    except error.HTTPError as http_error:
        raw_body = http_error.read().decode('utf-8')
        return {
            'status': http_error.code,
            'headers': {key.lower(): value for key, value in http_error.headers.items()},
            'body': raw_body,
        }


def _parse_sse_events(raw_payload: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for block in raw_payload.strip().split('\n\n'):
        lines = [line.strip() for line in block.split('\n') if line.strip() != '']
        if len(lines) == 0:
            continue

        data_line = next((line for line in lines if line.startswith('data: ')), None)
        if data_line is None:
            continue

        try:
            payload = json.loads(data_line.replace('data: ', '', 1))
        except json.JSONDecodeError:
            continue

        if isinstance(payload, dict):
            events.append(payload)

    return events


def _extract_snapshot_payload(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    for event in events:
        if event.get('type') != 'STATE_SNAPSHOT':
            continue
        state_payload = event.get('state')
        if not isinstance(state_payload, dict):
            continue
        chat_response = state_payload.get('chatResponse')
        if isinstance(chat_response, dict):
            return chat_response
    return None


def _try_parse_json(raw_payload: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return None

    if isinstance(payload, dict):
        return payload
    return None


def _load_dataset(dataset_path: Path) -> dict[str, Any]:
    payload = json.loads(dataset_path.read_text(encoding='utf-8'))
    if not isinstance(payload, dict):
        raise ValueError('Eval dataset root must be a JSON object.')
    return payload


def _read_nested(payload: dict[str, Any] | None, path: list[str]) -> Any:
    current: Any = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current
