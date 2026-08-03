# Engineering delivery and release readiness

**Status:** Core local product implemented; release hardening remains active

## Purpose and ownership

This document tracks implemented capabilities, engineering priorities, verification gates, operational risks, and remaining release work. Update it when a capability reaches a new state, a release risk changes, or new verification evidence becomes available.

Product rules remain in [requirements.md](requirements.md). Technical boundaries remain in [architecture.md](architecture.md) and [decisions.md](decisions.md).

## Delivery strategy

Build and verify one vertical capability at a time while keeping the repository runnable. Prove domain and backend behavior before dependent UI polish, and complete correctness/security work before optional platform expansion.

Priorities:

- **P0 — Product correctness:** authentication, authorization, task lifecycle, queue/worker behavior, durable history, private files, and reproducible local startup.
- **P1 — Engineering confidence:** duplicate safety, reconciliation, negative-path tests, accessibility, structured logs, graceful shutdown, CI, and clean containers.
- **P2 — Platform maturity:** browser E2E smoke coverage, production observability, object storage, managed infrastructure, and public deployment.

## Capability status

| Capability                          | State       | Readiness evidence                                                                                                          |
| ----------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| pnpm workspace and shared contracts | Implemented | Root install, generation, lint, typecheck, test, and build scripts                                                          |
| PostgreSQL schema and migrations    | Implemented | Committed migrations, constraints, indexes, deterministic seed                                                              |
| Authentication and sessions         | Implemented | Argon2id, access JWT, Redis refresh rotation, CSRF/CORS/RBAC tests                                                          |
| Task REST lifecycle                 | Implemented | CRUD, list controls, history, optimistic conflicts, admin reads, OpenAPI                                                    |
| Asynchronous processing             | Implemented | BullMQ worker, delayed execution, automatic/manual retries, deterministic delivery, and reconciliation integration coverage |
| Private file inspection             | Implemented | Magic-byte validation, private storage, authorized download, SHA-256 result                                                 |
| User and admin web applications     | Implemented | Auth, dashboard, task workflows, history, admin read views                                                                  |
| Cache and live invalidation         | Implemented | Bounded cache, invalidation, authenticated Socket.IO hints, canonical refetch                                               |
| Reproducible local runtime          | Implemented | `.env.example`, Dockerfiles, Compose, migrations, seed, health endpoints                                                    |
| API developer tooling               | Implemented | Swagger/OpenAPI and secret-free Postman smoke collection                                                                    |
| CI quality gates                    | Implemented | Workspace checks, integration tests, and container builds in GitHub Actions                                                 |
| Browser E2E suite                   | Planned     | Small critical-flow Playwright suite still needed                                                                           |
| Managed production deployment       | Planned     | Requires persistent services, object storage, secrets, TLS, and monitoring                                                  |

State meanings:

- **Implemented:** code and automated verification exist in the repository.
- **In progress:** implementation exists but a named readiness gate is incomplete.
- **Planned:** intentionally outside the current runnable product.

## Development workflow

For each change:

1. Identify the owning product rule and technical document.
2. Implement the smallest vertical behavior that preserves existing invariants.
3. Add positive, negative, authorization, concurrency, and recovery tests in proportion to risk.
4. Run focused checks for fast feedback.
5. Run the widest relevant integration/build/container checks.
6. Update the owning documentation and generated API contract.
7. Inspect the exact diff and keep the commit focused.

## Verification levels

### Fast feedback

1. Format and lint the changed workspace.
2. Run strict type checking.
3. Run focused unit, component, or HTTP tests.
4. Build the changed runtime when compilation or bundling may differ from tests.

### Infrastructure confidence

Run `pnpm test:integration:postgres` for changes involving PostgreSQL, Redis sessions, BullMQ behavior, scheduling, retries, duplicate delivery, reconciliation, or cross-process state.

The runner requires an allowlisted `_test` database, applies committed migrations from empty, isolates Redis database 15, uses bounded polling, and cleans up the test database.

### Repository quality gate

Run `pnpm ci:check` before merging cross-workspace or release-facing changes. It covers Prisma generation, lint, formatting, strict type checking, default tests, and production builds.

Run `pnpm docker:check` when Dockerfiles, Compose, environment contracts, runtime entry points, or production dependencies change.

### Release smoke

Before a tagged or deployed release:

- start from a clean clone and fresh named volumes;
- apply migrations and deterministic seed data;
- start web, API, worker, PostgreSQL, and Redis;
- verify liveness and readiness endpoints;
- exercise login, create, scheduled execution, completion/failure, history, retry, and authorized file download;
- verify graceful shutdown and restart recovery;
- confirm no secrets, debug output, generated uploads, or local paths are tracked.

## Primary risks

| Risk                             | Current control                                                           | Next maturity step                               |
| -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| Cookie/CORS environment mismatch | Exact origins, CSRF, secure-cookie configuration, browser/API tests       | Deployment-specific browser smoke                |
| PostgreSQL/queue drift           | Deterministic IDs, execution versions, conditional claims, reconciliation | Metrics and alerting on undispatched work        |
| Duplicate job delivery           | Conditional claim/finalization plus versioned job identity                | Long-running chaos and restart tests             |
| File/database divergence         | Bounded validation, compensation cleanup, metadata transaction            | Object storage and lifecycle policies            |
| Shared Redis pressure            | Namespaces, bounded TTLs, AOF, `noeviction`, separate connections         | Split queue Redis from session/cache Redis       |
| Missed live events               | Socket hints plus refocus/reconnect/interval refetch                      | Connection metrics and E2E reconnect coverage    |
| Accessibility regressions        | Semantic components and component-level assertions                        | Automated browser audit and manual keyboard pass |
| Documentation drift              | Explicit document ownership and same-change updates                       | Link/contract drift checks in CI                 |

## Definition of done

### Product behavior

- The requested user workflow succeeds.
- Invalid lifecycle actions, stale versions, and out-of-scope resources fail with stable public behavior.
- Immediate and scheduled tasks execute only in the worker.
- Current snapshot, result/error, and append-only history remain consistent.

### Security and data

- Authentication, CSRF, role, ownership, rate-limit, and upload policies still apply.
- Sensitive values are absent from responses, logs, fixtures, documentation, and generated artifacts.
- Database changes use committed migrations, constraints, and matching integration tests.

### Engineering

- Focused tests and the widest relevant quality gates pass.
- Failure and recovery behavior is observable and bounded.
- API and worker shutdown remain graceful.
- Documentation, OpenAPI, configuration examples, and code agree.
- The final diff contains only intended files.

## Remaining release work

- Add a small Playwright suite for login, task creation, live completion, failure/retry, and ownership boundaries.
- Complete a manual keyboard, focus, responsive-layout, and screen-reader status pass.
- Exercise PostgreSQL, Redis, worker, storage, cache, and Socket.IO outage/restart scenarios as a documented matrix.
- Add production object storage, malware scanning, managed secrets, and retention policies before accepting untrusted public uploads.
- Add metrics, tracing, error reporting, dashboards, alerts, and operational runbooks before a managed production rollout.
- Select a deployment provider only after the persistence, storage, TLS, cookie, secret, backup, and monitoring requirements are satisfied.

## Release checklist

- [ ] Product requirements and current limits are accurate.
- [ ] Fresh install, migration, seed, and startup commands work from the README.
- [ ] `pnpm ci:check` passes.
- [ ] `pnpm test:integration:postgres` passes against isolated real infrastructure.
- [ ] `pnpm docker:check` and a clean Compose smoke pass.
- [ ] OpenAPI, Swagger UI, Postman, `.env.example`, migrations, and seed match current behavior.
- [ ] Security-sensitive configuration uses environment/secret management rather than committed values.
- [ ] Known risks and deferred controls are documented without presenting them as complete.
