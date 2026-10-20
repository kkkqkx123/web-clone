/**
 * Vue 2 Post-Snapshot Probe Strategy.
 *
 * Match condition:
 * - detection framework is 'vue2' (identified via Vue.version or new Vue({) patterns)
 *
 * Probe method:
 * Vue 2's new Vue({el: '#app'}) hydrates automatically. This script is a diagnostic
 * observer that polls for `_isMounted` on the app element — a Vue 2 internal property
 * set after $mount() completes.
 * It does NOT trigger re-hydration.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const vue2Strategy: PostSnapshotStrategy = {
  framework: 'vue2',
  matches: (d) => d.framework === 'vue2',
  generateProbeScript: (d) => {
    const appEl = d.appElement || '#app';
    return `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('${appEl}');
  if (!appEl) return;
  if (appEl._isMounted || appEl.__vue__) {
    console.log('[Hydration] Vue 2 already hydrated');
    return;
  }
  console.log('[Hydration] Vue 2 detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl._isMounted || appEl.__vue__) {
      clearInterval(check);
      console.log('[Hydration] Vue 2 hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] Vue 2 hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`;
  },
  rewritePaths: () => {
    // Vue 2 apps do not have framework-internal path configs; no rewriting needed.
  },
};
