module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/emulator-tests/**/*.test.js',
    '<rootDir>/services/api/emulator-tests/**/*.test.js',
  ],
  maxWorkers: 1,
  testTimeout: 30000,
};
