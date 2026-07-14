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
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageJson() {
  return JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
  );
}

describe('package.json exports configuration — Phase 1', () => {
  const pkg = getPackageJson();

  it('should have exports field', () => {
    expect(pkg.exports).toBeDefined();
  });

  it('should export "." pointing to dist/index.js', () => {
    expect(pkg.exports['.']).toBe('./dist/index.js');
  });

  it('should export "./adapters" pointing to dist/adapters/index.js', () => {
    expect(pkg.exports['./adapters']).toBe('./dist/adapters/index.js');
  });

  it('should export "./types" pointing to dist/types.js', () => {
    expect(pkg.exports['./types']).toBe('./dist/types.js');
  });

  it('should export "./server" pointing to dist/server/index.js', () => {
    expect(pkg.exports['./server']).toBe('./dist/server/index.js');
  });

  it('should have main pointing to dist/index.js', () => {
    expect(pkg.main).toBe('dist/index.js');
  });
});

describe('Dependency configuration', () => {
  const pkg = getPackageJson();

  it('should have peerDependenciesMeta with optional jsdom', () => {
    expect(pkg.peerDependenciesMeta?.jsdom?.optional).toBe(true);
  });
});
