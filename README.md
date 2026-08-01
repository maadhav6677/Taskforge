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


## Note
Exact dependency versions and runnable commands will be added with the foundation implementation and committed lockfile. Until then, this README deliberately does not claim that the application can be installed or run.
