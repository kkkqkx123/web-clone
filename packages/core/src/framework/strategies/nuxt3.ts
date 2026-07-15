/**
 * Nuxt 3 Hydration Strategies.
 * 
 * Match condition: window.__NUXT__ global variable exists (detector returns nuxt3).
 * 
 * Hydration method:
 * Nuxt 3 uses Vue 3's automatic hydration mechanism and does not need to be triggered manually.
 * The script just waits for Vue to complete the hydration and outputs the log.
 * 
 * Path rewriting:
 * Nuxt's internal window.__NUXT__.assetsPath must be fixed from absolute /_nuxt/
 * to relative paths so the snapshot works when opened via file:// protocol.
 */

import type { HydrationStrategy } from '../types.js';

export const nuxt3Strategy: HydrationStrategy = {
  framework: 'nuxt3',
  matches: (d) => d.markers.includes('__NUXT__'),
  generateScript: (d) => {
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
        /assetsPath:\s*"\\u002F_nuxt\\u002F"/g,
        'assetsPath:".\\u002Fassets\\u002F_nuxt\\u002F"'
      );
      // 2. Handle literal: assetsPath:"/_nuxt/"  (with or without space after colon)
      fixed = fixed.replace(
        /assetsPath:\s*"\/[^"]*\/"/g,
        'assetsPath:"./assets/_nuxt/"'
      );
      if (fixed !== content) {
        script.textContent = fixed;
      }
    }
  },
};