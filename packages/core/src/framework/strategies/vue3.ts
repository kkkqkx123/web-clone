/**
 * Vue 3 Post-Snapshot Probe Strategy.
 * 
 * Match condition:
 * - JS content contains createSSRApp or __VUE__ markers
 * - or the meta generator is VuePress.
 * 
 * Probe method:
 * Vue 3's createSSRApp hydrates automatically. This script is a diagnostic
 * observer that polls for `__vue__` on the app element.
 * It does NOT trigger re-hydration.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const vue3Strategy: PostSnapshotStrategy = {
  framework: 'vue3',
  matches: (d) => d.framework === 'vue3',
  generateProbeScript: (d) => {
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