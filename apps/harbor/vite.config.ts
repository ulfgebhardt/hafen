import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { needsReload } from './vite.hmr'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'hafen-reload-on-module-change',
      /**
       * A changed module takes the page with it; a changed component does not.
       *
       * See `vite.hmr.ts` for what this cost when it was missing: a window that had been open
       * across an edit held two generations of the drawing code and stayed white.
       */
      hotUpdate({ modules, server }) {
        const paths = modules.map((module) => module.file ?? '').filter(Boolean)
        if (needsReload(paths)) {
          server.ws.send({ type: 'full-reload' })
          return []
        }
        return modules
      },
    },
  ],
  server: {
    watch: {
      // Coverage writes hundreds of HTML files and every one of them triggered a page reload.
      ignored: ['**/coverage/**', '**/dist/**'],
    },
  },
})
