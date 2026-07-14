import { DEFAULTS, loadMergedConfig } from '@web-clone/core';
import { safeInt, parseBool, parseCodegenFramework, parseFrameworkHint, parseResourcePreset, parseFileSize, validateOptions, resolveGroupOverrides } from '@web-clone/core';
import type { SnapshotOptions, MergedConfig } from '@web-clone/core';

/**
 * Fallback to environment variable if the CLI value is still the default.
 * This helps users on Windows where npm's `--` separator may not pass
 * quoted arguments to the script correctly.
 */
function envFallback(name: string, cliValue: number): number {
  const envVal = process.env[name];
  if (envVal !== undefined) {
    const n = parseInt(envVal, 10);
    if (Number.isFinite(n)) return n;
  }
  return cliValue;
}

/** Raw key-value pairs produced by Commander (all strings). */
export interface CommanderOpts {
  output: string;
  mode: string;
  maxAssets: string;
  concurrency: string;
  timeout: string;
  retryCount: string;
  retryInitialDelay?: string;
  retryMaxDelay?: string;
  inline: boolean;
  pretty: boolean;
  extractComponents: boolean;
  componentFilter?: string;
  componentDepth?: string;
  framework?: string;
  extractLogic: string;
  memoryLimit: string;
  codegenFramework?: string;
  codegenTypescript: string;
  codegenCssModules: string;
  codegenGenerateDrafts: string;
  codegenExtractShared: string;
  resourcePreset?: string;
  skipTypes?: string;
  includeWasm?: boolean;
  includeBin?: boolean;
  includeVideo?: boolean;
  includeMedia?: boolean;
  includeFonts?: boolean;
  includeAll?: boolean;
  excludeImages?: boolean;
  excludeCss?: boolean;
  excludeJs?: boolean;
  maxFileSize?: string;
  scanDepth?: string;
  scanJs?: boolean;
  scanJson?: boolean;
  hybrid?: boolean;
  convertLocal?: string;
  strictStatusCodes?: boolean;
  /** Browser automation adapter: 'playwright' | 'puppeteer' | undefined */
  adapter?: string;
  /** Start a local HTTP server after snapshot */
  serve?: boolean;
  /** Port for the HTTP server */
  servePort?: string;
  /** Actually start the server (only valid with --serve) */
  run?: boolean;
  /** Enable reverse proxy for runtime API requests in --serve mode */
  proxy?: boolean;
}

/**
 * Transform Commander raw opts → validated SnapshotOptions.
 *
 * Merge order (lowest → highest priority):
 *   1. Built-in DEFAULTS (hardcoded fallbacks)
 *   2. Merged config (global ~/.config/web-clone/config.json → project-level config)
 *   3. CLI flags (Commander opts)
 *   4. CLI --include-* / --exclude-* overrides (applied last)
 */
export function fromCommander(cmd: CommanderOpts, url: string): SnapshotOptions {
  const isLocal = !!cmd.convertLocal;
  const localPath = cmd.convertLocal as string | undefined;

  // ── Step 1: Load config file hierarchy ──────────────────────
  const mergedConfig: MergedConfig = loadMergedConfig();

  const outputPath = isLocal && cmd.output === DEFAULTS.output
    ? (localPath ?? DEFAULTS.output)
    : cmd.output;

  // ── Step 2: Build opts — config defaults as base, CLI overrides on top ──
  const opts: SnapshotOptions = {
    // Config file option overrides (lowest priority after DEFAULTS)
    ...mergedConfig.optionOverrides as Record<string, unknown>,

    // Explicit CLI / DEFAULTS values (override config defaults)
    url: isLocal ? (localPath ?? '') : (url ?? ''),
    output: outputPath || mergedConfig.optionOverrides.output || DEFAULTS.output,
    mode: (cmd.mode === 'single' ? 'single' : 'bundle'),
    maxAssets: envFallback('MAX_ASSETS', safeInt(cmd.maxAssets, mergedConfig.optionOverrides.maxAssets ?? DEFAULTS.maxAssets)),
    concurrency: envFallback('CONCURRENCY', safeInt(cmd.concurrency, mergedConfig.optionOverrides.concurrency ?? DEFAULTS.concurrency)),
    timeout: safeInt(cmd.timeout, mergedConfig.optionOverrides.timeout ?? DEFAULTS.timeout),
    retryCount: safeInt(cmd.retryCount, mergedConfig.optionOverrides.retryCount ?? DEFAULTS.retryCount),
    retryInitialDelay: cmd.retryInitialDelay !== undefined ? safeInt(cmd.retryInitialDelay, mergedConfig.optionOverrides.retryInitialDelay ?? DEFAULTS.retryInitialDelay) : (mergedConfig.optionOverrides.retryInitialDelay ?? DEFAULTS.retryInitialDelay),
    retryMaxDelay: cmd.retryMaxDelay !== undefined ? safeInt(cmd.retryMaxDelay, mergedConfig.optionOverrides.retryMaxDelay ?? DEFAULTS.retryMaxDelay) : (mergedConfig.optionOverrides.retryMaxDelay ?? DEFAULTS.retryMaxDelay),
    inline: cmd.inline !== false,
    pretty: cmd.pretty || false,
    extractComponents: isLocal ? true : (cmd.extractComponents || false),
    memoryLimit: safeInt(cmd.memoryLimit, mergedConfig.optionOverrides.memoryLimit ?? DEFAULTS.memoryLimit),
    convertLocal: cmd.convertLocal || undefined,
    strictStatusCodes: cmd.strictStatusCodes || false,
  };

  // Apply config's maxFileSize if CLI didn't specify one
  if (cmd.maxFileSize === undefined && mergedConfig.optionOverrides.maxFileSize !== undefined) {
    opts.maxFileSize = mergedConfig.optionOverrides.maxFileSize;
  } else if (cmd.maxFileSize !== undefined) {
    opts.maxFileSize = parseFileSize(cmd.maxFileSize);
  }

  // Component extraction sub-options
  if (opts.extractComponents) {
    opts.componentFilter = cmd.componentFilter || undefined;
    opts.componentDepth = cmd.componentDepth ? safeInt(cmd.componentDepth, NaN) : undefined;
    opts.frameworkHint = parseFrameworkHint(cmd.framework);
    opts.extractLogic = parseBool(cmd.extractLogic, DEFAULTS.extractLogic);

    // Framework code generation
    const fw = parseCodegenFramework(cmd.codegenFramework);
    if (fw) {
      opts.frameworkCodegen = {
        framework: fw,
        typescript: parseBool(cmd.codegenTypescript, DEFAULTS.codegenTypescript),
        cssModules: parseBool(cmd.codegenCssModules, DEFAULTS.codegenCssModules),
        generateDrafts: parseBool(cmd.codegenGenerateDrafts, DEFAULTS.codegenGenerateDrafts),
        extractSharedLogic: parseBool(cmd.codegenExtractShared, DEFAULTS.codegenExtractShared),
      };
    }
  }

  // Resource filtering (fetch mode only)
  if (!isLocal) {
    // If --skip-types is explicitly provided, use it as-is (backward compatible, highest priority)
    if (cmd.skipTypes !== undefined) {
      opts.skipExtensions = cmd.skipTypes
        ? cmd.skipTypes.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    } else {
      // Use config preset as base, CLI --resource-preset overrides
      const preset = parseResourcePreset(cmd.resourcePreset) ?? mergedConfig.resourcePreset ?? DEFAULTS.resourcePreset;
      opts.resourcePreset = preset;

      // Collect include/exclude from BOTH config file and CLI flags
      const configIncludes = mergedConfig.includeExtensions.map(e => e.startsWith('.') ? e : '.' + e);
      const configExcludes = mergedConfig.excludeExtensions.map(e => e.startsWith('.') ? e : '.' + e);

      const includes: string[] = [];
      const excludes: string[] = [...configExcludes];

      if (cmd.includeAll) {
        opts.resourcePreset = 'none';
      } else {
        // Config file includes apply regardless
        for (const ext of configIncludes) {
          includes.push(ext);
        }
        // CLI --include-* flags
        if (cmd.includeWasm) includes.push('wasm');
        if (cmd.includeBin) includes.push('bin');
        if (cmd.includeVideo) includes.push('video');
        if (cmd.includeMedia) { includes.push('video', 'audio'); }
        if (cmd.includeFonts) includes.push('fonts');
        if (cmd.excludeImages) excludes.push('images');
        if (cmd.excludeCss) excludes.push('css');
        if (cmd.excludeJs) excludes.push('js');
      }

      if (includes.length > 0 || excludes.length > 0) {
        const resolved = resolveGroupOverrides(includes, excludes);
        opts.includeExtensions = resolved.includeExtensions;
        opts.excludeExtensions = resolved.excludeExtensions;
      }
    }

    // Recursive scan options (config defaults as base, CLI overrides)
    if (cmd.scanDepth !== undefined) {
      opts.scanDepth = safeInt(cmd.scanDepth, DEFAULTS.scanDepth);
    } else if (mergedConfig.optionOverrides.scanDepth !== undefined) {
      opts.scanDepth = mergedConfig.optionOverrides.scanDepth;
    } else {
      opts.scanDepth = DEFAULTS.scanDepth; // Ensure default is applied
    }
    if (cmd.scanJs !== undefined) {
      opts.scanJs = cmd.scanJs;
    } else if (mergedConfig.optionOverrides.scanJs !== undefined) {
      opts.scanJs = mergedConfig.optionOverrides.scanJs;
    }
    if (cmd.scanJson !== undefined) {
      opts.scanJson = cmd.scanJson;
    } else if (mergedConfig.optionOverrides.scanJson !== undefined) {
      opts.scanJson = mergedConfig.optionOverrides.scanJson;
    }

    // Hybrid mode flag
    if (cmd.hybrid !== undefined) {
      opts.hybrid = cmd.hybrid;
    }
  }

  // ── Step 3: Validate ────────────────────────────────────────
  validateOptions(opts);
  return opts;
}
