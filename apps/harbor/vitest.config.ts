import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
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
