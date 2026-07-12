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
 * - Playwright browser automation
 */
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
  skipExtensions?: string[];
  maxFileSize?: number;
  memoryLimit?: number;
  convertLocal?: string;
  strictStatusCodes?: boolean; // When true, require 2xx for all asset types (default: false for lenient acceptance)

  // Playwright browser automation (Phase 0)
  usePlaywright?: boolean;
  headless?: boolean;
  proxy?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  authScript?: string; // Path to authentication script file
  authTimeout?: number;
  saveState?: string; // Path to save browser state
  loadState?: string; // Path to load browser state
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
