import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['public/assets/**', 'functions/**', '.claude/**'] },
  js.configs.recommended,
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, firebase: 'readonly' }
    }
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.cjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node }
  },
  {
    rules: {
      // Audio/storage fallbacks intentionally catch errors without using the error value.
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  }
];
