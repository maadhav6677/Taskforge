# Guide for contributors and coding agents

## Purpose

Use this file to choose the right source of truth, preserve TaskForge invariants, verify changes, and keep documentation synchronized with code.

Follow the user request first. If the request conflicts with implemented behavior or an accepted boundary, report the conflict before changing architecture.

## Read before changing

Always read [README.md](README.md), [product requirements](docs/requirements.md), and [architecture](docs/architecture.md). Then read the focused document for the affected area:

| Area                                   | Source of truth                              |
| -------------------------------------- | -------------------------------------------- |
| Product behavior and lifecycle         | [docs/requirements.md](docs/requirements.md) |
| Runtime flow and technical decisions   | [docs/architecture.md](docs/architecture.md) |
| HTTP and realtime contracts            | [docs/api.md](docs/api.md)                   |
| Schema, transactions, migrations, seed | [docs/database.md](docs/database.md)         |
| Auth, authorization, uploads, secrets  | [docs/security.md](docs/security.md)         |

Ignored Markdown files under `docs/` are historical drafts. Preserve them, never link to them, and never treat them as current authority.

## System boundaries

- Next.js is the web application; Express is the only business API.
- The API persists and dispatches tasks; it never executes task work inline.
- The API and BullMQ worker are separate runtimes from the same modular backend.
- PostgreSQL owns durable task state, results, attachments, and append-only history.
- Redis owns queue mechanics, refresh sessions, rate limits, bounded cache, and Pub/Sub hints.
- Workers assume at-least-once delivery and use deterministic job IDs, execution versions, and conditional database transitions.
- Backend policies and repository predicates enforce roles and ownership. Frontend guards are presentation only.
- Uploaded files stay private and require authorization for every download.
- TanStack Query owns server state, Redux owns client-only global state, URL parameters own list controls, and React Hook Form/local state owns forms.

## Change workflow

1. Run `git status --short`; preserve unrelated work.
2. Read the owning docs, implementation, tests, scripts, and configuration.
3. Identify lifecycle, authorization, concurrency, and failure behavior affected by the change.
4. Implement the smallest compatible change in the owning module.
5. Add focused positive and negative tests.
6. Update the owning tracked document when behavior or a contract changes.
7. Run focused checks, then the widest relevant check.
8. Inspect `git diff --check`, `git status`, and the final diff before handoff.

## Implementation rules

### Backend

- Organize by business module: `auth`, `users`, `tasks`, `files`, `dashboard`, and explicit operational modules.
- Routes/controllers translate HTTP; services own use cases; repositories own persistence; executors perform validated task work.
- Validate all external input, queue payloads, and persisted JSON at runtime.
- Keep Prisma and BullMQ types out of public contracts.
- Persist task snapshot and history changes in one transaction.
- Prefer explicit composition over generic repositories, dependency-injection frameworks, or global helper collections.

### Frontend

- Do not mirror API resources in Redux.
- Keep list filters, sorting, search, and pagination in the URL.
- Cover loading, empty, error, conflict, unauthorized, and success states.
- Use semantic HTML, labels, visible focus, keyboard-safe dialogs, and status meaning beyond color.
- Treat Socket.IO as an invalidation hint and refetch canonical API state.

### Security and data

- Scope user queries by owner in the database predicate.
- Public registration creates only `USER`; admin access uses explicit policies and routes.
- Apply the documented cookie, CSRF, CORS, validation, rate-limit, and upload controls.
- Never expose passwords, hashes, cookies, tokens, connection URLs, raw files, storage paths, or internal stacks.
- Use committed Prisma migrations; never replace migration history with `db push`.

## Verification

| Change                | Minimum check                                                         |
| --------------------- | --------------------------------------------------------------------- |
| Markdown              | Prettier on changed files and `git diff --check`                      |
| Contracts             | Contract tests, typecheck, affected builds                            |
| API                   | API lint, typecheck, tests, build                                     |
| Database/Redis/worker | Focused tests and `pnpm test:integration:postgres`                    |
| Web                   | Web lint, typecheck, tests, build                                     |
| Cross-workspace       | `pnpm ci:check`                                                       |
| Containers            | `pnpm docker:check` and a Compose smoke when runtime behavior changes |

Use real PostgreSQL and Redis where mocks cannot prove constraints, sessions, delays, retries, locks, or duplicate delivery. Prefer fake clocks for pure logic and bounded polling for worker tests.

## Documentation ownership

| Change                                                           | Update                           |
| ---------------------------------------------------------------- | -------------------------------- |
| Setup, environment, stack, folder structure, trade-offs, roadmap | `README.md`                      |
| Product behavior or lifecycle                                    | `docs/requirements.md`           |
| Runtime flow or technical decision                               | `docs/architecture.md`           |
| Endpoint, error, header, or event                                | `docs/api.md` and OpenAPI source |
| Schema, migration, index, seed, transaction                      | `docs/database.md`               |
| Security control or trust boundary                               | `docs/security.md`               |

## Git and completion

- Stage explicit paths only; do not commit secrets, `.env`, uploads, generated output, volumes, coverage, debug files, or ignored drafts.
- Do not reset, delete, commit, push, or open a pull request unless the task authorizes it.
- Never weaken checks, authorization, constraints, or recovery behavior to make tests pass.
- A change is complete when behavior, negative paths, tests, docs, and the final diff agree.
