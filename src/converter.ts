import type { SnapshotOptions, ConvertResult } from './types.js';
import { analyzeHtml } from './transform/component-analyzer.js';
import { analyzeCss } from './transform/css-analyzer.js';
import { analyzeJavaScript } from './transform/js-analyzer.js';
import { correlateComponents } from './transform/correlator.js';
import { generateComponentStructure } from './transform/generator.js';

export async function convert(
  html: string,
  css: string,
  js: string,
  options: SnapshotOptions
): Promise<ConvertResult> {
  // Phase 1: Parallel analysis
  const htmlAnalysis = analyzeHtml(html, {
    depth: options.componentDepth  // undefined when not specified (no limit)
  });

  const cssAnalysis = analyzeCss(css);

  const jsAnalysis = analyzeJavaScript(js, {
    extractLogic: options.extractLogic !== false
  });

  // Phase 2: Correlation
  const correlated = correlateComponents(htmlAnalysis, cssAnalysis, jsAnalysis);

  // Phase 3: Generation
  const components = generateComponentStructure(correlated);

  // Build component tree (simplified)
  const componentTree: Record<string, any> = {};
  components.forEach((comp, name) => {
    componentTree[name] = {
      type: comp.type,
      children: comp.children,
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
