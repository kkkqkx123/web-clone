/**
 * Unified Frame Detector.
 * 
 * Multi-dimensional frame detection, in order of reliability from highest to lowest:
 * 1. global variables (window.__NUXT__, etc.) — definitive tier
 * 2. Meta generator tags — strong tier
 * 3. HTML-specific id tags with inline script patterns — strong tier
 * 4. JS content scanning (framework-specific code patterns) — strong tier
 * 5. HTML-specific id tags alone — moderate tier
 * 6. Generic mount points — weak tier
 */

import type { FrameworkDetection, SignalTier } from './types.js';

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

  // ── Dimension 1: Global variable labeling (definitive tier) ───────────
  if (html.includes('window.__NUXT__')) {
    markers.push('__NUXT__');
    return {
      framework: 'nuxt3',
      tier: 'definitive',
      appElement: '#__nuxt',
      markers,
    };
  }
  if (html.includes('window.__NEXT_DATA__')) {
    markers.push('__NEXT_DATA__');
    return {
      framework: 'nextjs',
      tier: 'definitive',
      appElement: '#__next',
      markers,
    };
  }
  if (html.includes('window.__sveltekit__')) {
    markers.push('__sveltekit__');
    return {
      framework: 'sveltekit',
      tier: 'definitive',
      appElement: '#svelte',
      markers,
    };
  }

  // Dimension 2: HTML-specific tags ─────────────────────────────
  const hasNuxtApp = /id=["']__nuxt["']/.test(html);
  const hasNextApp = /id=["']__next["']/.test(html);
  const hasVpApp = /id=["']VPContent["']/.test(html);
  const hasSvelteApp = /id=["']svelte["']/.test(html);
  const hasAngularApp = /ng-version=["'][^"']*["']/i.test(html) || /ng-app=["'][^"']*["']/i.test(html);

  // ── Dimension 3: Meta generator tags (strong tier) ─────────────────
  const metaMatch = html.match(/<meta\s+name=["']generator["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch) {
    markers.push(`generator:${metaMatch[1]}`);
    const gen = metaMatch[1].toLowerCase();
    if (process.env.DEBUG_FRAMEWORK_DETECTOR) {
      console.log(`[detector] Meta generator detected: "${metaMatch[1]}"`);
    }
    if (gen.includes('vitepress')) {
      if (process.env.DEBUG_FRAMEWORK_DETECTOR) {
        console.log(`[detector] VitePress meta generator detected: "${metaMatch[1]}"`);
      }
      return { framework: 'vitepress', tier: 'strong', appElement: '#app', markers };
    }
    if (gen.includes('vuepress')) {
      const isVue3Signal = jsText.includes('createSSRApp') ||
                           jsText.includes('__VUE__') ||
                           html.includes('vue@3');
      markers.push(isVue3Signal ? 'vuepress:v2' : 'vuepress:v1');
      return { framework: 'vue3', tier: 'strong', appElement: '#app', markers };
    }
    if (gen.includes('astro')) {
      if (process.env.DEBUG_FRAMEWORK_DETECTOR) {
        console.log(`[detector] Astro meta generator detected: "${metaMatch[1]}"`);
      }
      return { framework: 'astro', tier: 'strong', appElement: null, markers };
    }
    if (gen.includes('sveltekit')) {
      return { framework: 'sveltekit', tier: 'strong', appElement: '#svelte', markers };
    }
  }

  // ── Dimension 4: JS Content Scanning (strong tier) ─────────────────
  // Vue 2 patterns (check before Vue 3 — Vue 2 uses new Vue(), Vue 3 uses createSSRApp)
  if (jsText.includes('new Vue({') || jsText.includes('Vue.extend(') || jsText.includes('Vue.component(')) {
    if (jsText.includes('createSSRApp') || jsText.includes('__VUE__')) {
      markers.push('__VUE__');
      return { framework: 'vue3', tier: 'strong', appElement: '#app', markers };
    }
    markers.push('new Vue');
    return { framework: 'vue2', tier: 'strong', appElement: '#app', markers };
  }
  if (jsText.includes('createSSRApp') || jsText.includes('__VUE__')) {
    markers.push('__VUE__');
    return { framework: 'vue3', tier: 'strong', appElement: '#app', markers };
  }
  // React patterns: hydrateRoot (React 18), __REACT_DEVTOOLS (dev), and
  // __reactFiber$ / __reactContainer$ (production fiber node marker)
  if (jsText.includes('hydrateRoot') || jsText.includes('__REACT_DEVTOOLS') ||
      jsText.includes('__reactFiber$') || jsText.includes('__reactContainer$')) {
    markers.push('__REACT_DEVTOOLS');
    return { framework: 'react18', tier: 'strong', appElement: '#root', markers };
  }
  if (jsText.includes('ng.probe') || jsText.includes('platformBrowser') ||
      jsText.includes('\u0275cmp') ||   // Angular component definition (survives AOT)
      jsText.includes('\u0275mod') ||   // Angular module definition
      jsText.includes('\u0275dir') ||   // Angular directive definition
      jsText.includes('\u0275fac') ||   // Angular factory function
      jsText.includes('\u0275\u0275defineComponent') ||  // Ivy component definition (Angular 9+)
      jsText.includes('\u0275\u0275defineDirective') ||  // Ivy directive definition
      jsText.includes('\u0275\u0275defineInjectable') || // Ivy injectable definition
      jsText.includes('bootstrapApplication') || // Angular 14+ standalone bootstrap
      jsText.includes('importProvidersFrom')) {   // Angular 14+ standalone providers
    markers.push('angular');
    return { framework: 'angular', tier: 'strong', appElement: null, markers };
  }
  if (jsText.includes('@sveltejs/kit') || jsText.includes('__sveltekit')) {
    markers.push('__sveltekit');
    return { framework: 'sveltekit', tier: 'strong', appElement: '#svelte', markers };
  }

  // ── Dimension 5: HTML tags with inline patterns or moderate signals ──
  if (hasVpApp) {
    return { framework: 'vitepress', tier: 'moderate', appElement: '#app', markers };
  }
  if (hasNuxtApp) {
    // Check for Nuxt 3 payload inline scripts.
    if (/<script[^>]*>\s*window\.__NUXT__\s*=\s*\(function\s*\(/i.test(html)) {
      markers.push('__NUXT__');
      return { framework: 'nuxt3', tier: 'strong', appElement: '#__nuxt', markers };
    }
    return { framework: 'nuxt2', tier: 'moderate', appElement: '#__nuxt', markers };
  }
  if (hasNextApp) {
    return { framework: 'nextjs', tier: 'moderate', appElement: '#__next', markers };
  }

  // ── Dimension 6: Generic mount points (weak tier) ──────────────────
  if (hasSvelteApp) {
    return { framework: 'sveltekit', tier: 'weak', appElement: '#svelte', markers };
  }
  if (hasAngularApp) {
    return { framework: 'angular', tier: 'weak', appElement: null, markers };
  }

  // ── No match ────────────────────────────────────────────
  return { framework: 'unknown', tier: 'none', appElement: null, markers };
}
