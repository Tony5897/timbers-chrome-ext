const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        CommunityVotes: 'readonly',
        MatchdayAuth: 'readonly',
        MATCHDAY_RUNTIME_CONFIG: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['background.js', 'runtime-config.js', 'auth.js', 'community.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
      },
    },
  },
  {
    files: ['background.js'],
    languageOptions: {
      globals: {
        importScripts: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js', 'emulator-tests/**/*.js', 'jest.setup.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
  {
    files: ['**/*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: ['coverage/', 'dist/', 'node_modules/', 'packages/', 'scripts/', 'safari/', 'services/api/'],
  },
];
