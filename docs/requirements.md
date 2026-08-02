# Product requirements

**Status:** Accepted baseline

## Outcome

TaskForge is a multi-user task automation micro-SaaS. Users create immediate or future tasks, a separate Redis-backed worker executes them, and the product exposes durable current state and append-only history.

The assessment values architecture, production-quality code, and clear decisions over feature count.

## Actors

### User

- Register, log in, refresh the session, and log out.
- Access only owned tasks, events, dashboard counts, and files.
- Create, search, filter, sort, paginate, update, delete, schedule, inspect, and retry eligible tasks.

### Admin

- Read system-wide tasks and aggregate status through explicit admin routes.
- Cannot be created through public registration; seed/configuration creates the assessment admin.

## Required stack

| Concern       | Choice                                                               |
| ------------- | -------------------------------------------------------------------- |
| Web           | Next.js 16, React 19, strict TypeScript, responsive components       |
| Browser state | Redux Toolkit for client state; TanStack Query for server state      |
| API           | Node.js 24 LTS, Express, versioned REST                              |
| Data          | PostgreSQL 18, Prisma, migrations, deterministic seed                |
| Jobs          | BullMQ on Redis; separate asynchronous worker                        |
| Redis         | Queue, refresh sessions, hot-read cache, rate limits, status Pub/Sub |
| Auth          | Access JWT, refresh flow, Admin/User RBAC, password hashing          |
| Delivery      | Dockerfiles, Compose, public GitHub repository                       |

PostgreSQL and Next.js are explicitly preferred assessment options. Details and rejected alternatives live in [decisions.md](decisions.md).

## Required behavior

### Authentication and authorization

- Registration, login, refresh, logout, and strong password hashing.
- Short-lived JWT access authentication with revocable rotating refresh sessions.
- Server-enforced `USER` and `ADMIN` roles plus resource ownership.

### Dashboard

- Total, pending, completed, and failed task counts.
- Queue status summary; processing count may be additional context.

### Tasks

- Create, read, update, delete, one-time schedule, history, and manual retry.
- Search title/description; allowlisted filters and sorting; bounded pagination.
- Public statuses are exactly `PENDING`, `PROCESSING`, `COMPLETED`, and `FAILED`.
- A future task remains `PENDING`; scheduling is secondary metadata.

### Queue execution

- API persists and dispatches; it never executes task work inline.
- Worker updates state automatically and records every meaningful transition.
- Transient failures use bounded automatic retries with exponential backoff.
- Duplicate/stale deliveries cannot execute the current task twice.

### Files

- Accept verified supported images and PDFs within count/size limits.
- Store privately and authorize every download.
- Initial local storage is allowed; object storage is a future adapter.

### Engineering quality

- Correct HTTP statuses, runtime validation, centralized errors/responses, structured logging, middleware, and API documentation.
- Database relationships, constraints, indexes, migrations, and consistent seed data.
- Modular backend, reusable accessible UI, rate limiting, security controls, lazy loading where useful, and environment validation.
- Jest unit/API tests are preferred and will be included.

## Product rules

### Initial job types

- `TEXT_PROCESSING`: deterministic allowlisted transformation/analysis.
- `FILE_INSPECTION`: verified type, size, metadata, and SHA-256 for images/PDFs.

This demonstrates real asynchronous work without paid APIs or arbitrary user code.

### Lifecycle

- Only pending tasks may change input, attachments, or schedule.
- Processing tasks return `409 Conflict` for update/delete because cancellation is not guaranteed.
- Deleting a pending task removes its queued job and soft-deletes the record.
- Completed/failed tasks may be soft-deleted while history remains auditable.
- Automatic attempts stay within one execution version.
- Manual retry is allowed only from `FAILED`, increments execution version, and records an event.
- History is append-only and must explain current state without exposing stacks, paths, or secrets.

### Sources of truth

- PostgreSQL owns user-visible state and history.
- BullMQ owns waiting/delayed/active/attempt mechanics.
- Caches and Socket.IO are optional delivery optimizations; durable state remains reconstructable without them.

## Preferred and bonus scope

Included preferred work:

- Next.js, PostgreSQL, concrete module repositories, Jest unit/API tests.

Bonus after the core is stable:

- Socket.IO live status updates.
- GitHub Actions quality gates.
- Optional public deployment only if persistent infrastructure is reliable and secure.

## Submission artifacts

- Public repository with focused incremental history.
- Complete README, Docker/Compose, `.env.example`, migrations, seed, OpenAPI/Swagger, and verified Postman collection.
- Five-to-ten-minute public walkthrough covering architecture, structure, auth, queue, Redis, database, decisions, and future work.
- Optional live demo.

## Evaluation priorities

Code quality and architecture are 20% each; backend and frontend engineering are 15% each; database and Redis/queue are 10% each. Documentation, Git, and video make up the remaining 10%. Core engineering therefore takes priority over bonus polish.

## Non-goals

- Business microservices, Kubernetes, CQRS, event sourcing, or a workflow language.
- Arbitrary user code, recurring schedules, dependencies, priorities, or integration marketplace.
- Organizations, billing, social login, MFA, recovery, or email verification.
- Large design system, production malware infrastructure, or full telemetry stack.
