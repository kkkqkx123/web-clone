/**
 * Shared type definitions for web-clone packages.
 *
 * This package contains the core types shared between @web-clone/core
 * and @web-clone/codegen, breaking the cyclic dependency between them.
 */

// ─── Framework code generation types ─────────────────────────────────────────

export type CodegenFramework = 'vue' | 'react' | 'angular' | 'svelte' | 'jquery';

export interface FrameworkCodeGenOptions {
  framework?: CodegenFramework;
  typescript?: boolean;
  cssModules?: boolean;
  generateDrafts?: boolean;
  extractSharedLogic?: boolean;
}

// ─── Component analysis types ────────────────────────────────────────────────

export interface StateVariable {
  name: string;
  type: string;
  initial?: unknown;
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

export interface MigrationTodo {
  type: 'dom_ref' | 'state_mapping' | 'event_binding' | 'unknown_pattern';
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface ComponentManifest {
  name: string;
  type: 'stateful' | 'presentational' | 'unknown';
  path: string;
  children: string[];
  state: Record<string, StateVariable>;
  events: Record<string, EventBinding>;
  migration: {
    effort: string;
    effortBreakdown: { extraction: string; conversion: string };
    suggestions: string[];
    todos: MigrationTodo[];
  };
}

export interface ComponentSpec {
  name: string;
  type: 'stateful' | 'presentational' | 'unknown';
  parent?: string;
  children: string[];
  template: string;
  styles: string;
  matchConfidence?: number;
  logic?: {
    state: StateVariable[];
    methods: MethodSpec[];
    events: EventBinding[];
  };
  manifest: ComponentManifest;
}

// ─── Generated output types ──────────────────────────────────────────────────

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
  packageJson?: Record<string, unknown>;
  shared?: {
    api?: string;
    utils?: string;
  };
}