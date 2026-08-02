/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api',
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/tests/integration/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
        useESM: true,
      },
    ],
  },
  testEnvironment: 'node',
};
