import { DEFAULTS } from './defaults.js';
import { safeInt, parseBool, parseCodegenFramework, parseFrameworkHint, parseFileSize, validateOptions } from './normalize.js';
import type { SnapshotOptions } from './schema.js';

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
  skipTypes?: string;
  maxFileSize?: string;
  convertLocal?: string;
  strictStatusCodes?: boolean; // Require 2xx status for all assets (default: false)
  // Playwright options (Phase 0)
  usePlaywright?: boolean;
  headless?: string;
  proxy?: string;
  authScript?: string;
  authTimeout?: string;
  saveState?: string;
  loadState?: string;
  userAgent?: string;
  viewport?: string;
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
    strictStatusCodes: cmd.strictStatusCodes || false, // Default: lenient acceptance (false = allow 4xx/5xx for CSS/JS)
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
    if (cmd.skipTypes !== undefined) {
      opts.skipExtensions = cmd.skipTypes
        ? cmd.skipTypes.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    }
    opts.maxFileSize = cmd.maxFileSize !== undefined
      ? parseFileSize(cmd.maxFileSize)
      : undefined;
  }

  // Playwright options (Phase 0)
  opts.usePlaywright = cmd.usePlaywright || false;
  opts.headless = cmd.headless !== 'false';
  opts.proxy = cmd.proxy;
  opts.authScript = cmd.authScript;
  opts.authTimeout = cmd.authTimeout ? safeInt(cmd.authTimeout, 30000) : 30000;
  opts.saveState = cmd.saveState;
  opts.loadState = cmd.loadState;
  opts.userAgent = cmd.userAgent;

  // Parse viewport if provided
  if (cmd.viewport) {
    const [w, h] = cmd.viewport.split('x').map(Number);
    if (w && h && w > 0 && h > 0) {
      opts.viewport = { width: w, height: h };
    }
  }

  validateOptions(opts);
  return opts;
}

