# Security design

TaskForge treats browser input, cookies and headers, multipart data, queue payloads, persisted JSON, filenames, Socket.IO handshakes, and environment variables as untrusted.

## Authentication and sessions

- Passwords use bounded input and Argon2id hashing; login failures do not reveal whether an account exists.
- A short-lived access JWT is stored in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie in production.
- JWT verification allowlists algorithm, issuer, audience, and expiry.
- A high-entropy refresh credential is stored in a narrower-path HttpOnly cookie; Redis stores only its hash and session metadata.
- Refresh rotation is atomic. Reuse of a replaced credential revokes its session family.
- Logout and security-sensitive role changes revoke server-side session state.
- Redis session loss fails closed by requiring a new login.

Tokens never enter localStorage, Redux, response bodies, logs, screenshots, or committed API examples.

## Request protection

- Credentialed CORS accepts exact configured origins, never `*`.
- State-changing browser requests require an allowed origin and matching CSRF cookie/header.
- `SameSite=Lax` is defense in depth, not the only CSRF control.
- Production requires HTTPS, secure cookies, narrow proxy trust, Helmet, restrictive headers, and HSTS only behind confirmed TLS.
- Express authenticates and authorizes every protected request; frontend route guards only improve presentation.

## Authorization

- Public registration always creates `USER`.
- User repository queries include owner identity in the database predicate.
- Cross-user identifiers normally return `404` to conceal resource existence.
- Admin access uses explicit read-only routes and policy checks.
- Socket rooms derive from the verified session, never client-provided identity.
- Every file download authorizes through its owning task.

## Input, execution, and errors

- Zod bounds and validates request fields, queries, schedules, pagination, environment values, and job payloads.
- Sort/filter fields are allowlisted; database access is parameterized.
- Request and multipart size limits apply before large allocation where possible.
- Executors revalidate persisted input and never run arbitrary URLs, shell commands, templates, or user code.
- Public failures return stable sanitized codes and request IDs, never database, Redis, BullMQ, filesystem, or stack details.

## Private uploads

- Accept only verified JPEG, PNG, WebP, and PDF signatures within configured count/size limits.
- Reject active formats such as HTML and SVG.
- Generate opaque storage keys; user filenames never become paths.
- Store bytes outside public web roots and stream them only after authorization.
- Send a safe content type/disposition, `nosniff`, and conservative cache headers.
- Clean temporary or partial files after validation and persistence failures.

Production object storage still needs encryption and access policies, malware scanning, retention rules, and controlled signed downloads.

## Rate limits and failure policy

Redis-backed limits are strict for login/register/refresh, moderate for task creation/upload/retry, and bounded by subject for lists and admin reads. Authentication abuse controls fail conservatively. Cache failure alone must not block ordinary durable reads.

## Secrets and logging

- Validate configuration once at startup and never print values.
- `.env.example` contains development placeholders only; real secrets come from deployment secret management.
- Never expose secrets through `NEXT_PUBLIC_*`, images, logs, API collections, or documentation.
- Structured logs may include request, task, job, execution, service, and stable error identifiers.
- Redact cookies, auth/CSRF headers, passwords, tokens, connection URLs, file bytes/paths, and raw user payloads.

## Production gaps

Email verification, password recovery, MFA, session-management UI, managed secret rotation, WAF controls, malware scanning, formal monitoring, and incident procedures are future work and must not be represented as implemented.
