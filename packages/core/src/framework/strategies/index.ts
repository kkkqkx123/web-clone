/**
 * Hydration Strategy Registry.
 * 
 * Policies are listed in descending order of match priority.
 * The top-ranked strategy matches first, and no subsequent strategies are attempted after a successful match.
 * 
 * When adding a new policy:
 * 1. create a policy file
 * 2. Insert the appropriate position in this array in order of priority.
 */

import type { HydrationStrategy } from '../types.js';
import { nuxt3Strategy } from './nuxt3.js';
import { nextjsStrategy } from './nextjs.js';
import { vitepressStrategy } from './vitepress.js';
import { astroStrategy } from './astro.js';
import { nuxt2Strategy } from './nuxt2.js';
import { vue3Strategy } from './vue3.js';
import { sveltekitStrategy } from './sveltekit.js';
import { react18Strategy } from './react18.js';
import { angularStrategy } from './angular.js';
import { staticStrategy } from './static.js';

/**
 * Hydration Strategy Registry.
 * 
 * Prioritization uses ordered lists rather than numeric values because only the order of matches is meaningful.
 * 
 * The first-ranked policy matches first, and no subsequent policies are attempted after a successful match.
 */
export const hydrationStrategies: HydrationStrategy[] = [
  // ── First Tier: Exact Match, High Confidence (0.95) ──────────────────
  nuxt3Strategy,     // Match: window.__NUXT__ + #__nuxt
  nextjsStrategy,    // Match: window.__NEXT_DATA__ + #__next

  // ── Second Tier: Meta-Generator Match, High Confidence (0.9) ─────────────────
  vitepressStrategy, // Match: <meta generator="VitePress"> or #VPContent
  astroStrategy,     // Match: <meta generator="Astro">

  // ── Third Tier: JS Content Scan, Medium-High Confidence ──────────────
  nuxt2Strategy,     // Match: #__nuxt without __NUXT__ (0.5)
  vue3Strategy,      // Match: JS containing createSSRApp or __VUE__ (0.8)
  sveltekitStrategy, // Match: JS containing @sveltejs/kit or __sveltekit (0.7)
  react18Strategy,   // Match: JS containing hydrateRoot or __REACT_DEVTOOLS (0.7)
  angularStrategy,   // Match: JS containing ng.probe or platformBrowser (0.7)

  // ── Degradation strategy: no frame or unrecognizable, no script injection ─────────
  staticStrategy,    // Match: all cases (always match), null operation
];