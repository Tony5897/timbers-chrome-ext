module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/mocks/styleMock.js',
  },
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  collectCoverageFrom: ['extension/background.js', 'extension/popup.js'],
  reporters: ['default'],
  testPathIgnorePatterns: ['/node_modules/', '/emulator-tests/', '/services/api/'],
};
