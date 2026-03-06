module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/mocks/styleMock.js',
  },
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  collectCoverageFrom: ['background.js', 'popup.js'],
  reporters: ['default'],
};
