/**
 * Fallback strategy (purely static pages).
 * Always matches, but generates no probe script.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const staticStrategy: PostSnapshotStrategy = {
  framework: 'static',
  matches: () => true,      // Always match, as fallback
  generateProbeScript: () => '',  // No script generated
  rewritePaths: () => {
    // Static pages have no framework; no rewriting needed.
  },
};