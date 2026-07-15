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
}

export const MAX_INLINE_SIZE = 10 * 1024 * 1024;
