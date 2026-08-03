import { seedDatabase, SEED_IDS } from '../../prisma/seed.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { TaskRepository } from '../../src/modules/tasks/task.repository.js';

const databaseUrl = process.env.DATABASE_URL_TEST;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST is required for PostgreSQL integration tests.');
}

const database = createPrismaClient(databaseUrl);
const tasks = new TaskRepository(database);

const createUser = async (email: string) =>
  database.user.create({
    data: {
      email,
      passwordHash:
        '$argon2id$v=19$m=65536,p=1,t=3$B3wj6DueMl+VZOenH6J4/g$ORaVMbaHDYIHex8t/u1IL7YpryqtamNpBAWtSEUHGSc',
    },
  });

beforeAll(async () => {
  await database.$connect();
});

beforeEach(async () => {
  await database.$executeRawUnsafe(
    'TRUNCATE TABLE "file_attachments", "task_events", "tasks", "users" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await database.$disconnect();
});

describe('PostgreSQL migrations and constraints', () => {
  it('applies both reviewed migrations and enables pg_trgm from an empty database', async () => {
    const migrations = await database.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY migration_name
    `;
    const extensions = await database.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    const searchIndexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('tasks_title_trgm_idx', 'tasks_description_trgm_idx')
      ORDER BY indexname
    `;

    expect(migrations.map(({ migration_name }) => migration_name)).toEqual([
      '20260802130000_initial_schema',
      '20260802130100_pg_trgm_search',
    ]);
    expect(extensions).toEqual([{ extname: 'pg_trgm' }]);
    expect(searchIndexes.map(({ indexname }) => indexname)).toEqual([
      'tasks_description_trgm_idx',
      'tasks_title_trgm_idx',
    ]);
  });

  it('rejects invalid normalized identities, task snapshots, attachments, and event shapes', async () => {
    const owner = await createUser('owner@taskforge.local');

    await expect(createUser('Owner@taskforge.local')).rejects.toThrow();
    await expect(createUser('owner@taskforge.local')).rejects.toThrow();

    await expect(
      database.task.create({
        data: {
          ownerId: owner.id,
          title: '   ',
          type: 'TEXT_PROCESSING',
          input: { schemaVersion: 1, text: 'invalid title' },
        },
      }),
    ).rejects.toThrow();

    const task = await tasks.createPending({
      ownerId: owner.id,
      title: 'Attachment constraint fixture',
      type: 'FILE_INSPECTION',
      input: { schemaVersion: 1 },
    });

    await expect(
      database.fileAttachment.create({
        data: {
          taskId: task.id,
          storageKey: 'fixture-key',
          originalName: 'fixture.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 0n,
        },
      }),
    ).rejects.toThrow();

    await expect(
      database.taskEvent.create({
        data: {
          taskId: task.id,
          type: 'CREATED',
          toStatus: 'FAILED',
          executionVersion: 1,
          metadata: {},
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps task history append-only at the database boundary', async () => {
    const owner = await createUser('audit@taskforge.local');
    const task = await tasks.createPending({
      ownerId: owner.id,
      title: 'Immutable event fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'History must remain append-only.' },
    });
    const event = await database.taskEvent.findFirstOrThrow({ where: { taskId: task.id } });

    await expect(
      database.taskEvent.update({
        where: { id: event.id },
        data: { metadata: { changed: true } },
      }),
    ).rejects.toThrow();
    await expect(database.taskEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  });
});

describe('deterministic development seed', () => {
  it('adds only missing fixtures and preserves a seeded task after it executes', async () => {
    await seedDatabase(database);
    const pendingTask = await database.task.findUniqueOrThrow({
      where: { id: SEED_IDS.pendingTask },
    });
    const startedAt = new Date('2026-08-03T12:00:00.000Z');
    const completedAt = new Date('2026-08-03T12:01:00.000Z');

    await expect(
      tasks.claimPending(pendingTask.id, pendingTask.executionVersion, 1, startedAt),
    ).resolves.toMatchObject({ status: 'PROCESSING' });
    await expect(
      tasks.completeProcessing(
        pendingTask.id,
        pendingTask.executionVersion,
        { schemaVersion: 1, normalized: 'seed completed safely' },
        completedAt,
      ),
    ).resolves.toMatchObject({ status: 'COMPLETED' });

    await seedDatabase(database);

    const [userCount, taskCount, eventCount, seededTasks] = await Promise.all([
      database.user.count(),
      database.task.count(),
      database.taskEvent.count(),
      database.task.findMany({
        where: { ownerId: SEED_IDS.user },
        include: { events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    expect({ userCount, taskCount, eventCount }).toEqual({
      userCount: 2,
      taskCount: 4,
      eventCount: 17,
    });
    expect(seededTasks.map(({ status }) => status)).toEqual([
      'COMPLETED',
      'PENDING',
      'COMPLETED',
      'FAILED',
    ]);

    for (const task of seededTasks) {
      const latestTransition = task.events.findLast((event) => event.toStatus !== null);
      const startedAttempts = task.events
        .filter((event) => event.type === 'STARTED')
        .map((event) => event.attempt ?? 0);

      expect(latestTransition?.toStatus).toBe(task.status);
      expect(Math.max(0, ...startedAttempts)).toBe(task.attemptsMade);
      expect(task.events.every((event) => event.executionVersion === task.executionVersion)).toBe(
        true,
      );
    }

    expect(seededTasks.find(({ id }) => id === SEED_IDS.completedTask)?.result).toEqual({
      operation: 'WORD_COUNT',
      schemaVersion: 1,
      wordCount: 6,
    });
    expect(seededTasks.find(({ id }) => id === SEED_IDS.failedTask)?.errorCode).toBe(
      'TEXT_PROCESSING_REJECTED',
    );
    expect(seededTasks.find(({ id }) => id === SEED_IDS.pendingTask)).toMatchObject({
      status: 'COMPLETED',
      attemptsMade: 1,
      result: { schemaVersion: 1, normalized: 'seed completed safely' },
    });
  });
});

describe('task repository ownership, search, history, and concurrency', () => {
  it('scopes details, case-insensitive search, and history through the owner predicate', async () => {
    const owner = await createUser('first-owner@taskforge.local');
    const otherOwner = await createUser('second-owner@taskforge.local');
    const ownedTask = await tasks.createPending({
      ownerId: owner.id,
      title: 'Quarterly engineering digest',
      description: 'Contains the unique Foxtrot search marker.',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'owned' },
    });
    await tasks.createPending({
      ownerId: otherOwner.id,
      title: 'Foxtrot private task',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'other owner' },
    });

    const searchResults = await tasks.listOwned({
      ownerId: owner.id,
      search: 'foxtrot',
      offset: 0,
      limit: 20,
    });

    expect(searchResults.map(({ id }) => id)).toEqual([ownedTask.id]);
    await expect(tasks.findOwnedById(owner.id, ownedTask.id)).resolves.toMatchObject({
      id: ownedTask.id,
    });
    await expect(tasks.findOwnedById(otherOwner.id, ownedTask.id)).resolves.toBeNull();
    await expect(tasks.listOwnedHistory(otherOwner.id, ownedTask.id)).resolves.toEqual([]);
    await expect(tasks.listOwnedHistory(owner.id, ownedTask.id)).resolves.toMatchObject([
      { type: 'CREATED', toStatus: 'PENDING' },
    ]);
  });

  it('accepts only one optimistic update for the same expected row version', async () => {
    const owner = await createUser('version-owner@taskforge.local');
    const task = await tasks.createPending({
      ownerId: owner.id,
      title: 'Original title',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'versioned update' },
    });

    const outcomes = await Promise.all([
      tasks.renamePending(owner.id, task.id, task.version, 'First contender'),
      tasks.renamePending(owner.id, task.id, task.version, 'Second contender'),
    ]);
    const winners = outcomes.filter((outcome) => outcome !== null);
    const stored = await tasks.findOwnedById(owner.id, task.id);
    const history = await tasks.listOwnedHistory(owner.id, task.id);

    expect(winners).toHaveLength(1);
    expect(stored?.version).toBe(2);
    expect(history.filter(({ type }) => type === 'UPDATED')).toHaveLength(1);
  });

  it('replaces the execution version when pending queued work changes', async () => {
    const owner = await createUser('replacement-owner@taskforge.local');
    const task = await tasks.createPending({
      ownerId: owner.id,
      title: 'Queued replacement fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'old payload' },
    });
    const dispatchedAt = new Date(Date.now() + 1_000);
    const replacementStartedAt = new Date(dispatchedAt.getTime() + 120_000);

    await expect(
      tasks.markDispatched(
        task.id,
        task.executionVersion,
        `task:${task.id}:v${task.executionVersion}`,
        dispatchedAt,
      ),
    ).resolves.toBe(true);

    const updated = await tasks.updatePending(owner.id, task.id, task.version, {
      input: { schemaVersion: 1, text: 'replacement payload' },
      scheduledAt: new Date(dispatchedAt.getTime() + 60_000),
    });

    expect(updated).toMatchObject({
      executionVersion: task.executionVersion + 1,
      queueJobId: null,
      dispatchedAt: null,
      version: task.version + 1,
    });
    await expect(
      tasks.claimPending(task.id, task.executionVersion, 1, replacementStartedAt),
    ).resolves.toBeNull();
    await expect(
      tasks.claimPending(task.id, task.executionVersion + 1, 1, replacementStartedAt),
    ).resolves.toMatchObject({
      executionVersion: task.executionVersion + 1,
      status: 'PROCESSING',
    });
  });

  it('soft-deletes an eligible owned task without deleting its audit history', async () => {
    const owner = await createUser('delete-owner@taskforge.local');
    const otherOwner = await createUser('delete-other@taskforge.local');
    const task = await tasks.createPending({
      ownerId: owner.id,
      title: 'Soft deletion fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'retain the history' },
    });
    const deletedAt = new Date(Date.now() + 1_000);

    await expect(
      tasks.softDeleteEligible(otherOwner.id, task.id, task.version, deletedAt),
    ).resolves.toBe(false);
    await expect(
      tasks.softDeleteEligible(owner.id, task.id, task.version, deletedAt),
    ).resolves.toBe(true);
    await expect(tasks.findOwnedById(owner.id, task.id)).resolves.toBeNull();

    const stored = await database.task.findUniqueOrThrow({
      where: { id: task.id },
      include: { events: { orderBy: { occurredAt: 'asc' } } },
    });
    expect(stored.deletedAt).toEqual(deletedAt);
    expect(stored.events.map(({ type }) => type)).toEqual(['CREATED', 'DELETED']);
  });

  it('claims and finalizes one current execution while rejecting duplicate and early work', async () => {
    const owner = await createUser('worker-owner@taskforge.local');
    const task = await tasks.createPending({
      ownerId: owner.id,
      title: 'Concurrent claim fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'claim exactly once' },
    });
    const startedAt = new Date(Date.now() + 1_000);

    const claims = await Promise.all([
      tasks.claimPending(task.id, task.executionVersion, 1, startedAt),
      tasks.claimPending(task.id, task.executionVersion, 1, startedAt),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);

    const completedAt = new Date(startedAt.getTime() + 60_000);
    await expect(
      tasks.completeProcessing(
        task.id,
        task.executionVersion,
        { schemaVersion: 1, operation: 'WORD_COUNT', wordCount: 3 },
        completedAt,
      ),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(
      tasks.completeProcessing(
        task.id,
        task.executionVersion,
        { schemaVersion: 1, operation: 'WORD_COUNT', wordCount: 3 },
        completedAt,
      ),
    ).resolves.toBeNull();

    const retryable = await tasks.createPending({
      ownerId: owner.id,
      title: 'Retryable failure fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'retry me' },
    });
    const retryStartedAt = new Date(completedAt.getTime() + 1_000);
    await expect(
      tasks.claimPending(retryable.id, retryable.executionVersion, 1, retryStartedAt),
    ).resolves.toMatchObject({ status: 'PROCESSING' });
    await expect(
      tasks.recordProcessingFailure(
        retryable.id,
        retryable.executionVersion,
        1,
        true,
        'TRANSIENT_FAILURE',
        'A retryable fixture failed.',
        new Date(retryStartedAt.getTime() + 1_000),
      ),
    ).resolves.toMatchObject({
      status: 'PENDING',
      startedAt: null,
      errorCode: null,
      errorMessage: null,
    });

    const scheduled = await tasks.createPending({
      ownerId: owner.id,
      title: 'Future execution fixture',
      type: 'TEXT_PROCESSING',
      input: { schemaVersion: 1, text: 'not yet' },
      scheduledAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    await expect(
      tasks.claimPending(scheduled.id, scheduled.executionVersion, 1, startedAt),
    ).resolves.toBeNull();

    const history = await tasks.listOwnedHistory(owner.id, task.id);
    expect(history.filter(({ type }) => type === 'STARTED')).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: 'COMPLETED', toStatus: 'COMPLETED' });
  });
});
