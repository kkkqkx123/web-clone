/**
 * Nuxt 3 Hydration Strategies.
 * 
 * Match condition: window.__NUXT__ global variable exists (detector returns nuxt3).
 * 
 * Hydration method:
 * Nuxt 3 uses Vue 3's automatic hydration mechanism and does not need to be triggered manually.
 * The script just waits for Vue to complete the hydration and outputs the log.
 */

import type { HydrationStrategy } from '../types.js';

export const nuxt3Strategy: HydrationStrategy = {
  framework: 'nuxt3',
  matches: (d) => d.markers.includes('__NUXT__'),
  needsPathRewrite: false,
  generateScript: (d) => `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('#__nuxt');
  if (!appEl || appEl.__vue__) return;
  console.log('[Hydration] Nuxt 3 detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__vue__ || (window.$nuxt && window.$nuxt.$el)) {
      clearInterval(check);
      console.log('[Hydration] Nuxt 3 hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] Nuxt 3 hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`,
};