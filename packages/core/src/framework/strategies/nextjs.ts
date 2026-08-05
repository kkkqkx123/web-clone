/**
 * Next.js Post-Snapshot Probe Strategy.
 *
 * Match conditions:
 * - window.__NEXT_DATA__ global variable exists (detector returns nextjs)
 * - or HTML contains id="__next" (moderate tier fallback)
 *
 * Probe method:
 * Next.js uses React 18's hydrateRoot() automatically. This script is a
 * diagnostic observer that polls for __reactRoot$ on #__next.
 * It does NOT trigger re-hydration.
 *
 * Path rewriting:
 * Next.js chunks are loaded via DOM <script src="/_next/static/chunks/...">
 * attributes, handled generically by assembleBundle via data-origin-url.
 * The __NEXT_DATA__ script contains only route/component data, not asset paths.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const nextjsStrategy: PostSnapshotStrategy = {
  framework: 'nextjs',
  matches: (d) =>
    d.framework === 'nextjs' ||
    d.markers.includes('__NEXT_DATA__'),
  generateProbeScript: (d) => `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('#__next');
  if (!appEl) return;
  if (appEl.__reactRoot$) {
    console.log('[Hydration] Next.js already hydrated');
    return;
  }
  console.log('[Hydration] Next.js detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__reactRoot$) {
      clearInterval(check);
      console.log('[Hydration] Next.js hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] Next.js hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`,
  rewritePaths: () => {
    // Next.js chunks are loaded via DOM <script src="...">, handled by assembleBundle.
    // __NEXT_DATA__ script contains route/component data, not asset paths.
  },
};