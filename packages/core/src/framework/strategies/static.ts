/**
 * Degradation strategy (purely static pages).
 * Always matches, but does not generate any hydration scripts.
 */

import type { HydrationStrategy } from '../types.js';

export const staticStrategy: HydrationStrategy = {
  framework: 'static',
  matches: () => true,      // Always match, as a pocket
  needsPathRewrite: false,
  generateScript: () => '',  // No scripts are generated
};