import {
  createPrismaClient,
  type TaskforgePrismaClient,
} from '../src/infrastructure/database/prisma.js';
import { env } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';

export const SEED_IDS = {
  user: '11111111-1111-4111-8111-111111111111',
  admin: '22222222-2222-4222-8222-222222222222',
  pendingTask: 'aaaaaaaa-0001-4000-8000-000000000001',
  scheduledTask: 'aaaaaaaa-0002-4000-8000-000000000002',
  completedTask: 'aaaaaaaa-0003-4000-8000-000000000003',
  failedTask: 'aaaaaaaa-0004-4000-8000-000000000004',
} as const;

const DEVELOPMENT_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=1,t=3$B3wj6DueMl+VZOenH6J4/g$ORaVMbaHDYIHex8t/u1IL7YpryqtamNpBAWtSEUHGSc';

const dates = {
  userCreated: new Date('2026-01-01T08:00:00.000Z'),
  pendingCreated: new Date('2026-01-02T09:00:00.000Z'),
  scheduledCreated: new Date('2026-01-03T09:00:00.000Z'),
  scheduledFor: new Date('2099-01-15T09:00:00.000Z'),
  completedCreated: new Date('2026-01-04T10:00:00.000Z'),
  completedDispatched: new Date('2026-01-04T10:01:00.000Z'),
  completedStarted: new Date('2026-01-04T10:02:00.000Z'),
  completedFinished: new Date('2026-01-04T10:03:00.000Z'),
  failedCreated: new Date('2026-01-05T11:00:00.000Z'),
  failedDispatched: new Date('2026-01-05T11:01:00.000Z'),
  failedAttemptOneStarted: new Date('2026-01-05T11:02:00.000Z'),
  failedAttemptOneRetried: new Date('2026-01-05T11:03:00.000Z'),
  failedAttemptTwoStarted: new Date('2026-01-05T11:04:00.000Z'),
  failedAttemptTwoRetried: new Date('2026-01-05T11:05:00.000Z'),
  failedAttemptThreeStarted: new Date('2026-01-05T11:06:00.000Z'),
  failedFinished: new Date('2026-01-05T11:07:00.000Z'),
} as const;

const seedUsers = async (database: Prisma.TransactionClient): Promise<void> => {
  await database.user.upsert({
    where: { id: SEED_IDS.user },
    create: {
      id: SEED_IDS.user,
      email: 'user@taskforge.local',
      passwordHash: DEVELOPMENT_PASSWORD_HASH,
      role: 'USER',
      createdAt: dates.userCreated,
      updatedAt: dates.userCreated,
    },
    update: {
      email: 'user@taskforge.local',
      passwordHash: DEVELOPMENT_PASSWORD_HASH,
      role: 'USER',
      updatedAt: dates.userCreated,
    },
  });

  await database.user.upsert({
    where: { id: SEED_IDS.admin },
    create: {
      id: SEED_IDS.admin,
      email: 'admin@taskforge.local',
      passwordHash: DEVELOPMENT_PASSWORD_HASH,
      role: 'ADMIN',
      createdAt: dates.userCreated,
      updatedAt: dates.userCreated,
    },
    update: {
      email: 'admin@taskforge.local',
      passwordHash: DEVELOPMENT_PASSWORD_HASH,
      role: 'ADMIN',
      updatedAt: dates.userCreated,
    },
  });
};

const seedTasks = async (database: Prisma.TransactionClient): Promise<void> => {
  const tasks = [
    {
      id: SEED_IDS.pendingTask,
      title: 'Summarize onboarding notes',
      description: 'Immediate task waiting for worker dispatch.',
      input: { schemaVersion: 1, text: 'TaskForge onboarding notes for the engineering team.' },
      status: 'PENDING' as const,
      attemptsMade: 0,
      scheduledAt: null,
      queueJobId: null,
      dispatchedAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      result: Prisma.DbNull,
      errorCode: null,
      errorMessage: null,
      createdAt: dates.pendingCreated,
      updatedAt: dates.pendingCreated,
    },
    {
      id: SEED_IDS.scheduledTask,
      title: 'Prepare future release digest',
      description: 'A deterministic example of one-time future scheduling.',
      input: { schemaVersion: 1, text: 'Release notes prepared for a future TaskForge run.' },
      status: 'PENDING' as const,
      attemptsMade: 0,
      scheduledAt: dates.scheduledFor,
      queueJobId: null,
      dispatchedAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      result: Prisma.DbNull,
      errorCode: null,
      errorMessage: null,
      createdAt: dates.scheduledCreated,
      updatedAt: dates.scheduledCreated,
    },
    {
      id: SEED_IDS.completedTask,
      title: 'Count words in launch brief',
      description: 'Representative successful execution snapshot.',
      input: { schemaVersion: 1, text: 'TaskForge keeps asynchronous task history truthful.' },
      status: 'COMPLETED' as const,
      attemptsMade: 1,
      scheduledAt: null,
      queueJobId: `task:${SEED_IDS.completedTask}:v1`,
      dispatchedAt: dates.completedDispatched,
      startedAt: dates.completedStarted,
      completedAt: dates.completedFinished,
      failedAt: null,
      result: { schemaVersion: 1, operation: 'WORD_COUNT', wordCount: 6 },
      errorCode: null,
      errorMessage: null,
      createdAt: dates.completedCreated,
      updatedAt: dates.completedFinished,
    },
    {
      id: SEED_IDS.failedTask,
      title: 'Analyze invalid text fixture',
      description: 'Representative exhausted execution with a sanitized failure.',
      input: { schemaVersion: 1, text: 'A deterministic failure fixture.' },
      status: 'FAILED' as const,
      attemptsMade: 3,
      scheduledAt: null,
      queueJobId: `task:${SEED_IDS.failedTask}:v1`,
      dispatchedAt: dates.failedDispatched,
      startedAt: dates.failedAttemptThreeStarted,
      completedAt: null,
      failedAt: dates.failedFinished,
      result: Prisma.DbNull,
      errorCode: 'TEXT_PROCESSING_REJECTED',
      errorMessage: 'The text fixture could not be processed.',
      createdAt: dates.failedCreated,
      updatedAt: dates.failedFinished,
    },
  ];

  for (const task of tasks) {
    await database.task.upsert({
      where: { id: task.id },
      create: {
        ...task,
        ownerId: SEED_IDS.user,
        type: 'TEXT_PROCESSING',
        executionVersion: 1,
        maxAttempts: 3,
        rowVersion: 1,
      },
      update: {
        ...task,
        ownerId: SEED_IDS.user,
        type: 'TEXT_PROCESSING',
        executionVersion: 1,
        maxAttempts: 3,
        rowVersion: 1,
      },
    });
  }
};

const seedEvents = async (database: Prisma.TransactionClient): Promise<void> => {
  const events = [
    {
      taskId: SEED_IDS.pendingTask,
      type: 'CREATED' as const,
      fromStatus: null,
      toStatus: 'PENDING' as const,
      attempt: null,
      occurredAt: dates.pendingCreated,
    },
    {
      taskId: SEED_IDS.scheduledTask,
      type: 'CREATED' as const,
      fromStatus: null,
      toStatus: 'PENDING' as const,
      attempt: null,
      occurredAt: dates.scheduledCreated,
    },
    {
      taskId: SEED_IDS.scheduledTask,
      type: 'SCHEDULED' as const,
      fromStatus: null,
      toStatus: null,
      attempt: null,
      occurredAt: dates.scheduledCreated,
    },
    {
      taskId: SEED_IDS.completedTask,
      type: 'CREATED' as const,
      fromStatus: null,
      toStatus: 'PENDING' as const,
      attempt: null,
      occurredAt: dates.completedCreated,
    },
    {
      taskId: SEED_IDS.completedTask,
      type: 'DISPATCHED' as const,
      fromStatus: null,
      toStatus: null,
      attempt: null,
      occurredAt: dates.completedDispatched,
    },
    {
      taskId: SEED_IDS.completedTask,
      type: 'STARTED' as const,
      fromStatus: 'PENDING' as const,
      toStatus: 'PROCESSING' as const,
      attempt: 1,
      occurredAt: dates.completedStarted,
    },
    {
      taskId: SEED_IDS.completedTask,
      type: 'COMPLETED' as const,
      fromStatus: 'PROCESSING' as const,
      toStatus: 'COMPLETED' as const,
      attempt: 1,
      occurredAt: dates.completedFinished,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'CREATED' as const,
      fromStatus: null,
      toStatus: 'PENDING' as const,
      attempt: null,
      occurredAt: dates.failedCreated,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'DISPATCHED' as const,
      fromStatus: null,
      toStatus: null,
      attempt: null,
      occurredAt: dates.failedDispatched,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'STARTED' as const,
      fromStatus: 'PENDING' as const,
      toStatus: 'PROCESSING' as const,
      attempt: 1,
      occurredAt: dates.failedAttemptOneStarted,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'RETRY_SCHEDULED' as const,
      fromStatus: 'PROCESSING' as const,
      toStatus: 'PENDING' as const,
      attempt: 1,
      occurredAt: dates.failedAttemptOneRetried,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'STARTED' as const,
      fromStatus: 'PENDING' as const,
      toStatus: 'PROCESSING' as const,
      attempt: 2,
      occurredAt: dates.failedAttemptTwoStarted,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'RETRY_SCHEDULED' as const,
      fromStatus: 'PROCESSING' as const,
      toStatus: 'PENDING' as const,
      attempt: 2,
      occurredAt: dates.failedAttemptTwoRetried,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'STARTED' as const,
      fromStatus: 'PENDING' as const,
      toStatus: 'PROCESSING' as const,
      attempt: 3,
      occurredAt: dates.failedAttemptThreeStarted,
    },
    {
      taskId: SEED_IDS.failedTask,
      type: 'FAILED' as const,
      fromStatus: 'PROCESSING' as const,
      toStatus: 'FAILED' as const,
      attempt: 3,
      occurredAt: dates.failedFinished,
    },
  ];

  for (const event of events) {
    const existing = await database.taskEvent.findFirst({
      where: {
        taskId: event.taskId,
        type: event.type,
        attempt: event.attempt,
        occurredAt: event.occurredAt,
      },
      select: { id: true },
    });

    if (!existing) {
      await database.taskEvent.create({
        data: {
          ...event,
          executionVersion: 1,
          metadata: {},
        },
      });
    }
  }
};

export const seedDatabase = async (database: TaskforgePrismaClient): Promise<void> => {
  await database.$transaction(async (transaction) => {
    await seedUsers(transaction);
    await seedTasks(transaction);
    await seedEvents(transaction);
  });
};

const main = async (): Promise<void> => {
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    await seedDatabase(database);
  } finally {
    await database.$disconnect();
  }
};

const isMainModule =
  process.argv[1] !== undefined && /[/\\]prisma[/\\]seed\.ts$/.test(process.argv[1]);

if (isMainModule) {
  void main().catch((error: unknown) => {
    // The CLI surfaces the full internal error; application responses never expose seed failures.
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
