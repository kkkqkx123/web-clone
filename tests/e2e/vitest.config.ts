/**
 * Vitest configuration dedicated to E2E tests
 *
 * Differences from the root vitest.config.ts:
 * - Longer timeouts (90s; a full crawl of one framework can take 30s+)
 * - Serial execution (avoids multiple browser instances competing for resources)
 * - No retry on failure (makes it easier to locate problems quickly)
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // E2E tests need a real browser and network — allow plenty of time
    testTimeout: 90000,
    hookTimeout: 90000,
    // Run serially to avoid browser conflicts
    fileParallelism: false,
    maxWorkers: 1,
    // No retries for E2E tests: stop on failure so issues surface fast
    retry: 0,
    // Reporters
    reporters: ['default', 'json'],
    outputFile: {
      // All temporary test output is collected under __tests__/outputs/ at the repo root
      json: './__tests__/outputs/test-results.json',
    },
  },
});
