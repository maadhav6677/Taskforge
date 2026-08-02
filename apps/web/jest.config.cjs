/** @type {import('jest').Config} */
module.exports = {
  displayName: 'web',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/**/*.test.tsx', '<rootDir>/**/*.test.ts'],
  passWithNoTests: true,
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.json',
      },
    ],
  },
};
