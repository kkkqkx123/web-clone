import type { SnapshotOptions, ConvertResult, MemoryBudget, ComponentSpec } from './types.js';
import type { ComponentRoot } from './transform/types.js';
import { analyzeHtml } from './transform/component-analyzer.js';
import { analyzeCss } from './transform/css-analyzer.js';
import { analyzeJavaScript } from './transform/js-analyzer.js';
import { correlateComponents } from './transform/correlator.js';
import { generateComponentStructure } from './transform/generator.js';
import { MemoryWatchdog } from './memory-budget.js';
import { compileWhere } from './query/expr.js';

/** Walk nested ComponentRoot.children to build a parent→children name map. */
function buildComponentHierarchy(roots: ComponentRoot[]): Map<string, string[]> {
  const hierarchy = new Map<string, string[]>();
  function walk(items: ComponentRoot[]) {
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        hierarchy.set(item.name, item.children.map(c => c.name));
        walk(item.children);
      }
    }
  }
  walk(roots);
  return hierarchy;
}

interface HtmlAnalysisOptions {
  depth?: number;
  maxTagScan?: number;
}

export async function convert(
  html: string,
  css: string,
  js: string,
  options: SnapshotOptions
): Promise<ConvertResult> {
  // Memory budget downgrade strategy
  const budget = (options as SnapshotOptions & { memoryBudget?: MemoryBudget }).memoryBudget;

  // Start runtime memory watchdog if limit is configured
  const watchdog = options.memoryLimit ? new MemoryWatchdog(options.memoryLimit) : undefined;

  // Phase 1: Parallel analysis (CPU-bound, wrapped in microtasks to yield event loop)
  const htmlOptions: HtmlAnalysisOptions = {
    depth: options.componentDepth,
  };
  if (budget) {
    if (budget.htmlStrategy === 'streaming') {
      htmlOptions.maxTagScan = 50000;
    }
  }

  const [htmlAnalysis, cssAnalysis, jsAnalysis] = await Promise.all([
    Promise.resolve().then(async () => {
      if (watchdog && await watchdog.check() === 'critical') {
        return { componentRoots: [], dynamicPoints: { bindings: [], events: [], conditions: [] } };
      }
      return analyzeHtml(html, htmlOptions);
    }),

    // CSS analysis: executed according to downgrade policy
    Promise.resolve().then(async () => {
      if (watchdog && await watchdog.check() === 'critical') {
        return { variables: {}, rules: [], componentStyles: {}, globalStyles: [], dynamicStyles: [] };
      }
      if (budget?.cssStrategy === 'skip') {
        return { variables: {}, rules: [], componentStyles: {}, globalStyles: [], dynamicStyles: [] };
      }
      if (budget?.cssStrategy === 'head') {
        return analyzeCss(css.slice(0, 500 * 1024));
      }
      return analyzeCss(css);
    }),

    // JS analysis: executed according to downgrade policy
    Promise.resolve().then(async () => {
      if (watchdog && await watchdog.check() === 'critical') {
        return { state: [], methods: [], events: [], refs: [], lifecycles: {}, todos: [] };
      }
      if (budget?.jsStrategy === 'skip') {
        return { state: [], methods: [], events: [], refs: [], lifecycles: {}, todos: [] };
      }
      if (budget?.jsStrategy === 'head') {
        return analyzeJavaScript(js.slice(0, 1024 * 1024), { extractLogic: options.extractLogic !== false });
      }
      return analyzeJavaScript(js, { extractLogic: options.extractLogic !== false });
    }),
  ]);

  // Phase 2: Correlation
  const correlated = correlateComponents(htmlAnalysis, cssAnalysis, jsAnalysis);

  // Phase 2b: Build parent→children hierarchy from the nested ComponentRoot tree
  const componentHierarchy = buildComponentHierarchy(htmlAnalysis.componentRoots);

  // Phase 3: Generation (with hierarchy so ComponentSpec.children is populated)
  const components = generateComponentStructure(correlated, componentHierarchy);

  // Phase 4: Apply component filter if specified
  if (options.componentFilter && components.size > 0) {
    const predicate = compileWhere(options.componentFilter);
    for (const [name, spec] of components) {
      const ctx = {
        name: spec.name,
        type: spec.type,
        confidence: spec.matchConfidence ?? 0,
        children: spec.children,
      };
      if (!predicate(ctx)) {
        components.delete(name);
      }
    }
  }

  // Build component tree from the actual parent→children hierarchy
  // (vs. the old flat `{ type, children, manifest }` which was always `children: []`)
  const componentTree: Record<string, unknown> = {};
  components.forEach((comp, name) => {
    const compChildren = componentHierarchy.get(name) ?? [];
    componentTree[name] = {
      type: comp.type,
      confidence: comp.matchConfidence,
      children: compChildren,
      manifest: comp.manifest
    };
  });

  // Build global index
  const index = {
    title: 'Component Structure',
    sourceUrl: options.url,
    timestamp: new Date().toISOString(),
    components: Array.from(components.keys()),
    stats: {
      total: components.size,
      stateful: Array.from(components.values()).filter(c => c.type === 'stateful').length,
      presentational: Array.from(components.values()).filter(c => c.type === 'presentational').length,
      unknown: Array.from(components.values()).filter(c => c.type === 'unknown').length
    },
    // Include global styles and CSS variables for styles/ directory generation
    globalStyles: cssAnalysis.variables,
    globalRules: cssAnalysis.globalStyles,
    dynamicStyles: cssAnalysis.dynamicStyles
  };

  return {
    sourceUrl: options.url,
    timestamp: new Date().toISOString(),
    html,
    assets: [],
    stats: { total: 0, fetched: 0, failed: 0, skipped: 0, validationWarnings: 0, totalBytes: 0 },
    components,
    componentTree,
    index
  };
}
