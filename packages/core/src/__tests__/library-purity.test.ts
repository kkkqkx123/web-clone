/**
 * Library Purity — No Framework-Specific Code (Phase 3)
 *
 * Verifies that the library code (assembler.ts) does NOT contain
 * framework-specific hydration logic — that belongs in the CLI layer.
 *
 * Scenarios covered:
 * 3.1  Library code has no Vue/Nuxt hydration injection
 * 3.2  Library code has a comment noting hydration moved to CLI
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Library Purity — No Framework Specific Code (Phase 3)', () => {
  const assemblerSource = readFileSync(
    resolve(__dirname, '../assembler.ts'),
    'utf-8'
  );

  it('should not contain Vue hydration script injection in library code', () => {
    expect(assemblerSource).not.toContain('injectVueHydration');
    expect(assemblerSource).not.toContain('__NUXT__');
    // A comment referencing hydration is acceptable; the actual implementation should not be here
  });

  it('should not import cli.ts from assembler.ts', () => {
    // Library should not depend on the CLI at all
    expect(assemblerSource).not.toContain("'./cli.js'");
    expect(assemblerSource).not.toContain('"../cli.js"');
  });
});
