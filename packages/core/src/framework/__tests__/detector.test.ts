/**
 * Framework Detection Unit Tests.
 *
 * Covers all 12 real detection scenarios:
 * - Dimension 1: Global variables (__NUXT__, __NEXT_DATA__, __SVELTEKIT__)
 * - Dimension 3: Meta generator tags (VitePress, VuePress, Astro, SvelteKit)
 * - Dimension 4: JS content scanning (Vue 3, React 18, Angular, SvelteKit)
 * - Dimension 5: Generic mount points (Nuxt 2, VitePress, Next.js, SvelteKit)
 * - Multi-framework priority ordering
 * - No-match fallback (unknown)
 */

import { describe, it, expect } from 'vitest';
import { detectFramework } from '../detector.js';

describe('detectFramework — Dimension 1: Global Variables', () => {
  it('should detect Nuxt 3 from window.__NUXT__', () => {
    const html = '<html><body><script>window.__NUXT__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nuxt3');
    expect(result.confidence).toBe(0.95);
    expect(result.appElement).toBe('#__nuxt');
    expect(result.markers).toContain('__NUXT__');
  });

  it('should detect Next.js from window.__NEXT_DATA__', () => {
    const html = '<html><body><script>window.__NEXT_DATA__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBe(0.95);
    expect(result.appElement).toBe('#__next');
    expect(result.markers).toContain('__NEXT_DATA__');
  });

  it('should detect SvelteKit from window.__SVELTEKIT__', () => {
    const html = '<html><body><script>window.__SVELTEKIT__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('sveltekit');
    expect(result.confidence).toBe(0.95);
    expect(result.appElement).toBe('#svelte');
    expect(result.markers).toContain('__SVELTEKIT__');
  });
});

describe('detectFramework — Dimension 3: Meta Generator Tags', () => {
  it('should detect VitePress from <meta generator="VitePress">', () => {
    const html = '<html><head><meta name="generator" content="VitePress"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('vitepress');
    expect(result.confidence).toBe(0.9);
    expect(result.appElement).toBe('#app');
  });

  it('should detect VuePress from <meta generator="VuePress"> and map to vue3', () => {
    const html = '<html><head><meta name="generator" content="VuePress"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('vue3');
    expect(result.confidence).toBe(0.85);
    expect(result.appElement).toBe('#app');
  });

  it('should detect Astro from <meta generator="Astro">', () => {
    const html = '<html><head><meta name="generator" content="Astro"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('astro');
    expect(result.confidence).toBe(0.9);
    expect(result.appElement).toBeNull();
  });

  it('should detect SvelteKit from <meta generator="SvelteKit">', () => {
    const html = '<html><head><meta name="generator" content="SvelteKit"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('sveltekit');
    expect(result.confidence).toBe(0.9);
    expect(result.appElement).toBe('#svelte');
  });

  it('should detect case-insensitive meta generator tags', () => {
    const html = '<html><head><META NAME="GENERATOR" CONTENT="VitePress"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('vitepress');
  });
});

describe('detectFramework — Dimension 4: JS Content Scanning', () => {
  it('should detect Vue 3 from JS containing createSSRApp', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const result = detectFramework(html, ['function createSSRApp() {}']);
    expect(result.framework).toBe('vue3');
    expect(result.confidence).toBe(0.8);
    expect(result.appElement).toBe('#app');
    expect(result.markers).toContain('__VUE__');
  });

  it('should detect Vue 3 from JS containing __VUE__', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['window.__VUE__ = true']);
    expect(result.framework).toBe('vue3');
    expect(result.confidence).toBe(0.8);
  });

  it('should detect React 18 from JS containing hydrateRoot', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['hydrateRoot(document.getElementById("root"))']);
    expect(result.framework).toBe('react18');
    expect(result.confidence).toBe(0.7);
    expect(result.appElement).toBe('#root');
    expect(result.markers).toContain('__REACT_DEVTOOLS');
  });

  it('should detect React 18 from JS containing __REACT_DEVTOOLS', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['window.__REACT_DEVTOOLS_GLOBAL_HOOK__']);
    expect(result.framework).toBe('react18');
  });

  it('should detect Angular from JS containing ng.probe', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['ng.probe($0)']);
    expect(result.framework).toBe('angular');
    expect(result.confidence).toBe(0.7);
    expect(result.appElement).toBeNull();
    expect(result.markers).toContain('angular');
  });

  it('should detect Angular from JS containing platformBrowser', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['platformBrowserDynamic().bootstrapModule']);
    expect(result.framework).toBe('angular');
  });

  it('should detect SvelteKit from JS containing @sveltejs/kit', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['import { mount } from "@sveltejs/kit"']);
    expect(result.framework).toBe('sveltekit');
    expect(result.confidence).toBe(0.7);
    expect(result.appElement).toBe('#svelte');
    expect(result.markers).toContain('__sveltekit');
  });

  it('should detect SvelteKit from JS containing __sveltekit', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['window.__sveltekit = { data: {} }']);
    expect(result.framework).toBe('sveltekit');
  });
});

describe('detectFramework — Dimension 5: Generic Mount Points', () => {
  it('should detect VitePress from #VPContent mount point (low confidence)', () => {
    const html = '<html><body><div id="VPContent"></div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('vitepress');
    expect(result.confidence).toBe(0.6);
    expect(result.appElement).toBe('#app');
  });

  it('should detect Nuxt 2 from #__nuxt mount point without __NUXT__', () => {
    const html = '<html><body><div id="__nuxt">App</div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nuxt2');
    expect(result.confidence).toBe(0.5);
    expect(result.appElement).toBe('#__nuxt');
  });

  it('should detect Next.js from #__next mount point (low confidence)', () => {
    const html = '<html><body><div id="__next"></div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBe(0.5);
    expect(result.appElement).toBe('#__next');
  });

  it('should detect SvelteKit from #svelte mount point (low confidence)', () => {
    const html = '<html><body><div id="svelte"></div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('sveltekit');
    expect(result.confidence).toBe(0.4);
    expect(result.appElement).toBe('#svelte');
  });
});

describe('detectFramework — Multi-Framework Priority', () => {
  it('should prefer Nuxt 3 (Dimension 1) over Vue 3 JS markers (Dimension 4)', () => {
    const html = '<html><body><script>window.__NUXT__ = {}</script></body></html>';
    const result = detectFramework(html, ['createSSRApp()']);
    expect(result.framework).toBe('nuxt3');
    expect(result.confidence).toBe(0.95);
  });

  it('should prefer Next.js (Dimension 1) over #__next mount point (Dimension 5)', () => {
    const html = '<html><body><script>window.__NEXT_DATA__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBe(0.95);
  });

  it('should prefer meta generator over generic mount point', () => {
    const html = '<html><head><meta name="generator" content="VitePress"></head><body><div id="__nuxt"></div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('vitepress');
    expect(result.confidence).toBe(0.9);
  });
});

describe('detectFramework — No Match / Unknown', () => {
  it('should return unknown for empty HTML', () => {
    const result = detectFramework('');
    expect(result.framework).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(result.appElement).toBeNull();
    expect(result.markers).toEqual([]);
  });

  it('should return unknown for plain static HTML', () => {
    const html = '<!DOCTYPE html><html><head></head><body><p>Hello World</p></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('should return unknown when JS contents have no framework markers', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, ['console.log("hello");']);
    expect(result.framework).toBe('unknown');
  });
});

describe('detectFramework — Edge Cases', () => {
  it('should handle undefined jsContents gracefully', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('unknown');
  });

  it('should handle empty jsContents array', () => {
    const html = '<html><body></body></html>';
    const result = detectFramework(html, []);
    expect(result.framework).toBe('unknown');
  });
});