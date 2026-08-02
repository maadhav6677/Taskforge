# TaskForge

TaskForge is a production-minded task automation and asynchronous job-processing platform.

Authenticated users will create immediate or scheduled tasks, send them to Redis-backed workers, inspect their status and history, retry failed work, and receive live updates. The goal is a focused micro-SaaS module with defensible engineering decisions.

## Documentation

- [Requirements](docs/requirements.md) — mandatory, preferred, and bonus scope plus resolved ambiguities.
- [Architecture](docs/architecture.md) — system boundaries, runtimes, modules, queue lifecycle, Redis responsibilities, and frontend state ownership.
- [Decisions](docs/decisions.md) — accepted technical decisions and their trade-offs.
- [API](docs/api.md) — proposed REST resources, authentication transport, response conventions, and real-time event contract.
- [Database](docs/database.md) — proposed relational model, constraints, indexes, lifecycle invariants, and queue-consistency strategy.
- [Security](docs/security.md) — authentication, authorization, CSRF, rate limiting, upload safety, and logging rules.
- [Coding style](docs/coding-style.md) — conventions and quality expectations for future implementation.
- [Delivery plan](docs/delivery.md) — implementation order, validation gates, risks, and definition of done.

AI agents and contributors must read [AGENTS.md](AGENTS.md) before changing the repository.

## Planned stack

Next.js 16, React 19, TypeScript, Redux Toolkit, TanStack Query, Node.js 24 LTS, Express, PostgreSQL 18, Prisma, Redis, BullMQ, Socket.IO, Jest, Docker Compose, and GitHub Actions.

## Foundation setup

Prerequisites:

- Node.js 24.x
- pnpm 10.12.1, pinned by the root `packageManager` field
- Docker Desktop for the Compose stack

Install the workspace and run the same quality gate used before a commit:

```bash
pnpm install --frozen-lockfile
pnpm ci:check
```

Run the Phase 1 development shells in separate terminals:

```bash
pnpm --filter @taskforge/api start:dev
pnpm --filter @taskforge/api start:worker:dev
pnpm start:web
```

The API exposes liveness at `http://localhost:4000/api/v1/health/live` and the current readiness shell at `http://localhost:4000/api/v1/health/ready`. PostgreSQL, Redis, queue, and business features are introduced in later delivery phases.
