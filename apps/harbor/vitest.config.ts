import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    // Playwright's, run by `test:e2e` against a built window. Named `.e2e.ts` so the default
    // pattern misses them already; excluded anyway, so a renamed file cannot slip into the wrong
    // runner and fail there for reasons that have nothing to do with it.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    css: { include: [/\.css\?raw$/] },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.vue', 'vite.hmr.ts'],
      /**
       * What cannot be asserted about, named rather than quietly counted.
       *
       * `scene.ts` and `HarborScene.vue` draw into a WebGL canvas: there is no assertion to make
       * about pixels that would not be a screenshot, and a committed screenshot goes red on the
       * next font or driver without anything being broken. What they *decide* was decided in
       * `fleet.ts` and `vessel.ts`, and those are measured to the line — which is exactly why the
       * split exists. `main.ts` mounts and nothing else. `testing.ts` is the fixtures.
       *
       * The blind spot is therefore small and stated, the same way the quest catalog states a
       * `manuell` check rather than pretending to measure it.
       */
      exclude: [
        'src/main.ts',
        'src/components/scene.ts',
        'src/components/HarborScene.vue',
        'src/components/testing.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
