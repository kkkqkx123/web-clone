import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotOptions } from '@web-clone/core';

/**
 * CLI post-processing: inject Vue/Nuxt hydration script into the output HTML.
 *
 * This was moved from the library (assembler.ts) to the CLI layer to keep the
 * library framework-agnostic. It performs string-based injection (no JSDOM
 * dependency needed in the CLI).
 *
 * The script helps Vue/Nuxt SSR snapshots hydrate properly when opened locally.
 *
 * @internal Exported for unit testing purposes.
 */
export function injectVueHydrationForCli(options: SnapshotOptions): void {
  // Determine the output HTML file path
  const htmlPath = options.mode === 'bundle'
    ? join(options.output, 'index.html')
    : options.output;

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf8');
  } catch {
    // File not found or unreadable — silently skip
    return;
  }

  // Only inject if the page has Vue/Nuxt app markers
  if (!html.includes('id="__nuxt"') && !html.includes('id="app"')) {
    return;
  }

  const hydrationScript = `<script type="text/javascript">
(function() {
  var retries = 0;
  var maxRetries = 20;
  var delay = 500;

  function tryHydrate() {
    var appEl = document.querySelector('#__nuxt') || document.querySelector('#app');
    if (!appEl) return;
    if (appEl.__vue__) {
      console.log('[Snapshot Hydration] Vue already hydrated');
      return;
    }
    if (window.__NUXT__) {
      console.log('[Snapshot Hydration] Attempting to trigger Vue hydration...');
      if (window.$nuxt && window.$nuxt.$mount) {
        try {
          window.$nuxt.$mount('#__nuxt');
          console.log('[Snapshot Hydration] Nuxt 2.x mount triggered');
          return;
        } catch (e) {
          console.log('[Snapshot Hydration] Nuxt 2.x mount failed:', e.message);
        }
      }
      if (window.$nuxt && window.$nuxt.$el) {
        console.log('[Snapshot Hydration] Nuxt 3.x already initialized');
        return;
      }
    }
    retries++;
    if (retries < maxRetries) {
      setTimeout(tryHydrate, delay);
    } else {
      console.log('[Snapshot Hydration] Max retries reached, hydration may be incomplete');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHydrate);
  } else {
    setTimeout(tryHydrate, 100);
  }
})();
<\/script>`;

  // Inject before </body>
  const modifiedHtml = html.replace('</body>', hydrationScript + '\n</body>');
  if (modifiedHtml !== html) {
    writeFileSync(htmlPath, modifiedHtml, 'utf8');
  }
}