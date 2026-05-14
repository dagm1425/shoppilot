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
| P0-T001 | Foundation Config | P0 | UNIT | Env schema validation for API and web public config paths. | `apps/api/test/unit/env.unit.test.ts`, `apps/web/test/unit/env.unit.test.ts` | Yes | Passing | 2026-05-03 |
| P0-T002 | API Bootstrap | P0 | INT | `GET /health` contract returns readiness payload and reachable API baseline. | `apps/api/test/integration/health.int.test.ts` | Yes | Passing | 2026-05-03 |
| P0-T003 | DB Workflow | P0 | INT | Prisma migration/seed determinism path and DB readiness wiring. | `packages/db/prisma/schema.prisma`, `packages/db/prisma/seed.ts` | Yes | Blocked | 2026-05-03 |
| P0-T004 | Web Baseline | P0 | E2E | Web shell loads and exposes health-check entrypoint. | `apps/web/test/e2e/home.e2e.test.ts` | Yes | Passing | 2026-05-03 |
| P0-T005 | Observability Defaults | P1 | INT | Sentry stays disabled-by-default in local/test config conventions. | `.env.example`, `docs/guides/observability-conventions.md` | Yes | Passing | 2026-05-03 |

### Phase: Auth, Catalog, and Cart

| ID | Category | Priority | Type | Description | Evidence (file refs) | Written | Result | Last Run |
|---|---|---|---|---|---|---|---|---|
| P1-1.1-T001 | Auth Validation | P0 | UNIT | Auth request/env schema validation, password hashing policy, and reset URL builder assertions. | `apps/api/test/unit/auth.schemas.unit.test.ts`, `apps/api/test/unit/env.unit.test.ts`, `apps/api/test/unit/password-reset-mailer.unit.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.1-T002 | Auth Contract | P0 | INT | Register, login, logout, and `me` endpoint contract coverage including duplicate/unauthorized paths. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.1-T003 | Reset Lifecycle | P0 | INT | Password reset request/confirm lifecycle covers invalid, expired, reused, and successful token paths. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.1-T004 | Auth Throttling | P0 | INT | Rate limit enforcement for login attempts returns `429` and safe error contract. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.1-T005 | Session Lifecycle | P0 | E2E | Login to protected account and logout flow with protected route re-check. | `apps/web/test/e2e/auth.e2e.test.ts` | Yes | Failing | 2026-05-14 |
| P1-1.1-T006 | Role Boundary | P0 | INT | Role guard enforcement for customer vs admin-only probe endpoint. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.1-T007 | Reset Delivery Mode | P0 | INT | Brevo-mode reset request omits local token and still returns generic response when delivery send fails. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.1-T008 | Reset Email UX | P0 | E2E | Forgot-password flow stays on page when no local token is returned and still supports token-link reset completion. | `apps/web/test/e2e/auth.e2e.test.ts` | Yes | Passing | 2026-05-13 |
| P1-1.2-T001 | Authorization Logic | P0 | UNIT | Roles guard allows/denies access based on required roles and authenticated identity payload shape. | `apps/api/test/unit/roles.guard.unit.test.ts` | Yes | Passing | 2026-05-14 |
| P1-1.2-T002 | API Access Boundary | P0 | INT | `GET /auth/admin-probe` returns `401` unauthenticated, `403` for customer, and `200` for admin; demoted admin token is rejected. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-14 |
| P1-1.2-T003 | Web Route Protection | P0 | E2E | Unauthenticated admin-route navigation redirects to login with return path, then returns to `/admin` after login. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Failing | 2026-05-14 |
| P1-1.2-T004 | Admin Happy Path | P0 | E2E | Authenticated admin can open the `/admin` route and view protected content. | `apps/web/test/e2e/admin-access.e2e.test.ts` | Yes | Written | 2026-05-14 |
| P1-1.2-T005 | Authorization Regression | P0 | INT | Existing admin session loses access immediately after persisted role downgrade from `ADMIN` to `CUSTOMER`. | `apps/api/test/integration/auth.int.test.ts` | Yes | Passing | 2026-05-14 |

### Phase: Checkout and Orders

### Phase: Admin, Webhooks Expansion, and Async Jobs

### Phase: Vercel AI Assistant

### Phase: Hardening, Performance, and Deployment
