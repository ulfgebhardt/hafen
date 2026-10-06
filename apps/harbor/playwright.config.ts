import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end checks against the built window, in both engines it ships in.
 *
 * `vite preview` over a fresh build and not the dev server, for two reasons. It is what Tauri
 * embeds (`frontendDist=../dist`), so the CSS that is judged is the CSS that ships. And the dev
 * server optimises dependencies on the first request and may then reload the page — a reload in
 * the middle of a check is a flake by construction, not by bad luck.
 *
 * Chromium and WebKit, because those are the window: WebKitGTK on Linux, WKWebView on the Mac,
 * WebView2 (Chromium) on Windows. Chromium alone missed the Mac: on 06.10.2026 the bar wrapped,
 * the roots popup opened past the window's edge and the window scrolled, all of it in WebKit.
 *
 * WebKit needs system libraries a non-Ubuntu host may lack. There, run the checks in the image CI
 * uses: `docker run --rm -v "$PWD":/w -w /w/apps/harbor mcr.microsoft.com/playwright:v1.63.0-noble
 * pnpm test:e2e` (after a `pnpm install` inside it).
 */

// eslint-disable-next-line n/no-process-env -- port, timeout and CI are the runner's to say
const { HAFEN_E2E_PORT, HAFEN_E2E_TIMEOUT, CI } = process.env

/** Strict, so a port already taken is an error and not a server from somebody else. */
const PORT = Number(HAFEN_E2E_PORT ?? 4319)
/**
 * One knob for slow machines instead of skips: a timeout that is too short on a loaded runner is
 * fixed by raising it, never by leaving the check out.
 */
const TIMEOUT = Number(HAFEN_E2E_TIMEOUT ?? 30_000)
const BASE = `http://127.0.0.1:${String(PORT)}`

export default defineConfig({
  testDir: 'e2e',
  // `.e2e.ts` rather than `.spec.ts`, so vitest's default pattern never runs these.
  testMatch: '*.e2e.ts',
  outputDir: 'test-results',
  timeout: TIMEOUT,
  expect: { timeout: TIMEOUT / 3 },
  /*
   * One worker, because the drawing is the bottleneck and it does not share. Measured on eight
   * cores: four workers took 39 s for five checks at 12–21 s each, one worker 38 s at 3–8 s each.
   * Parallel bought nothing and moved every check closer to its timeout — which is how a flake
   * gets made.
   */
  workers: 1,
  forbidOnly: CI !== undefined,
  // No retries: a check that passes on the second try has a cause, and a retry hides it.
  retries: 0,
  reporter: CI === undefined ? 'list' : [['list'], ['github']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `vite build && vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: BASE,
    // Never a server left running: it would serve an older build, and the checks would pass or
    // fail for reasons from before the change.
    reuseExistingServer: false,
    timeout: TIMEOUT * 4,
  },
})
