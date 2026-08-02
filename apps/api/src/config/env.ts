import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000,http://0.0.0.0:3000'),
  API_MAX_JSON_BYTES: z.coerce.number().int().positive().default(1_048_576),
  API_BODY_BYTES: z.coerce.number().int().positive().default(5_242_880),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REQUEST_ID_HEADER: z.string().default('x-request-id'),
  API_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(250),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('taskforge-api'),
  JWT_AUDIENCE: z.string().min(1).default('taskforge-web'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CSRF_HEADER: z.string().min(1).default('x-csrf-token'),
  TASK_FILE_STORAGE_PATH: z.string().min(1).default('./storage/tasks'),
  TASK_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(8_388_608),
  TASK_MAX_FILES: z.coerce.number().int().positive().default(5),
  JWT_ACCESS_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const message = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${message}`);
}

export type EnvConfig = z.infer<typeof envSchema>;
export const env: EnvConfig = result.data;
