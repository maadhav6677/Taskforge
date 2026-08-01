import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.base.json',
      },
    ],
  },
  passWithNoTests: true,
};

export default config;
