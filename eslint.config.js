import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'test-results/',
      'outputs/',
      'snapshot/',
      'eslint.config.js',
    ],
  },

  // Base: recommended JS rules
  js.configs.recommended,

  // TypeScript recommended rules (no type-checking required)
  ...tseslint.configs.recommended,

  // Custom rules for the project
  {
    rules: {
      // Allow console/process.stdout for CLI tool
      'no-console': 'off',

      // Prefer const over let when possible
      'prefer-const': 'warn',

      // No unused variables (but allow _ prefixed)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Allow explicit any sparingly, but warn
      '@typescript-eslint/no-explicit-any': 'warn',

      // Non-null assertions
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // No require imports (use ESM)
      '@typescript-eslint/no-var-requires': 'error',

      // No empty interfaces
      '@typescript-eslint/no-empty-interface': 'warn',

      // No empty functions
      '@typescript-eslint/no-empty-function': 'warn',

      // Ban ts-comment descriptions
      '@typescript-eslint/ban-ts-comment': ['warn', {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': 'allow-with-description',
        'ts-nocheck': 'allow-with-description',
        'ts-check': 'allow-with-description',
      }],
    },
  },
);