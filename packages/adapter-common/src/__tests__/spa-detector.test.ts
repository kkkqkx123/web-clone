/**
 * Tests for waitForSpaHydration — shared SPA hydration detection utility.
 *
 * Real business scenarios:
 * 1.  Nuxt 3 SSR page — has window.__NUXT__ + #__nuxt, needs to wait for Vue hydration
 * 2.  Nuxt 2 SSR page — has $nuxt.$mount + #__nuxt, needs to wait for Vue hydration
 * 3.  Vue 3 SPA page (hasVue3:true) — strong tier via __VUE__/Vue.version signal
 * 4.  Vue 3 SPA page (hasVue only, no version) — moderate tier fallback
 * 5.  Vue 3 SPA page via DOM heuristic (#app) — weak tier, no upgrade without prod signal
 * 6.  React 18 SPA (dev) — has __REACT_DEVTOOLS_GLOBAL_HOOK__, strong tier
 * 7.  React 18 SPA (prod) — DOM #root weak tier, upgraded to moderate by Phase 3b fiber check
 * 8.  Angular SPA (dev) — has ng.probe, strong tier
 * 9.  Angular SPA (prod) — _nghost-* plus ng-version and Zone.js signals, moderate tier
 * 10. Angular SPA — bare [ng-app] or [ng-version] root only, weak tier
 * 11. Next.js SSR — has window.__NEXT_DATA__, definitive tier
 * 12. SvelteKit SSR — has window.__sveltekit__, definitive tier
 * 13. Plain HTML page — no framework markers, should return quickly
 * 14. Timeout during Vue hydration — Nuxt page but Vue takes too long (non-fatal)
 * 15. Custom log prefix — verify log output uses custom prefix
 * 16. Evaluate error — page.evaluate throws, should be non-fatal
 * 17. Returns structured SpaDetectionResult — verify fine-grained framework identification
 * 18. Custom SpaPageLike implementation — third-party adapter compatibility
 * 19. Phase 3 timeout — handled by .catch() non-fatally
 * 20. Short timeout — sub-timeouts scale correctly
 * 21. Already hydrated Nuxt — skips Phase 2
 */

import { describe, it, expect, vi } from 'vitest';
import { waitForSpaHydration, type SpaPageLike, type SpaDetectorOptions, type SignalTier, compareTier } from '../index.js';

/**
 * Returns the SSR detection object expected by Phase 1.
 */
function nuxtSSRState(vueInstance: boolean) {
  return {
    hasNuxt: true,
    hasVue: true,
    hasVue2: false,
    hasVue3: false,
    appElement: true,
    vueInstance,
    hasNextData: false,
    hasReactHook: false,
    hasSvelteKit: false,
    hasAngular: false,
    hasNextRoot: false,
    hasAppRoot: false,
    hasReactRoot: false,
    hasSvelteRoot: false,
    hasAngularRoot: false,
  };
}

/** Nuxt version detection: v2 (has $nuxt.$mount) */
const nuxtVersion2 = 2;

/** Nuxt version detection: v3 (has __NUXT__) */
const nuxtVersion3 = 3;

function vueSPAState() {
  return {
    hasNuxt: false,
    hasVue: true,
    hasVue2: false,
    hasVue3: false,
    appElement: false,
    vueInstance: false,
    hasNextData: false,
    hasReactHook: false,
    hasSvelteKit: false,
    hasAngular: false,
    hasNextRoot: false,
    hasAppRoot: false,
    hasReactRoot: false,
    hasSvelteRoot: false,
    hasAngularRoot: false,
  };
}

function noFrameworkState() {
  return {
    hasNuxt: false,
    hasVue: false,
    hasVue2: false,
    hasVue3: false,
    appElement: false,
    vueInstance: false,
    hasNextData: false,
    hasReactHook: false,
    hasSvelteKit: false,
    hasAngular: false,
    hasNextRoot: false,
    hasAppRoot: false,
    hasReactRoot: false,
    hasSvelteRoot: false,
    hasAngularRoot: false,
  };
}

/** Post-wait hydration check return value (no frameworks hydrated) */
const noHydration = {
  nuxtHydrated: false,
  nextHydrated: false,
  vueHydrated: false,
  reactHydrated: false,
  angularHydrated: false,
  sveltekitHydrated: false,
};

/** Post-wait hydration check: Nuxt hydrated */
const nuxtHydrated = { ...noHydration, nuxtHydrated: true };

/** Post-wait hydration check: React hydrated (fiber markers found) */
const reactHydrated = { ...noHydration, reactHydrated: true };

/**
 * Base Phase 1 SSR-detection state with no framework signals.
 * Each concrete state constructor spreads this and overrides the flags it needs.
 */
function baseState(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  return {
    hasNuxt: false,
    hasVue: false,
    hasVue2: false,
    hasVue3: false,
    appElement: false,
    vueInstance: false,
    hasNextData: false,
    hasReactHook: false,
    hasSvelteKit: false,
    hasAngular: false,
    hasAngularProd: false,
    hasAngularRoot: false,
    hasNextRoot: false,
    hasAppRoot: false,
    hasReactRoot: false,
    hasSvelteRoot: false,
    ...overrides,
  };
}

/** Vue 3 with a definitive version signal (window.__VUE__ / Vue.version) → strong tier. */
function vue3StrongState(): Record<string, boolean> {
  return baseState({ hasVue: true, hasVue3: true });
}

/** React 18 dev build with __REACT_DEVTOOLS_GLOBAL_HOOK__ → strong tier. */
function reactDevState(): Record<string, boolean> {
  return baseState({ hasReactHook: true, hasReactRoot: true });
}

/** React 18 prod build: only DOM #root heuristic → weak tier (Phase 3b may upgrade). */
function reactWeakState(): Record<string, boolean> {
  return baseState({ hasReactRoot: true });
}

/** Angular dev build with ng.probe → strong tier. */
function angularDevState(): Record<string, boolean> {
  return baseState({ hasAngular: true });
}

/** Angular prod build with _nghost-* plus ng-version and Zone.js signals → moderate tier. */
function angularProdState(): Record<string, boolean> {
  return baseState({ hasAngularProd: true });
}

/** Angular with bare [ng-app]/[ng-version] root only → weak tier. */
function angularWeakState(): Record<string, boolean> {
  return baseState({ hasAngularRoot: true });
}

/** Next.js with window.__NEXT_DATA__ → definitive tier. */
function nextDataState(): Record<string, boolean> {
  return baseState({ hasNextData: true });
}

/** SvelteKit with window.__sveltekit__ → definitive tier. */
function svelteKitState(): Record<string, boolean> {
  return baseState({ hasSvelteKit: true });
}

/** Vue SPA detected only via DOM heuristic (#app) → weak tier. */
function appRootWeakState(): Record<string, boolean> {
  return baseState({ hasAppRoot: true });
}

/**
 * Create a mock page with an evaluate chain matching the caller's scenario.
 *
 * The evaluate call sequence of waitForSpaHydration is:
 *   Phase 1 (SSR detection) — always called
 *   Phase 3b (prod signal)  — only called when the detected tier is 'weak'
 *   hydration check         — always called
 *
 * Pass one return value per expected evaluate call. When only one value is
 * provided, the default post-wait hydration check (noHydration) is appended.
 * When none are provided, a noFrameworkState Phase 1 result is used.
 */
function createMockPage(
  ...evaluateReturns: unknown[]
): SpaPageLike & {
  _evaluate: ReturnType<typeof vi.fn>;
  _waitForFunction: ReturnType<typeof vi.fn>;
  _waitForTimeout: ReturnType<typeof vi.fn>;
} {
  const returns = [...evaluateReturns];
  if (returns.length === 0) returns.push(noFrameworkState());
  if (returns.length === 1) returns.push(noHydration);

  const mockEvaluate = vi.fn();
  for (const r of returns) {
    mockEvaluate.mockResolvedValueOnce(r);
  }
  const mockWaitForFunction = vi.fn().mockResolvedValue(undefined);
  const mockWaitForTimeout = vi.fn().mockResolvedValue(undefined);

  return {
    evaluate: mockEvaluate,
    waitForFunction: mockWaitForFunction,
    waitForTimeout: mockWaitForTimeout,
    _evaluate: mockEvaluate,
    _waitForFunction: mockWaitForFunction,
    _waitForTimeout: mockWaitForTimeout,
  };
}

/**
 * Create a mock page for Nuxt scenarios (has extra version-check evaluate call).
 */
function createMockNuxtPage(
  ssrState: Record<string, boolean>,
  nuxtVersion: number,
  postHydration?: Record<string, boolean>
): SpaPageLike & {
  _evaluate: ReturnType<typeof vi.fn>;
  _waitForFunction: ReturnType<typeof vi.fn>;
  _waitForTimeout: ReturnType<typeof vi.fn>;
} {
  const mockEvaluate = vi.fn()
    .mockResolvedValueOnce(ssrState)          // Phase 1: SSR detection
    .mockResolvedValueOnce(nuxtVersion)        // Nuxt version check
    .mockResolvedValueOnce(postHydration || noHydration); // Post-wait hydration check
  const mockWaitForFunction = vi.fn().mockResolvedValue(undefined);
  const mockWaitForTimeout = vi.fn().mockResolvedValue(undefined);

  return {
    evaluate: mockEvaluate,
    waitForFunction: mockWaitForFunction,
    waitForTimeout: mockWaitForTimeout,
    _evaluate: mockEvaluate,
    _waitForFunction: mockWaitForFunction,
    _waitForTimeout: mockWaitForTimeout,
  };
}

const defaultOptions: SpaDetectorOptions = {
  timeout: 30000,
  logPrefix: '[Test]',
};

describe('waitForSpaHydration', () => {
  // ─── Scenario 1: Nuxt 3 SSR Page ────────────────────────────────
  describe('Scenario 1: Nuxt 3 SSR page with hydration', () => {
    it('should detect Nuxt 3 SSR and wait for Vue hydration', async () => {
      const page = createMockNuxtPage(nuxtSSRState(false), nuxtVersion3, nuxtHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + version check + post-wait = 3 evaluate calls
      expect(page._evaluate).toHaveBeenCalledTimes(3);

      // Phase 2: waitForFunction for Vue hydration
      // Phase 3: evaluate used instead of waitForFunction now
      expect(page._waitForFunction).toHaveBeenCalledTimes(2);
      const phase2Call = page._waitForFunction.mock.calls[0];
      expect(phase2Call[1]).toHaveProperty('timeout');

      // Phase 4: small delay
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      // Result validation
      expect(result.framework).toBe('nuxt3');
      expect(result.appElement).toBe('#__nuxt');
      expect(result.isHydrated).toBe(true);
      expect(result.tier).toBe('definitive');
      expect(result.markers).toContain('__NUXT__');
      expect(result.markers).toContain('hydration-confirmed');
    });

    it('should detect Nuxt 2 SSR from version check', async () => {
      const page = createMockNuxtPage(nuxtSSRState(false), nuxtVersion2, nuxtHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(result.framework).toBe('nuxt2');
      expect(result.appElement).toBe('#__nuxt');
      expect(result.tier).toBe('strong');
      expect(result.markers).toContain('$nuxt.$mount');
    });
  });

  // ─── Scenario 2: Vue 3 SPA (no Nuxt, no version signal) ─────
  describe('Scenario 2: Vue 3 SPA page with hasVue only (moderate tier)', () => {
    it('should detect Vue 3 with moderate tier when version differentiation is unavailable', async () => {
      const page = createMockPage(vueSPAState());

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + post-wait check (no version check for Vue SPA)
      expect(page._evaluate).toHaveBeenCalledTimes(2);

      // Phase 2: SKIPPED — no Nuxt
      // Phase 3: waitForFunction
      // Phase 4: waitForTimeout
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      // hasVue:true but neither Vue2 nor Vue3 differentiation → 'moderate' tier
      expect(result.framework).toBe('vue3');
      expect(result.appElement).toBe('#app');
      expect(result.markers).toContain('Vue:unknown-version');
      expect(result.tier).toBe('moderate');
    });
  });

  // ─── Scenario 3: Vue 3 SPA via DOM heuristic only ────────────
  describe('Scenario 3: Vue 3 SPA page detected via DOM heuristic (weak tier)', () => {
    it('should detect vue3 with weak tier when only #app exists and no prod signal is found', async () => {
      // Phase 1 returns weak tier → Phase 3b triggers an extra evaluate;
      // it returns false (no prod signal), so the tier stays 'weak'.
      const page = createMockPage(appRootWeakState(), false, noHydration);

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + Phase 3b (weak tier) + post-wait check = 3 evaluate calls
      expect(page._evaluate).toHaveBeenCalledTimes(3);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('vue3');
      expect(result.appElement).toBe('#app');
      expect(result.markers).toContain('dom:#app');
      expect(result.tier).toBe('weak');
      expect(result.isHydrated).toBe(false);
    });
  });

  // ─── Scenario 4: Angular SPA Page ─────────────────────────────
  describe('Scenario 4: Plain HTML page (no framework)', () => {
    it('should return quickly without unnecessary delays', async () => {
      const page = createMockPage(noFrameworkState());

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('unknown');
      expect(result.isHydrated).toBe(false);
      expect(result.tier).toBe('none');
    });
  });

  // ─── Scenario 5: Vue 3 SPA with version signal ────────────────
  describe('Scenario 5: Vue 3 SPA page with version signal (strong tier)', () => {
    it('should detect vue3 with strong tier when hasVue3 is true', async () => {
      const page = createMockPage(vue3StrongState(), { ...noHydration, vueHydrated: true });

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + post-wait check (no version check for non-Nuxt pages)
      expect(page._evaluate).toHaveBeenCalledTimes(2);
      // Phase 2 skipped (no Nuxt), Phase 3 waitForFunction + Phase 4 delay
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('vue3');
      expect(result.appElement).toBe('#app');
      expect(result.markers).toContain('__VUE__');
      expect(result.tier).toBe('strong');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 6: React 18 SPA (dev) ───────────────────────────
  describe('Scenario 6: React 18 SPA page with devtools hook (strong tier)', () => {
    it('should detect react18 with strong tier when __REACT_DEVTOOLS_GLOBAL_HOOK__ is present', async () => {
      const page = createMockPage(reactDevState(), reactHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('react18');
      expect(result.appElement).toBe('#root');
      expect(result.markers).toContain('__REACT_DEVTOOLS__');
      expect(result.tier).toBe('strong');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 7: React 18 SPA (prod) weak → moderate upgrade ──
  describe('Scenario 7: React 18 SPA prod build (weak tier upgraded to moderate)', () => {
    it('should upgrade weak tier to moderate when Phase 3b finds React fiber nodes', async () => {
      // Phase 1: weak (dom:#root) → Phase 3b: prod signal found (true) → hydration check
      const page = createMockPage(reactWeakState(), true, reactHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + Phase 3b + post-wait check = 3 evaluate calls
      expect(page._evaluate).toHaveBeenCalledTimes(3);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('react18');
      expect(result.appElement).toBe('#root');
      expect(result.markers).toContain('dom:#root');
      expect(result.markers).toContain('tier-upgraded:weak→moderate');
      expect(result.tier).toBe('moderate');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 8: Angular SPA (dev) ────────────────────────────
  describe('Scenario 8: Angular SPA page with ng.probe (strong tier)', () => {
    it('should detect angular with strong tier when ng.probe is present', async () => {
      const page = createMockPage(angularDevState(), { ...noHydration, angularHydrated: true });

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('angular');
      expect(result.appElement).toBe('[ng-app], [ng-version]');
      expect(result.markers).toContain('angular');
      expect(result.tier).toBe('strong');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 9: Angular SPA (prod) ───────────────────────────
  describe('Scenario 9: Angular SPA prod build (moderate tier)', () => {
    it('should detect angular with moderate tier via production signals', async () => {
      const page = createMockPage(angularProdState(), { ...noHydration, angularHydrated: true });

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('angular');
      expect(result.markers).toContain('angular');
      expect(result.markers).toContain('angular-prod-signals');
      expect(result.tier).toBe('moderate');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 10: Angular SPA (bare root, weak) ───────────────
  describe('Scenario 10: Angular SPA with bare root (weak tier)', () => {
    it('should detect angular with weak tier when only [ng-app]/[ng-version] exists', async () => {
      // Phase 1: weak → Phase 3b: no prod signal (false) → hydration check
      const page = createMockPage(angularWeakState(), false, noHydration);

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + Phase 3b + post-wait check = 3 evaluate calls
      expect(page._evaluate).toHaveBeenCalledTimes(3);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('angular');
      expect(result.appElement).toBe('[ng-app], [ng-version]');
      expect(result.markers).toContain('angular');
      expect(result.tier).toBe('weak');
      expect(result.isHydrated).toBe(false);
    });
  });

  // ─── Scenario 11: Next.js SSR ─────────────────────────────────
  describe('Scenario 11: Next.js SSR page (definitive tier)', () => {
    it('should detect nextjs with definitive tier via __NEXT_DATA__', async () => {
      const page = createMockPage(nextDataState(), { ...noHydration, nextHydrated: true });

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('nextjs');
      expect(result.appElement).toBe('#__next');
      expect(result.markers).toContain('__NEXT_DATA__');
      expect(result.tier).toBe('definitive');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 12: SvelteKit SSR ───────────────────────────────
  describe('Scenario 12: SvelteKit SSR page (definitive tier)', () => {
    it('should detect sveltekit with definitive tier via __sveltekit__', async () => {
      const page = createMockPage(svelteKitState(), { ...noHydration, sveltekitHydrated: true });

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('sveltekit');
      expect(result.appElement).toBe('#svelte');
      expect(result.markers).toContain('__sveltekit__');
      expect(result.tier).toBe('definitive');
      expect(result.isHydrated).toBe(true);
    });
  });

  // ─── Scenario 5: Timeout During Vue Hydration ─────────────────
  describe('Scenario 5: Timeout during Vue hydration (non-fatal)', () => {
    it('should handle Phase 2 timeout gracefully and continue', async () => {
      const page = createMockNuxtPage(nuxtSSRState(false), nuxtVersion3);

      // Phase 2 waitForFunction throws timeout
      page._waitForFunction
        .mockRejectedValueOnce(new Error('Timeout')) // Phase 2 throws
        .mockResolvedValueOnce(undefined);            // Phase 3 resolves

      const result = await waitForSpaHydration(page, defaultOptions);

      // Should complete without throwing
      // Phase 1 + version check + post-wait = 3 evaluate calls
      expect(page._evaluate).toHaveBeenCalledTimes(3);
      expect(page._waitForFunction).toHaveBeenCalledTimes(2);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('nuxt3');
      expect(result.isHydrated).toBe(false);
    });
  });

  // ─── Scenario 6: Custom Log Prefix ────────────────────────────
  describe('Scenario 6: Custom log prefix', () => {
    it('should use the provided logPrefix in console output', async () => {
      const page = createMockPage(noFrameworkState());

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await waitForSpaHydration(page, { timeout: 30000, logPrefix: '[CustomAdapter]' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CustomAdapter]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });

    it('should use default log prefix when not provided', async () => {
      const page = createMockPage(noFrameworkState());

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await waitForSpaHydration(page, { timeout: 30000 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Adapter]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });

  // ─── Scenario 7: Evaluate Error ───────────────────────────────
  describe('Scenario 7: evaluate throws an error', () => {
    it('should handle evaluate error gracefully and return unknown result', async () => {
      const page = createMockPage(noFrameworkState());
      // Override: both evaluate calls reject
      page._evaluate.mockReset();
      page._evaluate.mockRejectedValue(new Error('Page crashed'));

      const result = await waitForSpaHydration(page, defaultOptions);

      // Should not throw
      expect(result.framework).toBe('unknown');
      expect(result.isHydrated).toBe(false);
      expect(result.markers).toEqual([]);
      expect(result.tier).toBe('none');
    });
  });

  // ─── Scenario 8: Returns Structured SpaDetectionResult ────────
  describe('Scenario 8: Returns structured detection result', () => {
    it('should return SpaDetectionResult with framework and tier', async () => {
      const page = createMockNuxtPage(nuxtSSRState(true), nuxtVersion3, nuxtHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(result).toHaveProperty('framework');
      expect(result).toHaveProperty('appElement');
      expect(result).toHaveProperty('isHydrated');
      expect(result).toHaveProperty('markers');
      expect(result).toHaveProperty('tier');
      expect(result.framework).toBe('nuxt3');
      expect(result.appElement).toBe('#__nuxt');
      expect(result.isHydrated).toBe(true);
      expect(Array.isArray(result.markers)).toBe(true);
      expect(result.tier).toBe('definitive');
    });
  });

  // ─── Scenario 9: Custom SpaPageLike Implementation ───────────
  describe('Scenario 9: Custom SpaPageLike implementation', () => {
    it('should work with a third-party adapter implementing SpaPageLike', async () => {
      let evalCount = 0;
      const customAdapter: SpaPageLike = {
        evaluate: async <T>() => {
          evalCount++;
          if (evalCount === 1) return noFrameworkState() as T;
          return noHydration as T;
        },
        waitForFunction: async () => undefined,
        waitForTimeout: async () => undefined,
      };

      const result = await waitForSpaHydration(customAdapter, defaultOptions);

      expect(result.framework).toBe('unknown');
      expect(result.isHydrated).toBe(false);
      expect(result.tier).toBe('none');
    });
  });

  // ─── Scenario 10: Phase 3 Framework Readiness Timeout ─────────
  describe('Scenario 10: Phase 3 timeout (non-fatal)', () => {
    it('should handle Phase 3 timeout gracefully via .catch()', async () => {
      const page = createMockPage(noFrameworkState());
      // Phase 3 waitForFunction rejects (timeout)
      page._waitForFunction.mockRejectedValue(new Error('Timeout'));

      await waitForSpaHydration(page, defaultOptions);

      // Should complete without throwing
      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);
    });
  });

  // ─── Scenario 11: Short Timeout Value ─────────────────────────
  describe('Scenario 11: Short timeout value', () => {
    it('should scale sub-timeouts based on the provided timeout', async () => {
      const page = createMockNuxtPage(nuxtSSRState(false), nuxtVersion3);

      await waitForSpaHydration(page, { timeout: 5000, logPrefix: '[Test]' });

      // Phase 2 sub-timeout: Math.min(5000/3, 5000) ≈ 1666
      expect(page._waitForFunction.mock.calls[0][1]?.timeout).toBeLessThanOrEqual(5000);
      // Phase 3 sub-timeout: Math.min(5000/2, 8000) = 2500
      expect(page._waitForFunction.mock.calls[1][1]?.timeout).toBeLessThanOrEqual(8000);
    });
  });

  // ─── Scenario 12: Already Hydrated Nuxt Page ──────────────────
  describe('Scenario 12: Nuxt page already hydrated', () => {
    it('should skip Phase 2 when vueInstance is already true', async () => {
      const page = createMockNuxtPage(nuxtSSRState(true), nuxtVersion3, nuxtHydrated);

      await waitForSpaHydration(page, defaultOptions);

      // Phase 2: SKIPPED — vueInstance is already true
      // Phase 3: evaluate used
      // Phase 4: waitForTimeout(500)
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);
    });
  });

  // ─── Scenario 13: compareTier utility ─────────────────────────
  describe('compareTier utility', () => {
    it('should rank tiers correctly', () => {
      expect(compareTier('definitive', 'strong')).toBeGreaterThan(0);
      expect(compareTier('strong', 'moderate')).toBeGreaterThan(0);
      expect(compareTier('moderate', 'weak')).toBeGreaterThan(0);
      expect(compareTier('weak', 'none')).toBeGreaterThan(0);
      expect(compareTier('definitive', 'definitive')).toBe(0);
      expect(compareTier('none', 'definitive')).toBeLessThan(0);
    });
  });
});
