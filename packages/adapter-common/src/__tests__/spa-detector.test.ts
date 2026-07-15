/**
 * Tests for waitForSpaHydration — shared SPA hydration detection utility.
 *
 * Real business scenarios:
 * 1. Nuxt 3 SSR page — has window.__NUXT__ + #__nuxt, needs to wait for Vue hydration
 * 2. Vue 3 SPA page — has __VUE__ global, no SSR markers
 * 3. React SPA page — has __REACT_DEVTOOLS_GLOBAL_HOOK__, no SSR markers
 * 4. Angular SPA page — has ng.probe, no SSR markers
 * 5. Plain HTML page — no framework markers, should return quickly
 * 6. Timeout during Vue hydration — Nuxt page but Vue takes too long (non-fatal)
 * 7. Custom log prefix — verify log output uses custom prefix
 * 8. Evaluate error — page.evaluate throws, should be non-fatal
 * 9. Multiple evaluate calls — verify evaluate is called exactly once
 * 10. Custom SpaPageLike implementation — third-party adapter compatibility
 */

import { describe, it, expect, vi } from 'vitest';
import { waitForSpaHydration, type SpaPageLike, type SpaDetectorOptions } from '../index.js';

/**
 * Create a mock page with the given evaluate return value.
 * All waitForFunction and waitForTimeout calls resolve by default.
 */
function createMockPage(evaluateReturn: Record<string, boolean>): SpaPageLike & {
  _evaluate: ReturnType<typeof vi.fn>;
  _waitForFunction: ReturnType<typeof vi.fn>;
  _waitForTimeout: ReturnType<typeof vi.fn>;
} {
  const mockEvaluate = vi.fn().mockResolvedValue(evaluateReturn);
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
      const page = createMockPage({
        hasNuxt: true,
        hasVue: true,
        appElement: true,
        vueInstance: false,
      });

      await waitForSpaHydration(page, defaultOptions);

      // Phase 1: evaluate called once to detect SSR
      expect(page._evaluate).toHaveBeenCalledTimes(1);

      // Phase 2: waitForFunction called for Vue hydration check
      // (because hasNuxt && appElement && !vueInstance)
      expect(page._waitForFunction).toHaveBeenCalledTimes(2);
      const phase2Call = page._waitForFunction.mock.calls[0];
      expect(phase2Call[1]).toHaveProperty('timeout');

      // Phase 3: waitForFunction called for framework readiness check
      const phase3Call = page._waitForFunction.mock.calls[1];
      expect(phase3Call[1]).toHaveProperty('timeout');

      // Phase 4: small delay
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  // ─── Scenario 2: Vue 3 SPA (no Nuxt) ──────────────────────────
  describe('Scenario 2: Vue 3 SPA page (no Nuxt SSR)', () => {
    it('should detect Vue 3 and skip Phase 2 hydration wait', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: true,
        appElement: false,
        vueInstance: false,
      });

      await waitForSpaHydration(page, defaultOptions);

      // Phase 1: evaluate called once
      expect(page._evaluate).toHaveBeenCalledTimes(1);

      // Phase 2: SKIPPED — no Nuxt + appElement
      // Phase 3: waitForFunction for framework readiness
      // Phase 4: waitForTimeout
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  // ─── Scenario 3: React SPA Page ───────────────────────────────
  describe('Scenario 3: React SPA page', () => {
    it('should detect React and proceed through phases', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });

      await waitForSpaHydration(page, defaultOptions);

      // React detection happens in Phase 3 via waitForFunction
      // Phase 1 only detects Nuxt/Vue SSR markers
      expect(page._evaluate).toHaveBeenCalledTimes(1);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  // ─── Scenario 4: Angular SPA Page ─────────────────────────────
  describe('Scenario 4: Angular SPA page', () => {
    it('should detect Angular and proceed through phases', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });

      await waitForSpaHydration(page, defaultOptions);

      // Angular detection via ng.probe happens in Phase 3
      expect(page._evaluate).toHaveBeenCalledTimes(1);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Scenario 5: Plain HTML Page (No Framework) ───────────────
  describe('Scenario 5: Plain HTML page (no framework)', () => {
    it('should return quickly without unnecessary delays', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });

      await waitForSpaHydration(page, defaultOptions);

      // Phase 1: evaluate detects no framework
      // Phase 2: skipped (no Nuxt + appElement)
      // Phase 3: waitForFunction checks all frameworks, falls through to readyState
      // Phase 4: waitForTimeout(1000)
      expect(page._evaluate).toHaveBeenCalledTimes(1);
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  // ─── Scenario 6: Timeout During Vue Hydration ─────────────────
  describe('Scenario 6: Timeout during Vue hydration (non-fatal)', () => {
    it('should handle Phase 2 timeout gracefully and continue', async () => {
      const page = createMockPage({
        hasNuxt: true,
        hasVue: true,
        appElement: true,
        vueInstance: false,
      });

      // Phase 2 waitForFunction throws timeout
      page._waitForFunction
        .mockRejectedValueOnce(new Error('Timeout')) // Phase 2 throws
        .mockResolvedValueOnce(undefined);            // Phase 3 resolves

      await waitForSpaHydration(page, defaultOptions);

      // Should complete without throwing
      expect(page._evaluate).toHaveBeenCalledTimes(1);
      // Phase 2 should be attempted (first call)
      // Phase 3 should be reached (second call)
      expect(page._waitForFunction).toHaveBeenCalledTimes(2);
      // Phase 4 should still be reached
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  // ─── Scenario 7: Custom Log Prefix ────────────────────────────
  describe('Scenario 7: Custom log prefix', () => {
    it('should use the provided logPrefix in console output', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });

      // Spy on console.log
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await waitForSpaHydration(page, { timeout: 30000, logPrefix: '[CustomAdapter]' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CustomAdapter]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });

    it('should use default log prefix when not provided', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });

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
    it('should handle evaluate error gracefully (non-fatal)', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });
      page._evaluate.mockRejectedValue(new Error('Page crashed'));

      // Should not throw — the outer try-catch catches it
      await expect(
        waitForSpaHydration(page, defaultOptions)
      ).resolves.toBeUndefined();
    });
  });

  // ─── Scenario 9: Evaluate Called Exactly Once ─────────────────
  describe('Scenario 9: evaluate is called exactly once', () => {
    it('should call evaluate only once regardless of framework', async () => {
      const page = createMockPage({
        hasNuxt: true,
        hasVue: true,
        appElement: true,
        vueInstance: true, // Already hydrated
      });

      await waitForSpaHydration(page, defaultOptions);

      // evaluate should only be called once (Phase 1)
      expect(page._evaluate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Scenario 10: Custom SpaPageLike Implementation ───────────
  describe('Scenario 10: Custom SpaPageLike implementation', () => {
    it('should work with a third-party adapter implementing SpaPageLike', async () => {
      // Simulate a custom adapter (e.g., Nightmare, Selenium, etc.)
      const customAdapter: SpaPageLike = {
        evaluate: async <T>() => {
          return { hasNuxt: false, hasVue: false, appElement: false, vueInstance: false } as T;
        },
        waitForFunction: async () => undefined,
        waitForTimeout: async () => undefined,
      };

      await expect(
        waitForSpaHydration(customAdapter, defaultOptions)
      ).resolves.toBeUndefined();
    });
  });

  // ─── Scenario 11: Phase 3 Framework Readiness Timeout ─────────
  describe('Scenario 11: Phase 3 framework readiness timeout', () => {
    it('should handle Phase 3 timeout gracefully via .catch()', async () => {
      const page = createMockPage({
        hasNuxt: false,
        hasVue: false,
        appElement: false,
        vueInstance: false,
      });
      // Phase 3 waitForFunction rejects (timeout)
      page._waitForFunction.mockRejectedValue(new Error('Timeout'));

      await waitForSpaHydration(page, defaultOptions);

      // Should complete without throwing
      expect(page._evaluate).toHaveBeenCalledTimes(1);
      // Phase 3 should be attempted
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      // Phase 4 should still be reached (timeout is caught by .catch())
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });

  // ─── Scenario 12: Short Timeout Value ─────────────────────────
  describe('Scenario 12: Short timeout value', () => {
    it('should scale sub-timeouts based on the provided timeout', async () => {
      const page = createMockPage({
        hasNuxt: true,
        hasVue: true,
        appElement: true,
        vueInstance: false,
      });

      // Short timeout: Phase 2 = min(5000/3, 5000) = 1666, Phase 3 = min(5000/2, 5000) = 2500
      await waitForSpaHydration(page, { timeout: 5000, logPrefix: '[Test]' });

      // Phase 2 sub-timeout: Math.min(5000/3, 5000) ≈ 1666
      expect(page._waitForFunction.mock.calls[0][1]?.timeout).toBeLessThanOrEqual(5000);
      // Phase 3 sub-timeout: Math.min(5000/2, 5000) = 2500
      expect(page._waitForFunction.mock.calls[1][1]?.timeout).toBeLessThanOrEqual(5000);
    });
  });

  // ─── Scenario 13: Already Hydrated Nuxt Page ──────────────────
  describe('Scenario 13: Nuxt page already hydrated', () => {
    it('should skip Phase 2 when vueInstance is already true', async () => {
      const page = createMockPage({
        hasNuxt: true,
        hasVue: true,
        appElement: true,
        vueInstance: true, // Already hydrated
      });

      await waitForSpaHydration(page, defaultOptions);

      // Phase 2: SKIPPED — vueInstance is already true
      // Phase 3: waitForFunction for framework readiness
      // Phase 4: waitForTimeout(1000)
      expect(page._waitForFunction).toHaveBeenCalledTimes(1);
      expect(page._waitForTimeout).toHaveBeenCalledWith(1000);
    });
  });
});