# Coding and quality conventions

**Status:** Accepted baseline; tooling enforcement pending

Write the smallest explicit implementation that preserves product invariants. Readability, testability, and failure behavior matter more than pattern count or clever brevity.

## Automated standards

- Prettier is the only formatter; ESLint uses flat configuration.
- Strict TypeScript applies to every workspace; enable stronger indexed/optional checks where compatible.
- Root scripts and CI run the same format, lint, typecheck, test, and build commands.
- Narrowly suppress a rule only with a reason; never weaken repository-wide checks for one dependency.

## TypeScript and naming

- Treat external data as `unknown` until runtime validation; do not use `any` as a shortcut.
- Infer local types and annotate public/non-obvious boundaries.
- Use discriminated unions for task inputs/results and `import type` for type imports.
- Prefer named exports except framework-required files.
- Avoid unsafe non-null assertions and public Prisma/BullMQ types.
- Use `PascalCase` exports for components/classes, `camelCase` functions/variables, and `kebab-case` non-framework filenames.
- Use precise domain names; avoid vague `utils`, `helpers`, `manager`, or `common` dumping grounds.

## Control flow and modules

- Guard invalid input/state early; keep the successful path readable.
- Separate pure transition/calculation logic from I/O.
- Catch only to translate, add context, compensate, classify, or recover; throw `Error` objects.
- Avoid ambiguous boolean parameters and hidden I/O in getters, serializers, or React render.
- Do not ignore promises without explicit observable fire-and-forget behavior.

Backend responsibilities:

- controllers: HTTP translation;
- services/use cases: policy, lifecycle, transaction/orchestration;
- concrete repositories: persistence queries;
- infrastructure adapters: Prisma, Redis, BullMQ, storage, logging;
- executors: validated task input to validated result.

Add interfaces only at meaningful seams or with multiple implementations. No automatic interface/class pair or generic base repository.

## Configuration and API

- Read/validate environment variables once into typed immutable configuration; modules do not read `process.env` ad hoc.
- Follow [api.md](api.md) for statuses/envelopes and [security.md](security.md) for auth/input/logging controls.
- Serializers explicitly select public fields; never spread ORM records into responses.
- Authorization scope belongs in persistence/policy paths, not just controllers.
- Map query sorts/filters from allowlists.

## Persistence and queue

- Follow [database.md](database.md); review every migration as SQL and never deploy with `db push`.
- Use transactions when task snapshot/history must agree and conditional updates for lifecycle/concurrency.
- Avoid N+1 reads and unexplained raw SQL/indexes.
- Use separate Redis connections for queue, request cache/session, publisher, and subscriber roles.
- Every application Redis key has a prefix and TTL/bounded lifecycle.
- Queue payloads are minimal/versioned, job IDs deterministic, and errors classified permanent/transient.
- Close API, workers, Prisma, queues, and Redis gracefully.

## Frontend

- Organize by feature; shared components require real reuse.
- TanStack Query owns API resources, Redux client-only global state, URL parameters list state, and React Hook Form local form state.
- Centralize query-key factories and mutation invalidation.
- Use server components for static/layout work and client components only for interaction/browser state.
- Dynamic-import only meaningful heavy route features.
- Cover loading, empty, no-results, error, unauthorized/conflict, and success states.
- Preserve semantic markup, labels/errors, keyboard focus, contrast, reduced motion, and status meaning beyond color.
- Use a small token/primitive layer; avoid an unedited generic dashboard aesthetic or decorative complexity.

## Errors, logs, and comments

- Domain errors have stable safe codes; infrastructure causes stay internal.
- Use structured Pino logging, not committed `console.log`.
- Log once at the layer with context; carry request/task/job/execution identifiers and redact per `security.md`.
- Comments explain invariants, races, and trade-offs—not syntax.
- Remove commented-out code. TODOs need a concrete issue/reason and cannot remain on mandatory paths.

## Tests

- Unit: transitions, validation, executors, auth helpers, query parsing, cache invalidation.
- Integration with real PostgreSQL/Redis: repositories, migrations, ownership, refresh rotation, delays, retries, duplicate delivery, reconciliation.
- API: Supertest at Express boundary.
- Frontend: React Testing Library user-visible/accessibility behavior at the HTTP boundary.
- E2E: small Playwright critical flows only after core stability.

Name tests by observable behavior, avoid implementation-only assertions/shared mutable state, use fake clocks for pure logic, and bounded polling—not fixed sleeps—for workers.

## Dependencies, documentation, and Git

- Add a dependency only for a current requirement when existing stack/local code is not clearer; review maintenance, security, license, runtime, and bundle cost.
- Update the authoritative document named in `AGENTS.md` when contracts change.
- Keep commits focused; separate broad formatting from behavior.
- Never commit secrets, generated uploads, service volumes, debug output, or ignored drafts.

Clean code here means another engineer can locate a feature, understand its legal states and failure behavior, change it without hidden coupling, and verify it through stable tests.
