# Repository guide for contributors and coding agents

## Purpose

This file defines how humans and automated coding agents should work in TaskForge. It identifies the authoritative documents, architectural boundaries, expected workflow, verification commands, and completion rules.

Follow the user request first, then this guide, then the owning technical document. If instructions conflict with the current code, stop and report the mismatch instead of silently changing an accepted boundary.

## Project mission and current state

TaskForge is a production-minded task automation platform. Authenticated users create immediate or scheduled tasks; an Express API persists and dispatches them; a separate BullMQ worker executes them; and the Next.js application presents durable state and append-only history.

The core local product is implemented. Public deployment, object storage, malware scanning, full browser E2E coverage, and production observability remain explicit follow-up work.

Prefer correct, explicit, maintainable behavior over feature volume, abstraction count, or decorative complexity. Do not assume a command, dependency, generated artifact, or service exists until it appears in the working tree.

## Source-of-truth map

Always read [README.md](README.md), [product requirements](docs/requirements.md), and [architecture](docs/architecture.md) before making a behavioral change. Then read the authority that owns the affected contract:

| Concern                                                  | Authoritative document                         |
| -------------------------------------------------------- | ---------------------------------------------- |
| Product scope, actors, lifecycle rules, non-goals        | [docs/requirements.md](docs/requirements.md)   |
| Runtime boundaries, module flow, source-of-truth rules   | [docs/architecture.md](docs/architecture.md)   |
| Implemented components, algorithms, and failure mapping  | [docs/system-design.md](docs/system-design.md) |
| Accepted technical choices and trade-offs                | [docs/decisions.md](docs/decisions.md)         |
| HTTP, errors, cookies, pagination, and realtime events   | [docs/api.md](docs/api.md)                     |
| Schema, constraints, indexes, transactions, migrations   | [docs/database.md](docs/database.md)           |
| Authentication, authorization, uploads, secrets, logging | [docs/security.md](docs/security.md)           |
| TypeScript, module, frontend, test, and Git conventions  | [docs/coding-style.md](docs/coding-style.md)   |
| Delivery status, risks, release gates, remaining work    | [docs/delivery.md](docs/delivery.md)           |

Ignored Markdown files in `docs/` are retained historical drafts. Preserve them, do not link to them from tracked documentation, and do not treat them as current project authority.

## Start-of-task checklist

Before editing:

1. Run `git status --short` and inspect existing changes. Treat unrelated changes as user-owned.
2. Read the source-of-truth documents for the requested area.
3. Locate the implementation, tests, scripts, configuration, and generated-contract source involved.
4. Confirm current behavior from code or tests; do not rely on filenames or stale comments.
5. Identify negative paths, authorization rules, failure recovery, and documentation impact.
6. Keep the change within the requested scope. Ask before expanding into a materially different product or infrastructure decision.

## Non-negotiable system boundaries

- Use a modular monolith with separately runnable Express API and BullMQ worker processes.
- PostgreSQL owns durable user-visible task state, results, attachment metadata, and append-only history.
- Redis owns BullMQ mechanics, refresh sessions, rate limits, bounded caches, and ephemeral Pub/Sub hints. It is not durable product truth.
- HTTP requests persist and dispatch work; they never execute task work inline.
- Workers tolerate at-least-once delivery through deterministic job IDs, execution versions, conditional claims, and conditional finalization.
- Next.js is the web application. Express is the only business API.
- TanStack Query owns server state, Redux Toolkit owns client-only global state, URL parameters own list controls, and React Hook Form/local state owns forms and dialogs.
- Backend policies and persistence predicates enforce roles and ownership. Frontend guards are presentation only.
- Uploaded files remain private, use opaque storage keys, and require authorization for every download.

Change an accepted boundary only when the task requires it. Update [docs/decisions.md](docs/decisions.md) with the new context, decision, consequences, and migration path in the same change.

## Repository map

```text
apps/
├── api/
│   ├── prisma/                 # schema, migrations, deterministic seed
│   └── src/
│       ├── bootstrap/          # API and worker composition roots
│       ├── infrastructure/     # PostgreSQL, Redis, BullMQ, storage, logging
│       ├── modules/            # auth, users, tasks, files, dashboard, admin
│       └── openapi/            # generated/served API description
└── web/src/
    ├── app/                    # Next.js routes and global presentation
    ├── components/             # user-facing application components
    ├── lib/                    # API client and presentation types
    ├── providers/              # Query and Redux providers
    └── store/                  # client-only global UI state
packages/contracts/             # runtime-safe shared Zod contracts
postman/                        # secret-free API smoke collection
docs/                           # authoritative engineering documentation
```

## Implementation rules

### Backend

- Organize code by business module: `auth`, `users`, `tasks`, `files`, `dashboard`, and explicit operational modules.
- Controllers/routes translate HTTP. Services implement use cases and policy. Concrete repositories own persistence. Executors perform validated task work.
- Validate every external value at runtime, including queue payloads and persisted JSONB.
- Do not leak Prisma or BullMQ models into public API or shared wire contracts.
- Prefer explicit module composition over dependency-injection frameworks, generic repositories, event buses, or global helper collections.
- Preserve task snapshot and event consistency in one database transaction.
- Classify executor failures as transient or permanent and keep public errors sanitized.

### Frontend

- Keep server resources in TanStack Query; never mirror task data in Redux.
- Keep search, filters, sorting, and pagination in URL parameters.
- Use semantic HTML, associated labels, keyboard-safe dialogs, visible focus, accessible status/error text, and responsive layouts.
- Implement loading, empty, no-results, error, conflict, unauthorized, and success states for every remote workflow.
- Treat Socket.IO as an invalidation hint; refetch canonical API state after events and reconnects.

### Security and data

- Scope user queries by owner in the repository predicate; do not fetch broadly and filter afterward.
- Public registration creates only `USER`; admin access uses explicit routes and policies.
- Mutations require the documented cookie, CSRF, CORS, validation, and rate-limit controls.
- Never log or return passwords, hashes, cookies, tokens, connection URLs, raw file bytes, storage paths, or internal stacks.
- Use reviewed Prisma migrations; never replace migration history with `db push`.

## Change workflow

1. **Inspect:** understand existing behavior, related tests, and current documentation.
2. **Design:** name the invariant being preserved and the smallest compatible change.
3. **Implement:** change the owning module without broad cleanup or unrelated formatting.
4. **Test:** add positive, negative, authorization, concurrency, and recovery coverage in proportion to risk.
5. **Document:** update the owning tracked document whenever behavior or a contract changes.
6. **Verify:** run focused checks first, then the widest relevant root checks.
7. **Review:** inspect `git diff --check`, `git status`, and the exact diff before handing off.

## Verification matrix

Use existing root scripts; do not invent replacement commands.

| Change scope                   | Minimum verification                                                  |
| ------------------------------ | --------------------------------------------------------------------- |
| Markdown only                  | `pnpm exec prettier --check <files>` and `git diff --check`           |
| Shared contracts               | `pnpm --filter @taskforge/contracts test`, typecheck, affected builds |
| API unit/HTTP behavior         | API lint, typecheck, tests, and build                                 |
| Database/Redis/worker behavior | Focused tests plus `pnpm test:integration:postgres`                   |
| Web behavior                   | Web lint, typecheck, tests, and production build                      |
| Cross-workspace or pre-merge   | `pnpm ci:check`                                                       |
| Container/runtime topology     | `pnpm docker:check`; clean Compose smoke when behavior changed        |

Use real PostgreSQL and Redis where mocks cannot prove constraints, sessions, delays, retries, locks, or duplicate delivery. Use fake clocks for pure time logic and bounded polling for workers; avoid fixed multi-second sleeps.

## Documentation ownership

Update the owning document in the same change:

| Change                                           | Documentation update                                     |
| ------------------------------------------------ | -------------------------------------------------------- |
| Product behavior or supported scope              | `docs/requirements.md`                                   |
| Runtime/module/data flow                         | `docs/architecture.md`; rationale in `docs/decisions.md` |
| Implemented component or algorithm               | `docs/system-design.md`                                  |
| Endpoint, status, error, or event contract       | `docs/api.md` and OpenAPI source                         |
| Schema, constraint, index, migration, or seed    | `docs/database.md`                                       |
| Security control or trust boundary               | `docs/security.md`                                       |
| Implementation or test convention                | `docs/coding-style.md`                                   |
| Delivery status, release risk, or readiness gate | `docs/delivery.md`                                       |
| Setup, service commands, or operator entry point | `README.md`                                              |

Keep documentation factual and project-oriented. Describe current behavior, decisions, limits, and next steps without tailoring the content to a temporary external audience.

## Git and worktree safety

- Preserve unrelated user changes and ignored drafts.
- Stage explicit paths only; do not use `git add -A` in a mixed worktree.
- Never commit `.env`, secrets, generated clients, uploads, service volumes, coverage, debug output, or ignored drafts.
- Do not rewrite, reset, delete, commit, push, or open a pull request unless the task authorizes that action.
- Keep commits focused and use messages that describe the behavior or documentation changed.
- Never weaken checks, constraints, authorization, or failure handling merely to make a test pass.

## Completion checklist

A change is complete only when:

- requested behavior works and incompatible behavior is rejected;
- ownership, role, lifecycle, concurrency, and failure rules still hold;
- tests cover the important positive and negative paths;
- relevant builds and integration checks pass;
- public errors and logs remain sanitized;
- authoritative docs and generated contracts agree with the code;
- the final diff contains only intended files and no secrets or generated noise.
