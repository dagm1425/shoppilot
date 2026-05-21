# ShopPilot Testing Overview

This document summarizes testing coverage in portfolio format: what is tested, how it is tested, and how to run tests locally.

## Test Strategy

ShopPilot uses a layered test strategy across all runtimes:

- Unit tests validate isolated business logic, validation rules, mappers, and utility behavior.
- Integration tests validate module/API contracts and cross-boundary behavior.
- End-to-end tests validate user-critical flows from entry point to outcome.

## Test Stack by Runtime

| Runtime | Frameworks | Layers |
|---|---|---|
| Web (`apps/web`) | Jest, Testing Library, Playwright | Unit, Integration, E2E |
| Core API (`apps/api`) | Jest (`unit`, `integration`, `e2e` projects) | Unit, Integration, E2E |
| AI API (`apps/ai`) | pytest, FastAPI `TestClient` | Unit, Integration, E2E |

## Coverage Highlights

### Frontend (Next.js)

- Auth and protected-route behavior.
- Catalog filter/search UX and product detail interactions.
- Cart and wishlist interaction states.
- Admin flows (access, products, orders).
- Assistant UI interaction and failure/retry behavior.

Representative specs:
- `apps/web/test/unit/env.unit.test.ts`
- `apps/web/test/integration/catalog.int.test.tsx`
- `apps/web/test/integration/assistant-modal.int.test.tsx`
- `apps/web/test/e2e/auth.e2e.test.ts`
- `apps/web/test/e2e/admin-orders.e2e.test.ts`

### Backend - Core API (NestJS)

- Schema validation and authorization guards.
- Auth/session contracts and role boundaries.
- Catalog, cart, wishlist, and admin API contracts.
- Checkout/order flow, webhook reconciliation, and idempotency paths.
- AI gateway contract/error mapping behavior.

Representative specs:
- `apps/api/test/unit/webhooks.service.unit.test.ts`
- `apps/api/test/unit/checkout.schemas.unit.test.ts`
- `apps/api/test/integration/auth.int.test.ts`
- `apps/api/test/integration/checkout-orders.int.test.ts`
- `apps/api/test/integration/checkout-webhooks.int.test.ts`

### Backend - AI API (FastAPI)

- Query parsing/refinement and retrieval-mode behavior.
- Planner and synthesizer guardrails (structured outputs, fallback paths).
- Search/indexing and embedding integration seams.
- Chat API JSON/SSE response contracts and typed error behavior.

Representative specs:
- `apps/ai/tests/unit/test_query_intent_unit.py`
- `apps/ai/tests/unit/test_llm_planner_unit.py`
- `apps/ai/tests/unit/test_llm_synthesizer_unit.py`
- `apps/ai/tests/integration/test_chat_int.py`
- `apps/ai/tests/e2e/test_chat_e2e.py`

## Run Tests

### Workspace-level commands

```bash
pnpm test
pnpm test:unit
pnpm test:int
pnpm test:e2e
```

### Per-app commands

```bash
# Web
pnpm --filter @shoppilot/web test
pnpm --filter @shoppilot/web test:unit
pnpm --filter @shoppilot/web test:int
pnpm --filter @shoppilot/web test:e2e

# Core API
pnpm --filter @shoppilot/api test
pnpm --filter @shoppilot/api test:unit
pnpm --filter @shoppilot/api test:int
pnpm --filter @shoppilot/api test:e2e

# Optional DB-backed API integration run
pnpm --filter @shoppilot/api test:int:db
```

```bash
# AI API (pytest)
cd apps/ai
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest tests/unit
pytest tests/integration
pytest tests/e2e
```

## Local Prerequisites for Full Signal

- Start PostgreSQL when running DB-backed flows:
  - `docker compose up -d db`
- For web E2E, ensure the core API is reachable at `http://127.0.0.1:4000`.
- For AI tests, `tests/conftest.py` sets required test env defaults to keep suites deterministic in local runs.

## Quality Signals for Reviewers

- Coverage is not limited to happy paths; failure/retry and idempotency behavior is validated.
- Cross-service boundaries (web <-> API <-> AI) are exercised via integration and e2e suites.
- Contract validation is tested explicitly in both TypeScript and Python runtimes.
