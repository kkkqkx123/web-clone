/**
 * web-clone library entry
 * 
 * Provides three main APIs:
 * 1. snapshot() - basic snapshot (HTTP direct pull)
 * 2. snapshotWithPlaywright() - Playwright snapshots (supports authentication)
 * 3. snapshotWithBrowserContext() - fine-grained control (manage your own browser)
 * 
 * also provides convertLocalSnapshot() for local conversion
 */

// Core Snapshot API
export {
  snapshot,
  snapshotWithPlaywright,
  snapshotWithBrowserContext,
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

// Playwright-related exports (advanced features)
export { PlaywrightFetcherAdapter } from './adapters/index.js';
export type { PlaywrightAdapterOptions } from './adapters/index.js';

// Optional tool function export
export { parseHtml } from './parser/html-parser.js';
