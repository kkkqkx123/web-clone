export type {
  SnapshotMode,
  SnapshotOptions,
  FrameworkCodeGenOptions,
  CodegenFramework,
  FrameworkHint,
  MemoryBudget,
  HtmlStrategy,
  CssStrategy,
  JsStrategy,
} from './config/schema.js';

// Re-export shared types from @web-clone/types for backward compatibility.
import type {
  StateVariable,
  MethodSpec,
  EventBinding,
  MigrationTodo,
  ComponentManifest,
  ComponentSpec,
  GeneratedComponent,
  GeneratedFramework,
} from '@web-clone/types';

export type {
  StateVariable,
  MethodSpec,
  EventBinding,
  MigrationTodo,
  ComponentManifest,
  ComponentSpec,
  GeneratedComponent,
  GeneratedFramework,
};

export type AssetType = 'css' | 'js' | 'img' | 'font' | 'media' | 'other';
export type AssetStatus = 'pending' | 'fetched' | 'failed' | 'skipped';

/**
 * Severity level for issues collected during the snapshot pipeline.
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Category of an issue, used for grouping and filtering.
 */
export type IssueCategory =
  | 'html_fetch'
  | 'css_fetch'
  | 'asset_download'
  | 'asset_validation'
  | 'memory_budget'
  | 'component_analysis'
  | 'resource_filter'
  | 'framework_detection';

/**
 * A single issue discovered during the snapshot pipeline.
 * Errors indicate functional problems (missing resources),
 * warnings indicate degraded but accepted results,
 * info provides contextual notes.
 */
export interface SnapshotIssue {
  /** Severity level */
  severity: IssueSeverity;
  /** Category for grouping */
  category: IssueCategory;
  /** The resource URL or identifier that triggered this issue */
  source: string;
  /** Short human-readable description */
  message: string;
  /** Optional detailed explanation (HTTP status, exception message, etc.) */
  detail?: string;
  /** Suggested action for the user to resolve or review the issue */
  action?: string;
  /** ISO timestamp when the issue was recorded */
  timestamp?: string;
}

export interface ConvertResult extends SnapshotResult {
  components: Map<string, ComponentSpec>;
  componentTree?: Record<string, unknown>;
  index?: Record<string, unknown>;
}

export interface AssetRef {
  url: string;
  type: AssetType;
  origin: string;
  attribute?: string;
}

export interface Asset {
  originUrl: string;
  localPath?: string;
  dataUri?: string;
  textContent?: string;
  type: AssetType;
  status: AssetStatus;
  size: number;
  mime: string;
  error?: string;
  statusCode?: number; // Track HTTP status code for lenient acceptance logging
  acceptedWithWarning?: boolean; // Mark if 4xx/5xx but content was valid
}

import type { FrameworkDetection } from './framework/types.js';

export interface SnapshotResult {
  sourceUrl: string;
  timestamp: string;
  html: string;
  assets: Asset[];
  stats: {
    total: number;
    fetched: number;
    failed: number;
    skipped: number;
    validationWarnings: number;
    totalBytes: number;
    htmlBytes: number;
    stateful?: number;
    presentational?: number;
  };
  frameworkDetection?: FrameworkDetection;
  /** Browser-level framework detection from SPA hydration (Vue/React/Angular runtime signals) */
  browserFramework?: FrameworkDetection;
  /** Quality issues that may need user review (component match, validation warnings, memory budget, lenient acceptance) */
  issues: SnapshotIssue[];
  /** Fetch/debug log entries (network errors, filter stats, skipped downloads) */
  logs: SnapshotIssue[];
}

export const MAX_INLINE_SIZE = 10 * 1024 * 1024;
