# ShopPilot

## Project Snapshot
ShopPilot is a full-stack AI-powered ecommerce application built in a monorepo.

It includes:
- a customer and admin web experience (`apps/web`)
- a core commerce/API gateway service plus async worker (`apps/api`)
- a dedicated AI assistant service (`apps/ai`)

## Quick Demo Access
### Demo Accounts
- Admin: `admin@shoppilot.local` / `AdminPass123!`
- Customer: `customer@shoppilot.local` / `CustomerPass123!`

### Stripe Test Payment
- Card number: `4242 4242 4242 4242`
- Expiry: any future date (example: `12/34`)
- CVC: any 3 digits (example: `123`)
- ZIP/postal code: any valid format (example: `10001`)

## Features
### Frontend (Next.js)
- Customer storefront with category, gender, price, and search-based catalog discovery.
- Product detail experience with image gallery, availability state, and add-to-cart/wishlist actions.
- Cookie-auth account flows: register, login, logout, forgot password, and reset password.
- Cart + wishlist drawer UX with optimistic UI updates and per-item pending state tracking.
- Checkout UX for address management, contact capture, payment initiation, and payment-return handling.
- Order confirmation experience with line-item and totals breakdown.
- Admin workspace for product management and order monitoring.
- Embedded AI assistant widget with real-time SSE streaming response rendering and recommendation cards.

### Backend - Core API (NestJS)
- Modular API surface for auth, catalog, cart, wishlist, address, checkout, orders, webhooks, and AI gateway.
- JWT cookie authentication, role-based authorization, and endpoint-level throttling.
- Checkout session lifecycle with readiness checks, pricing snapshots, and expiry handling.
- Stripe hosted checkout integration and return-flow status checks.
- Stripe webhook ingestion with event persistence, duplicate handling, and reconciliation workflow.
- Order creation with transactional stock revalidation/decrement and idempotent order placement behavior.
- Async order confirmation email pipeline using BullMQ queue producer and dedicated worker processor.
- Admin product media upload flow using S3 pre-signed upload URLs.
- AI gateway proxy endpoints for JSON and SSE transport to the FastAPI AI service, supporting cross-service AI workflow communication.

### Backend - AI API (FastAPI)
- `POST /ai/chat` and `POST /ai/chat/stream` endpoints (plus `/v1` aliases).
- LangGraph-based agent orchestration workflow with explicit planning, retrieval, validation, and synthesis stages.
- Planner-first query normalization using Gemini with deterministic fallback paths.
- Hybrid retrieval stack combining structured DB filtering and semantic vector search.
- Tool integration layer for product search, item details lookup, and product comparison.
- Prompt engineering for planner and synthesizer stages using strict system prompts, schema-constrained JSON outputs, and fallback guardrails.
- Gemini large language model (LLM) integration for query planning and response synthesis with structured JSON outputs and follow-up prompts.
- Local vector indexing pipeline over catalog products (PostgreSQL -> embeddings -> Chroma).
- Request/run/thread correlation, token usage telemetry, and transport-aware propagation for troubleshooting and model optimization.

## Observability
- Request correlation via `x-request-id` across web/API/AI boundaries.
- AI correlation headers (`x-run-id`, `x-thread-id`) for streaming and non-streaming requests.
- Sentry instrumentation across web, core API, and AI service runtimes.
- LangSmith tracing for AI graph/tool workflows.
- Structured operational logging for checkout, webhook processing, queue processing, and AI gateway behavior.
- Cross-service traces and correlated runtime logs support troubleshooting and optimization of application and model-related issues.

## Reliability / Idempotency
- Stripe webhook events are persisted and claimed to prevent duplicate processing races.
- Order placement enforces idempotency key matching to prevent duplicate order creation.
- Paid-order finalization runs in DB transactions with stock revalidation/decrement guarantees.
- Checkout sessions enforce readiness and expiry constraints before payment/order progression.
- Queue jobs use retry/backoff controls for resilient order-confirmation delivery.
- AI gateway applies throttling, timeout handling, and upstream error/status normalization.
- AI workflow budgets (retrieval top-k, response top-n, output token limits) enforce predictable latency/cost performance.

## Testing Coverage
- Web app: Jest unit/integration tests + Playwright end-to-end tests.
- Core API: Jest unit/integration/e2e project split.
- AI service: pytest unit/integration/e2e coverage.
- [Testing Overview](docs/testing-overview.md)

## Maintainability / Contracts
- Monorepo boundaries with app-level separation (`apps/web`, `apps/api`, `apps/ai`) and shared packages.
- Shared typed contracts for API payloads and frontend/client integration in [`@shoppilot/db`](packages/db).
- Strong runtime validation at boundaries using Zod (TypeScript services) and Pydantic v2 (Python service).
- Prisma schema + migration workflow for repeatable database evolution.
- Infrastructure-as-code baseline for deployment topology in `infra/cdk`.
- Cloud-ready deployment stack (ECS/RDS/ElastiCache/S3/ALB) supports platform, data, and cloud collaboration for scalable solutions.

## Docs / Diagrams
- [Architecture Overview](docs/architecture-overview.md)
- [Architecture Diagrams Index](docs/architecture%20diagrams/README.md)
- Documentation covers system architecture, workflow sequences, and technical implementation boundaries.

## Tech Stack
| Area | Stack |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Zustand, Zod, `@assistant-ui/react` |
| Backend - Core API | NestJS, Node.js, Prisma Client, BullMQ, ioredis, JWT/cookie auth, Zod validation |
| Backend - AI API | FastAPI, Python, LangGraph, Pydantic v2, Google GenAI SDK (Gemini), ChromaDB, psycopg |
| Databases & Persistence | PostgreSQL, Prisma ORM/schema/migrations, local Chroma vector store |
| System Integrations | Stripe (Checkout + Webhooks), Resend (transactional email), AWS S3 (product media uploads), Gemini APIs (LLM + embeddings) |
| Infra & Deployment | Docker, Docker Compose, AWS CDK, ECS Fargate, ALB, RDS Postgres, ElastiCache Redis, ECR |
| Observability | Sentry (web + API + AI), LangSmith tracing (AI workflows), CloudWatch (ECS/logs/alarms via CDK) |
| Testing | Jest, Testing Library, Playwright, pytest |
| Monorepo & Tooling | pnpm workspaces, TypeScript, ESLint, Prettier |

## Quickstart
### Prerequisites
- Node.js 22+
- pnpm 10+
- Python 3.12+
- Docker

### 1) Install dependencies
```bash
pnpm install
```

### 2) Configure environment
```bash
cp .env.example .env
```
Set required values in `.env` before running services:
- Core API minimum: `STRIPE_SECRET_KEY`, `RESEND_API_KEY` (non-empty for startup validation)
- AI service minimum: `GEMINI_API_KEY` (or `LLM_SYNTHESIS_API_KEY`)

### 3) Start PostgreSQL
```bash
docker compose up -d db
```

### 4) Ensure Redis is available
Default runtime expects `redis://localhost:6379`.

### 5) Apply DB migrations and seed demo data
```bash
pnpm --filter @shoppilot/db prisma:deploy
pnpm --filter @shoppilot/db seed
```

### 6) Run services
Terminal 1 (core API):
```bash
pnpm --filter @shoppilot/api dev
```

Terminal 2 (web):
```bash
pnpm --filter @shoppilot/web dev
```

Terminal 3 (AI service):
```bash
cd apps/ai
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Terminal 4 (worker, optional but recommended for async email jobs):
```bash
pnpm --filter @shoppilot/api build
pnpm --filter @shoppilot/api start:worker
```

### 7) Open local apps
- Web: `http://localhost:3000`
- Core API health: `http://localhost:4000/health`
- AI health: `http://localhost:8000/health`

## Demo
- Production app: `https://shoppilot-web.vercel.app/catalog`
- [Main flow](https://drive.google.com/file/d/1IJVy35tNnvwnODiIxD1wFDJQebCMFVUY/view?usp=sharing)
- [Follow up prompts: refinment and comparision](https://drive.google.com/file/d/1DTK_k5pTNI3GjkldyRsfHTdpw2SFNmVe/view?usp=sharing)

## Workspace Commands
- `pnpm dev` - run workspace apps in watch mode
- `pnpm build` - build all workspaces
- `pnpm lint` - lint all workspaces
- `pnpm typecheck` - type-check all workspaces
- `pnpm test` - run all configured tests
