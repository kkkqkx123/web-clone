/**
 * Shared SPA Hydration Detection Utility
 *
 * Detects and waits for SPA frameworks (Vue/React/Angular/Nuxt) to finish
 * client-side hydration after page navigation.
 *
 * This logic is framework-agnostic and can be used by any automation adapter
 * (Playwright, Puppeteer, etc.) that provides a page-like interface with
 * evaluate(), waitForFunction(), and waitForTimeout().
 *
 * Four-phase waiting strategy:
 * 1. Detect SSR framework indicators (Nuxt/Vue with #__nuxt element)
 * 2. Wait for Vue instance to mount on the app element
 * 3. Wait for framework signals OR production-reliable DOM readiness
 * 4. Small delay for event handler binding
 *
 * In production, devtools hooks (__REACT_DEVTOOLS_GLOBAL_HOOK__, ng.probe)
 * are often absent. Phase 3 additionally checks production-safe signals:
 * body child count stability, framework-specific DOM markers, and
 * non-empty root element with actual child elements (not just text).
 *
 * Usage:
 * ```typescript
 * import { waitForSpaHydration } from '../spa-detector.js';
 *
 * // After page.goto()
 * const result = await waitForSpaHydration(page, {
 *   timeout: 30000,
 *   logPrefix: '[Puppeteer Adapter]',
 * });
 * ```
 */

/**
 * Minimal page-like interface required for SPA detection.
 * Compatible with both Playwright's Page and Puppeteer's Page.
 */
export interface SpaPageLike {
  evaluate<T>(pageFunction: ((...args: any[]) => T) | string, ...args: any[]): Promise<T>;
  waitForFunction(
    pageFunction: ((...args: any[]) => boolean) | string,
    options?: { timeout?: number; polling?: number | 'raf' | 'mutation' },
    ...args: unknown[]
  ): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
}

export interface SpaDetectorOptions {
  /** Navigation timeout (used to compute sub-timeouts) */
  timeout: number;
  /** Log prefix for console output (e.g. '[Playwright Adapter]') */
  logPrefix?: string;
}

/**
 * Result of SPA hydration detection.
 * Contains framework identification and metadata for downstream use.
 */
export interface SpaDetectionResult {
  /** Detected framework type (fine-grained, consistent with core's FrameworkType) */
  framework: 'nuxt3' | 'nuxt2' | 'nextjs' | 'vue3' | 'vue2' | 'react18' | 'angular' | 'sveltekit' | 'unknown';
  /** Mount point element selector (e.g. '#app', '#__nuxt', '#__next') */
  appElement: string | null;
  /** Whether hydration was confirmed (framework internal markers found) */
  isHydrated: boolean;
  /** Raw detection markers from the browser context */
  markers: string[];
  /**
   * Detection confidence (0-1), computed from signal quality:
   * global vars (__NUXT__ etc.) = 0.95, HTML tags (#__nuxt etc.) = 0.70,
   * DOM heuristics (#app etc.) = 0.40. Hydration confirmation adds +0.03.
   */
  confidence: number;
}

/**
 * Wait for SPA frameworks (Vue/React/Angular/Nuxt) to finish hydration.
 *
 * Four-phase waiting strategy:
 * 1. Detect SSR frameworks (especially Nuxt/Vue with #__nuxt element)
 * 2. Wait for Vue instance to mount on the app element
 * 3. Wait for any recognized framework to signal readiness (framework-specific)
 * 4. Small delay for event handler binding
 *
 * All timeouts are non-fatal — if a framework takes too long we proceed anyway.
 *
 * @param page A page-like object with evaluate, waitForFunction, waitForTimeout
 * @param options Timeout and logging configuration
 * @returns SpaDetectionResult with framework identification
 */
export async function waitForSpaHydration(
  page: SpaPageLike,
  options: SpaDetectorOptions
): Promise<SpaDetectionResult> {
  const { timeout, logPrefix = '[Adapter]' } = options;
  let detectedFramework: SpaDetectionResult['framework'] = 'unknown';
  let appElement: string | null = null;
  let isHydrated = false;
  const markers: string[] = [];
  let detectionConfidence = 0;

  try {
    // Phase 1: Detect SSR framework indicators in the page
    const isSSRApp = await page.evaluate(() => {
      const w = window as any;
      // Vue 2 vs Vue 3 differentiation:
      // Vue 2: window.Vue.version starts with '2', has $mount but no createApp
      // Vue 3: window.__VUE__ exists, or Vue.createApp exists
      const hasVue2 = w.Vue && (
        (typeof w.Vue.version === 'string' && w.Vue.version.startsWith('2')) ||
        (typeof w.Vue.$mount === 'function' && typeof w.Vue.createApp !== 'function')
      );
      const hasVue3 = w.__VUE__ !== undefined ||
        (w.Vue && typeof w.Vue.version === 'string' && w.Vue.version.startsWith('3')) ||
        (w.Vue && typeof w.Vue.createApp === 'function');
      return {
        hasNuxt: w.__NUXT__ !== undefined,
        hasVue: w.Vue !== undefined || w.__VUE__ !== undefined,
        hasVue2,
        hasVue3,
        appElement: !!document.querySelector('#__nuxt'),
        vueInstance: !!(document.querySelector('#__nuxt') as any)?.__vue__,
        // Additional framework markers
        hasNextData: w.__NEXT_DATA__ !== undefined,
        hasReactHook: w.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined,
        hasSvelteKit: w.__sveltekit__ !== undefined || w.__SVELTEKIT__ !== undefined,
        hasAngular: w.ng !== undefined && w.ng.probe !== undefined,
        // Production-safe Angular detection: these signals exist even when
        // devtools (ng.probe) are stripped from production builds.
        hasAngularProd:
          // _nghost-* / _ngcontent-* attributes are Angular view encapsulation markers,
          // applied by the Angular compiler and never stripped in production.
          !!document.querySelector('[ng-version]') ||
          !!document.querySelector('[ng-app]') ||
          !!document.querySelector('[class*="_nghost-"], [class*="_ngcontent-"], [_nghost-], [_ngcontent-]') ||
          // Angular Zone.js patches the global Promise/MutationObserver constructors
          // with a __zone_symbol__ prefix, identifiable on the window object.
          w.Zone !== undefined,
        hasNextRoot: !!document.querySelector('#__next'),
        hasAppRoot: !!document.querySelector('#app'),
        hasReactRoot: !!document.querySelector('#root'),
        hasSvelteRoot: !!document.querySelector('#svelte'),
        hasAngularRoot: !!document.querySelector('[ng-app]') || !!document.querySelector('[ng-version]'),
      };
    });

    console.log(`${logPrefix} SSR App Detection:`, isSSRApp);

    // Determine framework with version differentiation
    // confidence reflects signal quality: global vars > HTML tags > DOM heuristics

    if (isSSRApp.hasNuxt) {
      // Nuxt: distinguish v2 ($nuxt.$mount) from v3 (__NUXT__)
      const nuxtVersion = await page.evaluate(() => {
        const w = window as any;
        if (w.$nuxt && w.$nuxt.$root && typeof w.$nuxt.$mount === 'function') return 2;
        if (w.__NUXT__) return 3;
        return 0;
      });
      if (nuxtVersion === 3) {
        detectedFramework = 'nuxt3';
        markers.push('__NUXT__');
        detectionConfidence = 0.95;
      } else if (nuxtVersion === 2) {
        detectedFramework = 'nuxt2';
        markers.push('$nuxt.$mount');
        detectionConfidence = 0.95;
      } else {
        // has #__nuxt but no version signal — low confidence
        detectedFramework = 'nuxt2';
        markers.push('#__nuxt');
        detectionConfidence = 0.50;
      }
      appElement = '#__nuxt';
    } else if (isSSRApp.hasNextData) {
      detectedFramework = 'nextjs';
      appElement = '#__next';
      markers.push('__NEXT_DATA__');
      detectionConfidence = 0.95;
    } else if (isSSRApp.hasSvelteKit) {
      detectedFramework = 'sveltekit';
      appElement = '#svelte';
      markers.push('__sveltekit__');
      detectionConfidence = 0.95;
    } else if (isSSRApp.hasAngular || isSSRApp.hasAngularProd || isSSRApp.hasAngularRoot) {
      detectedFramework = 'angular';
      appElement = '[ng-app], [ng-version]';
      markers.push('angular');
      // ng.probe is dev-only; production signals (_nghost-*, ng-version, Zone.js)
      // are medium confidence; bare [ng-version]/[ng-app] is low confidence
      if (isSSRApp.hasAngular) {
        detectionConfidence = 0.80;
      } else if (isSSRApp.hasAngularProd) {
        detectionConfidence = 0.60;
        markers.push('angular-prod-signals');
      } else {
        detectionConfidence = 0.40;
      }
    } else if (isSSRApp.hasVue2) {
      detectedFramework = 'vue2';
      appElement = '#app';
      markers.push('Vue.version:2');
      detectionConfidence = 0.80;
    } else if (isSSRApp.hasVue3) {
      detectedFramework = 'vue3';
      appElement = '#app';
      markers.push('__VUE__');
      detectionConfidence = 0.80;
    } else if (isSSRApp.hasVue) {
      // Vue detected but version differentiation failed — default to vue3
      // with reduced confidence (occurs when window.Vue exists but neither
      // Vue.version nor Vue.createApp is available, or in test environments)
      detectedFramework = 'vue3';
      appElement = '#app';
      markers.push('Vue:unknown-version');
      detectionConfidence = 0.60;
    } else if (isSSRApp.hasReactHook) {
      detectedFramework = 'react18';
      appElement = '#root';
      markers.push('__REACT_DEVTOOLS__');
      detectionConfidence = 0.70;
    } else {
      // Low-confidence heuristics from DOM
      detectionConfidence = 0.40;
      if (isSSRApp.hasNextRoot) {
        detectedFramework = 'nextjs';
        appElement = '#__next';
        markers.push('dom:#__next');
      } else if (isSSRApp.hasReactRoot) {
        detectedFramework = 'react18';
        appElement = '#root';
        markers.push('dom:#root');
      } else if (isSSRApp.hasAppRoot) {
        detectedFramework = 'vue3';
        appElement = '#app';
        markers.push('dom:#app');
      } else if (isSSRApp.hasSvelteRoot) {
        detectedFramework = 'sveltekit';
        appElement = '#svelte';
        markers.push('dom:#svelte');
      }
    }

    // Phase 2: If Nuxt/Vue SSR with unhydrated app element, wait for hydration
    if (isSSRApp.hasNuxt && isSSRApp.appElement && !isSSRApp.vueInstance) {
      console.log(`${logPrefix} Waiting for Vue hydration...`);
      try {
        await page.waitForFunction(() => {
          const el = document.querySelector('#__nuxt');
          return !!(el as any)?.__vue__;
        }, { timeout: Math.min(timeout / 3, 5000) });
        console.log(`${logPrefix} Vue hydration confirmed`);
      } catch {
        console.log(`${logPrefix} Vue hydration timeout (non-fatal), proceeding anyway`);
      }
    }

    // Phase 3: Wait for recognized framework signal OR production-reliable DOM stability.
    await page.waitForFunction(
      () => {
        const w = window as any;

        // Devtools-based signals (reliable in dev builds)
        if (w.__NUXT__ !== undefined && (document.querySelector('#__nuxt') as any)?.__vue__) return true;
        if (w.__VUE__ !== undefined) return true;
        if (w.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined) return true;
        if (w.ng !== undefined && w.ng.probe !== undefined) return true;

        // Framework-specific production-safe signals
        // Next.js: #__next has child elements (builds even in production)
        const nextRoot = document.querySelector('#__next');
        if (w.__NEXT_DATA__ !== undefined && nextRoot && nextRoot.children.length > 0) return true;
        if (nextRoot && nextRoot.querySelectorAll('*').length > 3) return true;

        // Angular: ng-version attribute appears after bootstrap.
        // Production-safe signals include _nghost-* / _ngcontent-* attributes
        // (Angular view encapsulation markers, never stripped) and Zone.js global.
        if (document.querySelector('[ng-version]')) return true;
        if (document.querySelector('[class*="_nghost-"], [class*="_ngcontent-"], [_nghost-], [_ngcontent-]')) return true;
        if ((window as any).Zone !== undefined) return true;

        // Nuxt: #__nuxt with actual content
        const nuxtRoot = document.querySelector('#__nuxt');
        if (nuxtRoot && nuxtRoot.children.length > 0 && nuxtRoot.querySelectorAll('*').length > 3) return true;

        // SvelteKit: meaningful structure in #svelte
        const svelteRoot = document.querySelector('#svelte');
        if (svelteRoot && svelteRoot.children.length > 0) return true;

        // React: #root has meaningful structure (not just Loading text)
        const reactRoot = document.querySelector('#root');
        if (reactRoot && reactRoot.children.length > 0) {
          // Check for actual element children, not just text nodes
          const hasElements = reactRoot.querySelectorAll('*').length > 2;
          if (hasElements) return true;
          // Production: check for React fiber nodes on the root element
          // React 18 createRoot().render() attaches __reactFiber$ keys in prod
          const hasFiber = Object.keys(reactRoot).some(
            k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$')
          );
          if (hasFiber) return true;
        }

        // Vue: #app has mounted content
        const appRoot = document.querySelector('#app');
        if (appRoot && appRoot.children.length > 0 && appRoot.querySelectorAll('*').length > 2) return true;

        // Generic fallback: body has meaningful children content
        const bodyChildren = document.body.children.length;
        if (bodyChildren > 0) {
          const roots = document.querySelectorAll(
            '#__nuxt, #__next, #app, #root, #svelte, [ng-app], .app-root'
          );
          let hasContent = false;
          roots.forEach((root) => {
            if (!hasContent && root.childElementCount > 0) {
              hasContent = true;
            }
          });
          if (hasContent) return true;
        }

        // Generic: document is fully interactive
        return document.readyState === 'complete';
      },
      { timeout: Math.min(timeout / 2, 8000) }
    ).catch(() => {
      // Non-fatal: framework detection may time out; proceed with current state
    });

    // Phase 4: Small additional delay for event handlers to be fully bound.
    await page.waitForTimeout(500);

    // Check post-wait hydration status for return value
    const hydrationCheck = await page.evaluate(() => {
      const w = window as any;
      const nuxtEl = document.querySelector('#__nuxt') as any;
      const nextEl = document.querySelector('#__next') as any;
      const appEl = document.querySelector('#app') as any;
      const rootEl = document.querySelector('#root') as any;
      const svelteEl = document.querySelector('#svelte') as any;

      return {
        nuxtHydrated: !!(nuxtEl?.__vue__),
        nextHydrated: !!(nextEl?.__reactRoot$) || (document.querySelector('#__next')?.children.length ?? 0) > 0,
        vueHydrated: !!(appEl?.__vue__) || (w.__VUE__ !== undefined),
        reactHydrated: !!(rootEl?._reactRootContainer) ||
          !!(rootEl && Object.keys(rootEl).some(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'))) ||
          (w.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined),
        angularHydrated: !!document.querySelector('[ng-version]'),
        sveltekitHydrated: !!(svelteEl?.__svelte) || (w.__sveltekit__ !== undefined),
      };
    });

    isHydrated =
      hydrationCheck.nuxtHydrated ||
      hydrationCheck.nextHydrated ||
      hydrationCheck.vueHydrated ||
      hydrationCheck.reactHydrated ||
      hydrationCheck.angularHydrated ||
      hydrationCheck.sveltekitHydrated;

    if (isHydrated) {
      markers.push('hydration-confirmed');
      detectionConfidence = Math.min(1.0, detectionConfidence + 0.03);
    }
  } catch {
    // Non-fatal: if any step fails, the main navigation already completed
  }

  return {
    framework: detectedFramework,
    appElement,
    isHydrated,
    markers,
    confidence: detectionConfidence,
  };
}
