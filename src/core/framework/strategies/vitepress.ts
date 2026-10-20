/**
 * VitePress Post-Snapshot Probe Strategy.
 * 
 * Matching conditions:
 * - meta generator contains "vitepress"
 * - or HTML contains id="VPContent"
 * 
 * Probe method:
 * VitePress uses Vite's ESM import to load and call createApp(App).mount('#app').
 * This script is a diagnostic observer that polls for `__vue__` on the app element.
 * It does NOT trigger re-hydration.
 */

import type { PostSnapshotStrategy } from '../types.js';

export const vitepressStrategy: PostSnapshotStrategy = {
  framework: 'vitepress',
  matches: (d) =>
    d.framework === 'vitepress' ||
    d.markers.some(m => m.includes('generator:vitepress') || m.includes('VPContent')),
  generateProbeScript: (d) => {
    const appEl = d.appElement || '#app';
    return `
<script type="text/javascript">
(function() {
  var appEl = document.querySelector('${appEl}');
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
<\/script>`;
  },
  rewritePaths: () => {
    // VitePress uses ESM module imports via Vite, paths are relative; no rewriting needed.
  },
};