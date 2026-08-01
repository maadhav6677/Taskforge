import type { Config } from 'jest';

const config: Config = {
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

export default config;
