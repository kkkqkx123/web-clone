import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    // Browser launch in parallel turbo runs can be slow under CPU contention;
    // keep hook (beforeAll/afterAll) timeouts generous.
    hookTimeout: 60000,
    // Do not hardcode PLAYWRIGHT_BROWSERS_PATH — Playwright falls back to its
    // default browser cache (~/.cache/ms-playwright) when the env var is unset.
    // A previous Windows-only default ('D:\Source\pw-browsers') broke browser
    // launch on Linux/CI. Export it only when explicitly provided.
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { env: { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } }
      : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
