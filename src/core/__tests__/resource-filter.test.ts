import { describe, it, expect } from 'vitest';
import { ResourceFilter } from '../resource-filter.js';
import type { AssetRef } from '../../types.js';

describe('ResourceFilter', () => {
  describe('shouldInclude', () => {
    it('should include normal resources', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'https://example.com/style.css', type: 'css' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(true);
    });

    it('should exclude resources by extension', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'https://example.com/archive.zip', type: 'other' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(false);
      expect(result.reason).toContain('Extension filtered');
    });

    it('should exclude blacklist domains', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'https://google-analytics.com/ga.js', type: 'js' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(false);
      expect(result.reason).toBe('Blacklist match');
    });

    it('should apply custom filter', () => {
      const filter = new ResourceFilter({
        customFilter: (url) => !url.includes('ads'),
      });

      const adUrl = { url: 'https://example.com/ads.js', type: 'js' };
      const result1 = filter.shouldInclude(adUrl);
      expect(result1.included).toBe(false);

      const normalUrl = { url: 'https://example.com/app.js', type: 'js' };
      const result2 = filter.shouldInclude(normalUrl);
      expect(result2.included).toBe(true);
    });

    it('should disable blacklist when enableDefaultBlacklist is false', () => {
      const filter = new ResourceFilter({ enableDefaultBlacklist: false });
      const ref = { url: 'https://google-analytics.com/ga.js', type: 'js' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(true);
    });

    it('should handle custom skip extensions', () => {
      const filter = new ResourceFilter({
        skipExtensions: ['.mp4', '.mp3'],
      });

      const videoUrl = { url: 'https://example.com/video.mp4', type: 'media' };
      const result1 = filter.shouldInclude(videoUrl);
      expect(result1.included).toBe(false);

      const zipUrl = { url: 'https://example.com/archive.zip', type: 'other' };
      const result2 = filter.shouldInclude(zipUrl);
      expect(result2.included).toBe(true);
    });

    it('should handle URLs with query strings', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'https://example.com/style.css?v=1.0', type: 'css' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(true);
    });

    it('should handle URLs with fragments', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'https://example.com/style.css#top', type: 'css' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(true);
    });
  });

  describe('filter', () => {
    it('should filter multiple resources and track stats', () => {
      const filter = new ResourceFilter();
      const refs: AssetRef[] = [
        { url: 'https://example.com/style.css', type: 'css', origin: 'html' },
        { url: 'https://example.com/archive.zip', type: 'other', origin: 'html' },
        { url: 'https://google-analytics.com/ga.js', type: 'js', origin: 'html' },
        { url: 'https://example.com/app.js', type: 'js', origin: 'html' },
      ];

      const filtered = filter.filter(refs);
      const stats = filter.getStats();

      expect(filtered.length).toBe(2);
      expect(stats.total).toBe(4);
      expect(stats.included).toBe(2);
      expect(stats.filtered).toBe(2);
    });

    it('should provide detailed filter reasons', () => {
      const filter = new ResourceFilter();
      const refs: AssetRef[] = [
        { url: 'https://example.com/archive.zip', type: 'other', origin: 'html' },
        { url: 'https://google-analytics.com/ga.js', type: 'js', origin: 'html' },
        { url: 'https://example.com/doc.pdf', type: 'other', origin: 'html' },
      ];

      filter.filter(refs);
      const stats = filter.getStats();

      expect(stats.filterReasons['Extension filtered: .zip']).toBe(1);
      expect(stats.filterReasons['Blacklist match']).toBe(1);
      expect(stats.filterReasons['Extension filtered: .pdf']).toBe(1);
    });
  });

  describe('extension normalization', () => {
    it('should normalize extensions to lowercase', () => {
      const filter = new ResourceFilter({
        skipExtensions: ['.ZIP', '.PDF'],
      });

      const ref1 = { url: 'https://example.com/archive.zip', type: 'other' };
      const result1 = filter.shouldInclude(ref1);
      expect(result1.included).toBe(false);

      const ref2 = { url: 'https://example.com/doc.PDF', type: 'other' };
      const result2 = filter.shouldInclude(ref2);
      expect(result2.included).toBe(false);
    });

    it('should add dot prefix if missing', () => {
      const filter = new ResourceFilter({
        skipExtensions: ['zip', 'pdf'],
      });

      const ref1 = { url: 'https://example.com/archive.zip', type: 'other' };
      const result1 = filter.shouldInclude(ref1);
      expect(result1.included).toBe(false);
    });
  });

  describe('stats management', () => {
    it('should reset stats', () => {
      const filter = new ResourceFilter();
      const refs: AssetRef[] = [
        { url: 'https://example.com/style.css', type: 'css', origin: 'html' },
      ];

      filter.filter(refs);
      let stats = filter.getStats();
      expect(stats.total).toBe(1);

      filter.resetStats();
      stats = filter.getStats();
      expect(stats.total).toBe(0);
      expect(stats.included).toBe(0);
      expect(stats.filtered).toBe(0);
    });

    it('should not modify returned stats', () => {
      const filter = new ResourceFilter();
      const refs: AssetRef[] = [
        { url: 'https://example.com/style.css', type: 'css', origin: 'html' },
      ];

      filter.filter(refs);
      const stats1 = filter.getStats();
      stats1.included = 999;

      const stats2 = filter.getStats();
      expect(stats2.included).toBe(1);
    });
  });

  describe('blacklist patterns', () => {
    it('should exclude common tracking services', () => {
      const filter = new ResourceFilter();
      const trackingUrls = [
        'https://google-analytics.com/ga.js',
        'https://googletagmanager.com/gtag/js',
        'https://doubleclick.net/instream/ad_status.js',
        'https://hotjar.com/static/surveys/survey-js.js',
        'https://clarity.ms/tag/abc123',
      ];

      for (const url of trackingUrls) {
        const result = filter.shouldInclude({ url, type: 'js' });
        expect(result.included).toBe(false);
      }
    });

    it('should handle case-insensitive matches', () => {
      const filter = new ResourceFilter();
      const ref1 = { url: 'https://GOOGLE-ANALYTICS.COM/ga.js', type: 'js' };
      const result1 = filter.shouldInclude(ref1);
      expect(result1.included).toBe(false);

      const ref2 = { url: 'https://example.com/GOOGLE-ANALYTICS.COM/ga.js', type: 'js' };
      const result2 = filter.shouldInclude(ref2);
      expect(result2.included).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid URLs gracefully', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'not-a-valid-url', type: 'other' };
      const result = filter.shouldInclude(ref);
      // Should return true since we can't extract extension
      expect(result.included).toBe(true);
    });

    it('should handle URLs without extensions', () => {
      const filter = new ResourceFilter();
      const ref = { url: 'https://example.com/api/data', type: 'other' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(true);
    });

    it('should handle empty skip extensions', () => {
      const filter = new ResourceFilter({
        skipExtensions: [],
      });
      const ref = { url: 'https://example.com/archive.zip', type: 'other' };
      const result = filter.shouldInclude(ref);
      expect(result.included).toBe(true);
    });
  });
});
