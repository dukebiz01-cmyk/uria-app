export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterFramework: [],
  setupFiles: ['./tests/setup.js'],
  testTimeout: 30000,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
  ],
  verbose: true,
};
