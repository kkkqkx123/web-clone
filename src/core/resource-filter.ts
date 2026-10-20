import { extname } from 'node:path';
import type { AssetRef } from './types.js';

// ──────────────────────────────────────────────────────────────
// Resource presets
// ──────────────────────────────────────────────────────────────

export type ResourcePreset = 'none' | 'minimal' | 'default' | 'no-media' | 'aggressive';

export const RESOURCE_PRESETS: Record<ResourcePreset, {
  description: string;
  skipExtensions: string[];
}> = {
  none: {
    description: 'No filtering applied',
    skipExtensions: [],
  },
  minimal: {
    description: 'Skip only archives',
    skipExtensions: [
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
    ],
  },
  default: {
    description: 'Skip archives, installers, and documents (safe for typical sites)',
    skipExtensions: [
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
      '.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    ],
  },
  'no-media': {
    description: 'Skip all media files (fast, text-focused)',
    skipExtensions: [
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
      '.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.mp4', '.webm', '.m3u8', '.ts',
      '.m4v', '.mkv', '.avi', '.mov', '.flv',
      '.mp3', '.aac', '.flac', '.ogg', '.wma', '.wav',
    ],
  },
  aggressive: {
    description: 'Download only critical web assets',
    skipExtensions: [
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
      '.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.mp4', '.webm', '.m3u8', '.ts',
      '.m4v', '.mkv', '.avi', '.mov', '.flv',
      '.mp3', '.aac', '.flac', '.ogg', '.wma', '.wav',
      '.wasm', '.bin',
      '.iso', '.torrent',
      '.otf', '.ttf', '.woff', '.woff2',
    ],
  },
};

/**
 * Convenience groups for --include-* / --exclude-* overrides.
 */
export const EXTENSION_GROUPS: Record<string, string[]> = {
  wasm:  ['.wasm'],
  bin:   ['.bin'],
  video: ['.mp4', '.webm', '.m3u8', '.ts', '.m4v', '.mkv', '.avi', '.mov', '.flv'],
  audio: ['.mp3', '.aac', '.flac', '.ogg', '.wma', '.wav', '.m4a'],
  fonts: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
  archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
  documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
  installers: ['.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm'],
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp'],
  css:   ['.css'],
  js:    ['.js', '.mjs', '.cjs'],
};

// ──────────────────────────────────────────────────────────────
// ResourceFilterOptions
// ──────────────────────────────────────────────────────────────

export interface ResourceFilterOptions {
  /** Explicit extension list (bypasses presets). */
  skipExtensions?: string[];
  /**
   * Named preset. Ignored when skipExtensions is explicitly set.
   * Default: 'default'.
   */
  resourcePreset?: ResourcePreset;
  /** Extensions to forcibly include (removed from skip list). */
  includeExtensions?: string[];
  /** Extensions to forcibly exclude (added to skip list). */
  excludeExtensions?: string[];
  /** Max file size in bytes. */
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
  /stripe\.com\/v/i,
  /google\.com\/analytics/i,
  /metrics\.cloudflare\.com/i,
  /cdn\.segment\.com/i,
];

/**
 * Resolve final skip-extension list from presets + overrides.
 */
export function resolveSkipExtensions(
  preset: ResourcePreset,
  includeExtensions: string[] = [],
  excludeExtensions: string[] = [],
): string[] {
  const base = [...RESOURCE_PRESETS[preset].skipExtensions];

  // Remove inclusions
  const includeSet = new Set(includeExtensions.map(normalizeExt));
  const filtered = base.filter(ext => !includeSet.has(ext));

  // Add exclusions
  const extra = excludeExtensions.map(normalizeExt);
  const result = [...filtered];
  for (const e of extra) {
    if (!result.includes(e)) result.push(e);
  }
  return result;
}

/**
 * Resolve extension-group names (e.g. "video", "wasm") to concrete extensions.
 */
export function resolveGroupOverrides(
  includes: string[],
  excludes: string[],
): { includeExtensions: string[]; excludeExtensions: string[] } {
  const flatten = (names: string[]): string[] => {
    const out: string[] = [];
    for (const n of names) {
      if (EXTENSION_GROUPS[n]) {
        out.push(...EXTENSION_GROUPS[n]);
      } else {
        out.push(normalizeExt(n));
      }
    }
    return out;
  };
  return {
    includeExtensions: flatten(includes),
    excludeExtensions: flatten(excludes),
  };
}

function normalizeExt(ext: string): string {
  const e = ext.startsWith('.') ? ext : '.' + ext;
  return e.toLowerCase();
}

// ──────────────────────────────────────────────────────────────
// ResourceFilter
// ──────────────────────────────────────────────────────────────

/**
 * Centralized resource filtering logic.
 *
 * Priority (highest → lowest):
 * 1. customFilter
 * 2. Domain blacklist (analytics/tracking)
 * 3. Extension-based filtering (preset + overrides / explicit skipExtensions)
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

    // Resolve extension list
    let exts: string[];
    if (options.skipExtensions !== undefined) {
      // Explicit list — highest priority, no preset/override mixing
      exts = options.skipExtensions;
    } else {
      const preset = options.resourcePreset ?? 'default';
      exts = resolveSkipExtensions(
        preset,
        options.includeExtensions,
        options.excludeExtensions,
      );
    }
    this.skipExtensions = this.normalizeExtensions(exts);

    this.blacklistPatterns = options.enableDefaultBlacklist !== false
      ? DEFAULT_BLACKLIST_PATTERNS
      : [];
  }

  /** Reconfigure the filter with new overrides (without creating a new instance). */
  applyOverrides(overrides: {
    includeExtensions?: string[];
    excludeExtensions?: string[];
    resourcePreset?: ResourcePreset;
    skipExtensions?: string[];
  }): void {
    let exts: string[];
    if (overrides.skipExtensions !== undefined) {
      exts = overrides.skipExtensions;
    } else {
      const preset = overrides.resourcePreset ?? 'default';
      exts = resolveSkipExtensions(
        preset,
        overrides.includeExtensions,
        overrides.excludeExtensions,
      );
    }
    this.skipExtensions = this.normalizeExtensions(exts);
    this.resetStats();
  }

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

  getStats(): FilterStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      total: 0,
      included: 0,
      filtered: 0,
      filterReasons: {},
    };
  }

  private normalizeExtensions(exts: string[]): Set<string> {
    return new Set(
      exts.map(ext => {
        const normalized = ext.startsWith('.') ? ext : '.' + ext;
        return normalized.toLowerCase();
      })
    );
  }

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
