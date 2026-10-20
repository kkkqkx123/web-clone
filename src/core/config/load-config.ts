import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { ResourcePreset } from '../resource-filter.js';
import type { SnapshotOptions } from './schema.js';
import { DEFAULTS } from './defaults.js';

// ──────────────────────────────────────────────────────────────
// Config file interface
// ──────────────────────────────────────────────────────────────

export interface WebCloneConfigFile {
  $schema?: string;

  /** Preset selection. */
  resourcePreset?: ResourcePreset;

  /** Extension overrides (takes priority over resourcePreset). */
  skipExtensions?: string[];

  /** Extensions to forcibly include. */
  includeExtensions?: string[];

  /** Extensions to forcibly exclude. */
  excludeExtensions?: string[];

  /** Per-category toggles (convenience overrides). */
  include?: {
    wasm?: boolean;
    bin?: boolean;
    video?: boolean;
    audio?: boolean;
    fonts?: boolean;
    documents?: boolean;
    archives?: boolean;
  };

  /** Browser adapter configuration. */
  browser?: {
    /** Adapter type: 'playwright' | 'puppeteer' */
    adapter?: string;
    /** Whether to use headless mode */
    headless?: boolean;
    /** User-Agent string */
    userAgent?: string;
    /** Viewport size, e.g. "1920x1080" */
    viewport?: string;
    /** Browser locale, e.g. "zh-CN" */
    locale?: string;
    /** Extra Chromium launch arguments */
    launchArgs?: string[];
    /** Page load wait state */
    waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
    /** Whether to enable hybrid mode */
    hybrid?: boolean;
  };

  /** Component extraction configuration. */
  extraction?: {
    enabled?: boolean;
    depth?: number;
    framework?: string;
    filter?: string;
    extractLogic?: boolean;
    memoryLimit?: number;
  };

  /** Code generation configuration. */
  codegen?: {
    framework?: string;
    typescript?: boolean;
    cssModules?: boolean;
    generateDrafts?: boolean;
    extractShared?: boolean;
  };

  /** Server mode configuration. */
  server?: {
    enabled?: boolean;
    port?: number;
    proxy?: boolean;
  };

  /** Global defaults (overridable by CLI). */
  defaults?: Partial<SnapshotOptions> & {
    /** Browser adapter type (not in SnapshotOptions) */
    adapter?: string;
    headless?: boolean;
    userAgent?: string;
    viewport?: string;
    locale?: string;
    launchArgs?: string[];
    hybrid?: boolean;
    serve?: boolean;
    servePort?: number;
    run?: boolean;
    proxy?: boolean;
    convertLocal?: string;
  };
}

// ──────────────────────────────────────────────────────────────
// Config file search
// ──────────────────────────────────────────────────────────────

const CONFIG_FILE_NAMES = [
  'web-clone.config.json',
  '.web-clonerc',
  '.web-clonerc.json',
];

/**
 * Search for a config file in the given directory and its ancestors.
 */
function searchConfigFile(startDir: string): { path: string; config: WebCloneConfigFile } | null {
  let current = resolve(startDir);
  for (let i = 0; i < 20; i++) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(current, name);
      if (existsSync(candidate)) {
        try {
          const raw = readFileSync(candidate, 'utf8');
          const config = JSON.parse(raw) as WebCloneConfigFile;
          return { path: candidate, config };
        } catch {
          // Malformed config — skip silently
          continue;
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }
  return null;
}

/**
 * Load the global user config (~/.config/web-clone/config.json).
 */
function loadGlobalConfig(): WebCloneConfigFile | null {
  try {
    const configDir = join(homedir(), '.config', 'web-clone');
    const configPath = join(configDir, 'config.json');
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8');
      return JSON.parse(raw) as WebCloneConfigFile;
    }
  } catch {
    // Silently ignore
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Merge helper
// ──────────────────────────────────────────────────────────────

export interface MergedConfig {
  /** The resource preset to use (from config or default). */
  resourcePreset: ResourcePreset;
  /** Extensions to include (unconditionally). */
  includeExtensions: string[];
  /** Extensions to exclude (unconditionally). */
  excludeExtensions: string[];
  /** Other SnapshotOptions overrides from config defaults. */
  optionOverrides: Partial<SnapshotOptions>;
  /** Browser adapter configuration (merged from global → project config). */
  browserConfig?: MergedBrowserConfig;
}

/** Merged browser adapter configuration from config files. */
export interface MergedBrowserConfig {
  adapter?: string;
  headless?: boolean;
  userAgent?: string;
  viewport?: string;
  locale?: string;
  launchArgs?: string[];
  hybrid?: boolean;
  waitForLoadState?: string;
}

/**
 * Load a config file from an explicit path.
 * Returns null if the file doesn't exist or contains invalid JSON.
 */
export function loadConfigFile(configPath: string): WebCloneConfigFile | null {
  const resolved = resolve(configPath);
  if (!existsSync(resolved)) {
    return null;
  }
  try {
    const raw = readFileSync(resolved, 'utf8');
    return JSON.parse(raw) as WebCloneConfigFile;
  } catch {
    return null;
  }
}

/**
 * Load and merge config files from:
 * 1. User-global config (~/.config/web-clone/config.json)
 * 2. Explicit --config file (if provided, replaces auto-discovered project config)
 * 3. Project-level config (nearest ancestor with config file, skipped if --config given)
 *
 * Returns a MergedConfig object with the combined settings.
 */
export function loadMergedConfig(projectDir?: string, configFile?: string): MergedConfig {
  const global = loadGlobalConfig();

  // Explicit --config file takes precedence over auto-discovery
  let explicitConfig: { path: string; config: WebCloneConfigFile } | null = null;
  if (configFile) {
    const config = loadConfigFile(configFile);
    if (config) {
      explicitConfig = { path: resolve(configFile), config };
    }
  }

  const project = explicitConfig ?? (projectDir ? searchConfigFile(projectDir) : searchConfigFile(process.cwd()));

  const layers: WebCloneConfigFile[] = [];
  if (global) layers.push(global);
  if (project) layers.push(project.config);

  // Merge resource-preset overrides
  const includeExts: string[] = [];
  const excludeExts: string[] = [];
  let preset: ResourcePreset = 'default';

  for (const layer of layers) {
    if (layer.resourcePreset) preset = layer.resourcePreset;
    if (layer.includeExtensions) includeExts.push(...layer.includeExtensions);
    if (layer.excludeExtensions) excludeExts.push(...layer.excludeExtensions);

    if (layer.include) {
      if (layer.include.archives) includeExts.push(...['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']);
      if (layer.include.documents) includeExts.push(...['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);
      if (layer.include.wasm) includeExts.push('.wasm');
      if (layer.include.bin) includeExts.push('.bin');
      if (layer.include.video) includeExts.push(...['.mp4', '.webm', '.m3u8', '.ts', '.m4v', '.mkv', '.avi', '.mov', '.flv']);
      if (layer.include.audio) includeExts.push(...['.mp3', '.aac', '.flac', '.ogg', '.wma', '.wav']);
      if (layer.include.fonts) includeExts.push(...['.woff', '.woff2', '.ttf', '.otf']);
    }
  }

  // Merge option overrides (global → project, so project wins)
  const optionOverrides: Partial<SnapshotOptions> = {};
  for (const layer of layers) {
    if (layer.defaults) {
      Object.assign(optionOverrides, layer.defaults);
    }
  }

  // Merge browser config (global → project, so project wins)
  const browserConfig: Record<string, unknown> = {};
  for (const layer of layers) {
    if (layer.browser) {
      Object.assign(browserConfig, layer.browser);
    }
  }

  return {
    resourcePreset: preset,
    includeExtensions: [...new Set(includeExts)],
    excludeExtensions: [...new Set(excludeExts)],
    optionOverrides,
    browserConfig: Object.keys(browserConfig).length > 0 ? browserConfig as MergedBrowserConfig : undefined,
  };
}
