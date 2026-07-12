import { extname } from 'node:path';
import type { AssetRef } from '../types.js';

export interface ResourceFilterOptions {
  skipExtensions?: string[];
  maxFileSize?: number;
  customFilter?: (url: string) => boolean;
  enableDefaultBlacklist?: boolean;
}

export interface FilterStats {
  total: number;
  included: number;
  filtered: number;
  filterReasons: Record<string, number>;
}

/**
 * Default blacklist of domains/services to skip
 * These are analytics, tracking, and ad networks
 */
const DEFAULT_BLACKLIST_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /facebook\.com\/tr/i,
  /doubleclick\.net/i,
  /hotjar\.com/i,
  /clarity\.ms/i,
  /amplitude\.com/i,
  /mixpanel\.com/i,
  /segment\.com/i,
  /intercom\.io/i,
  /zendesk\.com/i,
  /stripe\.com\/v/i,  // Stripe analytics/tracking
  /google\.com\/analytics/i,
  /metrics\.cloudflare\.com/i,
  /cdn\.segment\.com/i,
];

/**
 * Default skip extensions
 */
const DEFAULT_SKIP_EXTENSIONS: string[] = [
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
  // Installers
  '.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Media
  '.ts', '.m3u8', '.m4v', '.mkv', '.avi', '.mov', '.flv',
  '.mp3', '.aac', '.flac', '.ogg', '.wma', '.wav',
  '.mp4', '.webm',
  // Other binaries
  '.iso', '.torrent', '.wasm', '.bin',
];

/**
 * Centralized resource filtering logic
 * Supports multiple filtering strategies:
 * 1. Custom filter (highest priority)
 * 2. Default blacklist (domains/services to skip)
 * 3. Extension-based filtering
 * 4. File size limiting
 */
export class ResourceFilter {
  private customFilter?: (url: string) => boolean;
  private skipExtensions: Set<string>;
  private blacklistPatterns: RegExp[];
  private stats: FilterStats = {
    total: 0,
    included: 0,
    filtered: 0,
    filterReasons: {},
  };

  constructor(options: ResourceFilterOptions = {}) {
    this.customFilter = options.customFilter;
    this.skipExtensions = this.normalizeExtensions(
      options.skipExtensions || DEFAULT_SKIP_EXTENSIONS
    );
    this.blacklistPatterns = options.enableDefaultBlacklist !== false
      ? DEFAULT_BLACKLIST_PATTERNS
      : [];
  }

  /**
   * Check if a resource should be included
   */
  shouldInclude(ref: AssetRef | { url: string; type?: string; size?: number }): { included: boolean; reason?: string } {
    const url = ref.url;

    // 1. Custom filter (highest priority)
    if (this.customFilter && !this.customFilter(url)) {
      return { included: false, reason: 'Custom filter excluded' };
    }

    // 2. Default blacklist (for tracking/analytics)
    if (this.blacklistPatterns.some(pattern => pattern.test(url))) {
      return { included: false, reason: 'Blacklist match' };
    }

    // 3. Extension-based filtering
    const ext = this.getExtension(url);
    if (ext && this.skipExtensions.has(ext)) {
      return { included: false, reason: `Extension filtered: ${ext}` };
    }

    return { included: true };
  }

  /**
   * Filter multiple resources
   */
  filter(refs: AssetRef[]): AssetRef[] {
    this.stats = {
      total: refs.length,
      included: 0,
      filtered: 0,
      filterReasons: {},
    };

    return refs.filter(ref => {
      const result = this.shouldInclude(ref);
      if (result.included) {
        this.stats.included++;
      } else {
        this.stats.filtered++;
        const reason = result.reason || 'Unknown';
        this.stats.filterReasons[reason] = (this.stats.filterReasons[reason] || 0) + 1;
      }
      return result.included;
    });
  }

  /**
   * Get filter statistics
   */
  getStats(): FilterStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      included: 0,
      filtered: 0,
      filterReasons: {},
    };
  }

  /**
   * Helper: normalize extensions to lowercase with dot prefix
   */
  private normalizeExtensions(exts: string[]): Set<string> {
    return new Set(
      exts.map(ext => {
        const normalized = ext.startsWith('.') ? ext : '.' + ext;
        return normalized.toLowerCase();
      })
    );
  }

  /**
   * Helper: extract file extension from URL
   */
  private getExtension(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const ext = extname(pathname).toLowerCase();
      return ext.length > 0 ? ext : null;
    } catch {
      return null;
    }
  }
}
