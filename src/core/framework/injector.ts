/**
 * Post-snapshot probe script injector.
 * 
 * Process:
 * 1. Read the HTML file
 * 2. Use the pre-computed detection result (or detect fresh if not provided)
 * 3. Find the matching post-snapshot strategy
 * 4. Generate the corresponding probe script
 * 5. Inject before </body>
 * 
 * If no matching strategy (unknown), no script is injected.
 * Note: most strategies' scripts are diagnostic observers; only Nuxt 2
 * actively triggers re-hydration via $nuxt.$mount().
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { detectFramework } from './detector.js';
import { postSnapshotStrategies } from './strategies/index.js';
import type { FrameworkDetection } from './types.js';

export interface HydrationInjectOptions {
  /** Output HTML Path */
  htmlPath: string;
  /** Content of downloaded JS files (for enhanced detection) */
  jsContents?: string[];
  /**
   * Pre-computed framework detection result from the assembler pipeline.
   * When provided, skips redundant re-detection of the HTML.
   */
  detection?: FrameworkDetection;
  /**
   * When true, inject diagnostic probe scripts into the snapshot HTML.
   * Probe scripts poll framework internal markers (__vue__, __reactRoot$, etc.)
   * and log hydration status to the console. Defaults to false.
   */
  debugProbe?: boolean;
}

/**
 * Inject the probe script into the snapshot HTML.
 */
export function injectHydrationScript(
  options: HydrationInjectOptions
): void {
  const { htmlPath, jsContents, detection, debugProbe } = options;

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf8');
  } catch {
    return; // File does not exist, skip silently
  }

  // 1. Use pre-computed detection or detect fresh
  const det = detection ?? detectFramework(html, jsContents);

  // 2. Find matching post-snapshot strategy
  const strategy = postSnapshotStrategies.find(s => s.matches(det));
  if (!strategy || strategy.framework === 'static') {
    return; // No match or fallback strategy, no injection
  }

  // 3. Inject probe script when either:
  //    - debugProbe is enabled (diagnostic probes for all frameworks), OR
  //    - strategy.alwaysInject is true (functional probes, e.g. Nuxt 2 $nuxt.$mount())
  const shouldInject = debugProbe || strategy.alwaysInject;
  if (!shouldInject) return;

  const script = strategy.generateProbeScript(det);
  if (!script) return;

  const modifiedHtml = html.replace(/<\/body>/i, script + '\n</body>');

  if (modifiedHtml !== html) {
    writeFileSync(htmlPath, modifiedHtml, 'utf8');
  }
}
