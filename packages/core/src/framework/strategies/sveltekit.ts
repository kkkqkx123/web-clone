/**
 * SvelteKit Post-Snapshot Probe Strategy.
 *
 * Match conditions:
 * - window.__sveltekit__ global variable or window.__SVELTEKIT__ marker
 * - <meta generator="SvelteKit"> tag present
 * - JS content contains @sveltejs/kit or __sveltekit
 * - HTML contains id="svelte" (weak tier fallback)
 *
 * Probe method:
 * SvelteKit uses Svelte's automatic hydration. This script is a diagnostic
 * observer that polls for the __svelte internal marker on the mount point.
 * It does NOT trigger re-hydration.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const sveltekitStrategy: PostSnapshotStrategy = {
  framework: 'sveltekit',
  matches: (d) =>
    d.framework === 'sveltekit' ||
    d.markers.includes('__SVELTEKIT__') ||
    d.markers.includes('__sveltekit'),
  generateProbeScript: (d) => {
    const appEl = d.appElement || '#svelte';
    return `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('${appEl}');
  if (!appEl) return;
  if (appEl.__svelte) {
    console.log('[Hydration] SvelteKit already hydrated');
    return;
  }
  console.log('[Hydration] SvelteKit detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__svelte) {
      clearInterval(check);
      console.log('[Hydration] SvelteKit hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] SvelteKit hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`;
  },
  rewritePaths: () => {
    // SvelteKit chunks are loaded via DOM <script src="...">, handled by assembleBundle.
    // SvelteKit's internal data (if any) is passed via data-sveltekit attributes,
    // not a JS config object requiring path rewriting.
  },
};