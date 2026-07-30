/**
 * Astro Post-Snapshot Probe Strategy.
 *
 * Match conditions:
 * - Meta generator contains "astro" (detector returns astro)
 *
 * Probe method:
 * Astro outputs static HTML by default. Interactive components ("islands")
 * are self-bootstrapping via data-astro-* attributes. No probe script needed.
 * This strategy is a no-op (empty script).
 */

import type { PostSnapshotStrategy } from '../types.js';

export const astroStrategy: PostSnapshotStrategy = {
  framework: 'astro',
  matches: (d) =>
    d.framework === 'astro' ||
    d.markers.some(m => m.includes('generator:astro')),
  generateProbeScript: () => {
    // Astro outputs static HTML; interactive islands are self-bootstrapping.
    // No framework-level hydration script needed.
    return '';
  },
  rewritePaths: () => {
    // Astro is static, no framework-internal path configs.
  },
};