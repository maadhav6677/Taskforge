# API contract

**Status:** Current HTTP and realtime contract; OpenAPI is served at `/api/v1/openapi.json`

## Purpose and ownership

This document describes the public API behavior used by the web application and external API clients. Update it with every endpoint, status, envelope, error code, header, cookie, pagination, upload, or realtime-event change.

The served OpenAPI document is the machine-readable companion to this guide. Security policy remains authoritative in [security.md](security.md), lifecycle policy in [requirements.md](requirements.md), and persistence detail in [database.md](database.md).

## Conventions

- Base path `/api/v1`; JSON by default, multipart for tasks with attachments.
- UUID identifiers and UTC ISO 8601 timestamps.
- Zod validates params, query, headers, bodies, multipart metadata, and documented responses.
- Every response provides a request ID; public errors never expose dependency details or stacks.
- Ownership and roles are enforced before revealing resource existence.

### Success

```json
{ "data": {}, "meta": {}, "requestId": "uuid" }
```

`meta` is optional. `204` responses have no body and return request ID in a header.

### Error

```json
{
  "error": {
    "code": "TASK_INVALID_TRANSITION",
    "message": "The task cannot be updated while it is processing.",
    "details": []
  },
  "requestId": "uuid"
}
```

Codes are stable identifiers; validation `details` are optional and field-safe.

## Status codes

| Status | Meaning                                   |
| -----: | ----------------------------------------- |
|  `200` | Read/login/refresh/update succeeded       |
|  `201` | Registration created user/session         |
|  `202` | Async task/retry accepted                 |
|  `204` | Logout/delete succeeded                   |
|  `400` | Malformed transport                       |
|  `401` | Authentication invalid/expired/revoked    |
|  `403` | Role policy denied                        |
|  `404` | Absent or concealed out-of-scope resource |
|  `409` | Lifecycle, duplicate, or version conflict |
|  `413` | Request/file too large                    |
|  `422` | Invalid field values                      |
|  `429` | Rate limited                              |
|  `503` | Required infrastructure unavailable       |

## Endpoints

### Authentication

| Method | Path             | Purpose                              | Success |
| ------ | ---------------- | ------------------------------------ | ------: |
| `POST` | `/auth/register` | Create `USER` and initial session    |   `201` |
| `POST` | `/auth/login`    | Verify credentials/create session    |   `200` |
| `POST` | `/auth/refresh`  | Rotate refresh credential/access JWT |   `200` |
| `POST` | `/auth/logout`   | Revoke session/clear cookies         |   `204` |
| `GET`  | `/auth/me`       | Restore current user presentation    |   `200` |

### User resources

| Method   | Path                  | Purpose                                 | Success |
| -------- | --------------------- | --------------------------------------- | ------: |
| `GET`    | `/dashboard/summary`  | Owned counts and current queue context  |   `200` |
| `POST`   | `/tasks`              | Create immediate/scheduled task         |   `202` |
| `GET`    | `/tasks`              | Search/filter/sort/paginate owned tasks |   `200` |
| `GET`    | `/tasks/:id`          | Task/result/attachment metadata         |   `200` |
| `PATCH`  | `/tasks/:id`          | Update eligible pending task            |   `200` |
| `DELETE` | `/tasks/:id`          | Cancel if pending and soft-delete       |   `204` |
| `POST`   | `/tasks/:id/retry`    | New execution from failed task          |   `202` |
| `GET`    | `/tasks/:id/history`  | Paginated events                        |   `200` |
| `GET`    | `/files/:id/download` | Authorized attachment stream            |   `200` |

### Admin and operations

| Method | Path                       | Purpose                         |
| ------ | -------------------------- | ------------------------------- |
| `GET`  | `/admin/dashboard/summary` | System aggregates/queue summary |
| `GET`  | `/admin/tasks`             | Global task list                |
| `GET`  | `/health/live`             | Process liveness                |
| `GET`  | `/health/ready`            | PostgreSQL/Redis readiness      |
| `GET`  | `/docs`, `/openapi.json`   | Protected/development API docs  |

Initial admin scope is read-only; admin mutations require new audit/product rules.

### Operational health

- `/health/live` returns `200` when the API process can serve HTTP; it does not imply dependency readiness.
- `/health/ready` returns `200` only after bounded PostgreSQL and Redis checks succeed.
- A failed or timed-out required dependency check returns `503` with the stable code `SERVICE_NOT_READY`.

## Authentication transport

- Short-lived access JWT and rotating refresh credential use `Secure`, `HttpOnly`, `SameSite=Lax` cookies in production.
- A browser-readable CSRF cookie must match a mutation header; credentialed CORS uses exact configured origins.
- The frontend performs at most one single-flight refresh and one request replay after an access `401`.
- `403` and lifecycle `409` never trigger refresh.

Security details are authoritative in [security.md](security.md).

## Task creation

Core fields are `title`, optional `description`, `type`, versioned `input`, optional future `scheduledAt`, and bounded `maxAttempts`.

JSON-only creation sends the schema directly. Multipart creation sends:

- `task`: JSON matching the same schema;
- `attachments`: bounded verified image/PDF files.

The API returns the durable pending task with `202` because execution is separate. Temporary Redis dispatch failure remains recoverable through reconciliation.

`GET /tasks/:id` returns the owned task plus safe attachment metadata (`id`, display name,
detected MIME type, byte size, and optional SHA-256). It never returns the private storage key;
bytes remain available only through the separately authorized download route.

## Listing

| Parameter                     | Rule                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `q`                           | Bounded title/description search                           |
| `status`, `type`, `scheduled` | Allowlisted filters                                        |
| `createdFrom`, `createdTo`    | Valid UTC range                                            |
| `sortBy`                      | `createdAt`, `updatedAt`, `scheduledAt`, `status`, `title` |
| `sortOrder`                   | `asc` or `desc`                                            |
| `page`, `pageSize`            | Positive; defaults 1/20; max page size 50                  |

Unknown fields are rejected and all sorts add an ID tie-breaker. Metadata returns page, page size, total items, and total pages.

## Dashboard queue context

Dashboard summaries return durable task counts plus `queue`, containing `waiting`, `delayed`,
and `active` BullMQ job counts. A user summary resolves only the caller's current job IDs, with a
maximum of 50 job IDs and batches of 10 Redis reads; the admin summary reports the global queue.
`available: false` means an exact queue context could not be returned, either because Redis/BullMQ
could not be read or because the caller exceeded the scoped limit. PostgreSQL-backed task counts
remain available in both cases.

## Concurrency and lifecycle

Task resources expose integer `version`. It advances whenever the durable task snapshot changes.
The task-detail `ETag` incorporates that version and the snapshot's last-modified timestamp, so a
cached detail response is revalidated after worker transitions, including records created before
the current versioning policy. Update, delete, and retry accept either the current numeric version
or the task-detail `ETag` in `If-Match`; stale preconditions return `409 TASK_VERSION_CONFLICT`.
Matching versions do not bypass lifecycle rules in
[requirements.md](requirements.md).

Representative codes include `TASK_NOT_FOUND`, `TASK_INVALID_TRANSITION`, `TASK_RETRY_NOT_ALLOWED`, `TASK_VERSION_CONFLICT`, `VALIDATION_FAILED`, `CSRF_INVALID`, `FORBIDDEN`, `RATE_LIMITED`, and `SERVICE_UNAVAILABLE`.

## Live status

Authenticated Socket.IO event `task.status.changed` contains only `taskId`, `status`, `executionVersion`, and `occurredAt`. It is an invalidation hint, not durable state. The client refetches affected task/history/list/dashboard queries, including after reconnect. Selected pending or processing task detail/history also refetch at a bounded interval, so a completion that occurs before a detail subscription is established still converges on canonical state.
