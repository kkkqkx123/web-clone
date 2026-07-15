/**
 * VitePress Hydration Strategy.
 * 
 * Matching conditions:
 * - meta generator contains "vitepress"
 * - or HTML contains id="VPContent"
 * 
 * Hydration method:
 * VitePress is loaded dynamically using Vite's ESM import, and the script is inlined in the HTML.
 * There's no need to actively trigger the hydration - VitePress' JS import script is automatically called after loading
 * createApp(App).mount('#app').
 * We just need to make sure the mount point exists and wait for Vue to finish hydrating.
 */

import type { HydrationStrategy } from '../types.js';

export const vitepressStrategy: HydrationStrategy = {
  framework: 'vitepress',
  matches: (d) =>
    d.framework === 'vitepress' ||
    d.markers.some(m => m.includes('generator:vitepress') || m.includes('VPContent')),
  needsPathRewrite: false,
  generateScript: (d) => `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('#app');
  if (!appEl || appEl.__vue__) return;
  console.log('[Hydration] VitePress detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__vue__) {
      clearInterval(check);
      console.log('[Hydration] VitePress hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] VitePress hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`,
};