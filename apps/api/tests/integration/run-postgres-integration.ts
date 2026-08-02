import {
  dropPostgresTestDatabase,
  getPostgresTestDatabaseUrl,
  recreatePostgresTestDatabase,
  runWorkspaceCommand,
} from './postgres-test-environment.js';

const run = async (): Promise<void> => {
  const databaseUrl = getPostgresTestDatabaseUrl();
  await recreatePostgresTestDatabase(databaseUrl);

  try {
    await runWorkspaceCommand(['exec', 'prisma', 'migrate', 'deploy'], databaseUrl);
    await runWorkspaceCommand(
      ['exec', 'jest', '--config', 'jest.integration.config.cjs', '--runInBand'],
      databaseUrl,
    );
  } finally {
    await dropPostgresTestDatabase(databaseUrl);
  }
};

void run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
