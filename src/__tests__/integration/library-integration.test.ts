/**
 * Library Integration — Complete Workflow (Phase 1)
 *
 * End-to-end test of the library's snapshot function:
 * - bundle mode with HTTP adapter
 * - single file mode
 * - result structure verification
 *
 * Note: These tests connect to real network (https://example.com).
 * Since example.com has no sub-resources, stats.total may be 0.
 * We validate the result STRUCTURE, not asset counts.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, rmSync } from 'node:fs';

describe('Library Integration — Complete Workflow (Phase 1)', () => {
  const testDir = './__tests__/outputs/library-integration';

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should complete full snapshot workflow in bundle mode', async () => {
    const { snapshot } = await import('../../index.js');

    const result = await snapshot({
      url: 'https://example.com',
      output: testDir,
      mode: 'bundle',
      maxAssets: 50,
      concurrency: 4,
      timeout: 15000,
      pretty: true,
    });

    // Verify output structure
    expect(existsSync(`${testDir}/index.html`)).toBe(true);

    // Verify result has correct structure
    expect(result).toHaveProperty('sourceUrl', 'https://example.com');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('stats');
    expect(result.stats).toHaveProperty('total');
    expect(result.stats).toHaveProperty('fetched');
    expect(result.stats).toHaveProperty('failed');
  });

  it('should complete full snapshot workflow in single file mode', async () => {
    const { snapshot } = await import('../../index.js');

    const outputFile = `${testDir}-single.html`;
    const result = await snapshot({
      url: 'https://example.com',
      output: outputFile,
      mode: 'single',
      maxAssets: 10,
      concurrency: 4,
      timeout: 15000,
      inline: false,
    });

    expect(existsSync(outputFile)).toBe(true);
    expect(result).toHaveProperty('sourceUrl', 'https://example.com');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('timestamp');
  });
});
