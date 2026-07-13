export type SnapshotMode = 'single' | 'bundle';
export type FrameworkHint = 'vue' | 'react' | 'svelte';
export type CodegenFramework = 'vue' | 'react' | 'angular' | 'svelte' | 'jquery';

export interface FrameworkCodeGenOptions {
  framework?: CodegenFramework;
  typescript?: boolean;
  cssModules?: boolean;
  generateDrafts?: boolean;
  extractSharedLogic?: boolean;
}

/**
 * Unified config for all operations:
 * - Snapshot (fetch + bundle/single)
 * - Component extraction
 * - Framework code generation
 * - Local conversion
 */
export type ResourcePreset = 'none' | 'minimal' | 'default' | 'no-media' | 'aggressive';

export interface SnapshotOptions {
  url: string;
  output: string;
  mode: SnapshotMode;
  maxAssets: number;
  concurrency: number;
  timeout: number;
  retryCount: number;
  retryInitialDelay?: number;
  retryMaxDelay?: number;
  inline: boolean;
  pretty: boolean;
  extractComponents?: boolean;
  componentDepth?: number;
  frameworkHint?: FrameworkHint;
  extractLogic?: boolean;
  frameworkCodegen?: FrameworkCodeGenOptions;
  /** Named resource preset. Ignored when skipExtensions is explicitly set. */
  resourcePreset?: ResourcePreset;
  /** Explicit extension list (takes priority over resourcePreset). */
  skipExtensions?: string[];
  /** Extensions to forcibly include (removed from skip list). */
  includeExtensions?: string[];
  /** Extensions to forcibly exclude (added to skip list). */
  excludeExtensions?: string[];
  maxFileSize?: number;
  memoryLimit?: number;
  convertLocal?: string;
  strictStatusCodes?: boolean;
  /** Recursive resource scan depth (1 = current behavior; 2+ enables deeper discovery). */
  scanDepth?: number;
  /** Whether to scan JS files for embedded URLs during recursive discovery. */
  scanJs?: boolean;
  /** Whether to scan JSON files for media URLs during recursive discovery. */
  scanJson?: boolean;
  /** Hybrid mode: use browser adapter for HTML rendering, HTTP pool for asset downloads. */
  hybrid?: boolean;
}

/**
 * Memory budget & degradation strategy.
 * Three layers: quick preview → runtime monitoring → pipeline downgrade.
 */
export type HtmlStrategy = 'full' | 'streaming' | 'skip';
export type CssStrategy = 'full' | 'head' | 'skip';
export type JsStrategy = 'full' | 'head' | 'skip';

export interface MemoryBudget {
  htmlParseBudget: number;
  cssParseBudget: number;
  jsParseBudget: number;
  htmlStrategy: HtmlStrategy;
  cssStrategy: CssStrategy;
  jsStrategy: JsStrategy;
}
