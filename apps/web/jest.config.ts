import type { Config } from 'jest';

const base: Config = {
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'Node',
          jsx: 'react-jsx',
          allowJs: true,
        },
      },
    ],
  },
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@assistant-ui/react|@assistant-ui/core|@assistant-ui/store)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

const config: Config = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.unit.test.ts?(x)'],
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.int.test.ts?(x)'],
    },
  ],
};

export default config;
