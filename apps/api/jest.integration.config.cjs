/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api-postgres-integration',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['<rootDir>/tests/integration/**/*.integration.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.integration.json',
        useESM: true,
      },
    ],
  },
  testEnvironment: 'node',
  maxWorkers: 1,
};
