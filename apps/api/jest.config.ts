import type { Config } from 'jest';

const config: Config = {
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

export default config;
