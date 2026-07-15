/**
 * Unified Frame Detector.
 * 
 * Multi-dimensional frame detection, in order of reliability from highest to lowest:
 * 1. global variables (window.__NUXT__, etc.) - most reliable
 * 2. HTML-specific tags (id="__nuxt", etc.) -- reliable
 * 3. Meta generator tags - reliable
 * 4. JS content scanning (framework-specific code patterns) - medium
 * 5. generic mount point (id="app") - low reliability, used as a secondary signal
 */

import type { FrameworkDetection } from './types.js';

/**
 * Detects the type of frame used by the page.
 * 
 * @param html Page HTML content
 * @param jsContents A list of downloaded JS file contents (optional, for enhanced detection).
 * @returns Framework detection results
 */
export function detectFramework(
  html: string,
  jsContents?: string[]
): FrameworkDetection {
  const markers: string[] = [];
  const jsText = jsContents?.join('\n') ?? '';

  // ── Dimension 1: Global variable labeling ──────────────────────────────
  if (html.includes('window.__NUXT__')) {
    markers.push('__NUXT__');
    return {
      framework: 'nuxt3',  // Nuxt 3+ Using __NUXT__
      confidence: 0.95,
      appElement: '#__nuxt',
      ssrData: true,
      markers,
    };
  }
  if (html.includes('window.__NEXT_DATA__')) {
    markers.push('__NEXT_DATA__');
    return {
      framework: 'nextjs',
      confidence: 0.95,
      appElement: '#__next',
      ssrData: true,
      markers,
    };
  }

  // Dimension 2: HTML-specific tags ─────────────────────────────
  const hasNuxtApp = /id=["']__nuxt["']/.test(html);
  const hasNextApp = /id=["']__next["']/.test(html);
  const hasVpApp = /id=["']VPContent["']/.test(html);  // VitePress features
  const hasAngularApp = /ng-version|=["']ng-app["']/.test(html);

  // ── 维度 3：Meta generator ────────────────────────────
  const metaMatch = html.match(/<meta\s+name=["']generator["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch) {
    markers.push(`generator:${metaMatch[1]}`);
    const gen = metaMatch[1].toLowerCase();
    if (gen.includes('vitepress')) {
      return { framework: 'vitepress', confidence: 0.9, appElement: '#app', ssrData: false, markers };
    }
    if (gen.includes('vuepress')) {
      return { framework: 'vue3', confidence: 0.85, appElement: '#app', ssrData: false, markers };
    }
    if (gen.includes('astro')) {
      return { framework: 'astro', confidence: 0.9, appElement: null, ssrData: false, markers };
    }
  }

  // ── Dimension 4: JS Content Scanning ───────────────────────────────
  if (jsText.includes('createSSRApp') || jsText.includes('__VUE__')) {
    markers.push('__VUE__');
    return { framework: 'vue3', confidence: 0.8, appElement: '#app', ssrData: false, markers };
  }
  if (jsText.includes('hydrateRoot') || jsText.includes('__REACT_DEVTOOLS')) {
    markers.push('__REACT_DEVTOOLS');
    return { framework: 'react18', confidence: 0.7, appElement: '#root', ssrData: false, markers };
  }
  if (jsText.includes('ng.probe') || jsText.includes('platformBrowser')) {
    markers.push('angular');
    return { framework: 'angular', confidence: 0.7, appElement: null, ssrData: false, markers };
  }

  // ── Dimension 5: Generic Mount Points (low confidence) ────────────────────
  if (hasVpApp) {
    return { framework: 'vitepress', confidence: 0.6, appElement: '#app', ssrData: false, markers };
  }
  if (hasNuxtApp) {
    return { framework: 'nuxt2', confidence: 0.5, appElement: '#__nuxt', ssrData: false, markers };
  }
  if (hasNextApp) {
    return { framework: 'nextjs', confidence: 0.5, appElement: '#__next', ssrData: false, markers };
  }

  // ── No match ────────────────────────────────────────────
  return { framework: 'unknown', confidence: 0, appElement: null, ssrData: false, markers };
}