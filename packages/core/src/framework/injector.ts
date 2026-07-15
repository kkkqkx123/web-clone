/**
 * Hydration script injector.
 * 
 * Process:
 * 1. Read the HTML file
 * 2. Detect the frame type
 * 3. Prioritize the matching strategy
 * 4. Generate the corresponding hydration script
 * 5. Inject into </body
 * 
 * If there is no matching policy (unknown), no script is injected.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { detectFramework } from './detector.js';
import { hydrationStrategies } from './strategies/index.js';
import type { FrameworkDetection } from './types.js';

export interface HydrationInjectOptions {
  /** Output HTML Path */
  htmlPath: string;
  /** Content of downloaded JS files (for enhanced detection) */
  jsContents?: string[];
}

/**
 * Inject the hydration script into the snapshot HTML.
 */
export function injectHydrationScript(
  options: HydrationInjectOptions
): void {
  const { htmlPath, jsContents } = options;

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf8');
  } catch {
    return; // File does not exist, skip silently
  }

  // 1. Detection framework
  const detection = detectFramework(html, jsContents);

  // 2. Prioritized matching strategy
  const strategy = hydrationStrategies.find(s => s.matches(detection));
  if (!strategy || strategy.framework === 'static') {
    return; // No match or degradation strategy, no injection
  }

  // 3. Generate and inject scripts
  const script = strategy.generateScript(detection);
  if (!script) return;

  const modifiedHtml = html.replace('</body>', script + '\n</body>');

  if (modifiedHtml !== html) {
    writeFileSync(htmlPath, modifiedHtml, 'utf8');
  }
}