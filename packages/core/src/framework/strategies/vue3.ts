/**
 * Vue 3 hydration strategy.
 * 
 * Match condition:
 * - JS content contains createSSRApp or __VUE__ tags
 * - or the meta generator is VuePress.
 * 
 * hydration method:
 * Vue 3's createSSRApp is automatically hydrated, the script just waits for it to complete.
 */

import type { HydrationStrategy } from '../types.js';

export const vue3Strategy: HydrationStrategy = {
  framework: 'vue3',
  matches: (d) => d.framework === 'vue3',
  generateScript: (d) => {
    const appEl = d.appElement || '#app';
    return `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('${appEl}');
  if (!appEl || appEl.__vue__) return;
  console.log('[Hydration] Vue 3 detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__vue__) {
      clearInterval(check);
      console.log('[Hydration] Vue 3 hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] Vue 3 hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`;
  },
  rewritePaths: () => {
    // Vue 3 apps do not have framework-internal path configs; no rewriting needed.
  },
};