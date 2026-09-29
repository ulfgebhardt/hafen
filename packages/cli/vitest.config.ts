import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The bin, and nothing but the bin: shebang, `process.argv`, `process.exitCode`.
      // Everything it decides — argv, command choice, exit codes — lives in `command.ts`
      // and is measured there. The adapter is measured too: it is the environment
      // boundary, not test scaffolding.
      exclude: ['src/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
