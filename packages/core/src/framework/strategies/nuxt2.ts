/**
 * Nuxt 2 Hydration Strategies.
 * 
 * Match condition: detection results in nuxt2 (usually recognized by #__nuxt mount point, no __NUXT__ global variable).
 * 
 * Hydration method:
 * 1. wait for DOM loading to complete
 * 2. trigger hydration by window.$nuxt.$mount('#__nuxt')
 * 3. retry up to 20 times (each time 500ms).
 */

import type { HydrationStrategy } from '../types.js';

export const nuxt2Strategy: HydrationStrategy = {
  framework: 'nuxt2',
  matches: (d) => d.framework === 'nuxt2',
  needsPathRewrite: false,
  generateScript: (d) => `
<script type="text/javascript">
(function() {
  var retries = 0, maxRetries = 20, delay = 500;
  function tryHydrate() {
    var appEl = document.querySelector('#__nuxt');
    if (!appEl) return;
    if (appEl.__vue__) { console.log('[Hydration] Nuxt 2 already hydrated'); return; }
    if (window.__NUXT__ && window.$nuxt && window.$nuxt.$mount) {
      try { window.$nuxt.$mount('#__nuxt'); return; } catch (e) {}
    }
    if (++retries < maxRetries) { setTimeout(tryHydrate, delay); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHydrate);
  } else { setTimeout(tryHydrate, 100); }
})();
<\/script>`,
};