/**
 * Fixes absolute paths in generated snapshots to support file:// protocol opening
 * Handles framework-specific configuration and static path references
 */

export interface PathFixerOptions {
  // Base path for relative path conversion (e.g., 'assets/')
  basePath?: string;
}

/**
 * Detects if a path is an absolute URL path (starts with /)
 */
function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

/**
 * Converts absolute path to relative path
 * e.g., "/_nuxt/" → "./assets/js/_nuxt/"
 */
function absoluteToRelative(absolutePath: string, assetBase: string = 'assets'): string {
  // Remove leading slash
  const trimmed = absolutePath.replace(/^\/+/, '');
  return `./${assetBase}/${trimmed}`;
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
 * Fix script tags with absolute src paths
 * Converts /path/to/script.js → ./assets/js/path/to/script.js (if not already a relative path)
 */
export function fixScriptPaths(document: Document): void {
  const scripts = Array.from(document.querySelectorAll('script[src]'));

  for (const script of scripts) {
    const src = script.getAttribute('src') || '';

    // Skip if already a relative path or protocol-based URL
    if (src.startsWith('.') || src.includes('://') || src.startsWith('#') || src.startsWith('?')) {
      continue;
    }

    // Convert absolute paths to relative
    if (isAbsolutePath(src)) {
      const relativeSrc = absoluteToRelative(src, 'assets');
      script.setAttribute('src', relativeSrc);
    }
  }
}

/**
 * Fix link tags with absolute href paths (for stylesheets, icons, etc.)
 */
export function fixLinkPaths(document: Document): void {
  const links = Array.from(document.querySelectorAll('link[href]'));

  for (const link of links) {
    const href = link.getAttribute('href') || '';

    // Skip if already a relative path or protocol-based URL
    if (href.startsWith('.') || href.includes('://') || href.startsWith('#') || href.startsWith('?')) {
      continue;
    }

    // Convert absolute paths to relative
    if (isAbsolutePath(href)) {
      const relativeHref = absoluteToRelative(href, 'assets');
      link.setAttribute('href', relativeHref);
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
 * Apply all path fixes for file:// protocol compatibility
 */
export function fixPathsForFileProtocol(document: Document, html: string): void {
  const framework = detectFramework(html);

  // Framework-specific fixes
  if (framework === 'nuxt') {
    fixNuxtConfig(document);
  }

  // Generic path fixes that apply to all frameworks
  fixScriptPaths(document);
  fixLinkPaths(document);

  // Fix preload links with absolute paths
  const preloads = Array.from(document.querySelectorAll('link[rel="preload"][href]'));
  for (const preload of preloads) {
    const href = preload.getAttribute('href') || '';
    if (isAbsolutePath(href) && !href.includes('://')) {
      preload.setAttribute('href', absoluteToRelative(href, 'assets'));
    }
  }
}
