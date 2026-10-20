/**
 * Nuxt 2 Post-Snapshot Probe Strategy.
 * 
 * Match condition: detection results in nuxt2 (usually recognized by
 * #__nuxt mount point, no __NUXT__ global variable).
 * 
 * This is the ONLY strategy that actively triggers re-hydration:
 * 1. Wait for DOM loading to complete
 * 2. Trigger hydration by window.$nuxt.$mount('#__nuxt')
 * 3. Retry up to 20 times (500ms each).
 * 
 * All other strategies are diagnostic observers only (poll __vue__/__reactRoot$).
 */

import type { PostSnapshotStrategy } from '../types.js';

export const nuxt2Strategy: PostSnapshotStrategy = {
  framework: 'nuxt2',
  alwaysInject: true, // Functional probe: $nuxt.$mount() triggers re-hydration
  matches: (d) => d.framework === 'nuxt2',
  generateProbeScript: (d) => {
    const selector = d.appElement || '#__nuxt';
    return `
<script type="text/javascript">
(function() {
  var retries = 0, maxRetries = 20, delay = 500;
  function tryHydrate() {
    var appEl = document.querySelector('${selector}');
    if (!appEl) return;
    if (appEl.__vue__) { console.log('[Hydration] Nuxt 2 already hydrated'); return; }
    if (window.__NUXT__ && window.$nuxt && window.$nuxt.$mount) {
      try { window.$nuxt.$mount('${selector}'); return; } catch (e) {}
    }
    if (++retries < maxRetries) { setTimeout(tryHydrate, delay); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHydrate);
  } else { setTimeout(tryHydrate, 100); }
})();
<\/script>`;
  },
  rewritePaths: () => {
    // Nuxt 2 does not use ESM-based chunk paths, no path rewriting needed.
  },
};