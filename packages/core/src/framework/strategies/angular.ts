/**
 * Angular Hydration Strategy.
 *
 * Match conditions:
 * - JS content contains ng.probe or platformBrowser (detector returns angular)
 * - HTML contains ng-version attribute or ng-app directive
 *
 * Hydration method:
 * Angular SSR uses platformBrowserDynamic().bootstrapModule(AppModule) to
 * bootstrap the application. The script waits for the root element to gain
 * the ng-version attribute (set by Angular after successful bootstrapping).
 *
 * Path rewriting:
 * Angular chunks are loaded via DOM <script src="..."> attributes,
 * handled generically by assembleBundle. No framework-internal path configs
 * exist in the detected SSR output.
 */

import type { HydrationStrategy } from '../types.js';

export const angularStrategy: HydrationStrategy = {
  framework: 'angular',
  matches: (d) =>
    d.framework === 'angular' ||
    d.markers.includes('angular'),
  generateScript: (d) => {
    // Find the Angular root element (has ng-version attribute after bootstrap)
    return `
<script type="text/javascript">
(function() {
  function findRoot() {
    var els = document.querySelectorAll('[ng-version]');
    if (els.length > 0) {
      console.log('[Hydration] Angular already hydrated');
      return;
    }
    var appEl = document.querySelector('[ng-app]') || document.querySelector('.app-root');
    if (!appEl) return;
    console.log('[Hydration] Angular detected, waiting for bootstrapping...');
    var retries = 0;
    var check = setInterval(function() {
      if (document.querySelector('[ng-version]')) {
        clearInterval(check);
        console.log('[Hydration] Angular hydration successful');
      }
      if (++retries > 30) {
        clearInterval(check);
        console.log('[Hydration] Angular hydration timeout (non-fatal)');
      }
    }, 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', findRoot);
  } else { setTimeout(findRoot, 100); }
})();
<\/script>`;
  },
  rewritePaths: () => {
    // Angular chunks are loaded via DOM <script src="...">, handled by assembleBundle.
    // Angular's internal config (if any) is set via APP_BASE_HREF which is a DOM
    // <base href="..."> tag, not a JS config object.
  },
};