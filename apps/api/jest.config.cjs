/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.json',
      },
    ],
  },
  passWithNoTests: true,
  testEnvironment: 'node',
};
