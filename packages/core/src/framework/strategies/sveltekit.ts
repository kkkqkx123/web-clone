/**
 * SvelteKit Hydration Strategy.
 *
 * Match conditions:
 * - window.__SVELTEKIT__ global variable exists (detector returns sveltekit)
 * - <meta generator="SvelteKit"> tag present
 * - JS content contains @sveltejs/kit or __sveltekit
 * - HTML contains id="svelte" (low confidence fallback)
 *
 * Hydration method:
 * SvelteKit uses Svelte's automatic hydration mechanism. After the JS bundle
 * is loaded, SvelteKit's client-side app hydrates the SSR-rendered DOM.
 * The script waits for the mount point to gain the __svelte internal marker
 * (set by Svelte after successful hydration).
 *
 * Path rewriting:
 * SvelteKit chunks are loaded via DOM <script src="..."> attributes,
 * handled generically by assembleBundle. No framework-internal path configs
 * exist in the detected SSR output.
 */

import type { HydrationStrategy } from '../types.js';

export const sveltekitStrategy: HydrationStrategy = {
  framework: 'sveltekit',
  matches: (d) =>
    d.framework === 'sveltekit' ||
    d.markers.includes('__SVELTEKIT__') ||
    d.markers.includes('__sveltekit'),
  generateScript: (d) => {
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