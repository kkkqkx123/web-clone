/**
 * CLI End-to-End Tests (Phase 3)
 *
 * Verifies that the CLI can be invoked via npx tsx and produces output.
 *
 * Scenarios covered:
 * - Bundle mode
 * - Single file mode
 * - Pretty flag
 *
 * Note: These tests spawn a real process and connect to the network.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

describe('CLI E2E — Full Pipeline (Phase 3)', () => {
  const testDir = './test-cli-e2e-output';

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    const singleFile = `${testDir}.html`;
    if (existsSync(singleFile)) {
      rmSync(singleFile);
    }
  });

  it('should run bundle mode via npx tsx', () => {
    const output = execSync(
      `npx tsx src/cli.ts https://example.com -o ${testDir} -m bundle --max-assets 10`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    expect(output).toContain('complete');
    expect(existsSync(`${testDir}/index.html`)).toBe(true);
  });

  it('should support single file mode', () => {
    const outputFile = `${testDir}.html`;
    const output = execSync(
      `npx tsx src/cli.ts https://example.com -o ${outputFile} -m single --max-assets 10 --no-inline`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    expect(output).toContain('complete');
    expect(existsSync(outputFile)).toBe(true);
  });

  it('should support --pretty flag', () => {
    const output = execSync(
      `npx tsx src/cli.ts https://example.com -o ${testDir} -m bundle --pretty --max-assets 10`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    expect(output).toContain('complete');
    expect(existsSync(`${testDir}/index.html`)).toBe(true);
  });
});
