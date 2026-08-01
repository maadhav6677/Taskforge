# Delivery plan

**Status:** Active; Phase 1 baseline scaffolded, implementation phase 2 not started

## Strategy

Build one verified vertical capability at a time and keep milestone commits runnable. Prove backend/domain behavior before frontend polish depends on it. Start bonus work only after mandatory behavior is secure, tested, documented, and reproducible.

## Priorities

- **P0:** mandatory stack, auth, task lifecycle, worker, Redis uses, database/UI quality, Docker, required artifacts/video.
- **P1:** idempotency/reconciliation, meaningful tests, upload safety, accessibility, logs, graceful shutdown, CI.
- **P2:** Socket.IO polish, small E2E suite, optional deployment.

Deployment is the first item dropped if reliability is uncertain.

## Phases

| Phase | Outcome | Gate |
| ---: | --- | --- |
| 0 | Requirements, architecture, decisions, contracts | Complete |
| 1 | pnpm workspace; Next/Express API+worker; TS/lint/test/config/log/health baseline | Root install/check/test/build works; runtimes start separately |
| 2 | Prisma/PostgreSQL schema, constraints, indexes, migrations, seed | Empty DB migrates/seeds; repository integration tests pass |
| 3 | Argon2id auth, access JWT, Redis refresh rotation, CSRF/CORS/RBAC | Rotation/revocation/negative authorization tests pass |
| 4 | Task state policy, CRUD/history/list/admin REST and OpenAPI | Lifecycle, ownership, pagination, status/error contract tests pass |
| 5 | BullMQ worker, scheduling, retries, idempotency, reconciliation | Async/delay/retry/duplicate/outage integration tests pass |
| 6 | Private uploads and file-inspection executor | Type/size/path/ownership/cleanup tests pass |
| 7 | Frontend auth shell and dashboard | Session, responsive, keyboard, loading/error states verified |
| 8 | Task list/create/detail/edit/delete/retry/history UI | URL state, conflicts, all lifecycle UI states verified |
| 9 | Bounded caches and authenticated Socket.IO hints | Scope/invalidation/outage/reconnect tests pass |
| 10 | Full hardening, Docker, CI, OpenAPI/Postman, README, video | Clean-room setup and public submission checklist pass |

Update phase status here only when its gate passes. File creation alone is not completion.

## Milestone details

### Foundation (Phases 1–2)

- Pin Node/pnpm/dependencies and commit lockfile.
- Establish strict quality scripts shared with CI.
- Create separate API/worker composition roots and shared wire contracts.
- Implement the schema described in [database.md](database.md), including deterministic development user/admin and representative task history.

Suggested commits:

- `chore: scaffold typed web and api workspaces`
- `feat(db): add task lifecycle schema and seed data`

### Backend core (Phases 3–6)

- Implement [security](security.md), then task REST contracts, then asynchronous execution and files.
- Keep queue behind the task use-case boundary; never execute inline.
- Verify real PostgreSQL/Redis behavior before building dependent screens.

Suggested commits:

- `feat(auth): add rotating sessions and role-based access`
- `feat(tasks): add authorized lifecycle APIs and history`
- `feat(queue): process and reconcile scheduled tasks`
- `feat(files): add secure attachments and inspection jobs`

### Frontend (Phases 7–8)

- Establish state ownership before feature screens.
- Build task workflows against stable contracts.
- Treat responsive/accessibility/edge states as acceptance, not final polish.

Suggested commits:

- `feat(web): add accessible auth shell and dashboard`
- `feat(web): add responsive task lifecycle workflows`

### Optimization/submission (Phases 9–10)

- Add cache/live status as recoverable optimizations.
- Run full threat, accessibility, clean Compose, and fresh-database checks.
- Generate/verify required documentation artifacts and record video last.

Suggested commits:

- `feat(realtime): cache and stream task status`
- `test: cover auth task and worker critical paths`
- `chore(docker): add reproducible production containers`
- `ci: verify quality gates and container builds`
- `docs: finalize evaluation and API guide`

## Verification order

After canonical scripts exist:

1. Format/lint changed workspace.
2. Strict typecheck.
3. Focused unit tests.
4. Relevant real PostgreSQL/Redis integration tests.
5. Changed runtime's production build.
6. Complete non-E2E suite before milestone commit.
7. Full CI-equivalent, clean Compose, and E2E smoke before submission.

Use fake clocks for pure time logic and bounded polling for workers; never fixed multi-second synchronization sleeps.

## Primary risks

| Risk | Control |
| --- | --- |
| Cookie/CORS deployment mismatch | Real browser-origin integration during auth phase |
| Database/queue drift | Deterministic IDs, execution version, conditional claims, reconciliation |
| Flaky queue tests | Injected clocks and bounded condition polling |
| File/database divergence | Temporary storage plus compensation/cleanup |
| Mixed Redis pressure | TTLs, bounded retention, noeviction; production split documented |
| Duplicate browser state | Enforce Query/Redux/URL ownership |
| Bonus scope threatens core | P0/P1 gates; drop deployment/live polish first |
| Documentation drift | Owning doc updated in same change |

## Definition of done

### Product

- Auth/session/RBAC and user isolation work.
- Immediate/scheduled tasks execute only in worker; lifecycle/history/retries remain truthful.
- Dashboard, list controls, files, and responsive accessible UI meet [requirements](requirements.md).

### Engineering

- Fresh migration/seed and clean Compose succeed.
- Duplicate delivery, dispatch failure, security negatives, and infrastructure failure paths have tests.
- Logs are structured/redacted; API/worker shut down cleanly.
- Local and public CI quality gates pass.

### Submission

- Public repository has focused incremental history.
- README, `.env.example`, Docker, migrations, seed, OpenAPI, and verified Postman collection are accurate.
- Public 5–10-minute video covers architecture, structure, auth, queue, Redis, database, decisions, live lifecycle, tests, and trade-offs.
- Live URL is included only if stable and secure.
