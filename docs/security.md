# Security design

**Status:** Prototype controls implemented; complete threat matrix pending

## Trust boundaries

Validate browser input, cookies/headers, HTTP payloads, multipart content, queue payloads, persisted JSONB, filenames, Socket.IO handshakes, and environment variables at runtime. TypeScript types do not make external data trusted.

## Credentials and sessions

- Hash passwords with Argon2id using measured runtime parameters; bound password length and never log input/hash.
- Return a generic login failure for unknown email and wrong password.
- Issue a short-lived access JWT (about 15 minutes) in a production `Secure`, `HttpOnly`, `SameSite=Lax` cookie.
- JWT verification allowlists algorithm, issuer, audience, and expiry; claims are limited to subject, role, session/token IDs, and times.
- Issue a high-entropy rotating refresh credential (about seven days) in a narrower-path HttpOnly cookie.
- Store only its hash plus user/role/family/expiry metadata in Redis.
- Rotate atomically; reuse of a replaced credential revokes the session family.
- Logout deletes Redis session state and clears auth/CSRF cookies.
- Role/security changes revoke affected sessions.
- Redis session loss fails closed by requiring login.

No token enters localStorage, Redux, logs, API bodies, Postman exports, or video.

## CSRF, CORS, and transport

- Credentialed CORS uses exact configured frontend origins, never `*`.
- Local development may configure multiple exact loopback origins such as `localhost`, `127.0.0.1`,
  and `0.0.0.0` so browser requests work regardless of which printed dev URL is opened.
- State-changing requests require allowed `Origin` and matching double-submit CSRF cookie/header.
- `SameSite=Lax` is defense in depth, not the only CSRF control.
- Production requires HTTPS, secure cookies, narrow proxy trust, Helmet, restrictive CSP/headers, and production HSTS behind confirmed TLS.
- No state-changing GET route.
- Next.js route redirects are UX; Express authenticates/authorizes every protected request.

## Authorization

- Public registration creates only `USER`.
- User resource queries include owner scope in the persistence predicate.
- Cross-user IDs generally return `404` to avoid confirming existence.
- Admin global reads use explicit policy/repository paths and tests; omission of an ownership predicate is not an admin policy.
- Initial admin scope is read-only.
- Socket rooms derive from verified subject/role, never client-requested identity.

Frontend guards never substitute for server authorization.

## Input and API safety

- Zod bounds strings, arrays, dates, query length, page size, schedule horizon, and task discriminators.
- Sort/filter mapping is allowlisted; raw user fields never reach Prisma order clauses.
- Apply request/multipart limits before large allocation where possible.
- Revalidate JSONB/job data before executor use.
- Parameterize database access; reviewed raw SQL uses bound values.
- The initial product executes no arbitrary URLs, commands, templates, or user code.
- Public errors use stable sanitized codes and request IDs, never ORM/Redis/BullMQ/filesystem details.

## Uploads

- Allowlist specific raster-image formats and PDF; verify magic bytes rather than extension/browser MIME.
- Limit total request, file count, per-file size, and displayed filename length.
- Generate opaque storage keys; user filenames never form a path.
- Store outside public roots and stream only after ownership/Admin authorization.
- Return safe content type/disposition, `nosniff`, and conservative cache headers.
- Reject active formats such as HTML/SVG initially.
- Clean temporary/partial files after validation or persistence failure.
- Future production storage adds encryption/access policies, scanning, retention, and signed downloads.

## Rate limiting

Redis-backed limits combine route class with IP, user, or session:

| Surface                  | Relative policy                         |
| ------------------------ | --------------------------------------- |
| Login/register/refresh   | Strict                                  |
| Upload/task create/retry | Moderate plus size/count limits         |
| Search/list              | Normal plus query/page bounds           |
| Admin reads              | Authenticated subject limit and logging |

Thresholds are validated configuration. Failure policy is deliberate: auth abuse controls fail conservatively; cache failure alone does not block ordinary reads.

## Secrets and logs

- Validate environment configuration once at startup; never print values.
- `.env.example` contains clearly marked development-only values; real deployments override them through environment/secret management.
- Never expose secrets through `NEXT_PUBLIC_*`, images, snapshots, logs, collections, or video.
- Pino logs request/service/task/job/execution identifiers and stable error codes.
- Redact cookies, auth/CSRF headers, passwords/hashes, tokens, connection URLs, file bytes/paths, and full user payloads.

## Containers and dependencies

- Pin package manager/lockfile and review production dependencies for purpose, maintenance, license, and runtime fit.
- Use multi-stage images, production dependencies only, non-root users, minimal write access, and `.dockerignore`.
- Database, Redis, and private uploads are not public network services in production.
- Dependency audit findings are triaged explicitly rather than ignored or blindly auto-fixed.

## Required negative tests

- Duplicate registration, generic bad login, expiry/revocation, concurrent refresh, and replaced-token reuse.
- Missing/invalid CSRF and disallowed origin.
- Cross-user task/event/file/socket access, user on admin route, and admin self-registration attempt.
- Spoofed/unsupported/oversized/traversal-style upload.
- Invalid query/schedule/task input, stale version, and illegal lifecycle mutation.
- Sensitive response/log redaction.
- Database, Redis session/queue/cache, and storage outage behavior.

Deferred controls—email verification, recovery, MFA, session UI, managed secret rotation, WAF, scanning, and formal monitoring—must never be represented as implemented.
