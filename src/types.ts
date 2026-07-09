export type AssetType = 'css' | 'js' | 'img' | 'font' | 'media' | 'other';

export type AssetStatus = 'pending' | 'fetched' | 'failed' | 'skipped';

export type SnapshotMode = 'single' | 'bundle';

export interface FrameworkCodeGenOptions {
  framework?: 'vue' | 'react' | 'angular' | 'svelte' | 'jquery';
  typescript?: boolean;
  cssModules?: boolean;
  generateDrafts?: boolean;
  extractSharedLogic?: boolean;
}

export interface SnapshotOptions {
  url: string;
  output: string;
  mode: SnapshotMode;
  maxAssets: number;
  concurrency: number;
  timeout: number;
  retryCount: number;
  inline: boolean;
  pretty: boolean;
  // Component extraction (orthogonal to output mode)
  extractComponents?: boolean;
  componentDepth?: number;
  frameworkHint?: 'vue' | 'react' | 'svelte';
  extractLogic?: boolean;
  // Framework code generation
  frameworkCodegen?: FrameworkCodeGenOptions;
  // Resource filtering
  skipExtensions?: string[];
  maxFileSize?: number;
}

export interface StateVariable {
  name: string;
  type: string;
  initial?: any;
  bindings: string[];
  mutators: string[];
  confidence: number;
}

export interface MethodSpec {
  name: string;
  kind: 'handler' | 'lifecycle' | 'utility';
  code: string;
  parameters: string[];
  sideEffects: string[];
}

export interface EventBinding {
  selector: string;
  event: string;
  handler: string;
  preventDefault?: boolean;
}

export interface ComponentManifest {
  name: string;
  type: 'stateful' | 'presentational' | 'unknown';
  path: string;
  children: string[];
  state: Record<string, StateVariable>;
  events: Record<string, EventBinding>;
  migration: {
    effort: string;          // Estimated hours: "0.5h", "1h", "2h", "4h", "8h+"
    effortBreakdown: {       // NEW: detailed breakdown for transparency
      extraction: string;     // Time to verify extraction accuracy
      conversion: string;     // Time to convert extracted content
    };
    suggestions: string[];
    todos: MigrationTodo[];
  };
}

export interface MigrationTodo {
  type: 'dom_ref' | 'state_mapping' | 'event_binding' | 'unknown_pattern';
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface ComponentSpec {
  name: string;
  type: 'stateful' | 'presentational' | 'unknown';
  parent?: string;
  children: string[];
  template: string;
  styles: string;
  matchConfidence?: number; // NEW: confidence score for component matching
  logic?: {
    state: StateVariable[];
    methods: MethodSpec[];
    events: EventBinding[];
  };
  manifest: ComponentManifest;
}

export interface ConvertResult extends SnapshotResult {
  components: Map<string, ComponentSpec>;
  componentTree?: Record<string, any>;
  index?: Record<string, any>;
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
  };
}

export const MAX_INLINE_SIZE = 10 * 1024 * 1024;

// Framework code generation types
export interface GeneratedComponent {
  name: string;
  code: string;
  language: 'vue' | 'jsx' | 'tsx' | 'svelte' | 'ts' | 'js';
  imports: string[];
  dependencies: string[];
  metadata: {
    hasState: boolean;
    eventCount: number;
    styleSize: number;
  };
}

export interface GeneratedFramework {
  components: GeneratedComponent[];
  appTemplate?: string;
  mainEntry?: string;
  packageJson?: Record<string, any>;
  shared?: {
    api?: string;
    utils?: string;
  };
}
