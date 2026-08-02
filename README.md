# TaskForge

TaskForge is a production-minded task automation and asynchronous job-processing platform.

Authenticated users create immediate or scheduled tasks, send them to Redis-backed workers, inspect status and append-only history, retry failed work, upload private inspection files, and receive live invalidation updates. The prototype implements that complete vertical path while keeping production limitations explicit.

## Documentation

- [Requirements](docs/requirements.md) — mandatory, preferred, and bonus scope plus resolved ambiguities.
- [Architecture](docs/architecture.md) — system boundaries, runtimes, modules, queue lifecycle, Redis responsibilities, and frontend state ownership.
- [Decisions](docs/decisions.md) — accepted technical decisions and their trade-offs.
- [API](docs/api.md) — proposed REST resources, authentication transport, response conventions, and real-time event contract.
- [Database](docs/database.md) — proposed relational model, constraints, indexes, lifecycle invariants, and queue-consistency strategy.
- [Security](docs/security.md) — authentication, authorization, CSRF, rate limiting, upload safety, and logging rules.
- [Coding style](docs/coding-style.md) — conventions and quality expectations for future implementation.
- [Delivery plan](docs/delivery.md) — implementation order, validation gates, risks, and definition of done.
- [HLD and LLD](docs/system-design.md) — implemented runtime topology, flows, components, algorithms, failure mapping, and repository layout.

AI agents and contributors must read [AGENTS.md](AGENTS.md) before changing the repository.

## Stack

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

Create local configuration, start dependencies, and initialize the development database:

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
```

Run the real PostgreSQL, isolated Redis-session, and BullMQ-worker suite separately. It recreates and drops only the database named by `DATABASE_URL_TEST`, refuses names that do not end in `_test`, and uses Redis database 15:

```bash
pnpm test:integration:postgres
```

Validate the production container definitions and build all application images:

```bash
pnpm docker:check
```

Run the development runtimes in separate terminals:

```bash
pnpm --filter @taskforge/api start:dev
pnpm --filter @taskforge/api start:worker:dev
pnpm start:web
```

Open the web application at `http://localhost:3000`, Swagger UI at `http://localhost:4000/api/v1/docs`, liveness at `/api/v1/health/live`, and dependency readiness at `/api/v1/health/ready`.

Development seed identities use password `TaskForge123!`:

- `user@taskforge.local` — owns representative pending, scheduled, completed, and failed tasks.
- `admin@taskforge.local` — read-only global dashboard and task list.

The API uses HttpOnly access/refresh cookies and a CSRF cookie/header pair; no bearer token is copied into the frontend or Postman collection. Import [TaskForge.postman_collection.json](postman/TaskForge.postman_collection.json) and run its requests in order for a smoke workflow.

If default database or Redis ports are occupied, override `TASKFORGE_POSTGRES_PORT` and `TASKFORGE_REDIS_PORT` for Compose and update the matching local URLs. Do not point integration lifecycle scripts at shared production data.
