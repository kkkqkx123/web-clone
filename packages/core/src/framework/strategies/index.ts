/**
 * Post-Snapshot Probe Strategy Registry.
 * 
 * Strategies are listed in descending order of match priority.
 * The first matching strategy wins; no subsequent strategies are tried.
 * 
 * When adding a new strategy:
 * 1. Create a strategy file implementing PostSnapshotStrategy
 * 2. Insert it at the appropriate position in this array by priority
 */

import type { PostSnapshotStrategy } from '../types.js';
import { nuxt3Strategy } from './nuxt3.js';
import { nextjsStrategy } from './nextjs.js';
import { vitepressStrategy } from './vitepress.js';
import { astroStrategy } from './astro.js';
import { nuxt2Strategy } from './nuxt2.js';
import { vue2Strategy } from './vue2.js';
import { vue3Strategy } from './vue3.js';
import { sveltekitStrategy } from './sveltekit.js';
import { react18Strategy } from './react18.js';
import { angularStrategy } from './angular.js';
import { staticStrategy } from './static.js';

/**
 * Post-Snapshot Probe Strategy Registry.
 * 
 * Uses ordered lists rather than numeric values — only the match order is meaningful.
 * The first strategy whose `matches()` returns true wins.
 */
export const postSnapshotStrategies: PostSnapshotStrategy[] = [
  // ── First Tier: Exact Match, High Confidence (0.95) ──────────────────
  nuxt3Strategy,     // Match: window.__NUXT__ + #__nuxt
  nextjsStrategy,    // Match: window.__NEXT_DATA__ + #__next

  // ── Second Tier: Meta-Generator Match, High Confidence (0.9) ─────────────────
  vitepressStrategy, // Match: <meta generator="VitePress"> or #VPContent
  astroStrategy,     // Match: <meta generator="Astro">

  // ── Third Tier: JS Content Scan, Medium-High Confidence ──────────────
  nuxt2Strategy,     // Match: #__nuxt without __NUXT__ (0.5)
  vue2Strategy,      // Match: Vue 2 (Vue.version starts with '2', new Vue({) patterns)
  vue3Strategy,      // Match: JS containing createSSRApp or __VUE__ (0.8)
  sveltekitStrategy, // Match: JS containing @sveltejs/kit or __sveltekit (0.7)
  react18Strategy,   // Match: JS containing hydrateRoot or __REACT_DEVTOOLS (0.7)
  angularStrategy,   // Match: JS containing ng.probe or platformBrowser (0.7)

  // ── Fallback: no framework or unrecognized, no probe script ─────────
  staticStrategy,    // Match: always (no-op)
];