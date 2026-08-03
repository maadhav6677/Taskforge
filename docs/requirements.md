# Product requirements

**Status:** Current product baseline

## Purpose and ownership

This document defines TaskForge product behavior, supported actors, lifecycle rules, quality attributes, and non-goals. Update it whenever a user-visible capability, role, task state rule, or supported product boundary changes.

Implementation detail belongs in [architecture.md](architecture.md) and [system-design.md](system-design.md). HTTP detail belongs in [api.md](api.md).

## Product objective

TaskForge is a multi-user task automation platform. Users submit immediate or scheduled work, a separate Redis-backed worker executes it asynchronously, and the product exposes a durable current state plus append-only execution history.

The product is designed around four outcomes:

- HTTP requests accept work quickly without running background operations inline.
- Users can understand the state, result, and history of every task.
- Retries, duplicate delivery, and temporary queue failures do not corrupt durable state.
- Roles, ownership, sessions, and private files remain enforced by the backend.

## Actors

### User

- Register, sign in, refresh a session, and sign out.
- Access only owned tasks, events, dashboard counts, and files.
- Create, search, filter, sort, paginate, update, delete, schedule, inspect, and retry eligible tasks.

### Admin

- Read system-wide task lists and aggregate status through explicit admin routes.
- Remain read-only until separate mutation and audit rules are designed.
- Cannot be created through public registration; deterministic seed or controlled configuration creates admin identities.

## Platform constraints

| Concern           | Current choice                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Web               | Next.js 16, React 19, strict TypeScript, responsive accessible components                                     |
| Browser state     | TanStack Query for server state; Redux Toolkit for client-only global state; URL parameters for list controls |
| API               | Node.js 24 LTS, Express, versioned REST, Zod runtime validation                                               |
| Data              | PostgreSQL 18, Prisma, committed migrations, deterministic seed                                               |
| Jobs              | BullMQ on Redis with a separately runnable worker                                                             |
| Redis             | Queue mechanics, refresh sessions, rate limits, bounded cache, status Pub/Sub                                 |
| Authentication    | HttpOnly access JWT, rotating refresh session, CSRF, `USER`/`ADMIN` RBAC                                      |
| Runtime packaging | pnpm workspace, Dockerfiles, Docker Compose, GitHub Actions                                                   |

The reasoning behind these choices and rejected alternatives lives in [decisions.md](decisions.md).

## Functional behavior

### Authentication and authorization

- Registration, login, refresh, logout, and Argon2id password hashing.
- Short-lived JWT access authentication with revocable rotating refresh sessions.
- Server-enforced `USER` and `ADMIN` roles plus resource ownership.
- Cross-owner resource identifiers do not reveal whether another user's resource exists.

### Dashboard

- Total, pending, processing, completed, and failed task counts.
- Recent task and queue context scoped to the current user or explicit admin view.
- Cache is an optimization; dashboard results remain available from PostgreSQL when cache is unavailable.

### Tasks

- Create, read, update, soft-delete, one-time schedule, history, and manual retry.
- Search title and description with allowlisted filters and sorting plus bounded pagination.
- Public statuses are exactly `PENDING`, `PROCESSING`, `COMPLETED`, and `FAILED`.
- A future task remains `PENDING`; `scheduledAt` is execution metadata, not a separate status.

### Queue execution

- The API persists and dispatches; it never executes task work inline.
- The worker validates the job, conditionally claims the current execution, and records every meaningful transition.
- Transient failures use bounded automatic retries with exponential backoff.
- Deterministic job IDs, execution versions, and conditional writes prevent stale or duplicate delivery from executing the current task twice.
- Reconciliation redispatches durable pending work after a temporary queue failure.

### Files

- Accept verified JPEG, PNG, WebP, and PDF attachments within count and size limits.
- Verify magic bytes instead of trusting filenames or browser MIME values.
- Store bytes privately and authorize every download through the owning task.
- Keep the local storage adapter replaceable by an object-storage implementation.

### Live updates

- Authenticated Socket.IO events contain minimal status-change hints.
- Events trigger query invalidation and canonical API refetch; they do not replace durable state.
- Refocus, reconnect, and interval refetch preserve correctness if events are missed.

## Initial task types

- `TEXT_PROCESSING`: deterministic allowlisted text transformation and analysis.
- `FILE_INSPECTION`: verified type, size, metadata, and SHA-256 inspection for supported images and PDFs.

TaskForge does not execute arbitrary user code, commands, URLs, or templates.

## Lifecycle rules

- Only `PENDING` tasks may change input, attachments, or schedule.
- Updating or deleting `PROCESSING` tasks returns `409 Conflict` because cancellation is not guaranteed.
- Deleting a pending task removes its queued job where possible and soft-deletes the durable record.
- Completed and failed tasks may be soft-deleted while history remains auditable.
- Automatic attempts stay within one execution version.
- Manual retry is allowed only from `FAILED`, increments the execution version, clears execution fields, and records an event.
- Browser-facing update, delete, and retry operations require the current row version through `If-Match`.
- History is append-only and explains the current state without exposing stacks, paths, credentials, or dependency internals.

## Sources of truth

- PostgreSQL owns user-visible identity, task state, results, attachment metadata, and history.
- BullMQ owns waiting, delayed, active, attempt, and lock mechanics.
- Redis session state controls refresh validity; cache and Pub/Sub remain ephemeral.
- File storage owns private bytes; PostgreSQL owns their authorized metadata relationship.

## Quality attributes

### Correctness and reliability

- Snapshot and history transitions commit atomically.
- Queue delivery is treated as at-least-once.
- Infrastructure failures produce bounded, observable recovery behavior.
- API and worker processes shut down gracefully.

### Security and privacy

- Runtime validation applies at every external boundary.
- Backend authorization scopes all protected reads and mutations.
- Cookies, tokens, passwords, connection URLs, raw files, and internal stacks never appear in public output or logs.
- Uploaded files remain outside public web roots.

### Developer experience

- A fresh clone can run through documented Node/pnpm and Docker commands.
- Root scripts cover formatting, linting, strict type checking, tests, builds, integration checks, and container validation.
- OpenAPI, Swagger UI, `.env.example`, migrations, deterministic seed data, and a secret-free Postman collection stay synchronized with behavior.
- Architectural and behavioral changes update their owning documentation in the same change.

### User experience

- The web application is responsive and keyboard-usable.
- Remote workflows expose loading, empty, no-results, error, conflict, unauthorized, and success states.
- Status meaning is not communicated through color alone.

## Current delivery boundaries

Implemented product scope includes Next.js, PostgreSQL, the Express API, BullMQ worker, Redis sessions/cache/rate limits/Pub/Sub, private local file storage, Jest/Supertest/React Testing Library suites, Docker Compose, and CI configuration.

Public deployment is optional and should be added only with reliable persistent PostgreSQL, Redis, private object storage, secure cookies, secret management, and operational monitoring.

## Non-goals

- Business microservices, Kubernetes, CQRS, event sourcing, or a workflow definition language.
- Arbitrary user code, recurring schedules, task dependencies, priorities, or an integration marketplace.
- Organizations, billing, social login, MFA, password recovery, or email verification.
- A large design system, production malware-analysis infrastructure, or a full telemetry platform.

These boundaries keep the current product focused. Moving an item into active scope requires corresponding requirements, architecture, security, tests, and delivery updates.
