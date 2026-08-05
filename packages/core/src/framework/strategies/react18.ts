/**
 * React 18 Post-Snapshot Probe Strategy.
 *
 * Match conditions:
 * - JS content contains hydrateRoot or __REACT_DEVTOOLS markers
 * - Low-tier detection without specific framework markers
 *
 * Probe method:
 * React 18's hydrateRoot() is called automatically by the application code.
 * This script is a diagnostic observer that polls for __reactRoot$ on the
 * root element. It does NOT trigger re-hydration.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const react18Strategy: PostSnapshotStrategy = {
  framework: 'react18',
  matches: (d) =>
    d.framework === 'react18' ||
    d.markers.includes('__REACT_DEVTOOLS'),
  generateProbeScript: (d) => {
    const rootEl = d.appElement || '#root';
    return `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('${rootEl}');
  if (!appEl) return;
  if (appEl.__reactRoot$) {
    console.log('[Hydration] React 18 already hydrated');
    return;
  }
  console.log('[Hydration] React 18 detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__reactRoot$) {
      clearInterval(check);
      console.log('[Hydration] React 18 hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] React 18 hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`;
  },
  rewritePaths: () => {
    // React 18 does not use framework-internal path configs.
    // All chunk paths are in DOM attributes, handled by assembleBundle.
  },
};