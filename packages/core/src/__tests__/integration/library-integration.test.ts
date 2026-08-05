/**
 * Library Integration — Complete Workflow (Phase 1)
 *
 * End-to-end test of the library's snapshot function:
 * - bundle mode with HTTP adapter
 * - single file mode
 * - result structure verification
 *
 * The tests run against a local HTTP server (no external network),
 * so they are deterministic and work offline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, stopTestServer, type TestServer } from './helpers/test-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 所有测试临时输出统一收敛到仓库根目录的 __tests__/outputs/
// （packages/core/src/__tests__/integration/ → 上 5 层为仓库根）
const TEST_OUTPUT_ROOT = resolve(__dirname, '../../../../../__tests__/outputs');

describe('Library Integration — Complete Workflow (Phase 1)', () => {
  const testDir = join(TEST_OUTPUT_ROOT, 'library-integration');
  let testServer: TestServer;
  let TEST_URL: string;

  beforeAll(async () => {
    testServer = await startTestServer();
    TEST_URL = testServer.url;
  });

  afterAll(async () => {
    await stopTestServer(testServer);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should complete full snapshot workflow in bundle mode', async () => {
    const { snapshot } = await import('../../index.js');

    const result = await snapshot({
      url: TEST_URL,
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
    expect(result).toHaveProperty('sourceUrl', TEST_URL);
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('stats');
    expect(result.stats).toHaveProperty('total');
    expect(result.stats).toHaveProperty('fetched');
    expect(result.stats).toHaveProperty('failed');
  }, 30000);

  it('should complete full snapshot workflow in single file mode', async () => {
    const { snapshot } = await import('../../index.js');

    const outputFile = `${testDir}-single.html`;
    const result = await snapshot({
      url: TEST_URL,
      output: outputFile,
      mode: 'single',
      maxAssets: 10,
      concurrency: 4,
      timeout: 15000,
      inline: false,
    });

    expect(existsSync(outputFile)).toBe(true);
    expect(result).toHaveProperty('sourceUrl', TEST_URL);
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('timestamp');
  }, 30000);
});
