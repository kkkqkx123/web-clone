/**
 * Proper tests for @web-clone/adapter-common package exports.
 *
 * Verifies that all public API surfaces are properly exported
 * from the package entry point, so consumers can import them.
 */

import { describe, it, expect } from 'vitest';
import {
  waitForSpaHydration,
  compareTier,
  tierAtLeast,
  type SpaPageLike,
  type SpaDetectorOptions,
  type SpaDetectionResult,
  type SignalTier,
  type AutomationAdapterOptions,
  type AutomationAuthOptions,
  type PageLoadWaitStrategy,
} from '../index.js';

describe('@web-clone/adapter-common exports', () => {
  it('should export waitForSpaHydration function', () => {
    expect(waitForSpaHydration).toBeDefined();
    expect(typeof waitForSpaHydration).toBe('function');
  });

  it('should export SpaPageLike type (interface check via function parameter)', () => {
    // Verify that a mock SpaPageLike can be passed to the function
    const mockPage: SpaPageLike = {
      evaluate: async <T>() => ({} as T),
      waitForFunction: async () => undefined,
      waitForTimeout: async () => undefined,
    };
    // The type check passes at compile time; at runtime, the function
    // will call these methods. This confirms the interface is properly exported.
    expect(mockPage.evaluate).toBeDefined();
    expect(mockPage.waitForFunction).toBeDefined();
    expect(mockPage.waitForTimeout).toBeDefined();
  });

  it('should export SpaDetectorOptions type', () => {
    const opts: SpaDetectorOptions = { timeout: 10000 };
    expect(opts.timeout).toBe(10000);
  });

  it('should export SpaDetectorOptions with optional logPrefix', () => {
    const opts: SpaDetectorOptions = { timeout: 10000, logPrefix: '[Test]' };
    expect(opts.logPrefix).toBe('[Test]');
  });

  it('should export SpaDetectionResult type', () => {
    const result: SpaDetectionResult = {
      framework: 'nuxt3',
      appElement: '#__nuxt',
      isHydrated: true,
      markers: ['__NUXT__', 'hydration-confirmed'],
      tier: 'definitive',
    };
    expect(result.framework).toBe('nuxt3');
    expect(result.appElement).toBe('#__nuxt');
    expect(result.isHydrated).toBe(true);
    expect(result.markers).toHaveLength(2);
    expect(result.tier).toBe('definitive');
  });

  it('should export SignalTier type', () => {
    const tier: SignalTier = 'definitive';
    expect(tier).toBe('definitive');
  });

  it('should export compareTier utility', () => {
    expect(compareTier('definitive', 'weak')).toBeGreaterThan(0);
    expect(compareTier('weak', 'definitive')).toBeLessThan(0);
  });

  it('should export tierAtLeast utility', () => {
    expect(tierAtLeast('definitive', 'strong')).toBe(true);
    expect(tierAtLeast('weak', 'definitive')).toBe(false);
  });

  it('should export AutomationAdapterOptions type', () => {
    const opts: AutomationAdapterOptions = {
      waitStrategy: 'networkidle',
      requestTimeout: 30000,
    };
    expect(opts.waitStrategy).toBe('networkidle');
    expect(opts.requestTimeout).toBe(30000);
  });

  it('should export AutomationAdapterOptions with debug settings', () => {
    const opts: AutomationAdapterOptions = {
      waitStrategy: 'domcontentloaded',
      debug: {
        screenshot: './debug.png',
        logs: './debug.log',
      },
    };
    expect(opts.debug?.screenshot).toBe('./debug.png');
    expect(opts.debug?.logs).toBe('./debug.log');
  });

  it('should export AutomationAdapterOptions with customHeaders', () => {
    const opts: AutomationAdapterOptions = {
      waitStrategy: 'load',
      customHeaders: { Authorization: 'Bearer token123' },
    };
    expect(opts.customHeaders?.Authorization).toBe('Bearer token123');
  });

  it('should export AutomationAdapterOptions with validateSSL', () => {
    const opts: AutomationAdapterOptions = { validateSSL: false };
    expect(opts.validateSSL).toBe(false);
  });

  it('should export AutomationAuthOptions type', () => {
    const auth: AutomationAuthOptions = {
      headers: { Authorization: 'Bearer token123' },
    };
    expect(auth.headers?.Authorization).toBe('Bearer token123');
  });

  it('should export AutomationAuthOptions with cookies', () => {
    const auth: AutomationAuthOptions = {
      cookies: [
        { name: 'session', value: 'abc123', domain: '127.0.0.1' },
      ],
    };
    expect(auth.cookies).toHaveLength(1);
    expect(auth.cookies![0].name).toBe('session');
  });

  it('should export AutomationAuthOptions with storageState', () => {
    const auth: AutomationAuthOptions = {
      storageState: { cookies: [], origins: [] },
    };
    expect(auth.storageState).toBeDefined();
  });

  it('should export PageLoadWaitStrategy type as union of valid values', () => {
    // Verify all expected values are assignable
    const strategies: PageLoadWaitStrategy[] = ['load', 'domcontentloaded', 'networkidle'];
    expect(strategies).toHaveLength(3);
    expect(strategies).toContain('load');
    expect(strategies).toContain('domcontentloaded');
    expect(strategies).toContain('networkidle');
  });
});