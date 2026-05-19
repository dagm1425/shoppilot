# ShopPilot Test Inventory

Use this file to track high-value tests by phase, evidence, and latest result status.

## How to Use

- Add only high-value tests (critical flow, risky logic, integration boundaries, regressions).
- Keep one row per meaningful test case.
- Update `Result` and `Last Run` whenever tests are executed.
- Use ISO date format for `Last Run`: `YYYY-MM-DD`.
- `Evidence` should point to concrete file references in repo.

## Status Values

- `Planned`
- `Written`
- `Passing`
- `Failing`
- `Blocked`

## Template

### Phase: <Phase Name>

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| <PHASE>-T001 | <Domain> | P0/P1 | UNIT/INT/E2E | <What behavior is validated> | `<path/to/test.file.ts>` | Yes/No | Planned/Written/Passing/Failing/Blocked | YYYY-MM-DD |

## ShopPilot Sections

### Phase: Foundation and Architecture

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| P0-T001 | Foundation Config | P0 | UNIT | Env schema validation for API and web public config paths. | `apps/api/test/unit/env.unit.test.ts`, `apps/web/test/unit/env.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P0-T002 | API Bootstrap | P0 | INT | `GET /health` contract returns readiness payload and reachable API baseline. | `apps/api/test/integration/health.int.test.ts` | Yes | Passing | 2026-05-16 |
| P0-T003 | DB Workflow | P0 | INT | Prisma migration/seed determinism path and DB readiness wiring. | `packages/db/prisma/schema.prisma`, `packages/db/prisma/seed.ts` | Yes | Blocked | 2026-05-03 |
| P0-T004 | Web Baseline | P0 | E2E | Web shell loads and exposes health-check entrypoint. | `apps/web/test/e2e/home.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P0-T005 | Observability Defaults | P1 | INT | Sentry stays disabled-by-default in local/test config conventions. | `.env.example`, `docs/guides/observability-conventions.md` | Yes | Passing | 2026-05-03 |

### Phase: Auth, Catalog, and Cart

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| P1-1.1-T001 | Auth Validation | P0 | UNIT | Auth request/env schema validation, password hashing policy, and reset URL builder assertions. | `apps/api/test/unit/auth.schemas.unit.test.ts`, `apps/api/test/unit/env.unit.test.ts`, `apps/api/test/unit/password-reset-mailer.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T002 | Auth Contract | P0 | INT | Register, login, logout, and `me` endpoint contract coverage including duplicate/unauthorized paths. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T003 | Reset Lifecycle | P0 | INT | Password reset request/confirm lifecycle covers invalid, expired, reused, and successful token paths. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T004 | Auth Throttling | P0 | INT | Rate limit enforcement for login attempts returns `429` and safe error contract. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T005 | Session Lifecycle | P0 | E2E | Login to protected account and logout flow with protected route re-check. | `apps/web/test/e2e/auth.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T006 | Role Boundary | P0 | INT | Role guard enforcement for customer vs admin-only probe endpoint. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T007 | Reset Delivery Mode | P0 | INT | Brevo-mode reset request omits local token and still returns generic response when delivery send fails. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.1-T008 | Reset Email UX | P0 | E2E | Forgot-password flow stays on page when no local token is returned and still supports token-link reset completion. | `apps/web/test/e2e/auth.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.2-T001 | Authorization Logic | P0 | UNIT | Roles guard allows/denies access based on required roles and authenticated identity payload shape. | `apps/api/test/unit/roles.guard.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.2-T002 | API Access Boundary | P0 | INT | `GET /auth/admin-probe` returns `401` unauthenticated, `403` for customer, and `200` for admin; demoted admin token is rejected. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.2-T003 | Web Route Protection | P0 | E2E | Unauthenticated admin-route navigation redirects to login with return path, then returns to `/admin` after login. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.2-T004 | Admin Happy Path | P0 | E2E | Authenticated admin can open the `/admin` route and view protected content. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.2-T005 | Authorization Regression | P0 | INT | Existing admin session loses access immediately after persisted role downgrade from `ADMIN` to `CUSTOMER`. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.3-T001 | Catalog Validation | P0 | UNIT | Catalog query schema validation clamps page/page-size values, rejects invalid sort enums, and normalizes search text/category mapping behavior. | `apps/api/test/unit/products.schemas.unit.test.ts`, `apps/api/test/unit/products.query-utils.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.3-T002 | Catalog API Contract | P0 | INT | `GET /products` and `GET /products/:productId` cover pagination/filter/search/sort success paths plus invalid sort, empty set, and not-found failures. | `apps/api/test/integration/products.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.3-T003 | Catalog UI States | P0 | INT | Catalog page integration verifies success, empty, error-retry recovery, and disabled controls during loading requests. | `apps/web/test/integration/catalog.int.test.tsx` | Yes | Passing | 2026-05-16 |
| P1-1.3-T004 | Catalog Happy Path | P0 | E2E | User can browse catalog, apply category/search filters, and open product detail with add-to-cart entry seam visible. | `apps/web/test/e2e/catalog.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.3-T005 | Catalog Failure Recovery | P0 | E2E | Catalog request failure surfaces retry state and recovers to loaded results on subsequent request. | `apps/web/test/e2e/catalog.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.3-T006 | Catalog Responsive Coverage | P0 | E2E | Catalog route validates required viewport matrix with no horizontal overflow and reachable primary actions. | `apps/web/test/e2e/catalog.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T001 | Cart Validation Logic | P0 | UNIT | Cart add/update schema validation rejects invalid quantity and malformed identifiers while applying default quantity rules. | `apps/api/test/unit/cart.schemas.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T002 | Cart Totals Computation | P0 | UNIT | Cart summary and line-state policy excludes invalid/unavailable lines from subtotal and preserves item counters. | `apps/api/test/unit/cart.policy.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T003 | Cart CRUD Contract | P0 | INT | Authenticated cart CRUD endpoints support add/increment, quantity update, remove, and idempotent delete behavior. | `apps/api/test/integration/cart.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T004 | Invalid Item Handling Regression | P0 | INT | Cart keeps invalid lines visible and marks `INSUFFICIENT_STOCK` or `PRODUCT_UNAVAILABLE` while excluding invalid totals after inventory changes. | `apps/api/test/integration/cart.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T005 | Cart Persistence and User Isolation | P0 | INT | Cart data is persisted by authenticated user and blocks cross-user access/update attempts. | `apps/api/test/integration/cart.int.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T006 | Cart Happy Path UI Flow | P0 | E2E | User can add from catalog, open cart, update quantity, and remove line item with UI feedback. | `apps/web/test/e2e/cart.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T007 | Cart Failure/Recovery UI Flow | P0 | E2E | Stock-drop invalidation and unauthenticated cart-action redirect paths provide recoverable UX and expected redirects. | `apps/web/test/e2e/cart.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T008 | Wishlist Toggle + Auth Redirect | P1 | INT | Wishlist toggle posts add/remove mutations, syncs local wishlist state, and redirects unauthorized users to login. | `apps/web/test/integration/wishlist.int.test.tsx` | Yes | Passing | 2026-05-16 |
| P1-1.4-T009 | Wishlist Validation Logic | P0 | UNIT | Wishlist payload schema validation accepts normalized product ids and rejects malformed identifiers/item ids. | `apps/api/test/unit/wishlist.schemas.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P1-1.4-T010 | Wishlist API Contract + Isolation | P0 | INT | Wishlist API covers read/add(unique)/remove(idempotent), malformed and not-found errors, auth boundary, and cross-user delete isolation. | `apps/api/test/integration/wishlist.int.test.ts` | Yes | Passing | 2026-05-16 |

### Phase: Checkout and Orders

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| P2-2.1-T001 | Address Validation | P0 | UNIT | Address schema parsing enforces ISO country, required fields, and update payload constraints. | `apps/api/test/unit/address.schemas.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.1-T002 | Checkout Validation | P0 | UNIT | Checkout session token/contact/address payload validators reject malformed inputs and normalize valid payloads. | `apps/api/test/unit/checkout.schemas.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.1-T003 | Checkout Foundation API | P0 | INT | Checkout session start/resume/readiness lifecycle with address + contact completion transitions blocked -> ready. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.1-T004 | Checkout Precondition Guard | P0 | INT | Session creation rejects empty carts with deterministic `CHECKOUT_CART_EMPTY` error contract. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.1-T005 | Checkout Session Expiry | P1 | INT | Expired checkout sessions return explicit `CHECKOUT_SESSION_EXPIRED` response and block stale token reuse. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.1-T006 | Checkout UI Readiness Flow | P0 | E2E | `/checkout` keeps Continue disabled until address/contact requirements are saved, then enables continuation state. | `apps/web/test/e2e/checkout.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.1-T007 | Checkout Responsive Coverage | P0 | E2E | Checkout page remains usable with no horizontal overflow across required viewport matrix. | `apps/web/test/e2e/checkout.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.2-T001 | Checkout Query Validation | P0 | UNIT | Checkout schema validator enforces non-empty provider session id for payment-status query input. | `apps/api/test/unit/checkout.schemas.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.2-T002 | Pricing Breakdown API | P0 | INT | Checkout session returns deterministic pricing (`subtotal`, fixed shipping, default ET tax rate, tax cents, total cents). | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.2-T003 | Hosted Payment Session Reuse | P0 | INT | Payment session creation for ready checkout is idempotent and reuses existing open Stripe session on retry. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.2-T004 | Payment Status Mapping | P1 | INT | Payment-status endpoint maps Stripe provider states to normalized checkout payment status payload. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.3-T001 | Place-Order Input Validation | P0 | UNIT | Checkout place-order payload and order number parsing enforce idempotency-key format, token requirements, and canonical order-number shape. | `apps/api/test/unit/checkout.schemas.unit.test.ts`, `apps/api/test/unit/orders.schemas.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.3-T002 | Place-Order Transaction + Idempotency | P0 | INT | `POST /checkout/place-order` creates one paid order, decrements stock once, clears cart, expires active checkout, and returns replay payload for same idempotency key. | `apps/api/test/integration/checkout-orders.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.3-T003 | Place-Order Failure Paths | P0 | INT | Place-order rejects mismatched idempotency replays and fails safely when transactional stock revalidation fails. | `apps/api/test/integration/checkout-orders.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.3-T004 | Order Confirmation Route | P0 | E2E | `/orders/:orderNumber` renders finalized order confirmation payload (order number + totals) on customer-facing UI. | `apps/web/test/e2e/checkout.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.3-T005 | Order Read Ownership Boundary | P0 | INT | `GET /orders/:orderNumber` returns order for owner and `ORDER_NOT_FOUND` for non-owner access attempts. | `apps/api/test/integration/checkout-orders.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.4-T001 | Webhook Guardrails | P0 | UNIT | Webhook service enforces signature-required guardrail, duplicate event no-op behavior, and retry-safe failure mapping when checkout session link is missing. | `apps/api/test/unit/webhooks.service.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.4-T002 | Off-Session Paid Finalization | P0 | INT | `POST /webhooks/stripe` finalizes paid checkout server-side (order create + stock decrement + cart clear + checkout deactivate) when user never returns from Stripe. | `apps/api/test/integration/checkout-webhooks.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.4-T003 | Webhook Idempotency + Stale Event Safety | P0 | INT | Duplicate webhook deliveries are replay-safe (no duplicate mutations) and stale terminal events do not downgrade already paid orders. | `apps/api/test/integration/checkout-webhooks.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.4-T004 | Terminal Failure + Retry Semantics | P0 | INT | Expired/failure outcomes reconcile without duplicate order creation, and missing local-session linkage returns retryable failure with persisted FAILED event status. | `apps/api/test/integration/checkout-webhooks.int.test.ts` | Yes | Passing | 2026-05-17 |
| P2-2.4-T005 | Payment Return Failure Recovery UI | P0 | E2E | `/checkout/payment-return` shows deterministic expired/canceled recovery state with actionable navigation back to checkout and retry affordance. | `apps/web/test/e2e/checkout.e2e.test.ts` | Yes | Passing | 2026-05-17 |

### Phase: Admin, Webhooks Expansion, and Async Jobs

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| P3-3.1-T001 | Admin Route Protection | P0 | E2E | Unauthenticated user navigating to `/admin` is redirected to login and returned to `/admin` after successful sign-in. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.1-T002 | Admin Role Boundary | P0 | E2E | Authenticated customer is denied admin workspace access and sees explicit access-required messaging on `/admin`. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.1-T003 | Admin Foundation Access | P0 | E2E | Authenticated admin can access `/admin` and sees admin navigation shell links for Home, Products, and Orders. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.1-T004 | Admin Products Route Access | P0 | E2E | Authenticated admin can open `/admin/products` workspace route and active sidebar state is set correctly. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.1-T005 | Admin Placeholder Authorization | P0 | E2E | Authenticated customer is blocked from `/admin/orders` placeholder route and does not see orders workspace content. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.2-T001 | Admin Home Data Smoke | P0 | E2E | Admin home path uses mocked `GET /orders/admin/home` summary response in route tests, providing smoke coverage for dashboard data loading path under authenticated admin access. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.3-T001 | Admin Product Validation | P0 | UNIT | Admin product schema parsers validate presign/create/update payloads, including duplicate media-object-key rejection and empty-update rejection paths. | `apps/api/test/unit/products.schemas.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.3-T002 | Admin Product Create + RBAC | P0 | INT | `POST /products/admin` enforces admin-only access, creates product + media metadata successfully, and returns deterministic slug-conflict error on duplicate product slugs. | `apps/api/test/integration/admin-products.int.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.3-T003 | Admin Product Update Contract | P0 | INT | `PATCH /products/admin/:productId` updates mutable fields and media metadata via upsert semantics for valid admin update requests. | `apps/api/test/integration/admin-products.int.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.3-T004 | Admin Media Presign Contract | P0 | INT | `POST /products/admin/media/presign` returns presigned upload payload for admins and forwards validated role/content-type metadata to storage service seam. | `apps/api/test/integration/admin-products.int.test.ts`, `apps/api/test/helpers/test-app.ts` | Yes | Passing | 2026-05-17 |
| P3-3.3-T005 | Admin Product Create UI Flow | P0 | E2E | `/admin/products` create flow covers media upload (presign + PUT), form submission, and success-state rendering for created product details. | `apps/web/test/e2e/admin-products.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.3-T006 | Admin Product Update Failure/Recovery UI Flow | P0 | E2E | `/admin/products` update flow handles lookup failure (`PRODUCT_NOT_FOUND`), recovers by loading valid slug, and persists updates successfully. | `apps/web/test/e2e/admin-products.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.4-T001 | Admin Orders Query Validation | P0 | UNIT | Admin orders list query parser applies defaults and rejects invalid date windows (`dateFrom > dateTo`). | `apps/api/test/unit/orders.schemas.unit.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.4-T002 | Admin Orders API Role Boundary | P0 | INT | `GET /orders/admin/list` denies customer-role tokens with `AUTH_FORBIDDEN` and enforces admin-only access. | `apps/api/test/integration/admin-orders.int.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.4-T003 | Admin Orders API Filters + Pagination | P0 | INT | Admin orders list returns newest-first pagination and supports combined status/customer/date filtering with validation failure on invalid date ranges. | `apps/api/test/integration/admin-orders.int.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.4-T004 | Admin Orders UI Flow | P0 | E2E | `/admin/orders` supports pagination navigation, combined filter apply/clear actions, and stable list rendering under mocked API responses. | `apps/web/test/e2e/admin-orders.e2e.test.ts` | Yes | Passing | 2026-05-17 |
| P3-3.6-T001 | Queue Health Endpoint | P0 | INT | `GET /orders/admin/queue-health` enforces admin-only access and returns read-only BullMQ queue counts (`waiting`, `active`, `completed`, `failed`) with timestamp payload. | `apps/api/test/integration/admin-orders.int.test.ts`, `apps/api/test/helpers/test-app.ts` | Yes | Passing | 2026-05-18 |

### Phase: Vercel AI Assistant

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| P4-4.1-T001 | AI Contracts | P0 | UNIT | Chat service contract coverage for placeholder compatibility plus typed recommendation/no-match mapping in `ChatResponse`. | `apps/ai/tests/unit/test_chat_service_unit.py` | Yes | Passing | 2026-05-17 |
| P4-4.1-T002 | AI Config Validation | P0 | UNIT | App settings enforce LangSmith and Sentry validation guards (required keys only when feature flags are enabled). | `apps/ai/tests/unit/test_settings_unit.py` | Yes | Passing | 2026-05-17 |
| P4-4.1-T003 | AI Health Endpoint | P0 | INT | `/health` and `/v1/health` return typed payload and include request-id response header. | `apps/ai/tests/integration/test_health_int.py` | Yes | Passing | 2026-05-17 |
| P4-4.1-T004 | AI Chat Endpoint | P0 | INT | `/ai/chat` and `/v1/ai/chat` return typed recommendation/no-match responses, preserve payload request ID, and echo inbound request-id header. | `apps/ai/tests/integration/test_chat_int.py` | Yes | Passing | 2026-05-17 |
| P4-4.1-T005 | AI Validation Failure Contract | P0 | E2E | Invalid chat payload returns `422` typed `ErrorResponse` with deterministic `AI_VALIDATION_ERROR` and request-id propagation. | `apps/ai/tests/e2e/test_chat_e2e.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T001 | Retrieval Intent Parsing | P0 | UNIT | Intent parser classifies structured/semantic/hybrid modes and extracts category/price/rating/availability filters from natural-language prompts. | `apps/ai/tests/unit/test_query_intent_unit.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T002 | Embedding Text Builder | P0 | UNIT | Embedding text builder includes required semantic fields (title/description/category/features/tags/price/availability/rating) with deterministic tokenized content. | `apps/ai/tests/unit/test_text_builder_unit.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T003 | Retrieval Orchestration Branching | P0 | UNIT | Semantic search service covers structured path, semantic vector hydration path, and hybrid fallback ranking when vector hits are empty. | `apps/ai/tests/unit/test_search_service_unit.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T004 | Index Rebuild Orchestration | P0 | UNIT | Index rebuild batches upserts deterministically and fails fast with explicit error when PostgreSQL source products are unavailable. | `apps/ai/tests/unit/test_indexer_unit.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T005 | Chat Retrieval Contract | P0 | INT | Chat endpoint contract returns typed recommendations and graceful no-match responses with stable request-id propagation on unversioned and versioned routes. | `apps/ai/tests/integration/test_chat_int.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T006 | Chat Failure and Recovery Contract | P0 | E2E | Chat e2e coverage includes recommendation success path plus typed `AI_INTERNAL_ERROR` mapping for retrieval runtime failures. | `apps/ai/tests/e2e/test_chat_e2e.py` | Yes | Passing | 2026-05-17 |
| P4-4.2-T007 | Gemini SDK Embedding Client Contract | P0 | UNIT | Embedding client uses `google-genai` SDK contract and normalizes single/multi-text embeddings while surfacing malformed embedding payload failures. | `apps/ai/tests/unit/test_embeddings_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.2-T008 | Embedding Config Validation and Provider Guard | P0 | UNIT | Embedding settings require `GEMINI_API_KEY`, support Gemini base/model alias fallback behavior, and reject unsupported providers. | `apps/ai/tests/unit/test_settings_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T001 | Graph Deterministic Recommendation Path | P0 | UNIT | LangGraph workflow returns a typed recommendation payload with validated `recommendedProductIds` on successful retrieval. | `apps/ai/tests/unit/test_graph_workflow_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T002 | Graph Retry Loop Guardrail | P0 | UNIT | Retrieval validation/execution failure triggers exactly one retry and then graceful fallback, preventing unbounded loops. | `apps/ai/tests/unit/test_graph_workflow_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T003 | Graph Memory Continuity | P0 | UNIT | Follow-up comparison on the same `thread_id` reuses prior recommendations and produces comparison output without redundant retrieval. | `apps/ai/tests/unit/test_graph_workflow_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T004 | Graph Session Isolation | P0 | UNIT | Different `thread_id` values isolate memory and prevent cross-session recommendation leakage on follow-up compare prompts. | `apps/ai/tests/unit/test_graph_workflow_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T005 | Chat Service Workflow Delegation | P0 | UNIT | Chat service delegates to workflow runtime, preserves graceful no-result response shape, and applies configured model metadata. | `apps/ai/tests/unit/test_chat_service_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T006 | Chat API Workflow Contract | P0 | INT | `/ai/chat` and `/v1/ai/chat` enforce typed workflow response fields (`retrievalMode`, `recommendedProductIds`) and request-id header propagation. | `apps/ai/tests/integration/test_chat_int.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T007 | Chat API Failure and Validation Contract | P0 | E2E | Invalid requests return typed `AI_VALIDATION_ERROR`, and workflow runtime failures map to typed `AI_INTERNAL_ERROR` with request-id continuity. | `apps/ai/tests/e2e/test_chat_e2e.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T008 | Gemini Synthesis Runtime Provider Migration | P0 | UNIT | Synthesis runtime and provider call path use Gemini SDK semantics with strict JSON parsing and deterministic fallback behavior. | `apps/ai/tests/unit/test_llm_synthesizer_unit.py`, `apps/ai/tests/unit/test_graph_workflow_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T009 | Synthesis Env Alias and Provider Validation | P0 | UNIT | Synthesis settings enforce canonical Gemini provider config, support `GEMINI_*` and temporary `OPENAI_*` alias fallbacks, and reject unsupported providers. | `apps/ai/tests/unit/test_settings_unit.py` | Yes | Passing | 2026-05-19 |
| P4-4.3-T010 | Chat Contract Stability After Synthesis Provider Swap | P0 | INT | `/ai/chat` and `/ai/chat/stream` preserve typed response and stream contracts after synthesis provider migration, including request-id and `RUN_ERROR` behavior. | `apps/ai/tests/integration/test_chat_int.py` | Yes | Passing | 2026-05-19 |
| P4-4.4-T001 | Gateway Payload and Response Validation | P0 | UNIT | AI gateway request schema rejects blank prompts and upstream response parser enforces safe `AI_UPSTREAM_RESPONSE_INVALID` mapping for malformed payloads. | `apps/api/test/unit/ai.schemas.unit.test.ts` | Yes | Passing | 2026-05-19 |
| P4-4.4-T002 | Gateway Proxy Boundary and Failure Mapping | P0 | INT | `POST /ai/chat` forwards sanitized context and request-id to upstream service while mapping upstream validation/unavailable/timeout/rate-limit outcomes to safe client-facing contracts. | `apps/api/test/integration/ai-gateway.int.test.ts` | Yes | Passing | 2026-05-19 |
| P4-4.4-T003 | Gateway SSE Stream Proxy Contract | P0 | INT | `POST /ai/chat/stream` proxies upstream SSE bytes unchanged, preserves status mapping before stream start, and aborts upstream on client disconnect. | `apps/api/test/integration/ai-gateway-stream.int.test.ts` | Yes | Passing | 2026-05-19 |
| P4-4.4-T004 | Assistant Modal Integration States | P0 | INT | Global assistant FAB modal integration validates modal open/close behavior, disabled-send blank input, loading/success/error+retry states, and snapshot-driven recommendation rendering. | `apps/web/test/integration/assistant-modal.int.test.tsx` | Yes | Passing | 2026-05-19 |
| P4-4.4-T005 | Assistant Modal Route-Level E2E Surface | P0 | E2E | Customer route e2e verifies FAB modal availability, request dispatch to stream transport, loading-state UX, and intentional `/assistant` 404 after modal migration. | `apps/web/test/e2e/assistant-modal.e2e.test.ts` | Yes | Passing | 2026-05-19 |

### Phase: Hardening, Performance, and Deployment
