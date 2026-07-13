/**
 * web-clone library entry
 *
 * Provides two main APIs:
 * 1. snapshot() - web page snapshot with HTTP fetcher
 * 2. snapshot() with custom FetcherAdapter - advanced usage with Playwright/Puppeteer
 *
 * For Playwright integration, use loadPlaywrightAdapter():
 *   import { snapshot } from 'web-clone';
 *   import { loadPlaywrightAdapter } from 'web-clone/adapters';
 *
 *   const browser = await chromium.launch();
 *   const context = await browser.newContext();
 *   const page = await context.newPage();
 *
 *   // Your authentication logic here
 *   const PlaywrightAdapter = await loadPlaywrightAdapter();
 *   const adapter = new PlaywrightAdapter(page, context);
 *   const result = await snapshot({ url, output, mode: 'bundle' }, adapter);
 */

// Core Snapshot API
export {
  snapshot,
  convertLocalSnapshot,
} from './assembler.js';

// Core type
export type {
  SnapshotOptions,
  SnapshotResult,
  SnapshotMode,
  AssetType,
  AssetStatus,
  Asset,
  AssetRef,
  ComponentSpec,
  ComponentManifest,
  StateVariable,
  EventBinding,
  MethodSpec,
  MigrationTodo,
  ConvertResult,
  FrameworkCodeGenOptions,
  GeneratedComponent,
  GeneratedFramework,
} from './types.js';

// Resource filtering exports
export {
  ResourceFilter,
  resolveSkipExtensions,
  resolveGroupOverrides,
  RESOURCE_PRESETS,
  EXTENSION_GROUPS,
} from './core/resource-filter.js';
export type { ResourceFilterOptions, FilterStats } from './core/resource-filter.js';

// Adapter interfaces and implementations
export { HttpFetcherAdapter } from './adapters/index.js';
export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './adapters/index.js';

// Optional tool function export
export { parseHtml } from './parser/html-parser.js';

// Validation & cleanup tools
export {
  validateSnapshot,
  cleanSnapshot,
  formatValidationReport,
  formatCleanResult,
} from './validation/asset-validator.js';
export type { ValidationReport, ValidationIssue, ValidationSeverity, CleanOptions, CleanResult } from './validation/asset-validator.js';

// Config exports (used by CLI)
export { DEFAULTS } from './config/defaults.js';
export {
  safeInt,
  parseBool,
  parseCodegenFramework,
  parseFrameworkHint,
  parseResourcePreset,
  parseFileSize,
  validateOptions,
} from './config/normalize.js';
export { loadMergedConfig } from './config/load-config.js';
export type { WebCloneConfigFile, MergedConfig } from './config/load-config.js';
export type {
  FrameworkHint,
  CodegenFramework,
  ResourcePreset,
  MemoryBudget,
  HtmlStrategy,
  CssStrategy,
  JsStrategy,
} from './config/schema.js';