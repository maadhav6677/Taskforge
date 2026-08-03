# API documentation

The Express API uses base path `/api/v1`. The machine-readable OpenAPI document is served at `/api/v1/openapi.json`; this file summarizes behavior that clients must understand.

## Conventions

- JSON is the default transport; task creation may use multipart form data for attachments.
- IDs are UUIDs and timestamps are UTC ISO 8601 values.
- Zod validates parameters, queries, headers, bodies, multipart metadata, and queue payloads.
- Responses include a request ID. Public errors use stable codes and sanitized messages.
- Protected resource lookup enforces role and ownership before revealing existence.

Success responses use `{ "data": ..., "meta"?: ..., "requestId": "..." }`. Errors use `{ "error": { "code": "...", "message": "...", "details"?: [...] }, "requestId": "..." }`. A `204` response has no body.

## Endpoints

### Authentication

| Method | Path             | Purpose                                    |
| ------ | ---------------- | ------------------------------------------ |
| `GET`  | `/auth/csrf`     | Set/read the browser CSRF token            |
| `POST` | `/auth/register` | Create a `USER` and initial session        |
| `POST` | `/auth/login`    | Verify credentials and create a session    |
| `POST` | `/auth/refresh`  | Rotate refresh state and issue access auth |
| `POST` | `/auth/logout`   | Revoke the session and clear cookies       |
| `GET`  | `/auth/me`       | Return the current user                    |

### User resources

| Method   | Path                  | Purpose                                        |
| -------- | --------------------- | ---------------------------------------------- |
| `GET`    | `/dashboard/summary`  | Owned task totals and queue context            |
| `POST`   | `/tasks`              | Create an immediate or scheduled task          |
| `GET`    | `/tasks`              | Search, filter, sort, and paginate owned tasks |
| `GET`    | `/tasks/:id`          | Read an owned task and safe file metadata      |
| `PATCH`  | `/tasks/:id`          | Update an eligible pending task                |
| `DELETE` | `/tasks/:id`          | Soft-delete an eligible task                   |
| `POST`   | `/tasks/:id/retry`    | Retry an eligible failed task                  |
| `GET`    | `/tasks/:id/history`  | Read append-only task history                  |
| `GET`    | `/files/:id/download` | Stream an authorized private attachment        |

### Admin and operations

| Method | Path                       | Purpose                              |
| ------ | -------------------------- | ------------------------------------ |
| `GET`  | `/admin/dashboard/summary` | Global task totals and queue context |
| `GET`  | `/admin/tasks`             | Read-only global task list           |
| `GET`  | `/health/live`             | Process liveness                     |
| `GET`  | `/health/ready`            | PostgreSQL and Redis readiness       |
| `GET`  | `/openapi.json`            | OpenAPI 3.1 description              |

## Authentication and mutation safety

Access and rotating refresh credentials are HttpOnly cookies. Browser mutations also require an allowed origin and a CSRF header matching the browser-readable CSRF cookie. Credentialed CORS accepts only configured origins.

The client may perform one single-flight refresh and one replay after an access `401`. A `403` or lifecycle/version `409` must not trigger token refresh. See [security.md](security.md) for the full security model.

## Task creation and listing

Task input includes `title`, optional `description`, `type`, versioned `input`, optional future `scheduledAt`, and bounded `maxAttempts`. Multipart requests send the same schema as JSON in a `task` field plus `attachments`.

Creation returns `202 Accepted` with a durable pending task because execution is asynchronous. A temporary dispatch failure remains recoverable through reconciliation.

`GET /tasks` supports:

- `q`, `status`, `type`, and `scheduled` filters;
- `createdFrom` and `createdTo` UTC bounds;
- `sortBy` of `createdAt`, `updatedAt`, `scheduledAt`, `status`, or `title`;
- `sortOrder` of `asc` or `desc`;
- positive `page` and `pageSize`, with page size capped at 50.

Unknown query fields are rejected. Sorting uses an ID tie-breaker, and metadata reports page, page size, total items, and total pages.

## Concurrency and status updates

Task resources expose integer `version`. It advances whenever the durable user-visible snapshot changes, including worker transitions. Task detail returns an `ETag`; update, delete, and retry require the matching value in `If-Match`. A stale precondition returns `409 TASK_VERSION_CONFLICT` without bypassing lifecycle rules in [requirements.md](requirements.md).

The authenticated `task.status.changed` Socket.IO event contains only `taskId`, `status`, `executionVersion`, and `occurredAt`. It is an invalidation hint: clients refetch task, history, list, and dashboard data. Reconnect and bounded polling for selected active tasks handle missed events.

## Dashboard queue context

Dashboard responses contain PostgreSQL-backed task counts and a `queue` object with `waiting`, `delayed`, and `active`. User views resolve only the caller's current job IDs; admin views use global queue counts. `queue.available: false` means Redis/BullMQ could not be read, while durable counts remain usable.

## Common statuses

|        Status | Meaning                                    |
| ------------: | ------------------------------------------ |
|         `200` | Successful read, login, refresh, or update |
|         `201` | Registration created a user/session        |
|         `202` | Asynchronous task or retry accepted        |
|         `204` | Logout or delete completed                 |
| `400` / `422` | Malformed transport or invalid fields      |
| `401` / `403` | Authentication or authorization failure    |
|         `404` | Missing or concealed out-of-scope resource |
|         `409` | Duplicate, lifecycle, or version conflict  |
| `413` / `429` | Payload too large or rate limited          |
|         `503` | Required infrastructure unavailable        |
