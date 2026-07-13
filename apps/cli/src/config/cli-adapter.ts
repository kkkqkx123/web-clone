import { DEFAULTS } from '@web-clone/core';
import { safeInt, parseBool, parseCodegenFramework, parseFrameworkHint, parseResourcePreset, parseFileSize, validateOptions, resolveGroupOverrides } from '@web-clone/core';
import type { SnapshotOptions } from '@web-clone/core';

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
  convertLocal?: string;
  strictStatusCodes?: boolean;
}

/**
 * Transform Commander raw opts → validated SnapshotOptions.
 */
export function fromCommander(cmd: CommanderOpts, url: string): SnapshotOptions {
  const isLocal = !!cmd.convertLocal;
  const localPath = cmd.convertLocal as string | undefined;

  const outputPath = isLocal && cmd.output === DEFAULTS.output
    ? (localPath ?? DEFAULTS.output)
    : cmd.output;

  const opts: SnapshotOptions = {
    url: isLocal ? (localPath ?? '') : (url ?? ''),
    output: outputPath || DEFAULTS.output,
    mode: (cmd.mode === 'single' ? 'single' : 'bundle'),
    maxAssets: envFallback('MAX_ASSETS', safeInt(cmd.maxAssets, DEFAULTS.maxAssets)),
    concurrency: envFallback('CONCURRENCY', safeInt(cmd.concurrency, DEFAULTS.concurrency)),
    timeout: safeInt(cmd.timeout, DEFAULTS.timeout),
    retryCount: safeInt(cmd.retryCount, DEFAULTS.retryCount),
    retryInitialDelay: cmd.retryInitialDelay !== undefined ? safeInt(cmd.retryInitialDelay, DEFAULTS.retryInitialDelay) : DEFAULTS.retryInitialDelay,
    retryMaxDelay: cmd.retryMaxDelay !== undefined ? safeInt(cmd.retryMaxDelay, DEFAULTS.retryMaxDelay) : DEFAULTS.retryMaxDelay,
    inline: cmd.inline !== false,
    pretty: cmd.pretty || false,
    extractComponents: isLocal ? true : (cmd.extractComponents || false),
    memoryLimit: safeInt(cmd.memoryLimit, DEFAULTS.memoryLimit),
    convertLocal: cmd.convertLocal || undefined,
    strictStatusCodes: cmd.strictStatusCodes || false,
  };

  // Component extraction sub-options
  if (opts.extractComponents) {
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
    // If --skip-types is explicitly provided, use it as-is (backward compatible)
    if (cmd.skipTypes !== undefined) {
      opts.skipExtensions = cmd.skipTypes
        ? cmd.skipTypes.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    } else {
      // Use preset-based resolution
      const preset = parseResourcePreset(cmd.resourcePreset) ?? DEFAULTS.resourcePreset;
      opts.resourcePreset = preset;

      // Collect include/exclude group overrides from --include-* / --exclude-* flags
      const includes: string[] = [];
      const excludes: string[] = [];

      if (cmd.includeAll) {
        opts.resourcePreset = 'none';
      } else {
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

    opts.maxFileSize = cmd.maxFileSize !== undefined
      ? parseFileSize(cmd.maxFileSize)
      : undefined;

    // Recursive scan options
    if (cmd.scanDepth !== undefined) {
      opts.scanDepth = safeInt(cmd.scanDepth, DEFAULTS.scanDepth);
    }
    if (cmd.scanJs !== undefined) {
      opts.scanJs = cmd.scanJs;
    }
    if (cmd.scanJson !== undefined) {
      opts.scanJson = cmd.scanJson;
    }
  }

  validateOptions(opts);
  return opts;
}
