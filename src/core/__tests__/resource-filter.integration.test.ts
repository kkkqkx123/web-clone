/**
 * Phase 1: ResourceFilter Integration Test
 * Verifies that ResourceFilter is properly integrated into the snapshot pipeline
 */

import { describe, it, expect, vi } from 'vitest';
import { ResourceFilter } from '../resource-filter.js';

describe('Phase 1: ResourceFilter Integration', () => {
  it('should create a ResourceFilter instance with default options', () => {
    const filter = new ResourceFilter();
    expect(filter).toBeDefined();
    const stats = filter.getStats();
    expect(stats.total).toBe(0);
    expect(stats.included).toBe(0);
    expect(stats.filtered).toBe(0);
  });

  it('should filter resources with default blacklist and extensions', () => {
    const filter = new ResourceFilter();
    const refs = [
      { url: 'https://example.com/style.css', type: 'css' as const, origin: 'html' },
      { url: 'https://google-analytics.com/ga.js', type: 'js' as const, origin: 'html' },
      { url: 'https://example.com/archive.zip', type: 'other' as const, origin: 'html' },
    ];

    const filtered = filter.filter(refs);
    const stats = filter.getStats();

    expect(filtered.length).toBe(1);
    expect(stats.total).toBe(3);
    expect(stats.included).toBe(1);
    expect(stats.filtered).toBe(2);
  });

  it('should log filter reasons correctly', () => {
    const filter = new ResourceFilter();
    const refs = [
      { url: 'https://google-analytics.com/ga.js', type: 'js' as const, origin: 'html' },
      { url: 'https://example.com/archive.zip', type: 'other' as const, origin: 'html' },
    ];

    filter.filter(refs);
    const stats = filter.getStats();

    expect(stats.filterReasons['Blacklist match']).toBe(1);
    expect(Object.values(stats.filterReasons).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('should support custom filtering', () => {
    const filter = new ResourceFilter({
      customFilter: (url) => !url.includes('blocked'),
    });

    const refs = [
      { url: 'https://example.com/allowed.js', type: 'js' as const, origin: 'html' },
      { url: 'https://example.com/blocked.js', type: 'js' as const, origin: 'html' },
    ];

    const filtered = filter.filter(refs);
    expect(filtered.length).toBe(1);
  });

  it('should respect enableDefaultBlacklist option', () => {
    const filter = new ResourceFilter({ enableDefaultBlacklist: false });

    const refs = [
      { url: 'https://google-analytics.com/ga.js', type: 'js' as const, origin: 'html' },
    ];

    const filtered = filter.filter(refs);
    expect(filtered.length).toBe(1); // Not filtered since blacklist is disabled
  });

  it('should support custom skip extensions', () => {
    const filter = new ResourceFilter({
      skipExtensions: ['.wasm', '.zip'],
    });

    const refs = [
      { url: 'https://example.com/app.wasm', type: 'other' as const, origin: 'html' },
      { url: 'https://example.com/archive.zip', type: 'other' as const, origin: 'html' },
    ];

    const filtered = filter.filter(refs);
    expect(filtered.length).toBe(0); // Both filtered
  });
});
