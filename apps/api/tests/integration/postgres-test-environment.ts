import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

const apiRoot = process.cwd();
const repositoryRoot = resolve(apiRoot, '../..');

config({ path: resolve(repositoryRoot, '.env') });
config({ path: resolve(repositoryRoot, '.env.example') });

const defaultTestDatabaseUrl = 'postgresql://taskforge:taskforge@localhost:5432/taskforge_test';

export const getPostgresTestDatabaseUrl = (): string => {
  const value = process.env.DATABASE_URL_TEST ?? defaultTestDatabaseUrl;
  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL_TEST must use the PostgreSQL protocol.');
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*_test$/.test(databaseName)) {
    throw new Error('Refusing database lifecycle operation: test database must end in `_test`.');
  }

  return url.toString();
};

const getDatabaseName = (databaseUrl: string): string =>
  decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

const getMaintenanceUrl = (databaseUrl: string): string => {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
};

const quoteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const withMaintenanceClient = async (
  databaseUrl: string,
  operation: (client: Client, databaseName: string) => Promise<void>,
): Promise<void> => {
  const databaseName = getDatabaseName(databaseUrl);
  const client = new Client({
    connectionString: getMaintenanceUrl(databaseUrl),
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
    await operation(client, databaseName);
  } catch (error) {
    throw new Error(
      'PostgreSQL integration lifecycle failed. Start it with `docker compose up -d postgres`.',
      { cause: error },
    );
  } finally {
    await client.end().catch(() => undefined);
  }
};

const terminateDatabaseConnections = async (
  client: Client,
  databaseName: string,
): Promise<void> => {
  await client.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [databaseName],
  );
};

export const recreatePostgresTestDatabase = async (databaseUrl: string): Promise<void> => {
  await withMaintenanceClient(databaseUrl, async (client, databaseName) => {
    await terminateDatabaseConnections(client, databaseName);
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });
};

export const dropPostgresTestDatabase = async (databaseUrl: string): Promise<void> => {
  await withMaintenanceClient(databaseUrl, async (client, databaseName) => {
    await terminateDatabaseConnections(client, databaseName);
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  });
};

export const runWorkspaceCommand = async (
  arguments_: string[],
  databaseUrl: string,
): Promise<void> => {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: apiRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_URL_TEST: databaseUrl,
        NODE_ENV: 'test',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules']
          .filter((value) => value !== undefined && value.length > 0)
          .join(' '),
      },
      stdio: 'inherit',
    });

    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `Command failed (${arguments_.join(' ')}): ${signal ? `signal ${signal}` : `exit ${String(code)}`}`,
        ),
      );
    });
  });
};
