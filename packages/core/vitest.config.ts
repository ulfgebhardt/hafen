import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The mock adapter is test scaffolding; ports and the barrel are types and re-exports.
      exclude: ['src/mock.ts', 'src/ports.ts', 'src/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
