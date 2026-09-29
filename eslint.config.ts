import config, { vitest } from 'eslint-config-it4c'

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'] },
  ...config,
  ...vitest,
  {
    rules: {
      // Too many false positives on ordinary array/object access.
      'security/detect-object-injection': 'off',
    },
  },
  {
    // Port implementations must return Promises because the contract says so, not because
    // they await anything. Applies to real and mock adapters alike.
    files: ['**/mock.ts', '**/adapters/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    files: ['packages/cli/**'],
    rules: {
      // A CLI legitimately reads paths it was handed.
      'security/detect-non-literal-fs-filename': 'off',
      // The process boundary is where everything has to be caught.
      'no-catch-all/no-catch-all': 'off',
    },
  },
]
