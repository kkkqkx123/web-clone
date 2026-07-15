/**
 * React 18 Hydration Strategy.
 *
 * Match conditions:
 * - JS content contains hydrateRoot or __REACT_DEVTOOLS tags (detector returns react18)
 * - Low confidence detection without specific framework markers (e.g. no
 *   __NEXT_DATA__, no __NUXT__)
 *
 * Hydration method:
 * React 18's hydrateRoot() is called automatically by the application code.
 * The script just waits for the root element to gain React's internal markers.
 *
 * Path rewriting:
 * React 18 apps load chunks via DOM <script src="..."> attributes,
 * handled generically by assembleBundle. No framework-internal path configs exist.
 */

import type { HydrationStrategy } from '../types.js';

export const react18Strategy: HydrationStrategy = {
  framework: 'react18',
  matches: (d) =>
    d.framework === 'react18' ||
    d.markers.includes('__REACT_DEVTOOLS'),
  generateScript: (d) => {
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