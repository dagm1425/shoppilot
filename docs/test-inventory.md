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
| P2-2.1-T001 | Address Validation | P0 | UNIT | Address schema parsing enforces ISO country, required fields, and update payload constraints. | `apps/api/test/unit/address.schemas.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P2-2.1-T002 | Checkout Validation | P0 | UNIT | Checkout session token/contact/address payload validators reject malformed inputs and normalize valid payloads. | `apps/api/test/unit/checkout.schemas.unit.test.ts` | Yes | Passing | 2026-05-16 |
| P2-2.1-T003 | Checkout Foundation API | P0 | INT | Checkout session start/resume/readiness lifecycle with address + contact completion transitions blocked -> ready. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-16 |
| P2-2.1-T004 | Checkout Precondition Guard | P0 | INT | Session creation rejects empty carts with deterministic `CHECKOUT_CART_EMPTY` error contract. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-16 |
| P2-2.1-T005 | Checkout Session Expiry | P1 | INT | Expired checkout sessions return explicit `CHECKOUT_SESSION_EXPIRED` response and block stale token reuse. | `apps/api/test/integration/checkout-foundations.int.test.ts` | Yes | Passing | 2026-05-16 |
| P2-2.1-T006 | Checkout UI Readiness Flow | P0 | E2E | `/checkout` keeps Continue disabled until address/contact requirements are saved, then enables continuation state. | `apps/web/test/e2e/checkout.e2e.test.ts` | Yes | Passing | 2026-05-16 |
| P2-2.1-T007 | Checkout Responsive Coverage | P0 | E2E | Checkout page remains usable with no horizontal overflow across required viewport matrix. | `apps/web/test/e2e/checkout.e2e.test.ts` | Yes | Passing | 2026-05-16 |

### Phase: Admin, Webhooks Expansion, and Async Jobs

### Phase: Vercel AI Assistant

### Phase: Hardening, Performance, and Deployment
