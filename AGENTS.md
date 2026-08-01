# Repository instructions for AI agents

## Mission and current state

Build TaskForge as a recruiter-reviewed, production-minded task automation platform. Prefer correct, explicit, maintainable code over feature volume or decorative complexity.

The repository is currently documentation-only. Do not assume commands, dependencies, or generated artifacts exist until they appear in the working tree.

## Read before changing

Always read [README.md](README.md), [requirements](docs/requirements.md), and [architecture](docs/architecture.md). Then read only the relevant authority:

- technical rationale: [decisions](docs/decisions.md)
- endpoints and wire behavior: [API](docs/api.md)
- persistence: [database](docs/database.md)
- authentication, authorization, uploads, or secrets: [security](docs/security.md)
- implementation conventions: [coding style](docs/coding-style.md)
- sequencing and completion: [delivery](docs/delivery.md)

Ignored Markdown files in `docs/` are retained long-form drafts. Preserve them, but never link to them from tracked documentation or treat them as repository authority.

## Non-negotiable boundaries

- Use a modular monolith with separately runnable Express API and BullMQ worker processes.
- PostgreSQL owns durable task state and append-only history; Redis owns queue mechanics, refresh sessions, bounded caches, rate limits, and ephemeral status hints.
- HTTP requests never execute task work inline. Workers must tolerate duplicate delivery through deterministic job IDs, execution versions, and conditional database transitions.
- Next.js is the web application; Express is the only business API.
- TanStack Query owns server state, Redux Toolkit owns client-only global state, and URL parameters own list controls.
- Backend policies and persistence predicates enforce roles and ownership. Frontend guards are UX only.
- Uploaded files remain private and access-controlled.

Change an accepted boundary only by updating `docs/decisions.md` with the reason and consequences.

## Implementation rules

- Organize backend code by business module: `auth`, `users`, `tasks`, `files`, and `dashboard`.
- Controllers translate HTTP; services implement use cases; concrete repositories own persistence; executors perform task work.
- Validate every external value at runtime. Do not leak Prisma or BullMQ types into public contracts.
- Avoid generic repositories, dependency-injection frameworks, event buses, or shared helpers without a demonstrated need.
- Preserve unrelated user work and ignored drafts.
- Do not invent setup or test commands before matching root scripts exist.

## Verification and documentation

After scaffolding, canonical root scripts must cover format, lint, strict typecheck, unit tests, PostgreSQL/Redis integration tests, production builds, and Docker validation. Use real infrastructure where mocks cannot prove constraints, sessions, delays, retries, or locks. Avoid fixed sleeps.

Update the owning document in the same change:

| Change | Authority |
| --- | --- |
| Scope or product behavior | `docs/requirements.md` |
| Runtime/module/data flow | `docs/architecture.md`; rationale in `docs/decisions.md` |
| Endpoint or error contract | `docs/api.md` and generated OpenAPI when available |
| Schema, constraint, index, or migration | `docs/database.md` |
| Security control | `docs/security.md` |
| Convention or test policy | `docs/coding-style.md` |
| Phase status | `docs/delivery.md` |

## Git and completion

- Inspect status and exact diff; stage only the requested change.
- Never commit secrets, `.env`, generated uploads, service volumes, debug output, or ignored drafts.
- Keep commits focused and do not weaken checks or invariants to make them pass.
- A change is complete only when behavior, negative paths, authorization, failure handling, tests, and authoritative documentation agree.
