/**
 * Nuxt 3 Post-Snapshot Probe Strategy.
 * 
 * Match condition: window.__NUXT__ global variable exists (detector returns nuxt3).
 * 
 * Probe method:
 * Nuxt 3 uses Vue 3's automatic hydration — this script is a diagnostic observer
 * that polls for `__vue__` on the app element to confirm hydration completed.
 * It does NOT trigger re-hydration.
 * 
 * Path rewriting:
 * Nuxt's internal window.__NUXT__.assetsPath must be fixed from absolute /_nuxt/
 * to relative paths so the snapshot works when opened via file:// protocol.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const nuxt3Strategy: PostSnapshotStrategy = {
  framework: 'nuxt3',
  matches: (d) => d.markers.includes('__NUXT__'),
  generateProbeScript: (d) => {
    const appEl = d.appElement || '#__nuxt';
    return `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('${appEl}');
  if (!appEl || appEl.__vue__) return;
  console.log('[Hydration] Nuxt 3 detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__vue__ || (window.$nuxt && window.$nuxt.$el)) {
      clearInterval(check);
      console.log('[Hydration] Nuxt 3 hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] Nuxt 3 hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`;
  },
  rewritePaths: (document: Document) => {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const content = script.textContent || '';
      // Only process the script containing window.__NUXT__ with assetsPath
      if (!content.includes('window.__NUXT__') || !content.includes('assetsPath')) {
        continue;
      }
      let fixed = content;
      // 1. Handle Unicode-encoded: assetsPath:"\/_nuxt\/"  (with or without space after colon)
      fixed = fixed.replace(
        /assetsPath:\s*"\\u002F([^"\\]+)\\u002F"/g,
        'assetsPath:".\\u002Fassets\\u002F$1\\u002F"'
      );
      // 2. Handle literal: assetsPath:"/_nuxt/"  (preserve original subdirectory name)
      fixed = fixed.replace(
        /assetsPath:\s*"\/([^"]*\/)"/g,
        'assetsPath:"./assets/$1"'
      );
      if (fixed !== content) {
        script.textContent = fixed;
      }
    }
  },
};