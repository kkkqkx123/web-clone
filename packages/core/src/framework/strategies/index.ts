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
import { vitepressStrategy } from './vitepress.js';
import { nuxt2Strategy } from './nuxt2.js';
import { vue3Strategy } from './vue3.js';
import { staticStrategy } from './static.js';

/**
 * Hydration Strategy Registry.
 * 
 * Prioritization uses ordered lists rather than numeric values because only the order of matches is meaningful.
 * 
 * The first-ranked policy matches first, and no subsequent policies are attempted after a successful match.
 */
export const hydrationStrategies: HydrationStrategy[] = [
  // ── First Tier: Exact Match, High Confidence ──────────────────────
  nuxt3Strategy,    // Match: window.__NUXT__ + #__nuxt

  // ── Second tier: medium confidence with clear framework markers ──────────────
  vitepressStrategy, // Match: <meta generator="VitePress"> or #VPContent
  nuxt2Strategy,     // Match: #__nuxt + window.$nuxt
  vue3Strategy,      // Match: JS containing createSSRApp

  // ── Degradation strategy: no frame or unrecognizable, no script injection ─────────
  staticStrategy,    // Match: all cases (always match), null operation
];