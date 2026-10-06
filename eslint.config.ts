import config, { vitest, vue3 } from 'eslint-config-it4c'

export default [
  // `target/**` because cargo generates JS in there: after any `cargo build` the lint would
  // otherwise fail on Tauri's own generated API script, which nobody wrote and nobody can fix.
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**', 'target/**'],
  },
  ...config,
  ...vitest,
  ...vue3,
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
  {
    files: ['apps/harbor/**'],
    rules: {
      // `createApp()` takes a broadly typed Component; narrowing buys nothing for one line
      // that `vue-tsc` already checks.
      '@typescript-eslint/no-unsafe-argument': 'off',
      // `App.vue` is the boundary: anything swallowed there leaves the window in a loading
      // state forever instead of naming what went wrong.
      'no-catch-all/no-catch-all': 'off',
    },
  },
  {
    files: ['apps/harbor/**/*.vue'],
    rules: {
      // Text colour is a role from `style.css`, and only the roles are measured for contrast
      // (`style.spec.ts`). A palette grey here would be the one colour nobody checked — which is
      // how the small print ended up at 1.7 : 1. `ink-off` is exempt from contrast only because
      // a disabled control is, so it may appear only behind `disabled:`.
      'vue/no-restricted-class': [
        'error',
        '/(^|:)text-(slate|gray|zinc|neutral|stone)-\\d+/',
        '/^(?!disabled:)(.*:)?text-ink-off$/',
      ],
    },
  },
]
