# ShopPilot Architecture Overview

## Scope
ShopPilot is a full-stack AI-enabled ecommerce system with three runtime surfaces:
- Web application (`apps/web`)
- Core commerce/API gateway service + async worker (`apps/api`)
- AI assistant service (`apps/ai`)

Architecture diagrams:
- [Architecture diagrams index](architecture%20diagrams/README.md)

## Component Boundaries
### Web App (`apps/web`)
- Next.js App Router application for customer and admin workflows.
- Uses typed API clients in `apps/web/lib/*-api.ts` to call only the core API boundary.
- Hosts assistant UI (`apps/web/components/assistant/assistant-widget.tsx`) and consumes SSE from the core API AI gateway.

### Core API + Worker (`apps/api`)
- NestJS modular API (`AppModule`) with domains:
  - auth, products, cart, wishlist, address
  - checkout, orders, webhooks
  - AI gateway proxy
- Handles policy and integration concerns:
  - JWT cookie auth + role guards
  - rate limiting/throttling
  - Stripe/S3/Resend/Redis integration
  - standardized error contract (`ApiErrorFilter`)
- Worker runtime (`apps/api/src/worker/bootstrap.ts`) runs BullMQ processors for async jobs.

### AI Service (`apps/ai`)
- FastAPI service exposing `/ai/chat`, `/ai/chat/stream` and `/v1` aliases.
- Runs LangGraph workflow for planning, retrieval, validation, and response synthesis.
- Owns AI-specific orchestration, retrieval quality logic, and model/tool usage.

### Shared Data/Contracts (`packages/db`)
- Prisma schema and migrations define authoritative relational data model.
- Shared TypeScript contracts consumed by web and core API for payload consistency.

## Primary Flows
### Checkout, Payment, and Order Finalization
1. Web creates/updates checkout session through core API.
2. Core API creates Stripe hosted checkout session.
3. Stripe webhook and client return-flow both call shared reconciliation logic:
   - `CheckoutService.reconcilePaymentByProviderSessionId(...)`
4. Paid reconciliation finalizes order transactionally:
   - creates order + line items
   - decrements stock with revalidation
   - clears cart
5. Core API enqueues order-confirmation email job.
6. Worker consumes job and sends email through Resend.

### AI Assistant (Streaming Path)
1. Web sends request to core API `POST /ai/chat/stream`.
2. Core API enforces throttling/policy and proxies upstream to AI service.
3. AI service runs LangGraph workflow:
   - planner/updater step
   - retrieval through tools (PostgreSQL + Chroma)
   - synthesis via Gemini (with deterministic fallbacks)
4. AI service streams SSE events back to core API.
5. Core API passes stream to web with correlation/telemetry headers.

## Key Architecture Decisions
This section incorporates and validates major technical points from [`docs/interview-points.md`](interview-points.md) against current code paths.

### 1) Thin AI Gateway Boundary in NestJS
- Decision: keep AI orchestration in FastAPI; keep NestJS as policy/proxy boundary.
- Implemented in:
  - `apps/api/src/ai/ai.controller.ts`
  - `apps/api/src/ai/ai.service.ts`
  - `apps/api/src/ai/ai-throttler.guard.ts`
- Why: avoids duplicating AI logic across services and keeps ownership clear.

### 2) Shared Reconciliation for Webhook and Return Flow
- Decision: one reconciliation path for payment outcome handling.
- Implemented in:
  - `apps/api/src/checkout/checkout.service.ts`
  - `apps/api/src/webhooks/webhooks.service.ts`
- Why: handles off-session outcomes and prevents divergent business behavior.

### 3) Durable Webhook Idempotency with Claim-State Processing
- Decision: persist webhook events and claim by status transitions (`RECEIVED/FAILED -> PROCESSING`).
- Implemented in:
  - `packages/db/prisma/schema.prisma` (`PaymentWebhookEvent`)
  - `apps/api/src/webhooks/webhooks.service.ts`
- Why: Stripe delivery is at-least-once; dedupe must be durable, not in-memory.

### 4) Async Email Decoupling from Checkout Critical Path
- Decision: enqueue confirmation email jobs instead of sending inline on order finalization.
- Implemented in:
  - `apps/api/src/checkout/order-confirmation-email.queue.service.ts`
  - `apps/api/src/checkout/order-confirmation-email.processor.ts`
  - `apps/api/src/checkout/order-confirmation-email.mailer.service.ts`
- Why: protects checkout latency/reliability from external email dependency.

### 5) Planner-First AI Retrieval with Deterministic Fallbacks
- Decision: combine LLM planning with deterministic refinement and retrieval fallbacks.
- Implemented in:
  - `apps/ai/app/graph/workflow.py`
  - `apps/ai/app/llm/planner.py`
  - `apps/ai/app/search/service.py`
- Why: improves natural-language handling while preserving predictable behavior under model/index failures.

### 6) Contract-First Validation at Service Boundaries
- Decision: strict runtime validation on all major request/response boundaries.
- Implemented in:
  - Zod schemas in core API and web client parsing paths
  - Pydantic models in AI API/tool contracts
- Why: reduces cross-service drift and catches integration errors early.

## Reliability and Consistency Patterns
- Order placement idempotency key enforcement for replay safety.
- Transactional stock decrement with conflict handling.
- Checkout session readiness/expiry gating.
- Webhook duplicate claim handling + retry-safe failure modes.
- Queue retry/backoff configuration for transient failures.
- Gateway timeout/abort + mapped public error contracts for upstream AI failures.

## Observability Model
- Correlation IDs:
  - `x-request-id` across web -> gateway -> AI
  - `x-run-id` and `x-thread-id` for AI flow tracking
- Optional Sentry instrumentation in all runtimes.
- Optional LangSmith tracing in AI workflow.
- Structured logs for:
  - checkout + order finalization
  - webhook lifecycle
  - queue job lifecycle
  - AI gateway and graph execution

## Data Model Highlights
Core entities (see [ERD lite](architecture%20diagrams/05-erd-lite.mmd)):
- Identity and auth: `User`, `PasswordResetToken`
- Catalog: `Product`, `ProductMedia`
- Shopping state: `Cart`, `CartItem`, `Wishlist`, `WishlistItem`, `Address`
- Conversion pipeline: `CheckoutSession`, `Order`, `OrderLineItem`
- Integration durability: `PaymentWebhookEvent`

## Deployment Topology (Current Direction)
- Local development:
  - PostgreSQL via Docker Compose
  - web/core API/AI service run separately
  - optional worker process for async jobs
- AWS CDK target topology:
  - ECS services for API, AI, and worker
  - RDS PostgreSQL
  - ElastiCache Redis
  - S3 media bucket
  - ECR repositories and ALB-managed ingress

## Intentional Scope Limits
The architecture intentionally favors practical portfolio scope over enterprise complexity:
- No distributed transaction manager
- No global event bus
- No managed vector DB requirement (local Chroma used by default)
- No mandatory DLQ/replay admin tooling yet (deferred seam noted in queue code)
- No multi-region/active-active infrastructure assumptions
