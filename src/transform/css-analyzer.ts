import postcss from 'postcss';
import type { CssAnalysisResult } from './types.js';

export function analyzeCss(css: string): CssAnalysisResult {
  if (!css.trim()) {
    return { variables: {}, rules: [], componentStyles: {}, globalStyles: [], dynamicStyles: [] };
  }

  try {
    const root = postcss.parse(css);
    const variables = extractVariables(root);
    const rules = extractRules(root);
    const { globalStyles, componentStyles } = groupStylesByComponent(rules);
    const dynamicStyles = detectDynamicStyles(rules);

    return { variables, rules, componentStyles, globalStyles, dynamicStyles };
  } catch (err: any) {
    console.warn(`CSS analysis error: ${err.message}`);
    return { variables: {}, rules: [], componentStyles: {}, globalStyles: [], dynamicStyles: [] };
  }
}

function extractVariables(root: any): Record<string, string> {
  const vars: Record<string, string> = {};
  root.walkDecls((decl: any) => {
    if (decl.prop.startsWith('--')) {
      vars[decl.prop] = decl.value;
    }
  });
  return vars;
}

function extractRules(root: any): Array<{ selector: string; source: string; properties?: string[] }> {
  const rules: any[] = [];
  root.walkRules((rule: any) => {
    const properties: string[] = [];
    rule.walkDecls((decl: any) => {
      properties.push(decl.prop);
    });
    rules.push({
      selector: rule.selector,
      source: rule.toString(),
      properties
    });
  });
  return rules;
}

/**
 * Group CSS rules by component name and extract global styles.
 * - Separates global selectors (*, body, html, :root, etc.)
 * - Groups component styles by BEM block name
 * - Supports complex nesting patterns
 */
function groupStylesByComponent(rules: any[]): {
  globalStyles: string[];
  componentStyles: Record<string, string[]>
} {
  const globalRules: string[] = [];
  const componentGroups: Record<string, string[]> = {};

  // Global selectors that apply universally
  const globalSelectors = ['*', 'body', 'html', ':root', '::before', '::after'];

  rules.forEach(rule => {
    const selector = rule.selector.trim();

    // Check if it's a global style
    if (globalSelectors.some(gs => selector === gs || selector.startsWith(gs + ' ') || selector.startsWith(gs + ':'))) {
      globalRules.push(rule.source);
      return;
    }

    // Extract component name from BEM pattern
    // Supports: .component, .component__element, .component--modifier, .component__element--modifier
    const match = selector.match(/\.([a-z0-9][a-z0-9-]*?)(?:__|--|[^\w-]|$)/i);
    if (match) {
      const componentName = match[1];
      if (!componentGroups[componentName]) {
        componentGroups[componentName] = [];
      }
      componentGroups[componentName].push(rule.source);
    } else {
      // If no class-based component found, try ID-based
      const idMatch = selector.match(/#([a-z0-9_-]+)/i);
      if (idMatch) {
        const idName = idMatch[1];
        if (!componentGroups[idName]) {
          componentGroups[idName] = [];
        }
        componentGroups[idName].push(rule.source);
      } else {
        // Tag-based fallback
        const tagMatch = selector.match(/^([a-z]+)/i);
        if (tagMatch) {
          const tagName = tagMatch[1];
          if (!componentGroups[tagName]) {
            componentGroups[tagName] = [];
          }
          componentGroups[tagName].push(rule.source);
        }
      }
    }
  });

  return { globalStyles: globalRules, componentStyles: componentGroups };
}

/**
 * Detect CSS properties that are typically modified by JavaScript.
 * These are candidates for reactive binding in modern frameworks.
 */
function detectDynamicStyles(rules: any[]): Array<{ selector: string; properties: string[] }> {
  const dynamicProperties = new Set([
    'display', 'visibility', 'opacity', 'background-color', 'color',
    'transform', 'left', 'top', 'width', 'height', 'padding', 'margin',
    'border-color', 'box-shadow', 'z-index', 'animation', 'animation-play-state'
  ]);

  const dynamic: Array<{ selector: string; properties: string[] }> = [];

  rules.forEach(rule => {
    if (rule.properties) {
      const matchingProps = rule.properties.filter((prop: string) => dynamicProperties.has(prop));
      if (matchingProps.length > 0) {
        dynamic.push({
          selector: rule.selector,
          properties: matchingProps
        });
      }
    }
  });

  return dynamic;
}
