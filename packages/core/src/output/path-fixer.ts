/**
 * Fixes absolute paths in generated snapshots to support file:// protocol opening
 * Handles framework-specific configuration and static path references
 *
 * NOTE: DOM element attribute path fixes (script[src], link[href], etc.) are
 * handled by assembleBundle() via data-origin-url. This module only fixes
 * framework-internal configuration objects (e.g. Nuxt's window.__NUXT__.assetsPath)
 * that are not reachable through DOM element attributes.
 */

export interface PathFixerOptions {
  // Base path for relative path conversion (e.g., 'assets/')
  basePath?: string;
}

/**
 * Fix Nuxt framework configuration
 * Converts assetsPath from /_nuxt/ to ./assets/js/_nuxt/
 * Handles both literal and Unicode-encoded versions
 */
export function fixNuxtConfig(document: Document): void {
  const scripts = Array.from(document.querySelectorAll('script'));

  for (const script of scripts) {
    const content = script.textContent || '';

    // Check if this is the Nuxt config script
    if (!content.includes('window.__NUXT__') || !content.includes('assetsPath')) {
      continue;
    }

    // Direct string replacement approaches for both encoded and literal forms
    let fixed = content;

    // 1. Handle Unicode-encoded: assetsPath:"/_nuxt/"
    fixed = fixed.replace(/assetsPath:"\\u002F_nuxt\\u002F"/g, 'assetsPath:".\\u002Fassets\\u002Fjs\\u002F_nuxt\\u002F"');

    // 2. Handle literal: assetsPath:"/_nuxt/"
    fixed = fixed.replace(/assetsPath:"\/[^"]*\/"/g, 'assetsPath:"./assets/js/_nuxt/"');

    // If assetsPath was modified, update the script
    if (fixed !== content) {
      script.textContent = fixed;
    }
  }
}

/**
 * Detect framework type from HTML content
 */
export function detectFramework(html: string): 'nuxt' | 'vue' | 'react' | 'angular' | 'unknown' {
  if (html.includes('window.__NUXT__')) return 'nuxt';
  if (html.includes('window.__REACT_')) return 'react';
  if (html.includes('window.__ANGULAR__') || html.includes('ng-app')) return 'angular';
  if (html.includes('Vue')) return 'vue';
  return 'unknown';
}

/**
 * Apply all path fixes for file:// protocol compatibility.
 *
 * Only fixes framework-internal configuration objects (e.g. Nuxt's
 * window.__NUXT__.assetsPath). DOM element attribute path transformations
 * are handled by assembleBundle() via data-origin-url markers.
 */
export function fixPathsForFileProtocol(document: Document, html: string): void {
  const framework = detectFramework(html);

  // Framework-specific fixes — Nuxt assetsPath must be corrected
  // because it's used by the Vue runtime internally to resolve chunk URLs
  // and is not reachable through DOM element attribute modifications.
  if (framework === 'nuxt') {
    fixNuxtConfig(document);
  }

  // Note: fixScriptPaths / fixLinkPaths / preload link fixes have been removed.
  // All DOM element path modifications are now handled exclusively by
  // assembleBundle() via data-origin-url, eliminating double-modification issues.
}
