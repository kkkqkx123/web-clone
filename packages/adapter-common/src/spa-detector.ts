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
 * Usage:
 * ```typescript
 * import { waitForSpaHydration } from '../spa-detector.js';
 *
 * // After page.goto()
 * await waitForSpaHydration(page, {
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
 * Wait for SPA frameworks (Vue/React/Angular/Nuxt) to finish hydration.
 *
 * Three-phase waiting strategy:
 * 1. Detect SSR frameworks (especially Nuxt/Vue with #__nuxt element)
 * 2. Wait for Vue instance to mount on the app element
 * 3. Wait for any recognized framework to signal readiness
 * 4. Small delay for event handler binding
 *
 * All timeouts are non-fatal — if a framework takes too long we proceed anyway.
 *
 * @param page A page-like object with evaluate, waitForFunction, waitForTimeout
 * @param options Timeout and logging configuration
 */
export async function waitForSpaHydration(
  page: SpaPageLike,
  options: SpaDetectorOptions
): Promise<void> {
  const { timeout, logPrefix = '[Adapter]' } = options;

  try {
    // Phase 1: Detect SSR framework indicators in the page
    const isSSRApp = await page.evaluate(() => {
      const w = window as any;
      return {
        hasNuxt: w.__NUXT__ !== undefined,
        hasVue: w.Vue !== undefined || w.__VUE__ !== undefined,
        appElement: !!document.querySelector('#__nuxt'),
        vueInstance: !!(document.querySelector('#__nuxt') as any)?.__vue__,
      };
    });

    console.log(`${logPrefix} SSR App Detection:`, isSSRApp);

    // Phase 2: If Nuxt/Vue SSR with unhydrated app element, wait for hydration
    if (isSSRApp.hasNuxt && isSSRApp.appElement && !isSSRApp.vueInstance) {
      console.log(`${logPrefix} Waiting for Vue hydration...`);
      try {
        await page.waitForFunction(() => {
          const el = document.querySelector('#__nuxt');
          return !!(el as any)?.__vue__;
        }, { timeout: Math.min(timeout / 3, 5000) });
      } catch {
        console.log(`${logPrefix} Vue hydration timeout (non-fatal), proceeding anyway`);
      }
    }

    // Phase 3: Wait for any recognized framework to signal readiness
    await page.waitForFunction(() => {
      const w = window as any;
      // Vue apps
      if (w.__NUXT__ !== undefined && (document.querySelector('#__nuxt') as any)?.__vue__) return true;
      if (w.__VUE__ !== undefined) return true;
      // React apps
      if (w.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined) return true;
      // Angular apps
      if (w.ng !== undefined && w.ng.probe !== undefined) return true;
      // Generic: check if document is interactive
      return document.readyState === 'complete';
    }, { timeout: Math.min(timeout / 2, 5000) }).catch(() => {
      // Non-fatal: framework detection may time out; proceed with current state
    });

    // Phase 4: Small additional delay for event handlers to be fully bound
    // This is especially important for Vue which batches DOM updates
    await page.waitForTimeout(1000);
  } catch {
    // Non-fatal: if any step fails, the main navigation already completed
  }
}
