process.env.LOG_LEVEL = 'fatal';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://taskforge:taskforge@localhost:5432/taskforge_test';
process.env.REDIS_URL_TEST ??= 'redis://localhost:6379/15';
process.env.REDIS_URL = process.env.REDIS_URL_TEST;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-1234567890-abcdefghijklmnopqrstuvwxyz';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-1234567890-abcdefghijklmnopqrstuvwxyz';
