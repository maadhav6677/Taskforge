import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const apiRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(apiRoot, '../..');

config({ path: resolve(repositoryRoot, '.env') });
config({ path: resolve(repositoryRoot, '.env.example') });

export default defineConfig({
  schema: resolve(apiRoot, 'prisma/schema.prisma'),
  migrations: {
    path: resolve(apiRoot, 'prisma/migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
