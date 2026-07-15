/**
 * Astro Hydration Strategy.
 *
 * Match conditions:
 * - Meta generator contains "astro" (detector returns astro)
 *
 * Hydration method:
 * Astro outputs static HTML by default. Interactive components ("islands")
 * are self-bootstrapping via data-astro-* attributes and do not need
 * framework-level hydration monitoring. This strategy is a no-op, similar
 * to the static strategy.
 *
 * Path rewriting:
 * Astro chunks are loaded via DOM <script src="..."> attributes,
 * handled generically by assembleBundle. No framework-internal path configs exist.
 */

import type { HydrationStrategy } from '../types.js';

export const astroStrategy: HydrationStrategy = {
  framework: 'astro',
  matches: (d) =>
    d.framework === 'astro' ||
    d.markers.some(m => m.includes('generator:astro')),
  generateScript: () => {
    // Astro outputs static HTML; interactive islands are self-bootstrapping.
    // No framework-level hydration script needed.
    return '';
  },
  rewritePaths: () => {
    // Astro is static, no framework-internal path configs.
  },
};