/**
 * Tests for waitForSpaHydration — shared SPA hydration detection utility.
 *
 * Real business scenarios:
 * 1. Nuxt 3 SSR page — has window.__NUXT__ + #__nuxt, needs to wait for Vue hydration
 * 2. Nuxt 2 SSR page — has $nuxt.$mount + #__nuxt, needs to wait for Vue hydration
 * 3. Vue 3 SPA page — has __VUE__ global, no SSR markers
 * 4. React SPA page — has __REACT_DEVTOOLS_GLOBAL_HOOK__, no SSR markers
 * 5. Angular SPA page — has ng.probe, no SSR markers
 * 6. Plain HTML page — no framework markers, should return quickly
 * 7. Timeout during Vue hydration — Nuxt page but Vue takes too long (non-fatal)
 * 8. Custom log prefix — verify log output uses custom prefix
 * 9. Evaluate error — page.evaluate throws, should be non-fatal
 * 10. Returns structured SpaDetectionResult — verify fine-grained framework identification
 * 11. Custom SpaPageLike implementation — third-party adapter compatibility
 * 12. Phase 3 timeout — handled by .catch() non-fatally
 * 13. Short timeout — sub-timeouts scale correctly
 * 14. Already hydrated Nuxt — skips Phase 2
 */

import { describe, it, expect, vi } from 'vitest';
import { waitForSpaHydration, type SpaPageLike, type SpaDetectorOptions } from '../index.js';

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

/**
 * Create a mock page with evaluate that returns different values per call.
 * Supports two modes:
 * - Non-Nuxt: 2 evaluate calls (Phase 1 + post-wait hydration check)
 * - Nuxt: 3 evaluate calls (Phase 1 + version check + post-wait hydration check)
 */
function createMockPage(
  evaluateReturn1: Record<string, boolean>,
  evaluateReturn2?: Record<string, boolean>
): SpaPageLike & {
  _evaluate: ReturnType<typeof vi.fn>;
  _waitForFunction: ReturnType<typeof vi.fn>;
  _waitForTimeout: ReturnType<typeof vi.fn>;
} {
  const mockEvaluate = vi.fn()
    .mockResolvedValueOnce(evaluateReturn1)
    .mockResolvedValueOnce(evaluateReturn2 || noHydration);
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

      // Phase 2: waitForFunction called for Vue hydration check
      // Phase 3: waitForFunction called for framework readiness check
      expect(page._waitForFunction).toHaveBeenCalledTimes(2);
      const phase2Call = page._waitForFunction.mock.calls[0];
      expect(phase2Call[1]).toHaveProperty('timeout');

      // Phase 4: small delay
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      // Result validation — now returns fine-grained 'nuxt3'
      expect(result.framework).toBe('nuxt3');
      expect(result.appElement).toBe('#__nuxt');
      expect(result.isHydrated).toBe(true);
      expect(result.markers).toContain('__NUXT__');
      expect(result.markers).toContain('hydration-confirmed');
    });

    it('should detect Nuxt 2 SSR from version check', async () => {
      const page = createMockNuxtPage(nuxtSSRState(false), nuxtVersion2, nuxtHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(result.framework).toBe('nuxt2');
      expect(result.appElement).toBe('#__nuxt');
      // Version-differentiated detection now uses '$nuxt.$mount' marker
      expect(result.markers).toContain('$nuxt.$mount');
      // Confidence boosted by version signal (0.95) + hydration bonus (0.03)
      expect(result.confidence).toBe(0.98);
    });
  });

  // ─── Scenario 2: Vue 3 SPA (no Nuxt) ──────────────────────────
  describe('Scenario 2: Vue 3 SPA page (no Nuxt SSR)', () => {
    it('should detect Vue 3 and skip Phase 2 hydration wait', async () => {
      const page = createMockPage(vueSPAState());

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + post-wait check (no version check for Vue SPA)
      expect(page._evaluate).toHaveBeenCalledTimes(2);

      // Phase 2: SKIPPED — no Nuxt + appElement
      // Phase 3: waitForFunction for framework readiness
      // Phase 4: waitForTimeout
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('vue3');
    });
  });

  // ─── Scenario 3: React SPA Page ───────────────────────────────
  describe('Scenario 3: React SPA page', () => {
    it('should detect React and proceed through phases', async () => {
      const page = createMockPage(noFrameworkState());

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + post-wait check
      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('unknown');
    });
  });

  // ─── Scenario 4: Angular SPA Page ─────────────────────────────
  describe('Scenario 4: Angular SPA page', () => {
    it('should detect Angular and proceed through phases', async () => {
      const page = createMockPage(noFrameworkState());

      const result = await waitForSpaHydration(page, defaultOptions);

      // Phase 1 + post-wait check
      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);

      expect(result.framework).toBe('unknown');
    });
  });

  // ─── Scenario 5: Plain HTML Page (No Framework) ───────────────
  describe('Scenario 5: Plain HTML page (no framework)', () => {
    it('should return quickly without unnecessary delays', async () => {
      const page = createMockPage(noFrameworkState());

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(page._evaluate).toHaveBeenCalledTimes(2);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);

      expect(result.framework).toBe('unknown');
      expect(result.isHydrated).toBe(false);
    });
  });

  // ─── Scenario 6: Timeout During Vue Hydration ─────────────────
  describe('Scenario 6: Timeout during Vue hydration (non-fatal)', () => {
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

  // ─── Scenario 7: Custom Log Prefix ────────────────────────────
  describe('Scenario 7: Custom log prefix', () => {
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

  // ─── Scenario 8: Evaluate Error ───────────────────────────────
  describe('Scenario 8: evaluate throws an error', () => {
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
    });
  });

  // ─── Scenario 9: Returns Structured SpaDetectionResult ────────
  describe('Scenario 9: Returns structured detection result', () => {
    it('should return SpaDetectionResult with fine-grained framework and markers', async () => {
      const page = createMockNuxtPage(nuxtSSRState(true), nuxtVersion3, nuxtHydrated);

      const result = await waitForSpaHydration(page, defaultOptions);

      expect(result).toHaveProperty('framework');
      expect(result).toHaveProperty('appElement');
      expect(result).toHaveProperty('isHydrated');
      expect(result).toHaveProperty('markers');
      // With Nuxt v3 version check, framework is now 'nuxt3'
      expect(result.framework).toBe('nuxt3');
      expect(result.appElement).toBe('#__nuxt');
      expect(result.isHydrated).toBe(true);
      expect(Array.isArray(result.markers)).toBe(true);
    });
  });

  // ─── Scenario 10: Custom SpaPageLike Implementation ───────────
  describe('Scenario 10: Custom SpaPageLike implementation', () => {
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
    });
  });

  // ─── Scenario 11: Phase 3 Framework Readiness Timeout ─────────
  describe('Scenario 11: Phase 3 framework readiness timeout', () => {
    it('should handle Phase 3 timeout gracefully via .catch()', async () => {
      const page = createMockPage(noFrameworkState());
      // Phase 3 waitForFunction rejects (timeout)
      page._waitForFunction.mockRejectedValue(new Error('Timeout'));

      await waitForSpaHydration(page, defaultOptions);

      // Should complete without throwing
      expect(page._evaluate).toHaveBeenCalledTimes(2);
      // Phase 3 should be attempted
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      // Phase 4 should still be reached (timeout is caught by .catch())
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);
    });
  });

  // ─── Scenario 12: Short Timeout Value ─────────────────────────
  describe('Scenario 12: Short timeout value', () => {
    it('should scale sub-timeouts based on the provided timeout', async () => {
      const page = createMockNuxtPage(nuxtSSRState(false), nuxtVersion3);

      // Short timeout: Phase 2 = min(5000/3, 5000) = 1666, Phase 3 = min(5000/2, 8000) = 2500
      await waitForSpaHydration(page, { timeout: 5000, logPrefix: '[Test]' });

      // Phase 2 sub-timeout: Math.min(5000/3, 5000) ≈ 1666
      expect(page._waitForFunction.mock.calls[0][1]?.timeout).toBeLessThanOrEqual(5000);
      // Phase 3 sub-timeout: Math.min(5000/2, 8000) = 2500
      expect(page._waitForFunction.mock.calls[1][1]?.timeout).toBeLessThanOrEqual(8000);
    });
  });

  // ─── Scenario 13: Already Hydrated Nuxt Page ──────────────────
  describe('Scenario 13: Nuxt page already hydrated', () => {
    it('should skip Phase 2 when vueInstance is already true', async () => {
      const page = createMockNuxtPage(nuxtSSRState(true), nuxtVersion3, nuxtHydrated);

      await waitForSpaHydration(page, defaultOptions);

      // Phase 2: SKIPPED — vueInstance is already true
      // Phase 3: waitForFunction for framework readiness
      // Phase 4: waitForTimeout(500)
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(500);
    });
  });
});
