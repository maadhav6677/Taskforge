# Architecture decision log

**Status:** Active

## Usage

These are accepted constraints. Before implementing an alternative, add or update a decision with the new context, consequences, and migration effect. Superseded decisions remain visible.

## Accepted decisions

### D-001 — Modular monolith, separate runtimes

Use one business codebase with separate Express API and BullMQ worker entry points/services. It gives independent worker scaling without distributed-domain overhead.

### D-002 — Next.js web, Express business API

Next.js owns web routing/rendering; Express owns all business APIs. Splitting auth/validation/use cases across Next handlers and Express would create competing authorities.

### D-003 — PostgreSQL and Prisma

Preferred PostgreSQL over MongoDB for ownership, constraints, transactional lifecycle/history, and indexed aggregates. Use Prisma with reviewed migrations and JSONB only for versioned task input/result.

### D-004 — BullMQ

Use BullMQ rather than hand-built Redis lists because delays, retries, locks, stalled recovery, concurrency, and retention are core mechanics. Application code still owns public state and idempotency.

### D-005 — Browser state separation

TanStack Query owns remote resources, Redux Toolkit owns client-only global state, and URL parameters own list controls. Never duplicate task resources across caches.

### D-006 — Stateful refresh sessions

Use a short-lived HttpOnly access JWT plus rotating opaque refresh credentials hashed in Redis. This satisfies JWT/Redis requirements while supporting logout, revocation, and reuse detection; cookie mutations require CSRF protection.

### D-007 — Task row as dispatch ledger

Persist task/event, enqueue deterministic job, then record dispatch. Reconcile pending undispatched executions after Redis failure. Defer a full transactional outbox until multiple durable consumers or external side effects require it.

### D-008 — Local storage adapter first

Use private local storage and a shared API/worker volume for the assessment. Keep a storage interface for later S3-compatible storage, signed downloads, retention, and scanning.

### D-009 — Deterministic job types

Start with `TEXT_PROCESSING` and `FILE_INSPECTION`. They demonstrate real, testable async work without paid APIs, random behavior, or arbitrary user code.

### D-010 — Offset pagination

Use bounded page/page-size pagination with stable tie-breakers and indexes because arbitrary sorting and visible page controls are required. Move high-volume feeds to per-sort cursors only when needed.

### D-011 — One Redis service locally

Use one namespaced, persistent `noeviction` Redis in Compose with separate concern-specific connections. Split queue Redis from cache/session Redis in production.

### D-012 — pnpm workspaces only

Use pinned pnpm workspaces for web, API, and shared contracts. Nx/Turborepo adds configuration before the small build graph needs orchestration/caching.

### D-013 — Zod wire contracts and OpenAPI

Use shared serializable Zod schemas for runtime validation/type inference and derive OpenAPI registration. Keep Prisma entities, BullMQ payloads, authorization, and internal errors private.

### D-014 — Concrete repositories

Use module-specific repositories for ownership queries, transitions, and persistence boundaries. Do not create a generic `BaseRepository<T>` that hides Prisma features.

### D-015 — Real infrastructure integration tests

Use Jest/Supertest plus real PostgreSQL and Redis for constraints, sessions, delayed jobs, retries, locks, and reconciliation. Add a small Playwright critical-flow suite after core stability.

## Deferred decisions

Create a new decision only when implementation evidence requires choosing among real alternatives, such as deployment provider, production object storage, split Redis topology, telemetry, or cursor pagination.
