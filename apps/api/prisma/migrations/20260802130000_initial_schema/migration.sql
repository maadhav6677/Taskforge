-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('TEXT_PROCESSING', 'FILE_INSPECTION');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('CREATED', 'UPDATED', 'SCHEDULED', 'DISPATCHED', 'STARTED', 'RETRY_SCHEDULED', 'COMPLETED', 'FAILED', 'MANUAL_RETRY', 'DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_normalized_check" CHECK (
        "email" = lower(btrim("email"))
        AND char_length("email") BETWEEN 3 AND 320
    ),
    CONSTRAINT "users_password_hash_length_check" CHECK (
        char_length("password_hash") BETWEEN 1 AND 255
    )
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "type" "TaskType" NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" VARCHAR(80),
    "error_message" VARCHAR(500),
    "execution_version" INTEGER NOT NULL DEFAULT 1,
    "attempts_made" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "queue_job_id" VARCHAR(255),
    "scheduled_at" TIMESTAMPTZ(3),
    "dispatched_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_title_check" CHECK (
        "title" = btrim("title")
        AND char_length("title") BETWEEN 1 AND 160
    ),
    CONSTRAINT "tasks_description_check" CHECK (
        "description" IS NULL
        OR (
            "description" = btrim("description")
            AND char_length("description") BETWEEN 1 AND 2000
        )
    ),
    CONSTRAINT "tasks_input_object_check" CHECK (jsonb_typeof("input") = 'object'),
    CONSTRAINT "tasks_result_object_check" CHECK (
        "result" IS NULL OR jsonb_typeof("result") = 'object'
    ),
    CONSTRAINT "tasks_execution_version_check" CHECK ("execution_version" >= 1),
    CONSTRAINT "tasks_attempt_bounds_check" CHECK (
        "max_attempts" BETWEEN 1 AND 10
        AND "attempts_made" BETWEEN 0 AND "max_attempts"
    ),
    CONSTRAINT "tasks_row_version_check" CHECK ("row_version" >= 1),
    CONSTRAINT "tasks_error_pair_check" CHECK (
        ("error_code" IS NULL) = ("error_message" IS NULL)
    ),
    CONSTRAINT "tasks_dispatch_pair_check" CHECK (
        ("queue_job_id" IS NULL) = ("dispatched_at" IS NULL)
    ),
    CONSTRAINT "tasks_timestamp_order_check" CHECK (
        ("scheduled_at" IS NULL OR "scheduled_at" >= "created_at")
        AND ("dispatched_at" IS NULL OR "dispatched_at" >= "created_at")
        AND ("started_at" IS NULL OR "started_at" >= "created_at")
        AND ("completed_at" IS NULL OR "completed_at" >= "started_at")
        AND ("failed_at" IS NULL OR "failed_at" >= "started_at")
        AND ("deleted_at" IS NULL OR "deleted_at" >= "created_at")
    ),
    CONSTRAINT "tasks_status_snapshot_check" CHECK (
        (
            "status" = 'PENDING'
            AND "started_at" IS NULL
            AND "completed_at" IS NULL
            AND "failed_at" IS NULL
            AND "result" IS NULL
            AND "error_code" IS NULL
        )
        OR (
            "status" = 'PROCESSING'
            AND "attempts_made" >= 1
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NULL
            AND "failed_at" IS NULL
            AND "result" IS NULL
            AND "error_code" IS NULL
        )
        OR (
            "status" = 'COMPLETED'
            AND "attempts_made" >= 1
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NOT NULL
            AND "failed_at" IS NULL
            AND "result" IS NOT NULL
            AND "error_code" IS NULL
        )
        OR (
            "status" = 'FAILED'
            AND "attempts_made" >= 1
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NULL
            AND "failed_at" IS NOT NULL
            AND "result" IS NULL
            AND "error_code" IS NOT NULL
        )
    ),
    CONSTRAINT "tasks_deleted_state_check" CHECK (
        "deleted_at" IS NULL OR "status" <> 'PROCESSING'
    )
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" BIGSERIAL NOT NULL,
    "task_id" UUID NOT NULL,
    "type" "TaskEventType" NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus",
    "execution_version" INTEGER NOT NULL,
    "attempt" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_events_execution_version_check" CHECK ("execution_version" >= 1),
    CONSTRAINT "task_events_attempt_check" CHECK ("attempt" IS NULL OR "attempt" >= 1),
    CONSTRAINT "task_events_transition_check" CHECK (
        ("type" = 'CREATED' AND "from_status" IS NULL AND "to_status" = 'PENDING')
        OR ("type" IN ('UPDATED', 'SCHEDULED', 'DISPATCHED', 'DELETED') AND "from_status" IS NULL AND "to_status" IS NULL)
        OR ("type" = 'STARTED' AND "from_status" = 'PENDING' AND "to_status" = 'PROCESSING')
        OR ("type" = 'RETRY_SCHEDULED' AND "from_status" = 'PROCESSING' AND "to_status" = 'PENDING')
        OR ("type" = 'COMPLETED' AND "from_status" = 'PROCESSING' AND "to_status" = 'COMPLETED')
        OR ("type" = 'FAILED' AND "from_status" = 'PROCESSING' AND "to_status" = 'FAILED')
        OR ("type" = 'MANUAL_RETRY' AND "from_status" = 'FAILED' AND "to_status" = 'PENDING')
    )
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "file_attachments_storage_key_check" CHECK (
        "storage_key" = btrim("storage_key") AND char_length("storage_key") BETWEEN 1 AND 255
    ),
    CONSTRAINT "file_attachments_original_name_check" CHECK (
        "original_name" = btrim("original_name") AND char_length("original_name") BETWEEN 1 AND 255
    ),
    CONSTRAINT "file_attachments_mime_type_check" CHECK (
        "mime_type" = btrim("mime_type") AND char_length("mime_type") BETWEEN 1 AND 100
    ),
    CONSTRAINT "file_attachments_size_check" CHECK ("size_bytes" BETWEEN 1 AND 8388608),
    CONSTRAINT "file_attachments_sha256_check" CHECK (
        "sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_queue_job_id_key" ON "tasks"("queue_job_id");

-- CreateIndex
CREATE INDEX "tasks_owner_active_created_idx" ON "tasks"("owner_id", "deleted_at", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "tasks_owner_status_created_idx" ON "tasks"("owner_id", "status", "deleted_at", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "tasks_status_scheduled_idx" ON "tasks"("status", "scheduled_at");

-- Bounded reconciliation scans only current pending executions without a queue dispatch.
CREATE INDEX "tasks_pending_dispatch_idx"
ON "tasks"("scheduled_at", "id")
WHERE "status" = 'PENDING' AND "deleted_at" IS NULL AND "queue_job_id" IS NULL;

-- CreateIndex
CREATE INDEX "task_events_task_history_idx" ON "task_events"("task_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_storage_key_key" ON "file_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "file_attachments_task_id_idx" ON "file_attachments"("task_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- History is an audit record. Corrections append a new event; existing rows never change.
CREATE FUNCTION prevent_task_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'task_events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER task_events_prevent_update_delete
BEFORE UPDATE OR DELETE ON "task_events"
FOR EACH ROW EXECUTE FUNCTION prevent_task_event_mutation();
