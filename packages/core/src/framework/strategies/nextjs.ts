/**
 * Next.js Hydration Strategy.
 *
 * Match conditions:
 * - window.__NEXT_DATA__ global variable exists (detector returns nextjs)
 * - or HTML contains id="__next" (low confidence fallback)
 *
 * Hydration method:
 * Next.js uses React 18's hydrateRoot() automatically after loading the
 * bootstrap chunks. The script waits for __reactRoot$ to appear on #__next.
 *
 * Path rewriting:
 * Next.js chunks are loaded via DOM <script src="/_next/static/chunks/...">
 * attributes, which are handled generically by assembleBundle via data-origin-url.
 * The __NEXT_DATA__ script contains only route/component data (page, buildId),
 * not asset paths, so no framework-internal path rewriting is needed.
 */

import type { HydrationStrategy } from '../types.js';

export const nextjsStrategy: HydrationStrategy = {
  framework: 'nextjs',
  matches: (d) =>
    d.framework === 'nextjs' ||
    d.markers.includes('__NEXT_DATA__') ||
    (!d.markers.includes('__NUXT__') && !d.markers.includes('__VUE__') && d.appElement === '#__next'),
  generateScript: (d) => `
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