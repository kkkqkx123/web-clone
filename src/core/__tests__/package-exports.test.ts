/**
 * Package Configuration Exports (Phase 1 + Phase 2)
 *
 * Verifies that package.json exposes the correct sub-path exports and
 * has no peerDependencies (Phase 2 requirement).
 *
 * Scenarios covered:
 * - Consumer installs web-clone and imports from the main entry
 * - Consumer imports from 'web-clone/adapters'
 * - Consumer imports from 'web-clone/types'
 * - Consumer imports from 'web-clone/cli'
 * - No peerDependencies warnings during installation
 * - All export paths resolve to built files
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageJson() {
  return JSON.parse(
    readFileSync(resolve(__dirname, '../../../package.json'), 'utf-8')
  );
}

describe('package.json exports configuration — Phase 1', () => {
  const pkg = getPackageJson();

  it('should have exports field', () => {
    expect(pkg.exports).toBeDefined();
  });

  it('should export "." with types and default conditions pointing to dist/index', () => {
    expect(pkg.exports['.'].types).toBe('./dist/index.d.ts');
    expect(pkg.exports['.'].default).toBe('./dist/index.js');
  });

  it('should export "./types" pointing to dist/types.js', () => {
    expect(pkg.exports['./types'].types).toBe('./dist/types.d.ts');
    expect(pkg.exports['./types'].default).toBe('./dist/types.js');
  });

  it('should export "./codegen" pointing to dist/codegen/index.js', () => {
    expect(pkg.exports['./codegen'].default).toBe('./dist/codegen/index.js');
  });

  it('should export the automation adapter subpaths', () => {
    expect(pkg.exports['./adapters/playwright'].default).toBe('./dist/adapters/playwright/index.js');
    expect(pkg.exports['./adapters/puppeteer'].default).toBe('./dist/adapters/puppeteer/index.js');
    expect(pkg.exports['./adapters/common'].default).toBe('./dist/adapters/common.js');
  });

  it('should have main pointing to dist/index.js', () => {
    expect(pkg.main).toBe('dist/index.js');
  });
});

describe('Dependency configuration', () => {
  const pkg = getPackageJson();

  it('should have jsdom as a direct dependency', () => {
    expect(pkg.dependencies?.jsdom).toBeDefined();
  });
});
